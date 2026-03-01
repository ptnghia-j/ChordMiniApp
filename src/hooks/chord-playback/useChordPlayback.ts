import { useState, useEffect, useCallback, useRef } from 'react';
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
  let prevChord: string | null = null;

  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i];
    const beatTime = beats[i];
    if (isNoChord(chord) || typeof beatTime !== 'number') {
      if (!isNoChord(chord)) continue;
      // On N.C. boundary, close current event
      prevChord = null;
      continue;
    }
    if (chord !== prevChord) {
      events.push({
        audioTime: beatTime,
        chord: chord,
        duration: 2.0, // placeholder — filled below
        beatIndex: i,
      });
      prevChord = chord;
    }
  }

  // Fill durations: each event lasts until the next one starts
  for (let i = 0; i < events.length - 1; i++) {
    events[i].duration = Math.max(0.5, Math.min(8.0, events[i + 1].audioTime - events[i].audioTime));
  }

  return events;
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

  useEffect(() => { chordsRef.current = chords; }, [chords]);
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { isEnabledRef.current = isEnabled; }, [isEnabled]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // Initialize dynamics analyzer with musical params
  useEffect(() => {
    dynamicsAnalyzer.current.setParams({
      bpm,
      timeSignature: 4, // Default 4/4 time
    });
  }, [bpm]);

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

      // Binary search for the current chord event
      let lo = 0, hi = schedule.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (schedule[mid].audioTime <= time) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (idx < 0) return;

      const event = schedule[idx];

      // Skip if same chord already playing
      if (event.chord === lastPlayedChord.current) return;

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

  // Find the next chord change from current beat index
  const findNextChordChange = useCallback((fromIndex: number): { index: number; chord: string } | null => {
    if (!chords || chords.length === 0) return null;
    
    const currentChord = chords[fromIndex];
    
    // Look ahead to find the next different chord
    for (let i = fromIndex + 1; i < chords.length; i++) {
      const nextChord = chords[i];
      if (nextChord && nextChord !== currentChord && nextChord !== 'N.C.' && nextChord !== 'N/C' && nextChord !== 'N') {
        return { index: i, chord: nextChord };
      }
    }
    
    return null;
  }, [chords]);

  // Calculate chord duration based on beat timing
  const calculateChordDuration = useCallback((startIndex: number, endIndex: number): number => {
    if (!beats || beats.length === 0) return 2.0; // Default duration
    
    const startTime = beats[startIndex];
    const endTime = beats[endIndex];
    
    if (typeof startTime === 'number' && typeof endTime === 'number') {
      return Math.max(0.5, Math.min(8.0, endTime - startTime)); // Clamp between 0.5 and 8 seconds
    }
    
    return 2.0; // Default duration
  }, [beats]);

  // Main chord playback logic - triggered when beat index changes (foreground only)
  useEffect(() => {
    // Skip if background poller is active — it handles chord scheduling independently
    if (isBackgroundRef.current) return;

    if (!isEnabled || !isReady || !isPlaying || currentBeatIndex < 0 || !chords || chords.length === 0) {
      return;
    }

    const currentChord = chords[currentBeatIndex];

    // Check if current beat is a "No Chord" marker
    const isNoChord = !currentChord || currentChord === 'N.C.' || currentChord === 'N/C' || currentChord === 'NC' || currentChord === 'N' || currentChord === '';

    // If we encounter N.C and we were previously playing a chord, stop with fade-out
    if (isNoChord && lastPlayedChord.current !== null) {
      chordPlaybackService.current.stopAll();
      lastPlayedChord.current = null;
      lastPlayedChordIndex.current = currentBeatIndex;
      return;
    }

    // Skip if no chord or it's a rest
    if (isNoChord) {
      return;
    }

    // Only play if this is a new chord change (not just a beat within the same chord)
    const shouldPlay = (
      currentBeatIndex !== lastPlayedChordIndex.current &&
      currentChord !== lastPlayedChord.current
    );

    if (shouldPlay) {
      // Find the next chord change to calculate duration
      const nextChordChange = findNextChordChange(currentBeatIndex);
      const duration = nextChordChange
        ? calculateChordDuration(currentBeatIndex, nextChordChange.index)
        : 2.0;

      // Calculate dynamic velocity based on beat position and audio energy
      const currentBeatTime = typeof beats[currentBeatIndex] === 'number'
        ? (beats[currentBeatIndex] as number)
        : 0;
      const dynamicVelocity = dynamicsAnalyzer.current.getVelocityMultiplier(
        currentBeatTime,
        currentBeatIndex,
        currentChord,
      );

      // Play the chord with BPM information and dynamic velocity
      chordPlaybackService.current.playChord(currentChord, duration, bpm, dynamicVelocity);

      // Update tracking variables
      lastPlayedChordIndex.current = currentBeatIndex;
      lastPlayedChord.current = currentChord;
    }
  }, [currentBeatIndex, chords, beats, isEnabled, isReady, isPlaying, findNextChordChange, calculateChordDuration, bpm]);

  // Stop playback when paused or disabled
  useEffect(() => {
    if (!isPlaying || !isEnabled) {
      chordPlaybackService.current.stopAll();
      lastPlayedChordIndex.current = -1;
      lastPlayedChord.current = null;
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
