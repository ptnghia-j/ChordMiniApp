'use client';

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  getSegmentationColorForBeatIndex,
  formatRomanNumeral,
  buildBeatToChordSequenceMap
} from '@/utils/chordFormatting';

import {
  getChordStyle
} from '@/utils/chordStyling';
import { createShiftedChords } from '@/utils/chordProcessing';
import { useChordGridLayout } from '@/hooks/useChordGridLayout';
import { useChordDataProcessing } from '@/hooks/useChordDataProcessing';
import { useChordInteractions } from '@/hooks/useChordInteractions';
import { useLoopBeatSelection } from '@/hooks/useLoopBeatSelection';
import { useTheme } from '@/contexts/ThemeContext';
import { SegmentationResult } from '@/types/chatbotTypes';
import { ChordGridHeader } from './ChordGridHeader';
import { ChordCell } from './ChordCell';

/**
 * PERFORMANCE OPTIMIZATION: Memoized ChordCell Component
 *
 * This component is memoized to prevent unnecessary re-renders when only
 * the currentBeatIndex changes. Only cells that actually change state
 * (active/inactive) will re-render, reducing DOM updates from 1000+ to 2-3.
 *
 * Expected improvement: 80-90% reduction in render time
 */

interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
  audioIndex: number; // Original audio index for accurate beat click handling
}

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am') - may be transposed
  beats: (number | null)[]; // Array of corresponding beat timestamps (in seconds) - Updated to match service type
  currentBeatIndex?: number; // Current beat index for highlighting, optional
  timeSignature?: number; // Time signature (beats per measure), defaults to 4
  keySignature?: string; // Key signature (e.g., 'C Major')
  isDetectingKey?: boolean; // Whether key detection is in progress
  isChatbotOpen?: boolean; // Whether the chatbot panel is open
  isLyricsPanelOpen?: boolean; // Whether the lyrics panel is open
  hasPickupBeats?: boolean; // Whether the grid includes pickup beats
  pickupBeatsCount?: number; // Number of pickup beats
  hasPadding?: boolean; // Whether the chords array already includes padding/shifting
  paddingCount?: number; // Number of padding beats (for visual distinction)
  shiftCount?: number; // Number of shift beats (for visual distinction)
  beatTimeRangeStart?: number; // Start time of beat detection range (for padding timestamp calculation)
  originalAudioMapping?: AudioMappingItem[]; // NEW: Original timestamp-to-chord mapping for audio sync
  onBeatClick?: (beatIndex: number, timestamp: number) => void; // Callback for beat cell clicks
  isUploadPage?: boolean; // Whether this is the upload audio file page (for different layout)
  // Visual indicator for corrected chords
  showCorrectedChords?: boolean; // Whether corrected chords are being displayed
  //chordCorrections?: Record<string, string> | null; // Mapping of original chords to corrected chords (legacy)
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
  segmentationData?: SegmentationResult | null; // Segmentation analysis results
  showSegmentation?: boolean; // Whether to show segmentation colors
  // Edit mode props
  isEditMode?: boolean; // Whether edit mode is active
  editedChords?: Record<number, string>; // Temporarily edited chord values
  onChordEdit?: (index: number, newChord: string) => void; // Callback for chord edits
  // Roman numeral analysis props
  showRomanNumerals?: boolean; // Whether to show Roman numeral analysis
  romanNumeralData?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
  // CRITICAL FIX: Original chords for Roman numeral mapping (not transposed)
  originalChordsForRomanNumerals?: string[]; // Original chords before transposition for Roman numeral alignment
}

/**
 * Custom comparison function for ChordGrid memoization
 * Only re-render if props that actually affect the visual output change
 *
 * PERFORMANCE OPTIMIZATION: ChordGrid must re-render when currentBeatIndex changes
 * to recalculate isCurrentBeat for each cell. The optimization happens at ChordCell level,
 * where only cells with changed isCurrentBeat prop will re-render (prev + current beat).
 */
