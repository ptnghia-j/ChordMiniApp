'use client';

import React from 'react';
import ChordGrid from '@/components/ChordGrid';
import { RefactoredChordGrid } from './RefactoredChordGrid';
import { ChordGridProvider } from '@/contexts/ChordGridContext';
import { useChordGridContext } from '@/hooks/useChordGridContext';
import { useAnalysisData } from '@/contexts/AnalysisDataContext';
import { usePlayback } from '@/contexts/PlaybackContext';
import { useRomanNumeralsSelector, useSegmentationSelector } from '@/contexts/selectors';
import { useTransposedChordData } from '@/hooks/useTransposedChordData';
import { useUI } from '@/contexts/UIContext';
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
  analysisResults?: AnalysisResult | null;
  chordGridData: ChordGridData; // Accept comprehensive chord grid data as prop
  keySignature?: string | null;
  isDetectingKey?: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
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
  // Edit mode props
  isEditMode?: boolean;
  editedChords?: Record<number, string>;
  onChordEdit?: (index: number, newChord: string) => void;
  // NEW: Enable refactored version with context and performance optimizations
  useRefactoredVersion?: boolean;
  enableVirtualization?: boolean;
  virtualizationThreshold?: number;
}

export const ChordGridContainer: React.FC<ChordGridContainerProps> = React.memo(({
  analysisResults,
  chordGridData, // Use the comprehensive chord grid data passed as prop
  keySignature,
  isDetectingKey,
  isChatbotOpen,
  isLyricsPanelOpen,
  isUploadPage = false,
  showCorrectedChords,
  chordCorrections = null,
  sequenceCorrections = null,
  segmentationData = null,
  isEditMode = false,
  editedChords = {},
  onChordEdit,
  useRefactoredVersion = false,
  enableVirtualization = true,
  virtualizationThreshold = 100,
}) => {
  // PERFORMANCE OPTIMIZATION: Memoize stable props to prevent unnecessary re-renders
  // Only recalculate when the actual data changes, not on every render
  const analysisCtx = useAnalysisData();
  const mergedAnalysisResults = analysisResults ?? analysisCtx.analysisResults;
  const mergedKeySignature = (keySignature !== undefined ? keySignature : analysisCtx.keySignature) || undefined;
  const mergedIsDetectingKey = isDetectingKey ?? analysisCtx.isDetectingKey;
  const mergedShowCorrectedChords = showCorrectedChords ?? analysisCtx.showCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? analysisCtx.chordCorrections;
  // Use selector to subscribe to only Roman numerals slice
  const { showRomanNumerals: mergedShowRomanNumerals, romanNumeralData: mergedRomanNumeralData } = useRomanNumeralsSelector();

  // Segmentation toggle from UI context
  const { showSegmentation } = useSegmentationSelector();

  // Get pitch shift state for key signature display
  const { isPitchShiftEnabled, targetKey } = useUI();

  // Apply pitch shift transposition if enabled
  const { transposedChordGridData } = useTransposedChordData({
    chordGridData,
  });

  // Use transposed data if available, otherwise use original
  const effectiveChordGridData = transposedChordGridData || chordGridData;

  const stableProps = React.useMemo(() => {
    const timeSignature = mergedAnalysisResults?.beatDetectionResult?.time_signature || 4;

    // Use targetKey when pitch shift is enabled, otherwise use original keySignature
    // When pitch shift is enabled, add the quality suffix (major/minor) back to the transposed key
    let displayKey = mergedKeySignature;
    if (isPitchShiftEnabled && targetKey && mergedKeySignature) {
      // Extract quality from original key signature (e.g., "E♭ major" -> "major")
      const qualityMatch = mergedKeySignature.match(/\s+(major|minor)$/i);
      const quality = qualityMatch ? qualityMatch[1] : '';
      // Combine transposed note with original quality
      displayKey = quality ? `${targetKey} ${quality}` : targetKey;
    }

    console.log(`🎹 Key display logic: isPitchShiftEnabled=${isPitchShiftEnabled}, targetKey=${targetKey}, mergedKeySignature=${mergedKeySignature}, displayKey=${displayKey}`);

    // When pitch shift is enabled, disable ALL chord corrections to show transposed chords
    // Chord corrections are based on the original key and would override transposition
    const effectiveSequenceCorrections = isPitchShiftEnabled ? null : sequenceCorrections;
    const effectiveShowCorrectedChords = isPitchShiftEnabled ? false : mergedShowCorrectedChords;
    const effectiveChordCorrections = isPitchShiftEnabled ? null : mergedChordCorrections;

    // Debug logging for slash chords (exclude N/C and N.C. which are not real slash chords)
    if (isPitchShiftEnabled && effectiveChordGridData.chords) {
      const slashChords = effectiveChordGridData.chords.filter(c =>
        c.includes('/') && !c.match(/^N[./]C$/i)
      );
      if (slashChords.length > 0) {
        console.log(`🎸 Real slash chords in transposed data (first 10):`, slashChords.slice(0, 10));
      }
    }

    return {
      chords: effectiveChordGridData.chords,
      beats: effectiveChordGridData.beats,
      timeSignature,
      keySignature: displayKey,
      isDetectingKey: mergedIsDetectingKey,
      hasPickupBeats: effectiveChordGridData.hasPickupBeats,
      pickupBeatsCount: effectiveChordGridData.pickupBeatsCount,
      hasPadding: effectiveChordGridData.hasPadding,
      paddingCount: effectiveChordGridData.paddingCount,
      shiftCount: effectiveChordGridData.shiftCount,
      beatTimeRangeStart: mergedAnalysisResults?.beatDetectionResult?.beat_time_range_start || 0,
      originalAudioMapping: effectiveChordGridData.originalAudioMapping,
      isUploadPage,
      showCorrectedChords: effectiveShowCorrectedChords,
      chordCorrections: effectiveChordCorrections,
      sequenceCorrections: effectiveSequenceCorrections,
      segmentationData,
      showSegmentation,
      showRomanNumerals: mergedShowRomanNumerals,
      romanNumeralData: mergedRomanNumeralData
    };
  }, [
    effectiveChordGridData.chords,
    effectiveChordGridData.beats,
    effectiveChordGridData.hasPickupBeats,
    effectiveChordGridData.pickupBeatsCount,
    effectiveChordGridData.hasPadding,
    effectiveChordGridData.paddingCount,
    effectiveChordGridData.shiftCount,
    effectiveChordGridData.originalAudioMapping,
    mergedAnalysisResults?.beatDetectionResult?.time_signature,
    mergedAnalysisResults?.beatDetectionResult?.beat_time_range_start,
    mergedKeySignature,
    mergedIsDetectingKey,
    isUploadPage,
    mergedShowCorrectedChords,
    mergedChordCorrections,
    sequenceCorrections,
    segmentationData,
    showSegmentation,
    mergedShowRomanNumerals,
    mergedRomanNumeralData,
    isPitchShiftEnabled,
    targetKey
  ]);

  // Get beat state and click handler from PlaybackContext
  const { currentBeatIndex, onBeatClick } = usePlayback();
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
        // Beat state and click handler now come from context
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
