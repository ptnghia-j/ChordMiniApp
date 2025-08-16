'use client';

import React, { useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useChordGrid } from '@/contexts/ChordGridContext';
import { OptimizedChordCell } from './OptimizedChordCell';
import { useChordDataProcessing } from '@/hooks/useChordDataProcessing';
import { useChordGridLayout } from '@/hooks/useChordGridLayout';

interface VirtualizedChordGridProps {
  className?: string;
  virtualizationThreshold?: number; // Number of beats above which to enable virtualization
}

interface MeasureRowData {
  measures: Array<{
    measureIndex: number;
    chordIndices: number[];
    rowIndex: number;
  }>;
  cellSize: number;
  getDisplayChord: (index: number) => string;
  shouldShowChordLabel: (index: number) => boolean;
  getSegmentationColor: () => string | undefined;
  getRomanNumeral: (index: number) => string | undefined;
}

/**
 * Row component for virtualized rendering
 * Renders a single row of measures in the virtualized list
 */
const MeasureRow: React.FC<{
  index: number;
  style: React.CSSProperties;
  data: MeasureRowData;
}> = ({ index, style, data }) => {
  const {
    measures,
    cellSize,
    getDisplayChord,
    shouldShowChordLabel,
    getSegmentationColor,
    getRomanNumeral,
  } = data;

  const {
    editedChords,
    chords,
  } = useChordGrid();

  const rowMeasures = measures.slice(index * 4, (index + 1) * 4); // 4 measures per row

  return (
    <div style={style} className="flex gap-0.5 px-2">
      {rowMeasures.map((measure) => (
        <div
          key={`measure-${measure.measureIndex}`}
          className="flex border border-gray-200 dark:border-gray-700 rounded"
        >
          {measure.chordIndices.map((globalIndex) => {
            const chord = chords[globalIndex] || '';
            const displayChord = getDisplayChord(globalIndex);
            const showChordLabel = shouldShowChordLabel(globalIndex);
            const isEmpty = !chord || chord === 'N.C.';
            const wasCorrected = displayChord !== chord;
            const segmentationColor = getSegmentationColor();
            const romanNumeral = getRomanNumeral(globalIndex);
            const editedChord = editedChords[globalIndex];

            return (
              <OptimizedChordCell
                key={`chord-${globalIndex}`}
                chord={chord}
                globalIndex={globalIndex}
                cellSize={cellSize}
                showChordLabel={showChordLabel}
                isEmpty={isEmpty}
                displayChord={displayChord}
                wasCorrected={wasCorrected}
                segmentationColor={segmentationColor}
                romanNumeral={romanNumeral}
                editedChord={editedChord}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * Virtualized ChordGrid component for handling long songs efficiently
 * Uses react-window for virtualization when chord count exceeds threshold
 */
export const VirtualizedChordGrid: React.FC<VirtualizedChordGridProps> = ({
  className = '',
  virtualizationThreshold = 100,
}) => {
  const listRef = useRef<List>(null);
  
  const {
    chords,
    timeSignature,
    hasPadding,
    shiftCount,
    showCorrectedChords,
    sequenceCorrections,
    showRomanNumerals,
    romanNumeralData,
    segmentationData,
    showSegmentation,
    isChatbotOpen,
    isLyricsPanelOpen,
    isUploadPage,
  } = useChordGrid();

  // Use existing hooks for data processing and layout
  const {
    getDisplayChord: getDisplayChordWithCorrection,
    shouldShowChordLabel,
  } = useChordDataProcessing(
    chords,
    hasPadding,
    timeSignature,
    shiftCount,
    showCorrectedChords,
    sequenceCorrections
  );

  // Wrapper function to match expected interface
  const getDisplayChord = useCallback((index: number): string => {
    const chord = chords[index] || '';
    const result = getDisplayChordWithCorrection(chord, index);
    return result.chord;
  }, [chords, getDisplayChordWithCorrection]);

  const {
    cellSize,
    groupedByMeasure,
  } = useChordGridLayout(
    isUploadPage,
    timeSignature,
    chords.length,
    isChatbotOpen,
    isLyricsPanelOpen
  );

  // Determine if virtualization should be enabled
  const shouldVirtualize = chords.length > virtualizationThreshold;

  // Memoized helper functions
  const getSegmentationColor = useCallback((): string | undefined => {
    if (!showSegmentation || !segmentationData) return undefined;
    // Implementation for segmentation color logic
    return undefined;
  }, [showSegmentation, segmentationData]);

  const getRomanNumeral = useCallback((chordIndex: number): string | undefined => {
    if (!showRomanNumerals || !romanNumeralData) return undefined;
    return romanNumeralData.analysis[chordIndex];
  }, [showRomanNumerals, romanNumeralData]);

  // Calculate number of rows for virtualization
  const totalRows = Math.ceil(groupedByMeasure.length / 4); // 4 measures per row
  const rowHeight = cellSize + 16; // Cell height + padding

  // Memoized row data for virtualization
  const rowData = useMemo((): MeasureRowData => ({
    measures: groupedByMeasure,
    cellSize,
    getDisplayChord,
    shouldShowChordLabel,
    getSegmentationColor,
    getRomanNumeral,
  }), [
    groupedByMeasure,
    cellSize,
    getDisplayChord,
    shouldShowChordLabel,
    getSegmentationColor,
    getRomanNumeral,
  ]);

  // Auto-scroll functionality can be added here if needed

  // Render non-virtualized version for smaller grids
  if (!shouldVirtualize) {
    return (
      <div className={`chord-grid-container ${className}`}>
        <div className="space-y-2">
          {Array.from({ length: Math.ceil(groupedByMeasure.length / 4) }).map((_, rowIndex) => {
            const rowMeasures = groupedByMeasure.slice(rowIndex * 4, (rowIndex + 1) * 4);
            
            return (
              <div key={`row-${rowIndex}`} className="flex gap-0.5">
                {rowMeasures.map((measure) => (
                  <div
                    key={`measure-${measure.measureIndex}`}
                    className="flex border border-gray-200 dark:border-gray-700 rounded"
                  >
                    {measure.chordIndices.map((globalIndex) => {
                      const chord = chords[globalIndex] || '';
                      const displayChord = getDisplayChord(globalIndex);
                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isEmpty = !chord || chord === 'N.C.';
                      const wasCorrected = displayChord !== chord;
                      const segmentationColor = getSegmentationColor();
                      const romanNumeral = getRomanNumeral(globalIndex);

                      return (
                        <OptimizedChordCell
                          key={`chord-${globalIndex}`}
                          chord={chord}
                          globalIndex={globalIndex}
                          cellSize={cellSize}
                          showChordLabel={showChordLabel}
                          isEmpty={isEmpty}
                          displayChord={displayChord}
                          wasCorrected={wasCorrected}
                          segmentationColor={segmentationColor}
                          romanNumeral={romanNumeral}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render virtualized version for large grids
  return (
    <div className={`virtualized-chord-grid-container ${className}`}>
      <List
        ref={listRef}
        height={400} // Fixed height for virtualization
        width="100%" // Full width
        itemCount={totalRows}
        itemSize={rowHeight}
        itemData={rowData}
        overscanCount={2} // Render 2 extra rows for smooth scrolling
      >
        {MeasureRow}
      </List>
    </div>
  );
};