const areChordGridPropsEqual = (
  prevProps: ChordGridProps,
  nextProps: ChordGridProps
): boolean => {
  // Chord data - critical for visual output
  if (prevProps.chords !== nextProps.chords) return false;
  if (prevProps.beats !== nextProps.beats) return false;
  if (prevProps.originalChordsForRomanNumerals !== nextProps.originalChordsForRomanNumerals) return false;

  // Layout props
  if (prevProps.timeSignature !== nextProps.timeSignature) return false;
  if (prevProps.keySignature !== nextProps.keySignature) return false;
  if (prevProps.isDetectingKey !== nextProps.isDetectingKey) return false;
  if (prevProps.isChatbotOpen !== nextProps.isChatbotOpen) return false;
  if (prevProps.isLyricsPanelOpen !== nextProps.isLyricsPanelOpen) return false;
  if (prevProps.isUploadPage !== nextProps.isUploadPage) return false;

  // Pickup beats and padding
  if (prevProps.hasPickupBeats !== nextProps.hasPickupBeats) return false;
  if (prevProps.pickupBeatsCount !== nextProps.pickupBeatsCount) return false;
  if (prevProps.hasPadding !== nextProps.hasPadding) return false;
  if (prevProps.paddingCount !== nextProps.paddingCount) return false;
  if (prevProps.shiftCount !== nextProps.shiftCount) return false;
  if (prevProps.beatTimeRangeStart !== nextProps.beatTimeRangeStart) return false;

  // Chord corrections
  if (prevProps.showCorrectedChords !== nextProps.showCorrectedChords) return false;
  if (prevProps.sequenceCorrections !== nextProps.sequenceCorrections) return false;

  // Segmentation
  if (prevProps.segmentationData !== nextProps.segmentationData) return false;
  if (prevProps.showSegmentation !== nextProps.showSegmentation) return false;

  // Roman numerals
  if (prevProps.showRomanNumerals !== nextProps.showRomanNumerals) return false;
  if (prevProps.romanNumeralData !== nextProps.romanNumeralData) return false;

  // Edit mode
  if (prevProps.isEditMode !== nextProps.isEditMode) return false;
  if (prevProps.editedChords !== nextProps.editedChords) return false;

  // Audio mapping
  if (prevProps.originalAudioMapping !== nextProps.originalAudioMapping) return false;

  // CRITICAL FIX: Must check currentBeatIndex to allow beat animation
  // When currentBeatIndex changes, ChordGrid re-renders to recalculate isCurrentBeat for each cell
  // ChordCell memoization ensures only cells with changed isCurrentBeat actually re-render (2 cells)
  if (prevProps.currentBeatIndex !== nextProps.currentBeatIndex) return false;

  // Ignore callback props (onBeatClick, onChordEdit)
  // These are functions and shouldn't trigger re-renders if they're functionally equivalent

  // If all visual props are the same, skip re-render
  return true;
};

