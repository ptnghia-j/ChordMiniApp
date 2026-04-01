'use client';

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import BeatHighlighter from './BeatHighlighter';
import {
  formatRomanNumeral,
  buildBeatToChordSequenceMap
} from '@/utils/chordFormatting';

import {
  getChordStyle
} from '@/utils/chordStyling';
import { createShiftedChords } from '@/utils/chordProcessing';
import { useChordGridLayout } from '@/hooks/chord-analysis/useChordGridLayout';
import { useChordDataProcessing } from '@/hooks/chord-analysis/useChordDataProcessing';
import { useChordInteractions } from '@/hooks/chord-analysis/useChordInteractions';
import { useLoopBeatSelection } from '@/hooks/chord-analysis/useLoopBeatSelection';
import { useTheme } from '@/contexts/ThemeContext';
import { SegmentationResult } from '@/types/chatbotTypes';
import { ChordGridHeader } from './ChordGridHeader';
import { ChordCell } from './ChordCell';
import { getDisplayAccidentalPreference } from '@/utils/chordUtils';
import { getSegmentationColor } from '@/utils/segmentationColors';
import { buildSegmentedSectionBlocks, getVisibleCellsForSegmentedSlot, SegmentedSectionRow, shouldRenderSegmentedSlotMeasureBar } from '@/utils/chordGridSegmentationLayout';

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

interface GroupedMeasure {
  measureNumber: number;
  chords: string[];
  beats: number[];
  isPickupMeasure?: boolean;
  visualStartIndex: number;
}

interface SectionBlock {
  label: string;
  accentColor: string;
  rows: SegmentedSectionRow[];
}

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am') - may be transposed
  beats: (number | null)[]; // Array of corresponding beat timestamps (in seconds) - Updated to match service type
  // currentBeatIndex removed: BeatHighlighter subscribes directly to store
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
 * PERFORMANCE OPTIMIZATION: Beat highlighting is handled outside React by BeatHighlighter.
 * ChordGrid no longer re-renders on beat changes, preventing grid-wide updates.
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

  // Ignore callback props (onBeatClick, onChordEdit)
  // These are functions and shouldn't trigger re-renders if they're functionally equivalent

  // If all visual props are the same, skip re-render
  return true;
};

