import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import {
  DEFAULT_PIANO_VOLUME,
  DEFAULT_GUITAR_VOLUME,
  DEFAULT_VIOLIN_VOLUME,
  DEFAULT_FLUTE_VOLUME,
} from '@/config/audioDefaults';
import { useGuitarCapoFret, useGuitarSelectedPositions, useTargetKey } from '@/stores/uiStore';
import type { SegmentationResult } from '@/types/chatbotTypes';
import { isNoChordChordName } from '@/utils/chordToMidi';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import { findChordEventIndexForPlayback } from '@/utils/chordEventLookup';
import type { InstrumentName } from '@/utils/instrumentNoteGeneration';

export interface UseChordPlaybackProps {
  currentBeatIndex: number;
  chords: string[];
  beats: (number | null)[];
  isPlaying: boolean;
  currentTime: number;
  bpm?: number; // Beats per minute for dynamic timing (optional, defaults to 120)
  timeSignature?: number; // Beats per measure (e.g. 3 for 3/4, defaults to 4)
  segmentationData?: SegmentationResult | null;
  audioUrl?: string | null;
}

export interface UseChordPlaybackReturn {
  isEnabled: boolean;
  pianoVolume: number;
  guitarVolume: number;
  violinVolume: number;
  fluteVolume: number;
  isReady: boolean;
  togglePlayback: () => void;
  setPianoVolume: (volume: number) => void;
  setGuitarVolume: (volume: number) => void;
  setViolinVolume: (volume: number) => void;
  setFluteVolume: (volume: number) => void;
}

// ─── Helpers: No-chord detection ─────────────────────────────────────────────

function isNoChord(chord: string | undefined | null): boolean {
  return isNoChordChordName(chord);
}

// ─── Helpers: Build pre-scheduled chord list ─────────────────────────────────

interface ScheduledChordEvent {
  /** Absolute audio time (seconds) when this chord starts */
  startTime: number;
  /** Absolute audio time (seconds) when this chord ends */
  endTime: number;
  /** Chord symbol */
  chord: string;
  /** Duration in seconds */
  duration: number;
  /** Beat index (for dynamics) */
  beatIndex: number;
  /** Number of aligned beat-grid cells covered by this event */
  beatCount: number;
  /** Name of the chord immediately after this one, when present */
  nextChordName?: string;
}

interface ScheduledChordMatch {
  event: ScheduledChordEvent;
  index: number;
}

const FOREGROUND_EVENT_BOUNDARY_TOLERANCE = 0.08;
const EVENT_MISS_GRACE_PERIOD = 0.12;
const CHORD_EVENT_CATCH_UP_MAX_SECONDS = 0.22;
const CHORD_PLAYBACK_INSTRUMENTS: InstrumentName[] = ['piano', 'guitar', 'violin', 'flute', 'saxophone', 'bass'];

/**
 * Build a list of distinct chord-change events from beats/chords arrays.
 * Merges consecutive beats with the same chord into a single event.
 */
function buildChordSchedule(
  chords: string[],
  beats: (number | null)[],
): ScheduledChordEvent[] {
  const events: ScheduledChordEvent[] = [];
  let activeChord: string | null = null;
  let activeStartTime: number | null = null;
  let activeBeatIndex = -1;
  let activeBeatCount = 0;

  const pushEvent = (endTime: number) => {
    if (activeChord === null || activeStartTime === null) return;
    const effectiveEndTime = Math.max(endTime, activeStartTime + 0.5);
    events.push({
      startTime: activeStartTime,
      endTime: effectiveEndTime,
      chord: activeChord,
      duration: effectiveEndTime - activeStartTime,
      beatIndex: activeBeatIndex,
      beatCount: Math.max(1, activeBeatCount),
    });
  };

  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i];
    const beatTime = beats[i];
    if (typeof beatTime !== 'number') {
      continue;
    }

    if (isNoChord(chord)) {
      pushEvent(beatTime);
      activeChord = null;
      activeStartTime = null;
      activeBeatIndex = -1;
      activeBeatCount = 0;
      continue;
    }

    if (activeChord === null) {
      activeChord = chord;
      activeStartTime = beatTime;
      activeBeatIndex = i;
      activeBeatCount = 1;
      continue;
    }

    if (chord !== activeChord) {
      pushEvent(beatTime);
      activeChord = chord;
      activeStartTime = beatTime;
      activeBeatIndex = i;
      activeBeatCount = 1;
    } else {
      activeBeatCount += 1;
    }
  }

  if (activeChord !== null && activeStartTime !== null) {
    const estimatedSongDuration = estimateSongDuration(beats);
    pushEvent(estimatedSongDuration ?? activeStartTime + 2);
  }

  for (let index = 0; index < events.length; index += 1) {
    events[index].nextChordName = events[index + 1]?.chord;
  }

  return events;
}

