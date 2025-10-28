import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { LyricsData } from '@/types/musicAiTypes';

// Identity wrapper to disable devtools middleware in production with proper typing
function identityDevtools<S, Mps extends [] = [], Mcs extends [] = []>(
  fn: import('zustand/vanilla').StateCreator<S, Mps, Mcs>
) {
  return fn;
}

interface AnalysisStore {
  // Analysis results
  analysisResults: AnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;

  // Model state
  beatDetector: string;
  chordDetector: string;
  modelsInitialized: boolean;

  // Cache state
  cacheAvailable: boolean;
  cacheCheckCompleted: boolean;
  cacheCheckInProgress: boolean;

  // Lyrics state
  lyrics: LyricsData | null;
  showLyrics: boolean;
  hasCachedLyrics: boolean;
  isTranscribingLyrics: boolean;
  lyricsError: string | null;

  // Key detection state
  keySignature: string | null;
  isDetectingKey: boolean;

  // Chord corrections state
  chordCorrections: Record<string, string> | null;
  showCorrectedChords: boolean;

  // Analysis operations
  startAnalysis: () => void;
  completeAnalysis: (results: AnalysisResult) => void;
  failAnalysis: (error: string) => void;
  resetAnalysis: () => void;
  setAnalysisResults: (results: AnalysisResult | null) => void;
  setAnalysisError: (error: string | null) => void;

  // Model operations
  setBeatDetector: (detector: string) => void;
  setChordDetector: (detector: string) => void;
  setModelsInitialized: (initialized: boolean) => void;

  // Cache operations
  setCacheAvailable: (available: boolean) => void;
  setCacheCheckCompleted: (completed: boolean) => void;
  setCacheCheckInProgress: (inProgress: boolean) => void;

  // Lyrics operations
  startLyricsTranscription: () => void;
  completeLyricsTranscription: (lyricsData: LyricsData) => void;
  failLyricsTranscription: (error: string) => void;
  toggleLyricsVisibility: () => void;
  setLyrics: (lyrics: LyricsData | null) => void;
  setShowLyrics: (show: boolean) => void;
  setHasCachedLyrics: (hasCached: boolean) => void;
  setLyricsError: (error: string | null) => void;

  // Key detection operations
  setKeySignature: (key: string | null) => void;
  setIsDetectingKey: (detecting: boolean) => void;

  // Chord corrections operations
  setChordCorrections: (corrections: Record<string, string> | null) => void;
  setShowCorrectedChords: (show: boolean) => void;
}

export const useAnalysisStore = create<AnalysisStore>()(
  ((process.env.NODE_ENV !== 'production' ? devtools : identityDevtools) as unknown as typeof devtools)(
    (set) => ({
      // Initial state
      analysisResults: null,
      isAnalyzing: false,
      analysisError: null,
      beatDetector: 'auto',
      chordDetector: 'auto',
      modelsInitialized: false,
      cacheAvailable: false,
      cacheCheckCompleted: false,
      cacheCheckInProgress: false,
      lyrics: null,
      showLyrics: false,
      hasCachedLyrics: false,
      isTranscribingLyrics: false,
      lyricsError: null,
      keySignature: null,
      isDetectingKey: false,
      chordCorrections: null,
      showCorrectedChords: false,

      // Analysis operations
      startAnalysis: () =>
        set(
          {
            isAnalyzing: true,
            analysisError: null,
          },
          false,
          'startAnalysis'
        ),

      completeAnalysis: (results) =>
        set(
          {
            analysisResults: results,
            isAnalyzing: false,
            analysisError: null,
          },
          false,
          'completeAnalysis'
        ),

      failAnalysis: (error) =>
        set(
          {
            isAnalyzing: false,
            analysisError: error,
          },
          false,
          'failAnalysis'
        ),

      resetAnalysis: () =>
        set(
          {
            analysisResults: null,
            isAnalyzing: false,
            analysisError: null,
            keySignature: null,
            isDetectingKey: false,
            chordCorrections: null,
            lyrics: null,
            showLyrics: false,
            hasCachedLyrics: false,
            isTranscribingLyrics: false,
            lyricsError: null,
          },
          false,
          'resetAnalysis'
        ),

      setAnalysisResults: (results) => set({ analysisResults: results }, false, 'setAnalysisResults'),

      setAnalysisError: (error) => set({ analysisError: error }, false, 'setAnalysisError'),

      // Model operations
      setBeatDetector: (detector) => set({ beatDetector: detector }, false, 'setBeatDetector'),

      setChordDetector: (detector) => set({ chordDetector: detector }, false, 'setChordDetector'),

      setModelsInitialized: (initialized) => set({ modelsInitialized: initialized }, false, 'setModelsInitialized'),

      // Cache operations
      setCacheAvailable: (available) => set({ cacheAvailable: available }, false, 'setCacheAvailable'),

      setCacheCheckCompleted: (completed) => set({ cacheCheckCompleted: completed }, false, 'setCacheCheckCompleted'),

      setCacheCheckInProgress: (inProgress) =>
        set({ cacheCheckInProgress: inProgress }, false, 'setCacheCheckInProgress'),

      // Lyrics operations
      startLyricsTranscription: () =>
        set(
          {
            isTranscribingLyrics: true,
            lyricsError: null,
          },
          false,
          'startLyricsTranscription'
        ),

      completeLyricsTranscription: (lyricsData) =>
        set(
          {
            lyrics: lyricsData,
            isTranscribingLyrics: false,
            lyricsError: null,
            showLyrics: true,
          },
          false,
          'completeLyricsTranscription'
        ),

      failLyricsTranscription: (error) =>
        set(
          {
            isTranscribingLyrics: false,
            lyricsError: error,
          },
          false,
          'failLyricsTranscription'
        ),

      toggleLyricsVisibility: () =>
        set((state) => ({ showLyrics: !state.showLyrics }), false, 'toggleLyricsVisibility'),

      setLyrics: (lyrics) => set({ lyrics }, false, 'setLyrics'),

      setShowLyrics: (show) => set({ showLyrics: show }, false, 'setShowLyrics'),

      setHasCachedLyrics: (hasCached) => set({ hasCachedLyrics: hasCached }, false, 'setHasCachedLyrics'),

      setLyricsError: (error) => set({ lyricsError: error }, false, 'setLyricsError'),

      // Key detection operations
      setKeySignature: (key) => set({ keySignature: key }, false, 'setKeySignature'),

      setIsDetectingKey: (detecting) => set({ isDetectingKey: detecting }, false, 'setIsDetectingKey'),

      // Chord corrections operations
      setChordCorrections: (corrections) => set({ chordCorrections: corrections }, false, 'setChordCorrections'),

      setShowCorrectedChords: (show) => set({ showCorrectedChords: show }, false, 'setShowCorrectedChords'),
    }),
    { name: 'AnalysisStore' }
  )
);

