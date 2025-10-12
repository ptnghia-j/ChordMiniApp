import { useState, useEffect, useCallback, useRef } from 'react';
import { getSoundfontChordPlaybackService } from '@/services/soundfontChordPlaybackService';

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

/**
 * Hook for managing chord playback synchronized with beat animation
 * Triggers chord playback when the beat animation reaches visible chord changes
 */
export const useChordPlayback = ({
  currentBeatIndex,
  chords,
  beats,
  isPlaying,
  currentTime: _currentTime, // eslint-disable-line @typescript-eslint/no-unused-vars
  bpm = 120 // Default to 120 BPM if not provided
}: UseChordPlaybackProps): UseChordPlaybackReturn => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pianoVolume, setPianoVolumeState] = useState(50);
  const [guitarVolume, setGuitarVolumeState] = useState(60);
  const [violinVolume, setViolinVolumeState] = useState(60);
  const [fluteVolume, setFluteVolumeState] = useState(50);
  const [isReady, setIsReady] = useState(false);

  const chordPlaybackService = useRef(getSoundfontChordPlaybackService());
  const lastPlayedChordIndex = useRef(-1);
  const lastPlayedChord = useRef<string | null>(null);

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

  // Main chord playback logic - triggered when beat index changes
  useEffect(() => {
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

      // Play the chord with BPM information for dynamic timing
      chordPlaybackService.current.playChord(currentChord, duration, bpm);

      // Update tracking variables
      lastPlayedChordIndex.current = currentBeatIndex;
      lastPlayedChord.current = currentChord;
    }
  }, [currentBeatIndex, chords, isEnabled, isReady, isPlaying, findNextChordChange, calculateChordDuration]);

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