function findScheduledChordMatchForPlayback(
  schedule: ScheduledChordEvent[],
  time: number,
  beatIndex: number,
  cursorIndex: number,
  toleranceSeconds = FOREGROUND_EVENT_BOUNDARY_TOLERANCE,
): ScheduledChordMatch | null {
  const cursorEvent = cursorIndex >= 0 ? schedule[cursorIndex] : null;
  if (cursorEvent) {
    const isWithinCursorWindow = time >= cursorEvent.startTime - toleranceSeconds
      && time < cursorEvent.endTime + toleranceSeconds;
    if (isWithinCursorWindow) {
      return { event: cursorEvent, index: cursorIndex };
    }

    const nextCursorEvent = schedule[cursorIndex + 1];
    if (nextCursorEvent) {
      const nextStartsSoon = nextCursorEvent.startTime >= time
        && nextCursorEvent.startTime - time <= toleranceSeconds;
      const nextAlreadyStarted = time >= nextCursorEvent.startTime
        && time < nextCursorEvent.endTime + toleranceSeconds;
      const beatAdvancesToNext = beatIndex >= 0
        && beatIndex >= nextCursorEvent.beatIndex
        && nextCursorEvent.startTime - time <= toleranceSeconds;

      if (nextStartsSoon || nextAlreadyStarted || beatAdvancesToNext) {
        return { event: nextCursorEvent, index: cursorIndex + 1 };
      }
    }
  }

  const fallbackIndex = findChordEventIndexForPlayback(
    schedule,
    time,
    beatIndex,
    toleranceSeconds,
  );
  if (fallbackIndex < 0) {
    return null;
  }

  return {
    event: schedule[fallbackIndex],
    index: fallbackIndex,
  };
}

function findNextUnplayedChordEventForCatchUp(
  schedule: ScheduledChordEvent[],
  time: number,
  lastPlayedScheduleIndex: number,
  toleranceSeconds = FOREGROUND_EVENT_BOUNDARY_TOLERANCE,
): ScheduledChordMatch | null {
  if (lastPlayedScheduleIndex < 0) {
    return null;
  }

  const candidateIndex = lastPlayedScheduleIndex + 1;
  const candidate = candidateIndex >= 0 ? schedule[candidateIndex] : null;
  if (!candidate) {
    return null;
  }

  const catchUpWindow = Math.max(
    toleranceSeconds,
    Math.min(candidate.duration * 0.75, CHORD_EVENT_CATCH_UP_MAX_SECONDS),
  );

  const startsSoon = candidate.startTime >= time
    && candidate.startTime - time <= toleranceSeconds;
  const startedRecently = candidate.startTime < time
    && time - candidate.startTime <= catchUpWindow;

  return (startsSoon || startedRecently)
    ? { event: candidate, index: candidateIndex }
    : null;
}

function estimateSongDuration(beats: (number | null)[]): number | undefined {
  const numericBeats = beats.filter((beat): beat is number => typeof beat === 'number');
  if (numericBeats.length === 0) return undefined;
  if (numericBeats.length === 1) return numericBeats[0];

  const lastBeat = numericBeats[numericBeats.length - 1];
  const previousBeat = numericBeats[numericBeats.length - 2];
  const trailingBeatDuration = Math.max(0, lastBeat - previousBeat);

  return lastBeat + trailingBeatDuration;
}

