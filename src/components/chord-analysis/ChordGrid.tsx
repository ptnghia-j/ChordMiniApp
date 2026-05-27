'use client';

import React, { useMemo, useCallback, useRef } from 'react';
import BeatHighlighter from './BeatHighlighter';
import {
  formatRomanNumeral,
  buildBeatToChordSequenceMap
} from '@/utils/chordFormatting';

import {
  getChordStyle,
  getGridColumnsClass as getGridColumnsClassForBeats
} from '@/utils/chordStyling';
import { createShiftedChords } from '@/utils/chordProcessing';
import { useChordGridLayout } from '@/hooks/chord-analysis/useChordGridLayout';
import { useChordDataProcessing } from '@/hooks/chord-analysis/useChordDataProcessing';
import { useChordInteractions } from '@/hooks/chord-analysis/useChordInteractions';
import { useLoopBeatSelection } from '@/hooks/chord-analysis/useLoopBeatSelection';
import { SegmentationResult } from '@/types/chatbotTypes';
import { ChordGridHeader } from './ChordGridHeader';
import { ChordCell } from './ChordCell';
import GridLyricsRow, { type BeatGridTimedLyrics, groupPlacementsIntoRows } from './GridLyricsRow';
import { enhanceLyricsWithCharacterTiming, type EnhancedLyricLine } from '@/utils/lyricsTimingUtils';
import { getDisplayAccidentalPreference } from '@/utils/chordUtils';
import { getSegmentationColor } from '@/utils/segmentationColors';
import { buildSegmentedSectionBlocks, getVisibleCellsForSegmentedSlot, SegmentedSectionRow, shouldRenderSegmentedSlotMeasureBar } from '@/utils/chordGridSegmentationLayout';
import AppTooltip from '@/components/common/AppTooltip';
import type { MetricSegment } from '@/services/chord-analysis/gridTypes';

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
  beatsPerMeasure?: number;
}

interface SectionBlock {
  label: string;
  accentColor: string;
  rows: SegmentedSectionRow[];
  measuresPerRow: number;
}

interface MetricSectionBlock {
  label: string;
  accentColor: string;
  beatsPerMeasure: number;
  measuresPerRow: number;
  rows: GroupedMeasure[][];
}

interface GridLyricPlacement {
  line: NonNullable<BeatGridTimedLyrics['lyrics']['lines']>[number];
  columnStart: number;
  columnEnd: number;
}

interface GridLyricRowPlacement {
  placements: GridLyricPlacement[];
  columnCount: number;
}

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am') - may be transposed
  beats: (number | null)[]; // Array of corresponding beat timestamps (in seconds) - Updated to match service type
  // currentBeatIndex removed: BeatHighlighter subscribes directly to store
  timeSignature?: number; // Time signature (beats per measure), defaults to 4
  keySignature?: string; // Key signature (e.g., 'C Major')
  isDetectingKey?: boolean; // Whether key detection is in progress
  isChatbotOpen?: boolean; // Whether the chatbot panel is open
  isLyricsPanelOpen?: boolean; // Whether the embedded lyrics grid is open
  hasPickupBeats?: boolean; // Whether the grid includes pickup beats
  pickupBeatsCount?: number; // Number of pickup beats
  hasPadding?: boolean; // Whether the chords array already includes padding/shifting
  paddingCount?: number; // Number of padding beats (for visual distinction)
  shiftCount?: number; // Number of shift beats (for visual distinction)
  beatTimeRangeStart?: number; // Start time of beat detection range (for padding timestamp calculation)
  originalAudioMapping?: AudioMappingItem[]; // NEW: Original timestamp-to-chord mapping for audio sync
  metricSegments?: MetricSegment[];
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
  gridLyrics?: BeatGridTimedLyrics | null;
}

const MEASURES_PER_ROW_GRID_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
  8: 'grid-cols-8',
  9: 'grid-cols-9',
  10: 'grid-cols-10',
};