const ChordGrid: React.FC<ChordGridProps> = React.memo(({
  chords,
  beats,
  currentBeatIndex = -1,
  timeSignature = 4,
  keySignature,
  isDetectingKey = false,
  isChatbotOpen = false,
  isLyricsPanelOpen = false,
  hasPickupBeats = false,
  pickupBeatsCount = 0,
  hasPadding = false,
  paddingCount = 0,
  shiftCount = 0,

  originalAudioMapping,
  onBeatClick,
  isUploadPage = false,
  showCorrectedChords = false,
  //chordCorrections = null,
  sequenceCorrections = null,
  segmentationData = null,
  showSegmentation = false,
  isEditMode = false,
  editedChords = {},
  onChordEdit,
  showRomanNumerals = false,
  romanNumeralData = null,
  originalChordsForRomanNumerals // CRITICAL FIX: Original chords for Roman numeral mapping
}) => {

  // Get theme for dark mode detection
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // PERFORMANCE FIX #2: CSS-based beat highlighting
  // Track previous beat for efficient CSS class updates
  const previousBeatRef = useRef<number>(-1);
  const gridElementRef = useRef<HTMLDivElement | null>(null);

  // Use simple time signature - no complex beat source logic
  const actualBeatsPerMeasure = timeSignature;

  // Function to get segmentation color for a specific beat index using shared utility
  const getSegmentationColorForBeatIndexLocal = (beatIndex: number): string | undefined => {
    return getSegmentationColorForBeatIndex(
      beatIndex,
      beats,
      segmentationData,
      showSegmentation,
      originalAudioMapping,
      null
    );
  };

  // Use custom hook for chord data processing
  const {
    shiftedChords,
    getDisplayChord: getDisplayChordLocal,
    shouldShowChordLabel: shouldShowChordLabelLocal
  } = useChordDataProcessing(
    chords,
    hasPadding,
    actualBeatsPerMeasure,
    shiftCount,
    showCorrectedChords,
    sequenceCorrections
  );

  // Use utility function for grid columns class (already imported)

  // Use utility function for dynamic font sizing (already imported)

  // Use custom hook for interactions
  const { handleBeatClick, isClickable } = useChordInteractions(
    onBeatClick || null,
    beats,
    hasPadding,
    shiftCount,
    paddingCount,
    chords,
    originalAudioMapping
  );

  // Use custom hook for loop beat selection
  const {
    isLoopEnabled,
    handleLoopBeatClick,
    isInLoopRange
  } = useLoopBeatSelection();

  // Use custom hook for layout calculations
  const {
    cellSize,
    gridLayoutConfig,
    getDynamicFontSize,
    getGridColumnsClass,
    containerRef: gridContainerRef
  } = useChordGridLayout(
    isUploadPage,
    actualBeatsPerMeasure,
    chords.length,
    isChatbotOpen,
    isLyricsPanelOpen
  );

  // Merged ref callback to handle both layout hook ref and our element ref
  const mergedGridRef = useCallback((node: HTMLDivElement | null) => {
    // Store in our ref for CSS class updates
    gridElementRef.current = node;
    // Call the layout hook's ref callback
    if (gridContainerRef) {
      gridContainerRef(node);
    }
  }, [gridContainerRef]);

  // PERFORMANCE FIX #2: CSS-based beat highlighting
  // Update CSS class for current beat (no React re-renders, pure CSS)
  useEffect(() => {
    if (currentBeatIndex === undefined || currentBeatIndex < 0) return;
    if (!gridElementRef.current) return;

    // Defensive cleanup: remove any stale highlights first (e.g., after theme/loop toggles)
    const highlighted = gridElementRef.current.querySelectorAll('.chord-cell.current-beat-highlight');
    highlighted.forEach((el) => {
      const idx = (el as HTMLElement).getAttribute('data-beat-index');
      if (idx === null || Number(idx) !== currentBeatIndex) {
        el.classList.remove('current-beat-highlight');
      }
    });

    // Remove highlight from previously tracked beat (redundant but cheap)
    if (previousBeatRef.current >= 0 && previousBeatRef.current !== currentBeatIndex) {
      const prevCell = gridElementRef.current.querySelector(
        `.chord-cell[data-beat-index="${previousBeatRef.current}"]`
      );
      if (prevCell) prevCell.classList.remove('current-beat-highlight');
    }

    // Add highlight to current beat
    const currentCell = gridElementRef.current.querySelector(
      `.chord-cell[data-beat-index="${currentBeatIndex}"]`
    );
    if (currentCell) {
      currentCell.classList.add('current-beat-highlight');
    }

    previousBeatRef.current = currentBeatIndex;
  }, [currentBeatIndex, theme, isLoopEnabled]);

  // PERFORMANCE OPTIMIZATION: Extract layout values from memoized config
  const { measuresPerRow: dynamicMeasuresPerRow } = gridLayoutConfig;

  // Use utility function for chord styling
  const getChordStyleLocal = useCallback((chord: string, beatIndex: number, isClickable: boolean = true) => {
    return getChordStyle(chord, beatIndex, isClickable, hasPickupBeats, timeSignature, pickupBeatsCount);
  }, [hasPickupBeats, timeSignature, pickupBeatsCount]);

  // Memoized measure grouping with proper pickup beat handling using shifted chords
  const groupedByMeasure = useMemo(() => {
    if (chords.length === 0) {
      return [];
    }
    const measures: Array<{
      measureNumber: number;
      chords: string[];
      beats: number[];
      isPickupMeasure?: boolean;
    }> = [];

  // SIMPLIFIED: Basic measure grouping without padding/shift complexity
  let currentIndex = 0;
  let measureNumber = 0;

  while (currentIndex < shiftedChords.length) {
    const measure = {
      measureNumber: measureNumber,
      chords: [] as string[],
      beats: [] as number[],
      isPickupMeasure: false
    };

    // Simple measure grouping: exactly actualBeatsPerMeasure beats per measure
    for (let b = 0; b < actualBeatsPerMeasure && currentIndex < shiftedChords.length; b++) {
      measure.chords.push(shiftedChords[currentIndex]);
      const beatTime = beats[currentIndex];
      measure.beats.push(typeof beatTime === 'number' ? beatTime : 0);
      currentIndex++;
    }

    // FIXED: Only pad incomplete measures if they have actual content
    // This prevents trailing empty measures from beat-transformer-light
    if (measure.chords.length > 0) {
      // Pad incomplete measures to maintain consistent grid layout
      while (measure.chords.length < actualBeatsPerMeasure) {
        measure.chords.push(''); // Empty cell for padding
        measure.beats.push(-1); // Invalid beat index for padding
      }
      measures.push(measure);
      measureNumber++;
    }
  }

    return measures;
  }, [shiftedChords, beats, actualBeatsPerMeasure, chords.length]);

  // PERFORMANCE OPTIMIZATION: Memoized rows calculation
  // Group measures into rows using the dynamic measures per row
  const rows = useMemo(() => {
    const calculatedRows: Array<typeof groupedByMeasure> = [];
    for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
      calculatedRows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
    }
    return calculatedRows;
  }, [groupedByMeasure, dynamicMeasuresPerRow]);

  // CRITICAL FIX: Use original chords for Roman numeral mapping to prevent misalignment during pitch shift
  // Roman numerals are key-relative and should remain constant regardless of transposition
  // Only chord labels should change during pitch shift, not the Roman numeral analysis
  const beatToChordSequenceMap = useMemo(() => {
    // Use original chords if available (when pitch shift is active), otherwise use shifted chords
    const chordsForMapping = originalChordsForRomanNumerals || chords;

    // Process original chords through the same shifting logic to get the correct sequence
    const originalShiftedChords = originalChordsForRomanNumerals
      ? createShiftedChords(originalChordsForRomanNumerals, hasPadding, actualBeatsPerMeasure, shiftCount)
      : shiftedChords;

    return buildBeatToChordSequenceMap(
      chordsForMapping.length,
      originalShiftedChords,
      romanNumeralData,
      sequenceCorrections
    );
  }, [chords, shiftedChords, romanNumeralData, sequenceCorrections, originalChordsForRomanNumerals, hasPadding, actualBeatsPerMeasure, shiftCount]);

  // Memoize Roman numeral formatting to avoid per-cell recomputation on toggles
  const formatRomanNumeralMemo = useMemo(() => {
    const cache = new Map<string, React.ReactElement | string>();
    if (romanNumeralData?.analysis) {
      romanNumeralData.analysis.forEach((rn) => {
        if (rn && !cache.has(rn)) cache.set(rn, formatRomanNumeral(rn));
      });
    }
    return (rn: string) => {
      if (!rn) return '' as const;
      const v = cache.get(rn);
      return v !== undefined ? v : formatRomanNumeral(rn);
    };
  }, [romanNumeralData]);

  // Early return if no chords available
  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-700 dark:text-gray-200 text-center p-4 bg-white dark:bg-content-bg rounded-md border border-gray-200 dark:border-gray-600 w-full transition-colors duration-300">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  // Group consecutive identical chords and calculate their durations
  const chordDurations: Array<{chord: string, startBeat: number, endBeat: number, startTime: number, endTime: number, duration: number}> = [];
  let currentChordGroup = { chord: shiftedChords[0] || 'undefined', startIndex: 0 };

  for (let i = 1; i <= shiftedChords.length; i++) {
    const currentChord = i < shiftedChords.length ? shiftedChords[i] : 'END';

    // If chord changes or we reach the end
    if (currentChord !== currentChordGroup.chord || i === shiftedChords.length) {
      const endIndex = i - 1;
      const startTime = beats[currentChordGroup.startIndex];
      const endTime = beats[endIndex];

      // Calculate duration
      let duration = 0;
      if (typeof startTime === 'number' && typeof endTime === 'number') {
        duration = endTime - startTime;
      } else if (typeof startTime === 'number' && i < beats.length) {
        // For last chord, estimate duration
        const nextTime = beats[i];
        if (typeof nextTime === 'number') {
          duration = nextTime - startTime;
        } else {
          duration = 0.5; // Default estimate
        }
      }

      chordDurations.push({
        chord: currentChordGroup.chord,
        startBeat: currentChordGroup.startIndex,
        endBeat: endIndex,
        startTime: typeof startTime === 'number' ? startTime : 0,
        endTime: typeof endTime === 'number' ? endTime : 0,
        duration: duration
      });

      // Start new group
      if (i < shiftedChords.length) {
        currentChordGroup = { chord: currentChord, startIndex: i };
      }
    }
  }

  return (
    <div
      ref={mergedGridRef}
      className="chord-grid-container mx-auto px-0.5 sm:px-1 relative"
      style={{ maxWidth: "99%" }}
      data-current-beat={currentBeatIndex !== undefined && currentBeatIndex >= 0 ? currentBeatIndex : undefined}
    >
      {/* Clean card container with minimal styling */}
      <div className="bg-white dark:bg-content-bg rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">

        {/* Header section using extracted component */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600">
          <ChordGridHeader
            timeSignature={timeSignature}
            keySignature={keySignature}
            isDetectingKey={isDetectingKey}
            hasPickupBeats={hasPickupBeats}
            pickupBeatsCount={pickupBeatsCount}
            className="mb-0"
          />
        </div>

        {/* Clean grid area with minimal background */}
        <div className="px-0 dark:bg-dark-bg bg-gray-50">
          {/* Render rows of measures */}
          <div className="space-y-0.5 overflow-x-auto">
        {rows.map((row, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="measure-row min-w-0"
          >
            {/* Grid of measures with consistent responsive layout */}
            <div className={`grid gap-1 sm:gap-1 w-full ${
              // Consistent grid that maintains complete measures per row across all screen sizes
              dynamicMeasuresPerRow === 1 ? 'grid-cols-1' :
              dynamicMeasuresPerRow === 2 ? 'grid-cols-2' :
              dynamicMeasuresPerRow === 3 ? 'grid-cols-3' :
              dynamicMeasuresPerRow === 4 ? 'grid-cols-4' :
              dynamicMeasuresPerRow === 5 ? 'grid-cols-5' :
              dynamicMeasuresPerRow === 6 ? 'grid-cols-6' :
              dynamicMeasuresPerRow === 7 ? 'grid-cols-7' :
              dynamicMeasuresPerRow === 8 ? 'grid-cols-8' :
              dynamicMeasuresPerRow === 9 ? 'grid-cols-9' :
              dynamicMeasuresPerRow === 10 ? 'grid-cols-10' :
              'grid-cols-4' // Fallback
            }`}>
              {row.map((measure, measureIdx) => {
                return (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="border-l-[3px] border-gray-600 dark:border-gray-400 min-w-0 flex-shrink-0"
                  style={{
                    paddingLeft: '2px'
                  }}
                >
                  {/* Chord cells for this measure - consistent grid based on time signature */}
                  <div className={`grid gap-0.5 auto-rows-fr ${getGridColumnsClass()}`}>
                    {measure.chords.map((chord, beatIdx) => {
                      // Calculate global index with consistent measure layout
                      // Each measure always has exactly actualBeatsPerMeasure cells
                      let globalIndex = 0;

                      // Count beats from all previous rows (each measure has actualBeatsPerMeasure beats)
                      for (let r = 0; r < rowIdx; r++) {
                        globalIndex += rows[r].length * actualBeatsPerMeasure;
                      }

                      // Count beats from previous measures in current row
                      globalIndex += measureIdx * actualBeatsPerMeasure;

                      // Add current beat index within this measure
                      globalIndex += beatIdx;

                      // FIXED: Use currentBeatIndex directly - animation logic already accounts for shift/padding
                      // The analyze page animation logic handles shift and padding correctly
                      const isCurrentBeat = globalIndex === currentBeatIndex;
                      const showChordLabel = shouldShowChordLabelLocal(globalIndex);
                      const isEmpty = chord === '';

                      // Use hook function for click logic
                      const isClickableCell = isClickable(globalIndex, chord);

                      // COMMENTED OUT: Complex padding/shift click logic
                      // const isShiftCell = hasPadding && globalIndex < shiftCount;
                      // if (isShiftCell) {
                      //   isClickable = false; // Shift cells are not clickable
                      // }

                      // PERFORMANCE OPTIMIZATION: Use memoized ChordCell component
                      // This prevents unnecessary re-renders when only currentBeatIndex changes
                      const { chord: displayChord, wasCorrected } = getDisplayChordLocal(chord, globalIndex);

                      // Get segmentation color for this beat
                      const segmentationColor = getSegmentationColorForBeatIndexLocal(globalIndex);

                      // Get Roman numeral for this chord using chord sequence mapping
                      // Only show Roman numeral when chord label is shown (chord changes)
                      const chordSequenceIndex = beatToChordSequenceMap[globalIndex];
                      const rawRomanNumeral = showRomanNumerals && showChordLabel && romanNumeralData?.analysis && chordSequenceIndex !== undefined
                        ? romanNumeralData.analysis[chordSequenceIndex] || ''
                        : '';
                      const romanNumeral = rawRomanNumeral ? formatRomanNumeralMemo(rawRomanNumeral) : '';

                      // Check for modulation at this chord index
                      const modulationInfo = sequenceCorrections?.keyAnalysis?.modulations?.find(
                        mod => mod.atIndex === chordSequenceIndex
                      );
                      const modulationMarker = modulationInfo ? {
                        isModulation: true,
                        fromKey: modulationInfo.fromKey,
                        toKey: modulationInfo.toKey
                      } : undefined;

                      return (
                        <ChordCell
                          key={`chord-${globalIndex}`}
                          chord={chord}
                          globalIndex={globalIndex}
                          isCurrentBeat={isCurrentBeat}
                          isClickable={isClickableCell}
                          cellSize={cellSize}
                          isDarkMode={isDarkMode}
                          showChordLabel={showChordLabel}
                          isEmpty={isEmpty}
                          displayChord={displayChord}
                          wasCorrected={wasCorrected}
                          segmentationColor={segmentationColor}
                          onBeatClick={handleBeatClick}
                          getChordStyle={getChordStyleLocal}
                          getDynamicFontSize={getDynamicFontSize}
                          isEditMode={isEditMode}
                          editedChord={editedChords?.[globalIndex]}
                          onChordEdit={onChordEdit}
                          showRomanNumerals={showRomanNumerals}
                          romanNumeral={romanNumeral}
                          modulationInfo={modulationMarker}
                          isLoopEnabled={isLoopEnabled}
                          isInLoopRange={isInLoopRange(globalIndex)}
                          onLoopBeatClick={handleLoopBeatClick}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        ))}
          </div>
        </div> {/* Close grid area */}

      </div> {/* Close card container */}
    </div>
  );
}, areChordGridPropsEqual);

ChordGrid.displayName = 'ChordGrid';

export default ChordGrid;
