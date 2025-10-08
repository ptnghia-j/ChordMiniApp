import { useState, useEffect, useCallback, useRef } from 'react';
import { getLightweightChordPlaybackService } from '@/services/lightweightChordPlaybackService';

export interface UseChordPlaybackProps {
  currentBeatIndex: number;
  chords: string[];
  beats: (number | null)[];
  isPlaying: boolean;
  currentTime: number;
}

/**
 * Convert simplified chord notation back to playback-compatible format
 *
 * Simplified chords use Unicode symbols (♯, ♭) and generic "sus" which the audio parser cannot handle.
 * This function converts them back to ASCII format (#, b) and preserves sus2/sus4 distinction.
 *
 * IMPORTANT: This conversion is ONLY for playback. Display should continue using simplified format.
 *
 * @param chord - Simplified chord string (e.g., "F♯m", "B♭", "Csus")
 * @returns Playback-compatible chord string (e.g., "F#m", "Bb", "Csus4")
 */
function convertSimplifiedChordForPlayback(chord: string): string {
  if (!chord || chord === 'N.C.' || chord === 'N/C' || chord === 'N' || chord === '') {
    return chord;
  }

  let converted = chord;

  // Convert Unicode accidentals to ASCII
  // ♯ (U+266F) → # (ASCII)
  // ♭ (U+266D) → b (ASCII)
  converted = converted.replace(/♯/g, '#').replace(/♭/g, 'b');

  // Handle generic "sus" - default to "sus4" for playback
  // Note: We can't distinguish between original sus2 and sus4 after simplification,
  // so we default to sus4 which is more common
  // This is a limitation of the simplification process
  if (converted.endsWith('sus') && !converted.endsWith('sus2') && !converted.endsWith('sus4')) {
    converted = converted.replace(/sus$/, 'sus4');
  }

  return converted;
}

export interface UseChordPlaybackReturn {
  isEnabled: boolean;
  pianoVolume: number;
  guitarVolume: number;
  isReady: boolean;
  togglePlayback: () => void;
  setPianoVolume: (volume: number) => void;
  setGuitarVolume: (volume: number) => void;
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
  currentTime: _currentTime // eslint-disable-line @typescript-eslint/no-unused-vars
}: UseChordPlaybackProps): UseChordPlaybackReturn => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pianoVolume, setPianoVolumeState] = useState(50);
  const [guitarVolume, setGuitarVolumeState] = useState(30);
  const [isReady, setIsReady] = useState(false);
  
  const chordPlaybackService = useRef(getLightweightChordPlaybackService());
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
      guitarVolume
    });
  }, [isEnabled, pianoVolume, guitarVolume]);

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

    // Skip if no chord or it's a rest
    if (!currentChord || currentChord === 'N.C.' || currentChord === 'N/C' || currentChord === 'N' || currentChord === '') {
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

      // Convert simplified chord notation to playback-compatible format
      // This handles Unicode symbols (♯, ♭) and generic "sus" that the audio parser can't handle
      const playbackChord = convertSimplifiedChordForPlayback(currentChord);

      // Play the chord (using converted format for audio parsing)
      chordPlaybackService.current.playChord(playbackChord, duration);

      // Update tracking variables (using original chord for comparison)
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
    isReady,
    togglePlayback,
    setPianoVolume,
    setGuitarVolume
  };
};
