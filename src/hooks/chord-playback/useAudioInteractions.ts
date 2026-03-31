import { useCallback } from 'react';

export interface AudioInteractionsDependencies {
  // UI state toggles
  showCorrectedChords: boolean;
  setShowCorrectedChords: (show: boolean) => void;
}

export interface AudioInteractions {
  toggleEnharmonicCorrection: () => void;
  handleLoadedMetadata: () => void;
  handleTimeUpdate: () => void;
}

/**
 * Custom hook for audio interaction functions
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useAudioInteractions = (deps: AudioInteractionsDependencies): AudioInteractions => {
  const {
    showCorrectedChords,
    setShowCorrectedChords,
  } = deps;

  // Function to toggle enharmonic correction display
  const toggleEnharmonicCorrection = useCallback(() => {
    setShowCorrectedChords(!showCorrectedChords);
  }, [showCorrectedChords, setShowCorrectedChords]);

  // Placeholder handlers for compatibility (YouTube handles timing directly)
  const handleLoadedMetadata = useCallback(() => {
    // YouTube player handles metadata loading
  }, []);

  const handleTimeUpdate = useCallback(() => {
    // YouTube player handles time updates via progress events
  }, []);

  // No audio element event listeners needed - YouTube player handles all events

  return {
    toggleEnharmonicCorrection,
    handleLoadedMetadata,
    handleTimeUpdate,
  };
};