function getMeasuresPerRowGridClass(measuresPerRow: number): string {
  return MEASURES_PER_ROW_GRID_CLASS[measuresPerRow] ?? MEASURES_PER_ROW_GRID_CLASS[4];
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
  if (prevProps.metricSegments !== nextProps.metricSegments) return false;
  if (prevProps.gridLyrics !== nextProps.gridLyrics) return false;

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
  metricSegments = [],
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
  originalChordsForRomanNumerals, // CRITICAL FIX: Original chords for Roman numeral mapping
  gridLyrics = null
}) => {
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
  const hasMetricSegments = metricSegments.length > 0;
  const detectedSingleMeter = metricSegments.length === 1 ? metricSegments[0].beatsPerMeasure : null;
  const displayedTimeSignature = detectedSingleMeter ?? timeSignature;
  const timeSignatureLabel = metricSegments.length >= 2
    ? Array.from(new Set(metricSegments.map((segment) => `${segment.beatsPerMeasure}/4`))).join(' + ')
    : undefined;

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

  const enhancedGridLyrics = useMemo(() => {
    if (!gridLyrics?.lyrics) return null;
    return enhanceLyricsWithCharacterTiming(gridLyrics.lyrics);
  }, [gridLyrics]);

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

  const segmentationRowHeightPx = useMemo(() => {
    const isSmUp = screenWidth >= 640;
    const minRowHeight = showRomanNumerals
      ? (isSmUp ? 4.2 * 16 : 3.3 * 16)
      : (isSmUp ? 3.5 * 16 : 2.75 * 16);
    return Math.max(cellSize, minRowHeight);
  }, [cellSize, screenWidth, showRomanNumerals]);

  const segmentationRowGapPx = 2;
  const lyricsRowGapPx = 4;
  const lyricsRowPaddingPx = 12;

  const lyricsLineHeightPx = useMemo(() => {
    const minFontSize = showRomanNumerals ? 14 : 15;
    const maxFontSize = showRomanNumerals ? 17 : 19;
    const scale = showRomanNumerals ? 0.18 : 0.2;
    const baseChordSize = Math.max(
      minFontSize,
      Math.min(maxFontSize, Math.round(cellSize * scale))
    );
    const minLyricsSize = showRomanNumerals ? 15 : 17;
    const lyricsFontSize = Math.max(
      minLyricsSize,
      Math.round(baseChordSize * 1.2 * 100) / 100
    );
    return Math.round(lyricsFontSize * 1.25);
  }, [cellSize, showRomanNumerals]);

  const getLyricsBlockHeight = useCallback((lineCount: number) => {
    if (!gridLyrics || lineCount <= 0) return 0;
    const lineGap = Math.max(0, lineCount - 1) * lyricsRowGapPx;
    return Math.round(lineCount * lyricsLineHeightPx + lineGap + lyricsRowPaddingPx);
  }, [gridLyrics, lyricsLineHeightPx, lyricsRowGapPx, lyricsRowPaddingPx]);

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
  const measuresPerRowGridClass = useMemo(
    () => getMeasuresPerRowGridClass(dynamicMeasuresPerRow),
    [dynamicMeasuresPerRow],
  );

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

  const normalizedMetricSegments = useMemo<MetricSegment[]>(() => {
    if (!hasMetricSegments || shiftedChords.length === 0) {
      return [];
    }

    const sortedSegments = [...metricSegments]
      .filter((segment) => (
        segment.beatsPerMeasure > 1 &&
        segment.endIndex > segment.startIndex
      ))
      .sort((left, right) => left.startIndex - right.startIndex);

    if (sortedSegments.length === 0) {
      return [];
    }

    const normalized: MetricSegment[] = [];
    let cursor = 0;

    sortedSegments.forEach((segment) => {
      const startIndex = Math.max(cursor, Math.min(shiftedChords.length, segment.startIndex));
      const endIndex = Math.max(startIndex, Math.min(shiftedChords.length, segment.endIndex));

      if (startIndex > cursor) {
        normalized.push({
          startIndex: cursor,
          endIndex: startIndex,
          beatsPerMeasure: actualBeatsPerMeasure === 3 ? 3 : 4,
        });
      }

      if (endIndex > startIndex) {
        normalized.push({
          ...segment,
          startIndex,
          endIndex,
        });
      }

      cursor = endIndex;
    });

    if (cursor < shiftedChords.length) {
      normalized.push({
        startIndex: cursor,
        endIndex: shiftedChords.length,
        beatsPerMeasure: actualBeatsPerMeasure === 3 ? 3 : 4,
      });
    }

    return normalized.filter((segment) => segment.endIndex > segment.startIndex);
  }, [actualBeatsPerMeasure, hasMetricSegments, metricSegments, shiftedChords.length]);

  const metricGroupedByMeasure = useMemo<GroupedMeasure[]>(() => {
    if (normalizedMetricSegments.length === 0) {
      return [];
    }

    const measures: GroupedMeasure[] = [];
    let measureNumber = 0;

    normalizedMetricSegments.forEach((segment) => {
      let currentIndex = segment.startIndex;

      while (currentIndex < segment.endIndex) {
        const measure: GroupedMeasure = {
          measureNumber,
          chords: [],
          beats: [],
          isPickupMeasure: false,
          visualStartIndex: currentIndex,
          beatsPerMeasure: segment.beatsPerMeasure,
        };

        for (
          let beat = 0;
          beat < segment.beatsPerMeasure && currentIndex < segment.endIndex;
          beat += 1
        ) {
          measure.chords.push(shiftedChords[currentIndex]);
          const beatTime = beats[currentIndex];
          measure.beats.push(typeof beatTime === 'number' ? beatTime : -1);
          currentIndex += 1;
        }

        while (measure.chords.length < segment.beatsPerMeasure) {
          measure.chords.push('');
          measure.beats.push(-1);
        }

        measures.push(measure);
        measureNumber += 1;
      }
    });

    return measures;
  }, [beats, normalizedMetricSegments, shiftedChords]);

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
    if (
      normalizedMetricSegments.length > 0 ||
      !showSegmentation ||
      !segmentationData?.segments?.length ||
      groupedByMeasure.length === 0
    ) {
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
  }, [showSegmentation, segmentationData, groupedByMeasure, dynamicMeasuresPerRow, actualBeatsPerMeasure, normalizedMetricSegments.length]);

  const metricSectionBlocks = useMemo<MetricSectionBlock[] | null>(() => {
    if (normalizedMetricSegments.length === 0 || metricGroupedByMeasure.length === 0) {
      return null;
    }

    const cellsPerRowTarget = Math.max(
      actualBeatsPerMeasure,
      dynamicMeasuresPerRow * actualBeatsPerMeasure,
    );

    return normalizedMetricSegments.map((segment, segmentIndex) => {
      const segmentMeasures = metricGroupedByMeasure.filter((measure) => (
        measure.visualStartIndex >= segment.startIndex &&
        measure.visualStartIndex < segment.endIndex
      ));
      const measuresPerRow = Math.max(1, Math.floor(cellsPerRowTarget / segment.beatsPerMeasure));
      const rowsForSegment: GroupedMeasure[][] = [];

      for (let index = 0; index < segmentMeasures.length; index += measuresPerRow) {
        rowsForSegment.push(segmentMeasures.slice(index, index + measuresPerRow));
      }

      return {
        label: `${segment.beatsPerMeasure}/4`,
        accentColor: segmentIndex % 2 === 0 ? '#2563eb' : '#1d4ed8',
        beatsPerMeasure: segment.beatsPerMeasure,
        measuresPerRow,
        rows: rowsForSegment,
      };
    }).filter((block) => block.rows.length > 0);
  }, [
    actualBeatsPerMeasure,
    dynamicMeasuresPerRow,
    metricGroupedByMeasure,
    normalizedMetricSegments,
  ]);

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

    if (metricSectionBlocks) {
      metricSectionBlocks.forEach((block) => block.rows.forEach((row) => {
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
              globalIndex: globalIndex < shiftedChords.length ? globalIndex : null,
              measureIdx,
              chord: rowChord,
              showChordLabel: globalIndex < shiftedChords.length
                ? shouldShowChordLabelLocal(globalIndex)
                : false,
            });
          });
        });

        populateRowOverflows(rowEntries);
      }));

      return map;
    }

    if (sectionBlocks) {
      sectionBlocks.forEach((block) => block.rows.forEach((row) => {
        const rowEntries: Array<{
          globalIndex: number | null;
          measureIdx: number;
          chord: string;
          showChordLabel: boolean;
        }> = [];

        const activeSlots = row.slots.filter((slot) => slot.cells.some((cell) => cell !== null));
        activeSlots.forEach((slot, measureIdx) => {
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
  }, [rows, sectionBlocks, metricSectionBlocks, shiftedChords.length, shouldShowChordLabelLocal]);

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

  const modulationByChordSequenceIndex = useMemo(() => {
    const map = new Map<number, { isModulation: true; fromKey: string; toKey: string }>();
    sequenceCorrections?.keyAnalysis?.modulations?.forEach((mod) => {
      map.set(mod.atIndex, {
        isModulation: true,
        fromKey: mod.fromKey,
        toKey: mod.toKey,
      });
    });
    return map;
  }, [sequenceCorrections?.keyAnalysis?.modulations]);

  const findClosestBeatIndex = useCallback((time: number): number => {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let index = 0; index < beats.length; index += 1) {
      const beatTime = beats[index];
      if (typeof beatTime !== 'number' || beatTime < 0) continue;
      const delta = Math.abs(beatTime - time);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    }
    return bestIndex;
  }, [beats]);

  const getLyricsForIndexRange = useCallback((startIndex: number, endIndex: number): GridLyricRowPlacement => {
    const columnCount = Math.max(1, endIndex - startIndex + 1);
    if (!enhancedGridLyrics?.lines?.length) return { placements: [], columnCount };

    const placements: GridLyricPlacement[] = [];

    enhancedGridLyrics.lines.forEach((line) => {
      const characterTimings = line.characterTimings;
      if (!line.text) return;

      // Tokenize by words and spaces
      const tokens = line.text.match(/\s+|\S+/g) || [];
      let charOffset = 0;

      const tokensWithBeatIndex = tokens.map((tokenText) => {
        const startChar = charOffset;
        const endChar = charOffset + tokenText.length - 1;
        charOffset += tokenText.length;

        // Determine startTime and endTime of this token using characterTimings
        let tokenStartTime = line.startTime;
        let tokenEndTime = line.endTime;
        if (characterTimings && characterTimings.length > 0) {
          const startCharTiming = characterTimings[Math.min(startChar, characterTimings.length - 1)];
          const endCharTiming = characterTimings[Math.min(endChar, characterTimings.length - 1)];
          if (startCharTiming) tokenStartTime = startCharTiming.startTime;
          if (endCharTiming) tokenEndTime = endCharTiming.endTime;
        }

        const beatIndex = findClosestBeatIndex(tokenStartTime);

        return {
          text: tokenText,
          startTime: tokenStartTime,
          endTime: tokenEndTime,
          beatIndex,
          startChar,
          endChar,
          isWhitespace: /^\s+$/.test(tokenText),
        };
      });

      // Filter tokens belonging to this row range [startIndex, endIndex]
      // Custom threshold check: do not split short trailing fragments of a lyric line to the next row.
      const hasPresenceInCurrentRow = tokensWithBeatIndex.some(tok => tok.beatIndex >= startIndex && tok.beatIndex <= endIndex);
      const hasPresenceInPreviousRows = tokensWithBeatIndex.some(tok => tok.beatIndex < startIndex);

      const rowTokens = tokensWithBeatIndex.filter((t) => {
        // Exclude tokens before current row
        if (t.beatIndex < startIndex) return false;

        // For tokens after current row: merge them if they are part of a very short trailing fragment
        if (t.beatIndex > endIndex) {
          if (!hasPresenceInCurrentRow) return false;

          const futureTokens = tokensWithBeatIndex.filter(tok => tok.beatIndex > endIndex);
          const futureNonWhitespace = futureTokens.filter(tok => !tok.isWhitespace);
          const futureLength = futureNonWhitespace.map(tok => tok.text).join('').length;
          const isFutureVeryShort = futureNonWhitespace.length <= 1 || futureLength < 8;

          return isFutureVeryShort;
        }

        // For tokens within current row: exclude them if they were already claimed by the previous row
        if (hasPresenceInPreviousRows) {
          const remainingTokens = tokensWithBeatIndex.filter(tok => tok.beatIndex >= startIndex);
          const remainingNonWhitespace = remainingTokens.filter(tok => !tok.isWhitespace);
          const remainingLength = remainingNonWhitespace.map(tok => tok.text).join('').length;
          const isRemainingVeryShort = remainingNonWhitespace.length <= 1 || remainingLength < 8;

          if (isRemainingVeryShort) return false;
        }

        return true;
      });

      // Find first and last non-whitespace tokens to trim edge whitespace
      let startTokenIdx = 0;
      while (startTokenIdx < rowTokens.length && rowTokens[startTokenIdx].isWhitespace) {
        startTokenIdx++;
      }
      let endTokenIdx = rowTokens.length - 1;
      while (endTokenIdx >= startTokenIdx && rowTokens[endTokenIdx].isWhitespace) {
        endTokenIdx--;
      }

      if (startTokenIdx <= endTokenIdx) {
        const trimmedRowTokens = rowTokens.slice(startTokenIdx, endTokenIdx + 1);
        const subText = trimmedRowTokens.map((t) => t.text).join('');
        const subStartTime = trimmedRowTokens[0].startTime;
        const subEndTime = trimmedRowTokens[trimmedRowTokens.length - 1].endTime;
        const subBeatIndex = trimmedRowTokens[0].beatIndex;
        const subBeatEndIndex = trimmedRowTokens[trimmedRowTokens.length - 1].beatIndex;
        const columnStart = subBeatIndex - startIndex + 1;
        const columnEnd = subBeatEndIndex - startIndex + 1;

        const firstChar = trimmedRowTokens[0].startChar;
        const lastChar = trimmedRowTokens[trimmedRowTokens.length - 1].endChar;

        // Slice character timings
        const subCharacterTimings = characterTimings
          ? characterTimings.slice(firstChar, lastChar + 1)
          : undefined;

        // Slice word timings if they exist
        const subWordTimings = line.wordTimings
          ? line.wordTimings
              .filter((wt) => wt.startChar >= firstChar && wt.endChar <= lastChar)
              .map((wt) => ({
                ...wt,
                startChar: wt.startChar - firstChar,
                endChar: wt.endChar - firstChar,
              }))
          : undefined;

        placements.push({
          line: {
            text: subText,
            startTime: subStartTime,
            endTime: subEndTime,
            wordTimings: subWordTimings,
            characterTimings: subCharacterTimings,
          } as EnhancedLyricLine,
          columnStart,
          columnEnd,
        });
      }
    });

    return { placements, columnCount };
  }, [findClosestBeatIndex, enhancedGridLyrics]);

  const getLyricsForGroupedRow = useCallback((row: GroupedMeasure[]): GridLyricRowPlacement => {
    if (!row.length) return { placements: [], columnCount: 1 };
    const startIndex = Math.min(...row.map((measure) => measure.visualStartIndex));
    const endIndex = Math.max(...row.map((measure) => measure.visualStartIndex + (measure.beatsPerMeasure ?? actualBeatsPerMeasure) - 1));
    return getLyricsForIndexRange(startIndex, endIndex);
  }, [actualBeatsPerMeasure, getLyricsForIndexRange]);

  const getLyricsForSegmentedRow = useCallback((row: SegmentedSectionRow): GridLyricRowPlacement => {
    const indexes = row.slots.flatMap((slot) => slot.cells.map((cell) => cell?.globalIndex).filter((index): index is number => typeof index === 'number'));
    if (!indexes.length) return { placements: [], columnCount: 1 };
    return getLyricsForIndexRange(Math.min(...indexes), Math.max(...indexes));
  }, [getLyricsForIndexRange]);

  const renderLyricsRow = useCallback((lines: ReturnType<typeof getLyricsForGroupedRow>, key: string) => {
    if (!gridLyrics || lines.placements.length === 0) return null;

    // Calculate typical chord label font size from ChordCell and scale it for lyrics
    const minFontSize = showRomanNumerals ? 14 : 15;
    const maxFontSize = showRomanNumerals ? 17 : 19;
    const scale = showRomanNumerals ? 0.18 : 0.2;
    const baseChordSize = Math.max(
      minFontSize,
      Math.min(maxFontSize, Math.round(cellSize * scale))
    );
    // Scale to 120% of chord labels, enforcing a minimum readability floor of 17px (15px with Roman numerals)
    const minLyricsSize = showRomanNumerals ? 15 : 17;
    const lyricsFontSize = `${Math.max(minLyricsSize, Math.round(baseChordSize * 1.2 * 100) / 100)}px`;

    return (
      <GridLyricsRow
        key={`${key}-lyrics`}
        placements={lines.placements}
        columnCount={lines.columnCount}
        mode={gridLyrics.mode}
        fontSize={lyricsFontSize}
      />
    );
  }, [gridLyrics, showRomanNumerals, cellSize]);

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
    const modulationMarker = chordSequenceIndex !== undefined
      ? modulationByChordSequenceIndex.get(chordSequenceIndex)
      : undefined;
    const labelOverflow = labelOverflowMap.get(globalIndex);

    return (
      <ChordCell
        key={cellKey}
        chord={chord}
        globalIndex={globalIndex}
        isClickable={isClickableCell}
        cellSize={cellSize}
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
    isEditMode,
    isInLoopRange,
    isLoopEnabled,
    labelOverflowMap,
    makeCellRef,
    modulationByChordSequenceIndex,
    onChordEdit,
    romanNumeralData?.analysis,
    shouldShowChordLabelLocal,
    showRomanNumerals,
  ]);

  const renderMeasureRow = useCallback((row: GroupedMeasure[], rowKey: string) => {
    const lyricLines = getLyricsForGroupedRow(row);

    return (
      <div key={rowKey} className="measure-row min-w-0">
        <div className={`grid gap-1 sm:gap-1 w-full ${measuresPerRowGridClass}`}>
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
        {renderLyricsRow(lyricLines, rowKey)}
      </div>
    );
  }, [
    getLyricsForGroupedRow,
    getGridColumnsClass,
    measuresPerRowGridClass,
    renderChordGridCell,
    renderLyricsRow,
  ]);

  const renderMetricMeasureRow = useCallback((
    row: GroupedMeasure[],
    rowKey: string,
    beatsPerMeasure: number,
    measuresPerRow: number,
  ) => {
    const lyricLines = getLyricsForGroupedRow(row);
    const activeCount = row.length;
    const rowWidthPercent = (activeCount / measuresPerRow) * 100;

    return (
      <div 
        key={rowKey} 
        className="measure-row min-w-0"
        style={{ width: `${rowWidthPercent}%` }}
      >
        <div className={`grid gap-1 sm:gap-1 w-full ${getMeasuresPerRowGridClass(activeCount)}`}>
          {row.map((measure, measureIdx) => (
            <div
              key={`${rowKey}-metric-measure-${measure.measureNumber}-${measureIdx}`}
              className="border-l-[3px] border-gray-600 dark:border-gray-400 min-w-0 flex-shrink-0"
              style={{ paddingLeft: '2px' }}
            >
              <div className={`grid gap-0.5 auto-rows-fr ${getGridColumnsClassForBeats(beatsPerMeasure)}`}>
                {measure.chords.map((chord, beatIdx) => {
                  const globalIndex = measure.visualStartIndex + beatIdx;
                  if (globalIndex >= shiftedChords.length) {
                    return null;
                  }
                  return renderChordGridCell(chord, globalIndex, `metric-chord-${rowKey}-${globalIndex}`);
                })}
              </div>
            </div>
          ))}
        </div>
        {renderLyricsRow(lyricLines, rowKey)}
      </div>
    );
  }, [getLyricsForGroupedRow, renderChordGridCell, renderLyricsRow, shiftedChords.length]);

  const renderSegmentedRow = useCallback((row: SegmentedSectionRow, rowKey: string, widthMeasuresPerRow: number) => {
    const lyricLines = getLyricsForSegmentedRow(row);

    const activeSlots = row.slots.filter((slot) => slot.cells.some((cell) => cell !== null));
    const activeCount = activeSlots.length;
    const normalizedMeasuresPerRow = Math.max(1, widthMeasuresPerRow);
    const rowWidthPercent = Math.min(100, (activeCount / normalizedMeasuresPerRow) * 100);

    return (
      <div 
        key={rowKey} 
        className="measure-row min-w-0"
        style={{ width: `${rowWidthPercent}%` }}
      >
        <div className={`grid gap-1 sm:gap-1 w-full ${getMeasuresPerRowGridClass(activeCount)}`}>
          {activeSlots.map((slot, measureIdx) => {
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
        {renderLyricsRow(lyricLines, rowKey)}
      </div>
    );
  }, [getGridColumnsClass, getLyricsForSegmentedRow, renderChordGridCell, renderLyricsRow]);

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

  return (
    <div
      ref={mergedGridRef}
      className="chord-grid-container mx-auto px-0.5 sm:px-1 relative"
      style={{ maxWidth: "99%" }}
    >
      {/* Beat highlighter side-effect component (no UI) */}
      <BeatHighlighter cellRefsMap={cellRefsMapRef} />

      {/* Clean card container with minimal styling */}
      <div className="overflow-hidden rounded-xl border border-stone-300 bg-stone-50/90 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.18)] transition-colors duration-300 sm:rounded-2xl dark:border-gray-600 dark:bg-gray-800/50 dark:shadow-[0_18px_45px_-32px_rgba(15,23,42,0.75)]">

        {/* Header section using extracted component */}
        <div className="border-b border-stone-200/80 bg-stone-50/95 px-2.5 py-1.5 sm:px-3 sm:py-2 dark:border-white/10 dark:bg-gray-800/50">
          <ChordGridHeader
            timeSignature={displayedTimeSignature}
            timeSignatureLabel={timeSignatureLabel}
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
            {metricSectionBlocks ? (
              <div className="space-y-3">
                {metricSectionBlocks.map((section, sectionIdx) => {
                  const rowsHeight = section.rows.reduce((sum, row) => {
                    const lyricLines = getLyricsForGroupedRow(row);
                    const visualRows = groupPlacementsIntoRows(lyricLines.placements);
                    const lineCount = visualRows.length;
                    return sum + segmentationRowHeightPx + getLyricsBlockHeight(lineCount);
                  }, 0);

                  const stripHeight = Math.max(
                    segmentationRowHeightPx,
                    rowsHeight + Math.max(0, section.rows.length - 1) * segmentationRowGapPx,
                  );

                  return (
                  <div key={`metric-section-${sectionIdx}-${section.label}`} className="flex items-stretch gap-2 sm:gap-3">
                    <div
                      className="w-7 sm:w-8 flex-shrink-0 flex self-start"
                    >
                      <AppTooltip content={section.label} placement="right">
                        <div
                          className="w-full rounded-sm border border-blue-100/45 text-[10px] sm:text-xs font-semibold tracking-[0.18em] uppercase flex items-center justify-center text-white shadow-inner shadow-white/10 dark:border-blue-100/35"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            backgroundColor: section.accentColor,
                            padding: '0.5rem 0.2rem',
                            height: `${stripHeight}px`,
                          }}
                        >
                          {section.label}
                        </div>
                      </AppTooltip>
                    </div>

                    <div className="flex-1 space-y-0.5 min-w-0">
                      {section.rows.map((row, rowIdx) => renderMetricMeasureRow(
                        row,
                        `metric-section-${sectionIdx}-row-${rowIdx}`,
                        section.beatsPerMeasure,
                        section.measuresPerRow,
                      ))}
                    </div>
                  </div>
                );
                })}
              </div>
            ) : sectionBlocks ? (
              <div className="space-y-3">
                {sectionBlocks.map((section, sectionIdx) => {
                  const rowsHeight = section.rows.reduce((sum, row) => {
                    const lyricLines = getLyricsForSegmentedRow(row);
                    const visualRows = groupPlacementsIntoRows(lyricLines.placements);
                    const lineCount = visualRows.length;
                    return sum + segmentationRowHeightPx + getLyricsBlockHeight(lineCount);
                  }, 0);

                  const stripHeight = Math.max(
                    segmentationRowHeightPx,
                    rowsHeight + Math.max(0, section.rows.length - 1) * segmentationRowGapPx,
                  );

                  return (
                  <div key={`section-${sectionIdx}-${section.label}`} className="flex items-stretch gap-2 sm:gap-3">
                    <div
                      className="w-7 sm:w-8 flex-shrink-0 flex self-start"
                    >
                      <AppTooltip content={section.label} placement="right">
                        <div
                          className="w-full rounded-sm border border-black/10 text-[10px] sm:text-xs font-semibold tracking-[0.18em] uppercase flex items-center justify-center text-gray-700 dark:border-white/15 dark:text-gray-100"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            backgroundColor: section.accentColor,
                            padding: '0.5rem 0.2rem',
                            height: `${stripHeight}px`,
                          }}
                        >
                          {section.label}
                        </div>
                      </AppTooltip>
                    </div>

                    <div className="flex-1 space-y-0.5 min-w-0">
                      {section.rows.map((row, rowIdx) => renderSegmentedRow(
                        row,
                        `section-${sectionIdx}-row-${rowIdx}`,
                        dynamicMeasuresPerRow,
                      ))}
                    </div>
                  </div>
                );
                })}
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
