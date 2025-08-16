'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { LyricsData } from '@/types/musicAiTypes';

// Analysis data types
interface AnalysisDataState {
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
  
  // Chord processing state
  simplifyChords: boolean;
  showRomanNumerals: boolean;
  romanNumeralsRequested: boolean;
  romanNumeralData: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  
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
  
  // Model operations
  setBeatDetector: (detector: string) => void;
  setChordDetector: (detector: string) => void;
  
  // Lyrics operations
  startLyricsTranscription: () => void;
  completeLyricsTranscription: (lyricsData: LyricsData) => void;
  failLyricsTranscription: (error: string) => void;
  toggleLyricsVisibility: () => void;
  
  // Chord processing operations
  toggleChordSimplification: () => void;
  toggleRomanNumerals: () => void;
  updateRomanNumeralData: (data: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null) => void;
}

const AnalysisDataContext = createContext<AnalysisDataState | undefined>(undefined);

interface AnalysisDataProviderProps {
  children: ReactNode;
  // Inject state and operations from hooks
  analysisState: {
    analysisResults: AnalysisResult | null;
    isAnalyzing: boolean;
    analysisError: string | null;
    cacheAvailable: boolean;
    cacheCheckCompleted: boolean;
    cacheCheckInProgress: boolean;
    keySignature: string | null;
    isDetectingKey: boolean;
    chordCorrections: Record<string, string> | null;
    showCorrectedChords: boolean;
  };
  modelState: {
    beatDetector: string;
    chordDetector: string;
    modelsInitialized: boolean;
  };
  lyricsState: {
    lyrics: LyricsData | null;
    showLyrics: boolean;
    hasCachedLyrics: boolean;
    isTranscribingLyrics: boolean;
    lyricsError: string | null;
  };
  chordProcessingState: {
    simplifyChords: boolean;
    showRomanNumerals: boolean;
    romanNumeralsRequested: boolean;
    romanNumeralData: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  };
  operations: {
    // Analysis operations
    startAnalysis: () => void;
    completeAnalysis: (results: AnalysisResult) => void;
    failAnalysis: (error: string) => void;
    resetAnalysis: () => void;
    
    // Model operations
    setBeatDetector: (detector: string) => void;
    setChordDetector: (detector: string) => void;
    
    // Lyrics operations
    startLyricsTranscription: () => void;
    completeLyricsTranscription: (lyricsData: LyricsData) => void;
    failLyricsTranscription: (error: string) => void;
    toggleLyricsVisibility: () => void;
    
    // Chord processing operations
    toggleChordSimplification: () => void;
    toggleRomanNumerals: () => void;
    updateRomanNumeralData: (data: {
      analysis: string[];
      keyContext: string;
      temporalShifts?: Array<{
        chordIndex: number;
        targetKey: string;
        romanNumeral: string;
      }>;
    } | null) => void;
  };
}

export const AnalysisDataProvider: React.FC<AnalysisDataProviderProps> = ({
  children,
  analysisState,
  modelState,
  lyricsState,
  chordProcessingState,
  operations,
}) => {
  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo((): AnalysisDataState => ({
    // Analysis state
    analysisResults: analysisState.analysisResults,
    isAnalyzing: analysisState.isAnalyzing,
    analysisError: analysisState.analysisError,
    cacheAvailable: analysisState.cacheAvailable,
    cacheCheckCompleted: analysisState.cacheCheckCompleted,
    cacheCheckInProgress: analysisState.cacheCheckInProgress,
    keySignature: analysisState.keySignature,
    isDetectingKey: analysisState.isDetectingKey,
    chordCorrections: analysisState.chordCorrections,
    showCorrectedChords: analysisState.showCorrectedChords,
    
    // Model state
    beatDetector: modelState.beatDetector,
    chordDetector: modelState.chordDetector,
    modelsInitialized: modelState.modelsInitialized,
    
    // Lyrics state
    lyrics: lyricsState.lyrics,
    showLyrics: lyricsState.showLyrics,
    hasCachedLyrics: lyricsState.hasCachedLyrics,
    isTranscribingLyrics: lyricsState.isTranscribingLyrics,
    lyricsError: lyricsState.lyricsError,
    
    // Chord processing state
    simplifyChords: chordProcessingState.simplifyChords,
    showRomanNumerals: chordProcessingState.showRomanNumerals,
    romanNumeralsRequested: chordProcessingState.romanNumeralsRequested,
    romanNumeralData: chordProcessingState.romanNumeralData,
    
    // Operations
    ...operations,
  }), [
    analysisState,
    modelState,
    lyricsState,
    chordProcessingState,
    operations,
  ]);

  return (
    <AnalysisDataContext.Provider value={contextValue}>
      {children}
    </AnalysisDataContext.Provider>
  );
};

export const useAnalysisData = (): AnalysisDataState => {
  const context = useContext(AnalysisDataContext);
  if (context === undefined) {
    throw new Error('useAnalysisData must be used within an AnalysisDataProvider');
  }
  return context;
};

export default AnalysisDataContext;
