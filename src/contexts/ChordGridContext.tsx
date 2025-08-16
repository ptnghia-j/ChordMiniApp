'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { SegmentationResult } from '@/types/chatbotTypes';

// ChordGrid-specific state types
export interface ChordGridState {
  // Beat and playback state
  currentBeatIndex: number;
  isPlaying: boolean;
  
  // Chord correction settings
  showCorrectedChords: boolean;
  chordCorrections: Record<string, string> | null;
  sequenceCorrections: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
  } | null;
  
  // Grid display preferences
  showRomanNumerals: boolean;
  romanNumeralData: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  
  // Segmentation data
  segmentationData: SegmentationResult | null;
  showSegmentation: boolean;
  
  // Edit mode state
  isEditMode: boolean;
  editedChords: Record<string, string>;
  
  // Grid layout state
  timeSignature: number;
  keySignature: string | null;
  isDetectingKey: boolean;
  
  // Panel state (from UI context)
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  
  // Page context
  isUploadPage: boolean;
  
  // Grid data
  chords: string[];
  beats: (number | null)[];
  hasPickupBeats: boolean;
  pickupBeatsCount: number;
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

export interface ChordGridActions {
  // Beat navigation and interaction
  onBeatClick: (beatIndex: number, timestamp: number) => void;
  
  // Chord editing
  onChordEdit: (originalChord: string, newChord: string) => void;
  
  // State updates
  setCurrentBeatIndex: (index: number) => void;
  setShowCorrectedChords: (show: boolean) => void;
  setShowRomanNumerals: (show: boolean) => void;
  setShowSegmentation: (show: boolean) => void;
  setIsEditMode: (edit: boolean) => void;
  
  // Correction updates
  updateChordCorrections: (corrections: Record<string, string> | null) => void;
  updateSequenceCorrections: (corrections: ChordGridState['sequenceCorrections']) => void;
  updateRomanNumeralData: (data: ChordGridState['romanNumeralData']) => void;
  updateSegmentationData: (data: SegmentationResult | null) => void;
}

export interface ChordGridContextValue extends ChordGridState, ChordGridActions {}

const ChordGridContext = createContext<ChordGridContextValue | undefined>(undefined);

interface ChordGridProviderProps {
  children: ReactNode;
  // State injection from parent components
  chordGridState: ChordGridState;
  chordGridActions: ChordGridActions;
}

export const ChordGridProvider: React.FC<ChordGridProviderProps> = ({
  children,
  chordGridState,
  chordGridActions,
}) => {
  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo((): ChordGridContextValue => ({
    ...chordGridState,
    ...chordGridActions,
  }), [chordGridState, chordGridActions]);

  return (
    <ChordGridContext.Provider value={contextValue}>
      {children}
    </ChordGridContext.Provider>
  );
};

export const useChordGrid = (): ChordGridContextValue => {
  const context = useContext(ChordGridContext);
  if (context === undefined) {
    throw new Error('useChordGrid must be used within a ChordGridProvider');
  }
  return context;
};

export default ChordGridContext;
