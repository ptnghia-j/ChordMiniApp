'use client';

import React from 'react';
import ChordGrid from '@/components/chord-analysis/ChordGrid';
import { useAnalysisResults, useKeySignature, useIsDetectingKey, useShowCorrectedChords, useChordCorrections } from '@/stores/analysisStore';
import { useBeatHandlers } from '@/stores/playbackStore';
import { useRomanNumerals, useShowSegmentation, useIsPitchShiftEnabled, useTargetKey } from '@/stores/uiStore';
import { useTransposedChordData } from '@/hooks/chord-analysis/useTransposedChordData';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
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
}) => {
  // PERFORMANCE OPTIMIZATION: Memoize stable props to prevent unnecessary re-renders
  // Only recalculate when the actual data changes, not on every render
  // Use Zustand selectors for automatic optimization
  const storeAnalysisResults = useAnalysisResults();
  const storeKeySignature = useKeySignature();
  const storeIsDetectingKey = useIsDetectingKey();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();

  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedKeySignature = (keySignature !== undefined ? keySignature : storeKeySignature) || undefined;
  const mergedIsDetectingKey = isDetectingKey ?? storeIsDetectingKey;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;

  // Use Zustand selectors to subscribe to only Roman numerals slice
  const { showRomanNumerals: mergedShowRomanNumerals, romanNumeralData: mergedRomanNumeralData } = useRomanNumerals();

  // Segmentation toggle from Zustand store
  const showSegmentation = useShowSegmentation();

  // Get pitch shift state for key signature display from Zustand store
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const targetKey = useTargetKey();

  // Apply pitch shift transposition if enabled
  const { transposedChordGridData } = useTransposedChordData({
    chordGridData,
    correctedSequence: sequenceCorrections?.correctedSequence || null,
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

    // CRITICAL FIX: Keep sequenceCorrections active even when pitch shift is enabled
    // sequenceCorrections is used for Roman numeral mapping and should NOT be disabled
    // Only disable visual chord correction display, not the underlying sequence data
    const effectiveSequenceCorrections = sequenceCorrections; // Always use sequence corrections for Roman numeral mapping
    const effectiveShowCorrectedChords = isPitchShiftEnabled ? false : mergedShowCorrectedChords;
    const effectiveChordCorrections = isPitchShiftEnabled ? null : mergedChordCorrections;

    return {
      chords: effectiveChordGridData.chords,
      beats: effectiveChordGridData.beats,
      // CRITICAL FIX: Pass original chords for Roman numeral mapping
      // Roman numerals should be based on original key, not transposed chords
      originalChordsForRomanNumerals: chordGridData.chords,
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
    chordGridData.chords, // Add original chords to dependencies
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

  // Get click handler from Zustand store
  const { onBeatClick } = useBeatHandlers();

  // PERFORMANCE OPTIMIZATION: Memoize click handler to prevent recreation
  const memoizedOnBeatClick = React.useCallback((beatIndex: number, timestamp: number) => {
    onBeatClick(beatIndex, timestamp);
  }, [onBeatClick]);

  // Render ChordGrid with optimized props
  return (
    <div>
      <ChordGrid
        // PERFORMANCE OPTIMIZATION: Use memoized stable props
        {...stableProps}
        // Click handler from Zustand store
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
