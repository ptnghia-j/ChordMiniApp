import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { getDynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import {
  DEFAULT_PIANO_VOLUME,
  DEFAULT_GUITAR_VOLUME,
  DEFAULT_VIOLIN_VOLUME,
  DEFAULT_FLUTE_VOLUME,
} from '@/config/audioDefaults';

export interface UseChordPlaybackProps {
  currentBeatIndex: number;
  chords: string[];
  beats: (number | null)[];
  isPlaying: boolean;
  currentTime: number;
  bpm?: number; // Beats per minute for dynamic timing (optional, defaults to 120)
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

const NO_CHORD_VALUES = new Set(['N.C.', 'N/C', 'NC', 'N', '']);

function isNoChord(chord: string | undefined | null): boolean {
  return !chord || NO_CHORD_VALUES.has(chord);
}

// ─── Helpers: Build pre-scheduled chord list ─────────────────────────────────

interface ScheduledChordEvent {
  /** Absolute audio time (seconds) when this chord starts */
  audioTime: number;
  /** Chord symbol */
  chord: string;
  /** Duration in seconds */
  duration: number;
  /** Beat index (for dynamics) */
  beatIndex: number;
}

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

  const pushEvent = (endTime: number) => {
    if (activeChord === null || activeStartTime === null) return;
    events.push({
      audioTime: activeStartTime,
      chord: activeChord,
      duration: Math.max(0.5, endTime - activeStartTime),
      beatIndex: activeBeatIndex,
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
      continue;
    }

    if (activeChord === null) {
      activeChord = chord;
      activeStartTime = beatTime;
      activeBeatIndex = i;
      continue;
    }

    if (chord !== activeChord) {
      pushEvent(beatTime);
      activeChord = chord;
      activeStartTime = beatTime;
      activeBeatIndex = i;
    }
  }

  if (activeChord !== null && activeStartTime !== null) {
    const estimatedSongDuration = estimateSongDuration(beats);
    pushEvent(estimatedSongDuration ?? activeStartTime + 2);
  }

  return events;
}

function findScheduledChordEventAtTime(
  schedule: ScheduledChordEvent[],
  time: number,
): ScheduledChordEvent | null {
  let lo = 0;
  let hi = schedule.length - 1;
  let idx = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (schedule[mid].audioTime <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (idx < 0) return null;

  const event = schedule[idx];
  return time < event.audioTime + event.duration ? event : null;
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
  bpm = 120 // Default to 120 BPM if not provided
}: UseChordPlaybackProps): UseChordPlaybackReturn => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pianoVolume, setPianoVolumeState] = useState(DEFAULT_PIANO_VOLUME);
  const [guitarVolume, setGuitarVolumeState] = useState(DEFAULT_GUITAR_VOLUME);
  const [violinVolume, setViolinVolumeState] = useState(DEFAULT_VIOLIN_VOLUME);
  const [fluteVolume, setFluteVolumeState] = useState(DEFAULT_FLUTE_VOLUME);
  const [isReady, setIsReady] = useState(false);

  const chordPlaybackService = useRef(getSoundfontChordPlaybackService());
  const dynamicsAnalyzer = useRef(getDynamicsAnalyzer());
  const lastPlayedChordIndex = useRef(-1);
  const lastPlayedChord = useRef<string | null>(null);
  // Derive total song duration from chord schedule (max end time of all events)
  // This matches the visual path's calculation, ensuring endgame windows are consistent.
  const chordSchedule = useMemo(() => buildChordSchedule(chords, beats), [chords, beats]);
  const estimatedSongDuration = useMemo(() => {
    if (chordSchedule.length === 0) return estimateSongDuration(beats);
    // Use the max end time from the chord schedule, consistent with the visual path
    return chordSchedule.reduce(
      (maxEnd, ev) => Math.max(maxEnd, ev.audioTime + ev.duration),
      0,
    );
  }, [chordSchedule, beats]);

  // Background scheduling refs
  const backgroundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isBackgroundRef = useRef(false);

  // Keep latest values in refs so the background poller can access them
  // without causing effect re-runs
  const chordsRef = useRef(chords);
  const beatsRef = useRef(beats);
  const bpmRef = useRef(bpm);
  const isEnabledRef = useRef(isEnabled);
  const isPlayingRef = useRef(isPlaying);
  const isReadyRef = useRef(isReady);
  const currentTimeRef = useRef(currentTime);
  const estimatedSongDurationRef = useRef(estimatedSongDuration);

  useEffect(() => { chordsRef.current = chords; }, [chords]);
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { isEnabledRef.current = isEnabled; }, [isEnabled]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { estimatedSongDurationRef.current = estimatedSongDuration; }, [estimatedSongDuration]);

  // Initialize dynamics analyzer with musical params
  useEffect(() => {
    dynamicsAnalyzer.current.setParams({
      bpm,
      timeSignature: 4, // Default 4/4 time
      totalDuration: estimateSongDuration(beats),
    });
  }, [beats, bpm]);

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

    // Pre-compute the chord schedule once
    const schedule = buildChordSchedule(chordsRef.current, beatsRef.current);
    if (schedule.length === 0) return;

    // Poller: runs every 250ms (browsers clamp to ~1 000 ms in background)
    backgroundIntervalRef.current = setInterval(() => {
      if (!isEnabledRef.current || !isPlayingRef.current || !isReadyRef.current) {
        return;
      }

      const time = getAudioTime();
      if (time === null) return;

      const event = findScheduledChordEventAtTime(schedule, time);
      if (!event) return;

      // Skip if same chord already playing
      if (event.beatIndex === lastPlayedChordIndex.current) return;

      const dynamicVelocity = dynamicsAnalyzer.current.getVelocityMultiplier(
        event.audioTime,
        event.beatIndex,
        event.chord,
      );

      chordPlaybackService.current.playChord(
        event.chord,
        event.duration,
        bpmRef.current,
        dynamicVelocity,
        {
          startTime: event.audioTime,
          totalDuration: estimatedSongDurationRef.current,
          playbackTime: time,
        },
      );

      lastPlayedChord.current = event.chord;
      lastPlayedChordIndex.current = event.beatIndex;
    }, 250);
  }, [stopBackgroundPoller]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

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
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopBackgroundPoller();
    };
  }, [startBackgroundPoller, stopBackgroundPoller]);

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

    const event = findScheduledChordEventAtTime(chordSchedule, currentTime);
    if (!event) {
      if (lastPlayedChord.current !== null) {
        // Use soft crossfade stop instead of hard stopAll — prevents jarring
        // cuts when currentTime briefly falls between two chord boundaries.
        chordPlaybackService.current.softStopAll();
        lastPlayedChord.current = null;
        lastPlayedChordIndex.current = -1;
      }
      return;
    }

    if (event.beatIndex === lastPlayedChordIndex.current) {
      return;
    }

    const dynamicVelocity = dynamicsAnalyzer.current.getVelocityMultiplier(
      event.audioTime,
      event.beatIndex,
      event.chord,
    );

    chordPlaybackService.current.playChord(
      event.chord,
      event.duration,
      bpm,
      dynamicVelocity,
      {
        startTime: event.audioTime,
        totalDuration: estimatedSongDuration,
        playbackTime: currentTime,
      },
    );

    lastPlayedChordIndex.current = event.beatIndex;
    lastPlayedChord.current = event.chord;
  }, [currentBeatIndex, currentTime, isEnabled, isReady, isPlaying, chordSchedule, bpm, estimatedSongDuration]);

  // Stop playback when paused or disabled
  useEffect(() => {
    if (!isPlaying || !isEnabled) {
      chordPlaybackService.current.stopAll();
      lastPlayedChord.current = null;
      lastPlayedChordIndex.current = -1;
    }
  }, [isPlaying, isEnabled]);

  // Toggle playback enabled state
  const togglePlayback = useCallback(() => {
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
      service.stopAll();
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