// Selector hooks for optimized re-renders
export const useAnalysisResults = () => useAnalysisStore((state) => state.analysisResults);
export const useIsAnalyzing = () => useAnalysisStore((state) => state.isAnalyzing);
export const useAnalysisError = () => useAnalysisStore((state) => state.analysisError);

export const useBeatDetector = () => useAnalysisStore((state) => state.beatDetector);
export const useChordDetector = () => useAnalysisStore((state) => state.chordDetector);
export const useModelsInitialized = () => useAnalysisStore((state) => state.modelsInitialized);

export const useCacheState = () =>
  useAnalysisStore((state) => ({
    cacheAvailable: state.cacheAvailable,
    cacheCheckCompleted: state.cacheCheckCompleted,
    cacheCheckInProgress: state.cacheCheckInProgress,
  }));

export const useLyrics = () => useAnalysisStore((state) => state.lyrics);
export const useShowLyrics = () => useAnalysisStore((state) => state.showLyrics);
export const useHasCachedLyrics = () => useAnalysisStore((state) => state.hasCachedLyrics);
export const useIsTranscribingLyrics = () => useAnalysisStore((state) => state.isTranscribingLyrics);
export const useLyricsError = () => useAnalysisStore((state) => state.lyricsError);

export const useKeySignature = () => useAnalysisStore((state) => state.keySignature);
export const useIsDetectingKey = () => useAnalysisStore((state) => state.isDetectingKey);

export const useChordCorrections = () => useAnalysisStore((state) => state.chordCorrections);
export const useShowCorrectedChords = () => useAnalysisStore((state) => state.showCorrectedChords);

// Action selectors
export const useAnalysisActions = () =>
  useAnalysisStore((state) => ({
    startAnalysis: state.startAnalysis,
    completeAnalysis: state.completeAnalysis,
    failAnalysis: state.failAnalysis,
    resetAnalysis: state.resetAnalysis,
  }));

export const useModelActions = () =>
  useAnalysisStore((state) => ({
    setBeatDetector: state.setBeatDetector,
    setChordDetector: state.setChordDetector,
    setModelsInitialized: state.setModelsInitialized,
  }));

export const useLyricsActions = () =>
  useAnalysisStore((state) => ({
    startLyricsTranscription: state.startLyricsTranscription,
    completeLyricsTranscription: state.completeLyricsTranscription,
    failLyricsTranscription: state.failLyricsTranscription,
    toggleLyricsVisibility: state.toggleLyricsVisibility,
    setLyrics: state.setLyrics,
    setHasCachedLyrics: state.setHasCachedLyrics,
  }));