const ChordGrid: React.FC<ChordGridProps> = React.memo(({
  chords,
  beats,

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

  const gridElementRef = useRef<HTMLDivElement | null>(null);
  // Cache: map beatIndex -> HTMLElement to eliminate per-beat querySelector
  const cellRefsMapRef = useRef<Map<number, HTMLElement>>(new Map());

  // Reset the cache BEFORE rendering new cells when chord/beat arrays change
  // This avoids clearing after children have registered their refs, which could
  // leave the map empty (and freeze the highlighter) until another re-render.
  const prevLensRef = useRef<{ cl: number; bl: number }>({ cl: -1, bl: -1 });
  /* eslint-disable react-hooks/refs */
  if (
    prevLensRef.current.cl !== chords.length ||
    prevLensRef.current.bl !== beats.length
  ) {
    cellRefsMapRef.current = new Map();
    prevLensRef.current = { cl: chords.length, bl: beats.length };
  }
  /* eslint-enable react-hooks/refs */

  // Ref callback factory: register/unregister a cell by its global beat index
  const makeCellRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    const map = cellRefsMapRef.current;
    if (el) {
      map.set(index, el);
    } else {
      map.delete(index);
    }
  }, []);


  // Use simple time signature - no complex beat source logic
  const actualBeatsPerMeasure = timeSignature;

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
    sequenceCorrections,
    originalAudioMapping
  );

  // Compute a global accidental preference for consistent rendering.
  // The detected key signature is the most authoritative source (from Gemini
  // key-detection).  Fall back to the heuristic (count sharps vs flats in
  // chord labels) only when no key is available.
  const accidentalPreference = useMemo(() => {
    return getDisplayAccidentalPreference({
      chords: shiftedChords,
      keySignature,
      preserveExactSpelling: Boolean(sequenceCorrections),
    });
  }, [keySignature, sequenceCorrections, shiftedChords]);

  // Use utility function for grid columns class (already imported)

  // Use utility function for dynamic font sizing (already imported)

  // Use custom hook for interactions
  const { handleBeatClick, isClickable } = useChordInteractions(
    onBeatClick || null,
    beats,
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
    screenWidth,
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



  // PERFORMANCE OPTIMIZATION: Extract layout values from memoized config
  const { measuresPerRow: dynamicMeasuresPerRow } = gridLayoutConfig;

  const sectionStripMetrics = useCallback((rowCount: number) => {
    const rowGapPx = 2; // matches section content wrapper space-y-0.5
    const isDesktopLayout = screenWidth >= 640;
    const minCellHeightPx = showRomanNumerals
      ? (isDesktopLayout ? 4.2 * 16 : 3.3 * 16)
      : (isDesktopLayout ? 3.5 * 16 : 2.75 * 16);
    const effectiveRowHeightPx = Math.max(cellSize, minCellHeightPx);

    return {
      heightPx: (Math.max(1, rowCount) * effectiveRowHeightPx) + (Math.max(0, rowCount - 1) * rowGapPx),
    };
  }, [cellSize, screenWidth, showRomanNumerals]);

  // Use utility function for chord styling
  const getChordStyleLocal = useCallback((chord: string, beatIndex: number, isClickable: boolean = true) => {
    return getChordStyle(
      chord,
      beatIndex,
      isClickable,
      hasPickupBeats,
      timeSignature,
      pickupBeatsCount,
      paddingCount + shiftCount,
    );
  }, [hasPickupBeats, timeSignature, pickupBeatsCount, paddingCount, shiftCount]);

  // Memoized measure grouping with proper pickup beat handling using shifted chords
  const groupedByMeasure = useMemo<GroupedMeasure[]>(() => {
    if (chords.length === 0) {
      return [];
    }

    const measures: GroupedMeasure[] = [];

    // SIMPLIFIED: Basic measure grouping without padding/shift complexity
    let currentIndex = 0;
    let measureNumber = 0;

    while (currentIndex < shiftedChords.length) {
      const measure: GroupedMeasure = {
        measureNumber,
        chords: [],
        beats: [],
        isPickupMeasure: false,
        visualStartIndex: measureNumber * actualBeatsPerMeasure,
      };

      for (let b = 0; b < actualBeatsPerMeasure && currentIndex < shiftedChords.length; b += 1) {
        measure.chords.push(shiftedChords[currentIndex]);
        const beatTime = beats[currentIndex];
        measure.beats.push(typeof beatTime === 'number' ? beatTime : -1);
        currentIndex += 1;
      }

      if (measure.chords.length > 0) {
        while (measure.chords.length < actualBeatsPerMeasure) {
          measure.chords.push('');
          measure.beats.push(-1);
        }

        measures.push(measure);
        measureNumber += 1;
      }
    }

    return measures;
  }, [shiftedChords, beats, actualBeatsPerMeasure, chords.length]);

  // PERFORMANCE OPTIMIZATION: Memoized rows calculation
  // Group measures into rows using the dynamic measures per row
  const rows = useMemo<GroupedMeasure[][]>(() => {
    const calculatedRows: GroupedMeasure[][] = [];
    for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
      calculatedRows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
    }
    return calculatedRows;
  }, [groupedByMeasure, dynamicMeasuresPerRow]);

  const sectionBlocks = useMemo<SectionBlock[] | null>(() => {
    if (!showSegmentation || !segmentationData?.segments?.length || groupedByMeasure.length === 0) {
      return null;
    }

    return buildSegmentedSectionBlocks(
      groupedByMeasure,
      dynamicMeasuresPerRow,
      actualBeatsPerMeasure,
      segmentationData,
    ).map((block) => ({
      ...block,
      accentColor: getSegmentationColor(block.label),
    }));
  }, [showSegmentation, segmentationData, groupedByMeasure, dynamicMeasuresPerRow, actualBeatsPerMeasure]);

  const labelOverflowMap = useMemo(() => {
    const map = new Map<number, { cells: number; gapPx: number }>();
    const WITHIN_MEASURE_GAP_PX = 2;
    const MEASURE_BOUNDARY_GAP_PX = 9;

    const populateRowOverflows = (rowEntries: Array<{
      globalIndex: number | null;
      measureIdx: number;
      chord: string;
      showChordLabel: boolean;
    }>) => {
      rowEntries.forEach((entry, entryIndex) => {
        if (entry.globalIndex === null || !entry.showChordLabel || entry.chord === '') {
          return;
        }

        let cells = 0;
        let gapPx = 0;

        for (let scanIndex = entryIndex + 1; scanIndex < rowEntries.length; scanIndex += 1) {
          const previousEntry = rowEntries[scanIndex - 1];
          const nextEntry = rowEntries[scanIndex];

          if (nextEntry.showChordLabel) {
            break;
          }

          cells += 1;
          gapPx += nextEntry.measureIdx === previousEntry.measureIdx
            ? WITHIN_MEASURE_GAP_PX
            : MEASURE_BOUNDARY_GAP_PX;
        }

        map.set(entry.globalIndex, { cells, gapPx });
      });
    };

    if (sectionBlocks) {
      sectionBlocks.forEach((block) => block.rows.forEach((row) => {
        const rowEntries: Array<{
          globalIndex: number | null;
          measureIdx: number;
          chord: string;
          showChordLabel: boolean;
        }> = [];

        row.slots.forEach((slot, measureIdx) => {
          slot.cells.forEach((cell) => {
            rowEntries.push(cell
              ? {
                globalIndex: cell.globalIndex,
                measureIdx,
                chord: cell.chord,
                showChordLabel: shouldShowChordLabelLocal(cell.globalIndex),
              }
              : {
                globalIndex: null,
                measureIdx,
                chord: '',
                showChordLabel: false,
              });
          });
        });

        populateRowOverflows(rowEntries);
      }));

      return map;
    }

    rows.forEach((row) => {
      const rowEntries: Array<{
        globalIndex: number | null;
        measureIdx: number;
        chord: string;
        showChordLabel: boolean;
      }> = [];

      row.forEach((measure, measureIdx) => {
        measure.chords.forEach((rowChord, beatIdx) => {
          const globalIndex = measure.visualStartIndex + beatIdx;
          rowEntries.push({
            globalIndex,
            measureIdx,
            chord: rowChord,
            showChordLabel: shouldShowChordLabelLocal(globalIndex),
          });
        });
      });

      populateRowOverflows(rowEntries);
    });

    return map;
  }, [rows, sectionBlocks, shouldShowChordLabelLocal]);

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

  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
      return;
    }

    const sample = shiftedChords.slice(0, 24).map((chord, index) => ({
      index,
      sourceChord: chord,
      displayChord: getDisplayChordLocal(chord, index).chord,
      mappedSequenceIndex: sequenceCorrections ? (beatToChordSequenceMap[index] ?? -1) : -1,
      correctionSequenceIndex: sequenceCorrections ? -999 : -1,
      beat: beats[index],
    }));

    console.info('[alignment-debug] chord-grid-visual-sample', {
      showCorrectedChords,
      sequenceOriginalLength: sequenceCorrections?.originalSequence.length ?? 0,
      sequenceCorrectedLength: sequenceCorrections?.correctedSequence.length ?? 0,
      shiftedChordLength: shiftedChords.length,
      originalAudioMappingLength: originalAudioMapping?.length ?? 0,
      sample,
    });
  }, [
    beatToChordSequenceMap,
    beats,
    getDisplayChordLocal,
    originalAudioMapping,
    sequenceCorrections,
    shiftedChords,
    showCorrectedChords,
  ]);

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

  const renderChordGridCell = useCallback((chord: string, globalIndex: number, cellKey: string) => {
    const showChordLabel = shouldShowChordLabelLocal(globalIndex);
    const isEmpty = chord === '';
    const isClickableCell = isClickable(globalIndex, chord);
    const { chord: displayChord, wasCorrected } = getDisplayChordLocal(chord, globalIndex);
    const chordSequenceIndex = beatToChordSequenceMap[globalIndex];
    const rawRomanNumeral = showRomanNumerals && showChordLabel && romanNumeralData?.analysis && chordSequenceIndex !== undefined
      ? romanNumeralData.analysis[chordSequenceIndex] || ''
      : '';
    const romanNumeral = rawRomanNumeral ? formatRomanNumeralMemo(rawRomanNumeral) : '';
    const modulationInfo = sequenceCorrections?.keyAnalysis?.modulations?.find(
      (mod) => mod.atIndex === chordSequenceIndex
    );
    const modulationMarker = modulationInfo ? {
      isModulation: true,
      fromKey: modulationInfo.fromKey,
      toKey: modulationInfo.toKey,
    } : undefined;
    const labelOverflow = labelOverflowMap.get(globalIndex);

    return (
      <ChordCell
        key={cellKey}
        chord={chord}
        globalIndex={globalIndex}
        isClickable={isClickableCell}
        cellSize={cellSize}
        isDarkMode={isDarkMode}
        showChordLabel={showChordLabel}
        isEmpty={isEmpty}
        displayChord={displayChord}
        wasCorrected={wasCorrected}
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
        accidentalPreference={accidentalPreference}
        cellRef={makeCellRef(globalIndex)}
        labelOverflowCells={labelOverflow?.cells ?? 0}
        labelOverflowGapPx={labelOverflow?.gapPx ?? 0}
      />
    );
  }, [
    accidentalPreference,
    beatToChordSequenceMap,
    cellSize,
    editedChords,
    formatRomanNumeralMemo,
    getChordStyleLocal,
    getDisplayChordLocal,
    getDynamicFontSize,
    handleBeatClick,
    handleLoopBeatClick,
    isClickable,
    isDarkMode,
    isEditMode,
    isInLoopRange,
    isLoopEnabled,
    labelOverflowMap,
    makeCellRef,
    onChordEdit,
    romanNumeralData?.analysis,
    sequenceCorrections?.keyAnalysis?.modulations,
    shouldShowChordLabelLocal,
    showRomanNumerals,
  ]);

  const renderMeasureRow = useCallback((row: GroupedMeasure[], rowKey: string) => (
    <div key={rowKey} className="measure-row min-w-0">
      <div className={`grid gap-1 sm:gap-1 w-full ${
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
        'grid-cols-4'
      }`}>
        {row.map((measure, measureIdx) => (
          <div
            key={`${rowKey}-measure-${measure.measureNumber}-${measureIdx}`}
            className="border-l-[3px] border-gray-600 dark:border-gray-400 min-w-0 flex-shrink-0"
            style={{ paddingLeft: '2px' }}
          >
            <div className={`grid gap-0.5 auto-rows-fr ${getGridColumnsClass()}`}>
              {measure.chords.map((chord, beatIdx) => {
                const globalIndex = measure.visualStartIndex + beatIdx;
                return renderChordGridCell(chord, globalIndex, `chord-${globalIndex}`);
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  ), [
    dynamicMeasuresPerRow,
    getGridColumnsClass,
    renderChordGridCell,
  ]);

  const renderSegmentedRow = useCallback((row: SegmentedSectionRow, rowKey: string) => (
    <div key={rowKey} className="measure-row min-w-0">
      <div className={`grid gap-1 sm:gap-1 w-full ${
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
        'grid-cols-4'
      }`}>
        {row.slots.map((slot, measureIdx) => {
          const visibleCells = getVisibleCellsForSegmentedSlot(slot.cells);
          const showMeasureBar = shouldRenderSegmentedSlotMeasureBar(slot.cells);

          return (
          <div
            key={`${rowKey}-slot-${slot.slotIndex}-${measureIdx}`}
            className={`${showMeasureBar ? 'border-l-[3px] border-gray-600 dark:border-gray-400' : ''} min-w-0 flex-shrink-0`}
            style={showMeasureBar ? { paddingLeft: '2px' } : undefined}
          >
            <div className={`grid gap-0.5 auto-rows-fr ${getGridColumnsClass()}`}>
              {visibleCells.map(({ cell, gridColumnStart }) => (
                <div
                  key={`segmented-${rowKey}-${slot.slotIndex}-${cell.globalIndex}`}
                  style={gridColumnStart ? { gridColumnStart } : undefined}
                >
                  {renderChordGridCell(cell.chord, cell.globalIndex, `segmented-cell-${rowKey}-${slot.slotIndex}-${cell.globalIndex}`)}
                </div>
              ))}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  ), [dynamicMeasuresPerRow, getGridColumnsClass, renderChordGridCell]);

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
    >
      {/* Beat highlighter side-effect component (no UI) */}
      <BeatHighlighter cellRefsMap={cellRefsMapRef} theme={theme} isLoopEnabled={isLoopEnabled} />

      {/* Clean card container with minimal styling */}
      <div className="overflow-hidden rounded-xl border border-stone-300 bg-stone-50/90 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.18)] transition-colors duration-300 sm:rounded-2xl dark:border-gray-600 dark:bg-gray-800/50 dark:shadow-[0_18px_45px_-32px_rgba(15,23,42,0.75)]">

        {/* Header section using extracted component */}
        <div className="border-b border-stone-200/80 bg-stone-50/95 px-2.5 py-1.5 sm:px-3 sm:py-2 dark:border-white/10 dark:bg-gray-800/50">
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
        <div className="bg-gray-100/70 px-0 dark:bg-gray-800/45">
          <div className="overflow-x-auto">
            {sectionBlocks ? (
              <div className="space-y-3">
                {sectionBlocks.map((section, sectionIdx) => {
                  const stripMetrics = sectionStripMetrics(section.rows.length);

                  return (
                  <div key={`section-${sectionIdx}-${section.label}`} className="flex items-start gap-2 sm:gap-3">
                    <div
                      className="w-7 sm:w-8 flex-shrink-0 flex"
                      style={{ height: `${stripMetrics.heightPx}px` }}
                    >
                      <div
                        className={`w-full h-full rounded-sm border text-[10px] sm:text-xs font-semibold tracking-[0.18em] uppercase flex items-center justify-center ${
                          isDarkMode ? 'text-gray-100 border-white/15' : 'text-gray-700 border-black/10'
                        }`}
                        style={{
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          backgroundColor: section.accentColor,
                          padding: '0.5rem 0.2rem',
                        }}
                        title={section.label}
                      >
                        {section.label}
                      </div>
                    </div>

                    <div className="flex-1 space-y-0.5 min-w-0">
                      {section.rows.map((row, rowIdx) => renderSegmentedRow(row, `section-${sectionIdx}-row-${rowIdx}`))}
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <div className="space-y-0.5">
                {rows.map((row, rowIdx) => renderMeasureRow(row, `row-${rowIdx}`))}
              </div>
            )}
          </div>
        </div> {/* Close grid area */}

      </div> {/* Close card container */}
    </div>
  );
}, areChordGridPropsEqual);

ChordGrid.displayName = 'ChordGrid';

export default ChordGrid;
