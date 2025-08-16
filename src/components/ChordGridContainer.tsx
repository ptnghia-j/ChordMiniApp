'use client';

import React from 'react';
import ChordGrid from '@/components/ChordGrid';
import { RefactoredChordGrid } from './RefactoredChordGrid';
import { ChordGridProvider } from '@/contexts/ChordGridContext';
import { useChordGridContext } from '@/hooks/useChordGridContext';
// import { AnalysisSummary } from '@/components/AnalysisSummary';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { SegmentationResult } from '@/types/chatbotTypes';

interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
  audioIndex: number; // Updated to match ChordGrid component format
}

interface ChordGridData {
  chords: string[];
  beats: (number | null)[]; // Updated to match service type
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number; // Added to match service type
  hasPickupBeats?: boolean;
  pickupBeatsCount?: number;
  originalAudioMapping?: AudioMappingItem[]; // NEW: Original timestamp-to-chord mapping for audio sync
}

interface ChordGridContainerProps {
  analysisResults: AnalysisResult | null;
  chordGridData: ChordGridData; // Accept comprehensive chord grid data as prop
  currentBeatIndex: number;
  keySignature: string | null;
  isDetectingKey: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  onBeatClick: (beatIndex: number, timestamp: number) => void;
  isUploadPage?: boolean; // Whether this is the upload audio file page
  // Visual indicator for corrected chords
  showCorrectedChords?: boolean;
  chordCorrections?: Record<string, string> | null;
  // NEW: Enhanced sequence-based corrections
  sequenceCorrections?: {
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
  // NEW: Song segmentation data for color-coding
  segmentationData?: SegmentationResult | null;
  showSegmentation?: boolean;
  // Edit mode props
  isEditMode?: boolean;
  editedChords?: Record<number, string>;
  onChordEdit?: (index: number, newChord: string) => void;
  // Roman numeral analysis props
  showRomanNumerals?: boolean;
  romanNumeralData?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  // NEW: Enable refactored version with context and performance optimizations
  useRefactoredVersion?: boolean;
  enableVirtualization?: boolean;
  virtualizationThreshold?: number;
}

export const ChordGridContainer: React.FC<ChordGridContainerProps> = React.memo(({
  analysisResults,
  chordGridData, // Use the comprehensive chord grid data passed as prop
  currentBeatIndex,
  keySignature,
  isDetectingKey,
  isChatbotOpen,
  isLyricsPanelOpen,
  onBeatClick,
  isUploadPage = false,
  showCorrectedChords = false,
  chordCorrections = null,
  sequenceCorrections = null,
  segmentationData = null,
  showSegmentation = false,
  isEditMode = false,
  editedChords = {},
  onChordEdit,
  showRomanNumerals = false,
  romanNumeralData = null,
  useRefactoredVersion = false,
  enableVirtualization = true,
  virtualizationThreshold = 100,
}) => {
  // PERFORMANCE OPTIMIZATION: Memoize stable props to prevent unnecessary re-renders
  // Only recalculate when the actual data changes, not on every render
  const stableProps = React.useMemo(() => {
    const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;

    return {
      chords: chordGridData.chords,
      beats: chordGridData.beats,
      timeSignature,
      keySignature: keySignature || undefined,
      isDetectingKey,
      hasPickupBeats: chordGridData.hasPickupBeats,
      pickupBeatsCount: chordGridData.pickupBeatsCount,
      hasPadding: chordGridData.hasPadding,
      paddingCount: chordGridData.paddingCount,
      shiftCount: chordGridData.shiftCount,
      beatTimeRangeStart: analysisResults?.beatDetectionResult?.beat_time_range_start || 0,
      originalAudioMapping: chordGridData.originalAudioMapping,
      isUploadPage,
      showCorrectedChords,
      chordCorrections,
      sequenceCorrections,
      segmentationData,
      showSegmentation,
      showRomanNumerals,
      romanNumeralData
    };
  }, [
    chordGridData.chords,
    chordGridData.beats,
    chordGridData.hasPickupBeats,
    chordGridData.pickupBeatsCount,
    chordGridData.hasPadding,
    chordGridData.paddingCount,
    chordGridData.shiftCount,
    chordGridData.originalAudioMapping,
    analysisResults?.beatDetectionResult?.time_signature,
    analysisResults?.beatDetectionResult?.beat_time_range_start,
    keySignature,
    isDetectingKey,
    isUploadPage,
    showCorrectedChords,
    chordCorrections,
    sequenceCorrections,
    segmentationData,
    showSegmentation,
    showRomanNumerals,
    romanNumeralData
  ]);

  // PERFORMANCE OPTIMIZATION: Memoize click handler to prevent recreation
  const memoizedOnBeatClick = React.useCallback((beatIndex: number, timestamp: number) => {
    onBeatClick(beatIndex, timestamp);
  }, [onBeatClick]);

  // Use context-based hook for refactored version
  const { chordGridState, chordGridActions } = useChordGridContext({
    chordGridData: {
      chords: chordGridData.chords,
      beats: chordGridData.beats,
      hasPickupBeats: chordGridData.hasPickupBeats || false,
      pickupBeatsCount: chordGridData.pickupBeatsCount || 0,
      hasPadding: chordGridData.hasPadding,
      paddingCount: chordGridData.paddingCount,
      shiftCount: chordGridData.shiftCount,
      originalAudioMapping: chordGridData.originalAudioMapping,
    },
    currentBeatIndex,
    timeSignature: 4, // Default time signature, can be made configurable
    isUploadPage,
    onBeatClick: memoizedOnBeatClick,
    onChordEdit: onChordEdit ? (originalChord: string, newChord: string) => {
      // Convert from string-based to index-based for compatibility
      const index = chordGridData.chords.findIndex(chord => chord === originalChord);
      if (index !== -1) onChordEdit(index, newChord);
    } : undefined,
  });

  // Render refactored version with context
  if (useRefactoredVersion) {
    return (
      <ChordGridProvider
        chordGridState={chordGridState}
        chordGridActions={chordGridActions}
      >
        <RefactoredChordGrid
          enableVirtualization={enableVirtualization}
          virtualizationThreshold={virtualizationThreshold}
        />
      </ChordGridProvider>
    );
  }

  // Render legacy version
  return (
    <div>
      <ChordGrid
        // PERFORMANCE OPTIMIZATION: Use memoized stable props
        {...stableProps}
        // Only frequently changing props passed directly
        currentBeatIndex={currentBeatIndex}
        isChatbotOpen={isChatbotOpen}
        isLyricsPanelOpen={isLyricsPanelOpen}
        onBeatClick={memoizedOnBeatClick}
        isEditMode={isEditMode}
        editedChords={editedChords}
        onChordEdit={onChordEdit}
      />
    </div>
  );
});

ChordGridContainer.displayName = 'ChordGridContainer';
