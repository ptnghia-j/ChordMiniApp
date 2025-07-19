import { useState, useEffect, useRef } from 'react';
import { getSafeChordModel } from '@/utils/modelFiltering';

// Define detector types
export type BeatDetectorType = 'madmom' | 'beat-transformer';
export type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

export interface ModelState {
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  modelsInitialized: boolean;
  beatDetectorRef: React.MutableRefObject<BeatDetectorType>;
  chordDetectorRef: React.MutableRefObject<ChordDetectorType>;
  setBeatDetector: (detector: BeatDetectorType) => void;
  setChordDetector: (detector: ChordDetectorType) => void;
}

/**
 * Custom hook for managing model selection state with localStorage persistence
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useModelState = (): ModelState => {
  // Initialize model states with localStorage persistence
  const [beatDetector, setBeatDetector] = useState<BeatDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_beat_detector');
      if (saved && ['madmom', 'beat-transformer'].includes(saved)) {
        return saved as BeatDetectorType;
      }
      // If saved value was 'auto', default to 'beat-transformer'
      if (saved === 'auto') {
        localStorage.setItem('chordmini_beat_detector', 'beat-transformer');
      }
    }
    return 'beat-transformer';
  });

  const [chordDetector, setChordDetector] = useState<ChordDetectorType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chordmini_chord_detector');
      if (saved && ['chord-cnn-lstm', 'btc-sl', 'btc-pl'].includes(saved)) {
        // Ensure the saved model is available in the current environment
        return getSafeChordModel(saved as ChordDetectorType);
      }
    }
    return 'chord-cnn-lstm';
  });

  const [modelsInitialized, setModelsInitialized] = useState<boolean>(false);

  // Use refs to ensure we always get the latest model values
  const beatDetectorRef = useRef(beatDetector);
  const chordDetectorRef = useRef(chordDetector);

  // Update refs when state changes
  useEffect(() => {
    beatDetectorRef.current = beatDetector;
  }, [beatDetector]);

  useEffect(() => {
    chordDetectorRef.current = chordDetector;
  }, [chordDetector]);

  // Persist beat detector selection to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chordmini_beat_detector', beatDetector);
    }
  }, [beatDetector]);

  // Persist chord detector selection to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chordmini_chord_detector', chordDetector);
    }
  }, [chordDetector]);

  // Mark models as initialized after component mount to allow user interaction
  useEffect(() => {
    const timer = setTimeout(() => {
      setModelsInitialized(true);
    }, 100); // Minimal delay to prevent flash, allow immediate cache checking

    return () => clearTimeout(timer);
  }, []);

  return {
    beatDetector,
    chordDetector,
    modelsInitialized,
    beatDetectorRef,
    chordDetectorRef,
    setBeatDetector,
    setChordDetector,
  };
};