/**
 * Hook for managing chord playback synchronized with beat animation.
 *
 * Foreground mode: reacts to `currentBeatIndex` changes (driven by rAF).
 * Background mode: when the browser tab is hidden, rAF stops so we switch
 * to a `setInterval`-based poller that reads `audioElement.currentTime`
 * directly and triggers chord changes independently.
 */
export const useChordPlayback = ({
  currentBeatIndex,
  chords,
  beats,
  isPlaying,
  currentTime,
  bpm = 120, // Default to 120 BPM if not provided
  timeSignature = 4, // Default to 4/4 time
  segmentationData,
  audioUrl,
}: UseChordPlaybackProps): UseChordPlaybackReturn => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [playbackRecoveryNonce, setPlaybackRecoveryNonce] = useState(0);
  const [pianoVolume, setPianoVolumeState] = useState(DEFAULT_PIANO_VOLUME);
  const [guitarVolume, setGuitarVolumeState] = useState(DEFAULT_GUITAR_VOLUME);
  const [violinVolume, setViolinVolumeState] = useState(DEFAULT_VIOLIN_VOLUME);
  const [fluteVolume, setFluteVolumeState] = useState(DEFAULT_FLUTE_VOLUME);
  const [isReady, setIsReady] = useState(false);
  const guitarCapoFret = useGuitarCapoFret();
  const guitarSelectedPositions = useGuitarSelectedPositions();
  const targetKey = useTargetKey();
  const guitarVoicing = useMemo<Partial<GuitarVoicingSelection>>(
    () => ({
      capoFret: guitarCapoFret,
      selectedPositions: guitarSelectedPositions,
    }),
    [guitarCapoFret, guitarSelectedPositions],
  );

  const chordPlaybackService = useRef(getSoundfontChordPlaybackService());
  const lastPlayedChordIndex = useRef(-1);
  const lastPlayedScheduleIndexRef = useRef(-1);
  const scheduleCursorIndexRef = useRef(-1);
  const lastPlayedChord = useRef<string | null>(null);
  // Derive total song duration from chord schedule (max end time of all events)
  // This matches the visual path's calculation, ensuring endgame windows are consistent.
  const chordSchedule = useMemo(() => buildChordSchedule(chords, beats), [chords, beats]);
  const estimatedSongDuration = useMemo(() => {
    if (chordSchedule.length === 0) return estimateSongDuration(beats);
    return chordSchedule[chordSchedule.length - 1].endTime;
  }, [chordSchedule, beats]);
  const dynamicsParams = useMemo(
    () => ({
      bpm,
      timeSignature,
      totalDuration: estimatedSongDuration,
      segmentationData,
    }),
    [bpm, estimatedSongDuration, segmentationData, timeSignature],
  );
  const dynamicsAnalyzer = useSharedAudioDynamics(audioUrl, dynamicsParams);

  // Background scheduling refs
  const backgroundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBackgroundRef = useRef(false);

  // Keep latest values in refs so the background poller can access them
  // without causing effect re-runs
  const playbackScheduleRef = useRef(chordSchedule);
  const bpmRef = useRef(bpm);
  const timeSignatureRef = useRef(timeSignature);
  const isEnabledRef = useRef(isEnabled);
  const isPlayingRef = useRef(isPlaying);
  const isReadyRef = useRef(isReady);
  const currentTimeRef = useRef(currentTime);
  const estimatedSongDurationRef = useRef(estimatedSongDuration);
  const audioUrlRef = useRef(audioUrl);
  const dynamicsAnalyzerRef = useRef(dynamicsAnalyzer);
  const segmentationDataRef = useRef(segmentationData);
  const guitarVoicingRef = useRef(guitarVoicing);
  const targetKeyRef = useRef(targetKey);
  const eventMissStartedAtRef = useRef<number | null>(null);
  const lastRecoveryAttemptAtRef = useRef(0);

  useEffect(() => {
    playbackScheduleRef.current = chordSchedule;
    scheduleCursorIndexRef.current = -1;
  }, [chordSchedule]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { timeSignatureRef.current = timeSignature; }, [timeSignature]);
  useEffect(() => { isEnabledRef.current = isEnabled; }, [isEnabled]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { estimatedSongDurationRef.current = estimatedSongDuration; }, [estimatedSongDuration]);
  useEffect(() => { audioUrlRef.current = audioUrl; }, [audioUrl]);
  useEffect(() => { dynamicsAnalyzerRef.current = dynamicsAnalyzer; }, [dynamicsAnalyzer]);
  useEffect(() => { segmentationDataRef.current = segmentationData; }, [segmentationData]);
  useEffect(() => { guitarVoicingRef.current = guitarVoicing; }, [guitarVoicing]);
  useEffect(() => { targetKeyRef.current = targetKey; }, [targetKey]);

  // Initialize service and check readiness
  useEffect(() => {
    const checkReadiness = () => {
      if (chordPlaybackService.current.isReady()) {
        setIsReady(true);
      } else {
        // Check again in 100ms if not ready
        setTimeout(checkReadiness, 100);
      }
    };
    
    checkReadiness();
  }, []);

  // Update service options when state changes
  useEffect(() => {
    chordPlaybackService.current.updateOptions({
      enabled: isEnabled,
      pianoVolume,
      guitarVolume,
      violinVolume,
      fluteVolume
    });
  }, [isEnabled, pianoVolume, guitarVolume, violinVolume, fluteVolume]);

  // ─── Background Tab Chord Scheduling ─────────────────────────────────────
  // When the browser tab loses focus, rAF stops → currentBeatIndex freezes →
  // no new chords get triggered. We switch to a setInterval-based poller that
  // reads the audio element's currentTime directly (the <audio>/<video> element
  // keeps playing even in background tabs) and triggers chord changes.
  //
  // setInterval is throttled to ~1 000 ms minimum in background tabs by
  // browsers, but chord changes typically last 1-4 s so this is adequate.
  // ─────────────────────────────────────────────────────────────────────────

  const stopBackgroundPoller = useCallback(() => {
    if (backgroundIntervalRef.current !== null) {
      clearInterval(backgroundIntervalRef.current);
      backgroundIntervalRef.current = null;
    }
  }, []);

  const startBackgroundPoller = useCallback(() => {
    stopBackgroundPoller();

    // Use the currentTime prop (via ref) instead of querying the DOM.
    // This works for both HTML5 audio and YouTube iframe playback because
    // the parent component updates currentTime via timeupdate events or
    // YouTube player callbacks, both of which fire in background tabs.
    const getAudioTime = (): number | null => {
      if (isPlayingRef.current) {
        return currentTimeRef.current;
      }
      return null;
    };

    if (playbackScheduleRef.current.length === 0) return;

    // Poller: runs every 250ms (browsers clamp to ~1 000 ms in background)
    backgroundIntervalRef.current = setInterval(() => {
      if (!isEnabledRef.current || !isPlayingRef.current || !isReadyRef.current) {
        return;
      }

      const time = getAudioTime();
      if (time === null) return;

      const schedule = playbackScheduleRef.current;
      if (schedule.length === 0) {
        return;
      }

      let match = findScheduledChordMatchForPlayback(
        schedule,
        time,
        -1,
        scheduleCursorIndexRef.current,
      );
      if (match) {
        scheduleCursorIndexRef.current = match.index;
      }

      if (!match || match.event.beatIndex === lastPlayedChordIndex.current) {
        const catchUpMatch = findNextUnplayedChordEventForCatchUp(
          schedule,
          time,
          lastPlayedScheduleIndexRef.current,
        );
        if (catchUpMatch) {
          match = catchUpMatch;
          scheduleCursorIndexRef.current = catchUpMatch.index;
        }
      }
      if (!match) return;

      const event = match.event;

      // Skip if same chord already playing
      if (event.beatIndex === lastPlayedChordIndex.current) return;

      const signalDynamics = audioUrlRef.current
        ? dynamicsAnalyzerRef.current.getSignalDynamics(event.startTime, event.duration)
        : null;
      const dynamicVelocity = dynamicsAnalyzerRef.current.getVelocityMultiplier(
        event.startTime,
        event.beatIndex,
        event.chord,
        event.duration,
        signalDynamics,
      );

      chordPlaybackService.current.playChord(
        event.chord,
        event.duration,
        bpmRef.current,
        dynamicVelocity,
        {
          startTime: event.startTime,
          totalDuration: estimatedSongDurationRef.current,
          playbackTime: time,
          beatCount: event.beatCount,
          segmentationData: segmentationDataRef.current,
          signalDynamics,
          nextChordName: event.nextChordName,
        },
        timeSignatureRef.current,
        guitarVoicingRef.current,
        targetKeyRef.current,
      );

      lastPlayedChord.current = event.chord;
      lastPlayedChordIndex.current = event.beatIndex;
      lastPlayedScheduleIndexRef.current = match.index;
    }, 250);
  }, [stopBackgroundPoller]);

  const recoverForegroundPlayback = useCallback(async () => {
    if (!isEnabledRef.current || !isPlayingRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastRecoveryAttemptAtRef.current < 150) {
      return;
    }
    lastRecoveryAttemptAtRef.current = now;

    const ready = await chordPlaybackService.current.prepareForPlayback();
    setIsReady(ready);
    if (!ready) {
      return;
    }

    lastPlayedChord.current = null;
    lastPlayedChordIndex.current = -1;
    lastPlayedScheduleIndexRef.current = -1;
    scheduleCursorIndexRef.current = -1;
    eventMissStartedAtRef.current = null;
    setPlaybackRecoveryNonce(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab going to background — start polling
        isBackgroundRef.current = true;
        if (isEnabledRef.current && isPlayingRef.current) {
          startBackgroundPoller();
        }
      } else {
        // Tab returning to foreground — stop polling, let rAF take over
        isBackgroundRef.current = false;
        stopBackgroundPoller();
        void recoverForegroundPlayback();
      }
    };

    const handlePageActivation = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      isBackgroundRef.current = false;
      stopBackgroundPoller();
      void recoverForegroundPlayback();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handlePageActivation);
    window.addEventListener('pageshow', handlePageActivation);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handlePageActivation);
      window.removeEventListener('pageshow', handlePageActivation);
      stopBackgroundPoller();
    };
  }, [recoverForegroundPlayback, startBackgroundPoller, stopBackgroundPoller]);

  // Start/stop background poller when playback state changes while tab is hidden
  useEffect(() => {
    if (!isBackgroundRef.current) return;

    if (isEnabled && isPlaying && isReady) {
      startBackgroundPoller();
    } else {
      stopBackgroundPoller();
    }
  }, [isEnabled, isPlaying, isReady, startBackgroundPoller, stopBackgroundPoller]);

  // Main chord playback logic - foreground uses the same precomputed chord schedule
  // as background mode so playback always uses the chord's real start/duration.
  useEffect(() => {
    // Skip if background poller is active — it handles chord scheduling independently
    if (isBackgroundRef.current) return;

    if (!isEnabled || !isReady || !isPlaying || chordSchedule.length === 0) {
      return;
    }

    let match = findScheduledChordMatchForPlayback(
      chordSchedule,
      currentTime,
      currentBeatIndex,
      scheduleCursorIndexRef.current,
    );
    if (match) {
      scheduleCursorIndexRef.current = match.index;
    }

    if (!match || match.event.beatIndex === lastPlayedChordIndex.current) {
      const catchUpMatch = findNextUnplayedChordEventForCatchUp(
        chordSchedule,
        currentTime,
        lastPlayedScheduleIndexRef.current,
      );
      if (catchUpMatch) {
        match = catchUpMatch;
        scheduleCursorIndexRef.current = catchUpMatch.index;
      }
    }
    if (!match) {
      if (lastPlayedChord.current !== null) {
        if (eventMissStartedAtRef.current === null) {
          eventMissStartedAtRef.current = currentTime;
          return;
        }

        if (currentTime - eventMissStartedAtRef.current < EVENT_MISS_GRACE_PERIOD) {
          return;
        }

        // Use soft crossfade stop instead of hard stopAll and only after a
        // brief grace window so single missed timing ticks do not create an
        // audible drop-out between adjacent chords.
        chordPlaybackService.current.softStopInstruments(CHORD_PLAYBACK_INSTRUMENTS);
        lastPlayedChord.current = null;
        lastPlayedChordIndex.current = -1;
        lastPlayedScheduleIndexRef.current = -1;
        scheduleCursorIndexRef.current = -1;
        eventMissStartedAtRef.current = null;
      }
      return;
    }

    const event = match.event;

    eventMissStartedAtRef.current = null;

    if (event.beatIndex === lastPlayedChordIndex.current) {
      return;
    }

    const signalDynamics = audioUrl
      ? dynamicsAnalyzer.getSignalDynamics(event.startTime, event.duration)
      : null;
    const dynamicVelocity = dynamicsAnalyzer.getVelocityMultiplier(
      event.startTime,
      event.beatIndex,
      event.chord,
      event.duration,
      signalDynamics,
    );

    chordPlaybackService.current.playChord(
      event.chord,
      event.duration,
      bpm,
      dynamicVelocity,
      {
        startTime: event.startTime,
        totalDuration: estimatedSongDuration,
        playbackTime: currentTime,
        beatCount: event.beatCount,
        segmentationData,
        signalDynamics,
        nextChordName: event.nextChordName,
      },
      timeSignature,
      guitarVoicing,
      targetKey,
    );

    lastPlayedChordIndex.current = event.beatIndex;
    lastPlayedScheduleIndexRef.current = match.index;
    lastPlayedChord.current = event.chord;
  }, [
    audioUrl,
    bpm,
    chordSchedule,
    currentBeatIndex,
    currentTime,
    dynamicsAnalyzer,
    estimatedSongDuration,
    guitarVoicing,
    isEnabled,
    isPlaying,
    isReady,
    playbackRecoveryNonce,
    segmentationData,
    targetKey,
    timeSignature,
  ]);

  // Stop playback when paused or disabled
  useEffect(() => {
    if (!isPlaying || !isEnabled) {
      chordPlaybackService.current.stopInstruments(CHORD_PLAYBACK_INSTRUMENTS);
      lastPlayedChord.current = null;
      lastPlayedChordIndex.current = -1;
      lastPlayedScheduleIndexRef.current = -1;
      scheduleCursorIndexRef.current = -1;
      eventMissStartedAtRef.current = null;
    }
  }, [isPlaying, isEnabled]);

  // Toggle playback enabled state
  const togglePlayback = useCallback(() => {
    const isEnabling = !isEnabledRef.current;
    if (isEnabling) {
      lastPlayedChord.current = null;
      lastPlayedChordIndex.current = -1;
      lastPlayedScheduleIndexRef.current = -1;
      scheduleCursorIndexRef.current = -1;
      eventMissStartedAtRef.current = null;
      void chordPlaybackService.current.prepareForPlayback();
    }
    setIsEnabled(prev => !prev);
  }, []);

  // Update piano volume
  const setPianoVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    setPianoVolumeState(clampedVolume);
  }, []);

  // Update guitar volume
  const setGuitarVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    setGuitarVolumeState(clampedVolume);
  }, []);

  // Update violin volume
  const setViolinVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    setViolinVolumeState(clampedVolume);
  }, []);

  // Update flute volume
  const setFluteVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    setFluteVolumeState(clampedVolume);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const service = chordPlaybackService.current;
    return () => {
      service.stopInstruments(CHORD_PLAYBACK_INSTRUMENTS);
    };
  }, []);

  return {
    isEnabled,
    pianoVolume,
    guitarVolume,
    violinVolume,
    fluteVolume,
    isReady,
    togglePlayback,
    setPianoVolume,
    setGuitarVolume,
    setViolinVolume,
    setFluteVolume
  };
};
