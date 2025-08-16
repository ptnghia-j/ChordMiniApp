'use client';

import React, { useMemo } from 'react';
import { useChordGrid } from '@/contexts/ChordGridContext';
import { useOptimizedChordProcessing } from '@/hooks/useOptimizedChordProcessing';
import { useChordGridLayout } from '@/hooks/useChordGridLayout';

import { ChordGridHeader } from './ChordGridHeader';
import { VirtualizedChordGrid } from './VirtualizedChordGrid';
import { OptimizedChordCell } from './OptimizedChordCell';

interface RefactoredChordGridProps {
  className?: string;
  enableVirtualization?: boolean;
  virtualizationThreshold?: number;
}

/**
 * Refactored ChordGrid component using context system
 * Provides improved performance and reduced prop drilling
 */
export const RefactoredChordGrid: React.FC<RefactoredChordGridProps> = ({
  className = '',
  enableVirtualization = true,
  virtualizationThreshold = 100,
}) => {
  // Get all state from context
  const {
    chords,
    timeSignature,
    keySignature,
    isDetectingKey,
    hasPadding,
    shiftCount,
    showCorrectedChords,
    sequenceCorrections,
    showRomanNumerals,
    romanNumeralData,
    segmentationData,
    showSegmentation,
    editedChords,
    isChatbotOpen,
    isLyricsPanelOpen,
    isUploadPage,
  } = useChordGrid();

  // Use optimized chord processing
  const {
    groupedByMeasure,
    getDisplayChord,
    shouldShowChordLabel,
    getRomanNumeral,
    performanceMetrics,
  } = useOptimizedChordProcessing({
    chords,
    hasPadding,
    timeSignature,
    shiftCount,
    showCorrectedChords,
    sequenceCorrections,
    showRomanNumerals,
    romanNumeralData,
  });

  // Use layout calculations
  const {
    cellSize,
    containerRef,
  } = useChordGridLayout(
    isUploadPage,
    timeSignature,
    chords.length,
    isChatbotOpen,
    isLyricsPanelOpen
  );

  // Determine if virtualization should be used
  const shouldUseVirtualization = enableVirtualization && chords.length > virtualizationThreshold;

  // Memoized segmentation color function
  const getSegmentationColor = useMemo(() => {
    return (): string | undefined => {
      if (!showSegmentation || !segmentationData) return undefined;
      // Implementation would go here based on segmentation data
      return undefined;
    };
  }, [showSegmentation, segmentationData]);

  // Early return for empty data
  if (!chords.length) {
    return (
      <div className={`flex items-center justify-center p-8 bg-white dark:bg-content-bg rounded-lg shadow-card ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">No chord data available.</p>
      </div>
    );
  }

  // Render virtualized version for large datasets
  if (shouldUseVirtualization) {
    return (
      <div className={`chord-grid-refactored ${className}`} ref={containerRef}>
        <ChordGridHeader
          keySignature={keySignature || undefined}
          isDetectingKey={isDetectingKey}
          timeSignature={timeSignature}
        />
        <VirtualizedChordGrid
          virtualizationThreshold={virtualizationThreshold}
          className="mt-4"
        />
      </div>
    );
  }

  // Render standard version for smaller datasets
  return (
    <div className={`chord-grid-refactored ${className}`} ref={containerRef}>
      <ChordGridHeader
        keySignature={keySignature || undefined}
        isDetectingKey={isDetectingKey}
        timeSignature={timeSignature}
      />
      
      <div className="chord-grid-content mt-4">
        <div className="space-y-2">
          {Array.from({ length: Math.ceil(groupedByMeasure.length / 4) }).map((_, rowIndex) => {
            const rowMeasures = groupedByMeasure.slice(rowIndex * 4, (rowIndex + 1) * 4);
            
            return (
              <div key={`row-${rowIndex}`} className="flex gap-0.5 overflow-x-auto min-w-0">
                {rowMeasures.map((measure) => (
                  <div
                    key={`measure-${measure.measureIndex}`}
                    className="flex border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
                  >
                    {measure.chordIndices.map((globalIndex) => {
                      const chord = chords[globalIndex] || '';
                      const displayChord = getDisplayChord(globalIndex);
                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isEmpty = !chord || chord === 'N.C.';
                      const wasCorrected = displayChord !== chord && showCorrectedChords;
                      const segmentationColor = getSegmentationColor();
                      const romanNumeral = getRomanNumeral(chord, globalIndex);
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
          })}
        </div>
      </div>

      {/* Performance debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
          <div>Performance: {performanceMetrics.totalChords} chords, {performanceMetrics.uniqueChords} unique</div>
          <div>Cache hits: {JSON.stringify(performanceMetrics.cacheHitRatio)}</div>
          <div>Virtualization: {shouldUseVirtualization ? 'Enabled' : 'Disabled'}</div>
        </div>
      )}
    </div>
  );
};

RefactoredChordGrid.displayName = 'RefactoredChordGrid';
