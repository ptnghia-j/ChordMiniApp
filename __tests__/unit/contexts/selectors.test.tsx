import { act, renderHook } from '@testing-library/react';

import {
  useAnalysisResultsSelector,
  useBeatSelector,
  useChordCorrectionsSelector,
  useRomanNumeralsSelector,
  useSegmentationSelector,
  useSimplifySelector,
} from '@/contexts/selectors';
import { useAnalysisStore } from '@/stores/analysisStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUIStore } from '@/stores/uiStore';

const resetStores = () => {
  useAnalysisStore.setState(useAnalysisStore.getInitialState());
  usePlaybackStore.setState(usePlaybackStore.getInitialState());
  useUIStore.setState(useUIStore.getInitialState());
};

describe('contexts/selectors', () => {
  beforeEach(() => {
    resetStores();
  });

  it('selects analysis results from the analysis store', () => {
    const analysisResults = { beats: [], chords: [] } as any;

    act(() => {
      useAnalysisStore.getState().setAnalysisResults(analysisResults);
    });

    const { result } = renderHook(() => useAnalysisResultsSelector());

    expect(result.current).toEqual({ analysisResults });
  });

  it('selects segmentation, roman numeral, and simplify state from the UI store', () => {
    const romanNumeralData = {
      analysis: ['I', 'V'],
      keyContext: 'C',
    };

    act(() => {
      useUIStore.getState().setShowSegmentation(true);
      useUIStore.getState().setShowRomanNumerals(true);
      useUIStore.getState().updateRomanNumeralData(romanNumeralData);
      useUIStore.getState().setSimplifyChords(true);
    });

    const segmentation = renderHook(() => useSegmentationSelector());
    const numerals = renderHook(() => useRomanNumeralsSelector());
    const simplify = renderHook(() => useSimplifySelector());

    expect(segmentation.result.current).toEqual({ showSegmentation: true });
    expect(numerals.result.current).toEqual({
      showRomanNumerals: true,
      romanNumeralData,
    });
    expect(simplify.result.current.simplifyChords).toBe(true);
    expect(typeof simplify.result.current.toggleSimplifyChords).toBe('function');
  });

  it('selects chord correction data and beat tracking state', () => {
    const chordCorrections = { 'C#': 'Db' };

    act(() => {
      useAnalysisStore.getState().setChordCorrections(chordCorrections);
      useAnalysisStore.getState().setShowCorrectedChords(true);
      usePlaybackStore.getState().setCurrentBeatIndex(7);
    });

    const corrections = renderHook(() => useChordCorrectionsSelector());
    const beat = renderHook(() => useBeatSelector());

    expect(corrections.result.current).toEqual({
      showCorrectedChords: true,
      chordCorrections,
    });
    expect(beat.result.current).toEqual({ currentBeatIndex: 7 });
  });
});
