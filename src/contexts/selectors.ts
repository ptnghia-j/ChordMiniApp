import { useMemo, useCallback } from 'react';
import { useAnalysisData } from './AnalysisDataContext';
import { useUI } from './UIContext';
import { usePlayback } from './PlaybackContext';

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
  const ctx = useAnalysisData();
  return useMemo(() => ({
    analysisResults: ctx.analysisResults,
  }), [ctx.analysisResults]);
}

// Selector: segmentation toggle from UIContext
export function useSegmentationSelector() {
  let showSegmentation: boolean | undefined;
  try {
    const ui = useUI();
    showSegmentation = ui.showSegmentation;
  } catch {
    // UIProvider not mounted; undefined
  }
  return useMemo(() => ({ showSegmentation: !!showSegmentation }), [showSegmentation]);
}

// Selector: chord corrections & toggles
export function useChordCorrectionsSelector() {
  const ctx = useAnalysisData();
  return useMemo(() => ({
    showCorrectedChords: ctx.showCorrectedChords,
    chordCorrections: ctx.chordCorrections,
  }), [ctx.showCorrectedChords, ctx.chordCorrections]);
}

// Selector: Roman numerals — prefer UIContext if provided, fallback to AnalysisDataContext
export function useRomanNumeralsSelector() {
  let showRomanNumerals: boolean | undefined;
  let romanNumeralData: RomanNumeralData | null | undefined;
  try {
    const ui = useUI();
    // If UIProvider is mounted, prefer its values
    showRomanNumerals = ui.showRomanNumerals ?? undefined;
    romanNumeralData = ui.romanNumeralData ?? undefined;
  } catch {
    // UIProvider not mounted here; fallback to analysis context
  }
  const analysis = useAnalysisData();
  const finalShow = showRomanNumerals ?? analysis.showRomanNumerals;
  const finalData = (romanNumeralData ?? analysis.romanNumeralData) as RomanNumeralData | null;
  return useMemo(() => ({ showRomanNumerals: finalShow, romanNumeralData: finalData }), [finalShow, finalData]);
}

// Selector: Beat tracking from playback
export function useBeatSelector() {
  const playback = usePlayback();
  return useMemo(() => ({
    currentBeatIndex: playback.currentBeatIndex,
  }), [playback.currentBeatIndex]);
}


// Selector: chord simplification — prefer UIContext (authoritative)
export function useSimplifySelector() {
  // Always access analysis context in this app (mounted on analyze page)
  const analysis = useAnalysisData();

  let uiSimplify: boolean | undefined;
  let uiToggle: (() => void) | undefined;
  try {
    const ui = useUI();
    uiSimplify = ui.simplifyChords;
    uiToggle = ui.toggleSimplifyChords;
  } catch {
    // UIProvider not mounted here; fallback to legacy analysis state
  }

  type Legacy = Partial<{ simplifyChords: boolean; toggleChordSimplification: () => void }>;
  const legacy = analysis as unknown as Legacy;

  const finalSimplify = (uiSimplify ?? legacy.simplifyChords ?? false) as boolean;
  const legacyToggle = legacy.toggleChordSimplification;

  // Stable toggle wrapper
  const toggle = useCallback(() => {
    if (uiToggle) return uiToggle();
    if (legacyToggle) return legacyToggle();
  }, [uiToggle, legacyToggle]);

  return { simplifyChords: finalSimplify, toggleSimplifyChords: toggle };
}
