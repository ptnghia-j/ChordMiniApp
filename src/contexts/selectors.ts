/**
 * Selector hooks for Zustand stores
 * These provide optimized access to specific slices of state
 * Migrated from Context API to Zustand for better performance
 */

import { useAnalysisStore } from '@/stores/analysisStore';
import { useUIStore } from '@/stores/uiStore';
import { usePlaybackStore } from '@/stores/playbackStore';

export type RomanNumeralData = {
  analysis: string[];
  keyContext: string;
  temporalShifts?: Array<{
    chordIndex: number;
    targetKey: string;
    romanNumeral: string;
  }>;
};

// Selector: analysis results (minimize coupling in consumers)
export function useAnalysisResultsSelector() {
  return useAnalysisStore((state) => ({
    analysisResults: state.analysisResults,
  }));
}

// Selector: segmentation toggle from UIStore
export function useSegmentationSelector() {
  return useUIStore((state) => ({
    showSegmentation: state.showSegmentation,
  }));
}

// Selector: chord corrections & toggles
export function useChordCorrectionsSelector() {
  return useAnalysisStore((state) => ({
    showCorrectedChords: state.showCorrectedChords,
    chordCorrections: state.chordCorrections,
  }));
}

// Selector: Roman numerals from UIStore
export function useRomanNumeralsSelector() {
  return useUIStore((state) => ({
    showRomanNumerals: state.showRomanNumerals,
    romanNumeralData: state.romanNumeralData,
  }));
}

// Selector: Beat tracking from playback
export function useBeatSelector() {
  return usePlaybackStore((state) => ({
    currentBeatIndex: state.currentBeatIndex,
  }));
}

// Selector: chord simplification from UIStore
export function useSimplifySelector() {
  return useUIStore((state) => ({
    simplifyChords: state.simplifyChords,
    toggleSimplifyChords: state.toggleSimplifyChords,
  }));
}
