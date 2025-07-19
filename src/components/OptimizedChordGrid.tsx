'use client';

import React, { useMemo, useCallback, memo, useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';

interface OptimizedChordGridProps {
  chords: string[];
  beats: number[];
  currentBeatIndex?: number;
  timeSignature?: number;
  onBeatClick?: (beatIndex: number, timestamp: number) => void;
  className?: string;
}

/**
 * Optimized ChordGrid component with reduced re-renders and calculations
 * - Memoized calculations
 * - Simplified styling
 * - Reduced DOM complexity
 * - Better performance for mobile
 */
const OptimizedChordGrid: React.FC<OptimizedChordGridProps> = memo(({
  chords,
  beats,
  currentBeatIndex = -1,
  timeSignature = 4,
  onBeatClick,
  className = ''
}) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Screen width tracking for responsive layout
  const [screenWidth, setScreenWidth] = useState<number>(1200); // Default for SSR

  useEffect(() => {
    const updateScreenWidth = () => {
      setScreenWidth(window.innerWidth);
    };

    // Set initial width
    updateScreenWidth();

    // Add resize listener
    window.addEventListener('resize', updateScreenWidth);
    return () => window.removeEventListener('resize', updateScreenWidth);
  }, []);

  // Memoized chord processing - only recalculate when chords change
  const processedChords = useMemo(() => {
    if (!chords.length) return [];
    
    return chords.map((chord, index) => ({
      chord,
      index,
      isEmpty: !chord || chord === '' || chord === 'N.C.',
      isClickable: !!onBeatClick && beats[index] !== undefined && beats[index] >= 0
    }));
  }, [chords, beats, onBeatClick]);

  // Responsive measures per row calculation with minimum cell size constraint
  const getMeasuresPerRow = useMemo(() => {
    // MINIMUM CELL SIZE CONSTRAINT: Never shrink below 70% of desktop size
    const DESKTOP_CELL_SIZE = 80; // Base desktop cell size in pixels
    const MIN_CELL_SIZE = DESKTOP_CELL_SIZE * 0.7; // 70% minimum = 56px
    const MIN_TOUCH_TARGET = 44; // Apple/Google minimum touch target
    const EFFECTIVE_MIN_SIZE = Math.max(MIN_CELL_SIZE, MIN_TOUCH_TARGET);

    // Calculate available width (accounting for gaps and padding)
    const availableWidth = screenWidth * 0.95; // Full width with padding

    // Calculate maximum measures that fit with minimum cell size
    const gapSize = screenWidth < 640 ? 4 : 8; // sm:gap-2 vs gap-1
    const maxCellsWithMinSize = Math.floor(
      (availableWidth - (timeSignature - 1) * gapSize) / EFFECTIVE_MIN_SIZE
    );
    const maxMeasuresWithMinSize = Math.floor(maxCellsWithMinSize / timeSignature);

    const isMobilePortrait = screenWidth < 568; // Very small screens
    const isMobileLandscape = screenWidth >= 568 && screenWidth < 768;
    const isTablet = screenWidth >= 768 && screenWidth < 1024;
    const isDesktop = screenWidth >= 1024 && screenWidth < 1440;

    // IMPROVED RESPONSIVE ALGORITHM: Target 16-20 cells per row
    let targetCellsPerRow: number;

    if (isMobilePortrait) {
      // Mobile portrait: 8-12 cells per row
      targetCellsPerRow = 12;
    } else if (isMobileLandscape) {
      // Mobile landscape: 12-16 cells per row
      targetCellsPerRow = 16;
    } else if (isTablet) {
      // Tablet: 16-20 cells per row
      targetCellsPerRow = 20;
    } else if (isDesktop) {
      // Desktop: 16-20 cells per row
      targetCellsPerRow = 20;
    } else { // Large desktop
      // Large desktop: 20-24 cells per row
      targetCellsPerRow = 24;
    }

    // Calculate measures per row based on target cells
    let idealMeasuresPerRow = Math.max(1, Math.floor(targetCellsPerRow / timeSignature));

    // Apply time signature complexity limits
    if (timeSignature >= 7) {
      // Very complex: max 2-3 measures per row
      idealMeasuresPerRow = Math.min(idealMeasuresPerRow, 3);
    } else if (timeSignature >= 5) {
      // Moderately complex: max 3-4 measures per row
      idealMeasuresPerRow = Math.min(idealMeasuresPerRow, 4);
    }

    // Apply minimum cell size constraint: reduce measures if cells would be too small
    if (maxMeasuresWithMinSize > 0 && maxMeasuresWithMinSize < idealMeasuresPerRow) {
      return Math.max(1, maxMeasuresWithMinSize);
    }

    return Math.max(1, idealMeasuresPerRow);
  }, [screenWidth, timeSignature]);

  // Memoized measures grouping with responsive rows
  const { measures, rows } = useMemo(() => {
    // First, group chords into measures
    const measureGroups = [];
    for (let i = 0; i < processedChords.length; i += timeSignature) {
      measureGroups.push(processedChords.slice(i, i + timeSignature));
    }

    // Then group measures into rows based on screen size
    const rowGroups = [];
    for (let i = 0; i < measureGroups.length; i += getMeasuresPerRow) {
      rowGroups.push(measureGroups.slice(i, i + getMeasuresPerRow));
    }

    return { measures: measureGroups, rows: rowGroups };
  }, [processedChords, timeSignature, getMeasuresPerRow]);

  // Memoized click handler
  const handleCellClick = useCallback((index: number) => {
    if (!onBeatClick || !beats[index] || beats[index] < 0) return;
    onBeatClick(index, beats[index]);
  }, [onBeatClick, beats]);

  // Memoized cell styling with minimum size constraints
  const getCellStyle = useCallback((chord: { chord: string; index: number; isEmpty: boolean; isClickable: boolean }, index: number) => {
    const isCurrentBeat = index === currentBeatIndex;
    const baseClasses = 'flex items-center justify-center min-h-[2.75rem] sm:min-h-[3.5rem] border border-gray-300 dark:border-gray-600 rounded-sm transition-colors duration-200 overflow-hidden';
    
    if (chord.isEmpty) {
      return `${baseClasses} bg-gray-100 dark:bg-gray-800`;
    }
    
    if (isCurrentBeat) {
      return `${baseClasses} bg-blue-100 dark:bg-blue-200 ring-2 ring-blue-500 dark:ring-blue-300 text-gray-800 dark:text-blue-900`;
    }
    
    if (chord.isClickable) {
      return `${baseClasses} bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer text-gray-800 dark:text-gray-100`;
    }
    
    return `${baseClasses} bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100`;
  }, [currentBeatIndex]);

  // PERFORMANCE OPTIMIZATION: Memoized grid columns class generators
  const getGridColumns = useCallback((beatsPerMeasure: number) => {
    switch (beatsPerMeasure) {
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      case 4: return 'grid-cols-4';
      case 5: return 'grid-cols-5';
      case 6: return 'grid-cols-6';
      case 7: return 'grid-cols-7';
      case 8: return 'grid-cols-8';
      case 9: return 'grid-cols-9';
      case 10: return 'grid-cols-10';
      case 11: return 'grid-cols-11';
      case 12: return 'grid-cols-12';
      default: return 'grid-cols-4';
    }
  }, []);

  const getMeasuresGridClass = useCallback((measuresPerRow: number) => {
    switch (measuresPerRow) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      case 4: return 'grid-cols-4';
      case 5: return 'grid-cols-5';
      case 6: return 'grid-cols-6';
      default: return 'grid-cols-4';
    }
  }, []);

  if (!chords.length) {
    return (
      <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
        No chord data available
      </div>
    );
  }

  return (
    <div className={`chord-grid-optimized ${className}`}>
      {/* Header */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Chord Progression
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {timeSignature}/4 time • {measures.length} measures
        </p>
      </div>

      {/* Responsive Measures Grid */}
      <div className="space-y-4">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="row-container">
            {/* Row of measures */}
            <div className={`grid gap-3 ${getMeasuresGridClass(getMeasuresPerRow)}`}>
              {row.map((measure, measureIndexInRow) => {
                const measureIndex = rowIndex * getMeasuresPerRow + measureIndexInRow;

                return (
                  <div key={measureIndex} className="measure-container">
                    {/* Measure number */}
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-mono">
                      Measure {measureIndex + 1}
                    </div>

                    {/* Chord cells */}
                    <div className={`grid gap-1 ${getGridColumns(timeSignature)}`}>
                      {measure.map((chordData, beatIndex) => {
                        const globalIndex = measureIndex * timeSignature + beatIndex;

                        return (
                          <div
                            key={globalIndex}
                            className={getCellStyle(chordData, globalIndex)}
                            onClick={chordData.isClickable ? () => handleCellClick(globalIndex) : undefined}
                            role={chordData.isClickable ? "button" : undefined}
                            tabIndex={chordData.isClickable ? 0 : undefined}
                            aria-label={chordData.isClickable ? `Beat ${globalIndex + 1}, chord ${chordData.chord}` : undefined}
                          >
                            {!chordData.isEmpty && (
                              <span
                                className="text-sm font-medium leading-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-full px-1"
                                title={chordData.chord} // Show full chord name on hover
                                style={{
                                  maxWidth: '100%',
                                  textOverflow: 'ellipsis',
                                }}
                                dangerouslySetInnerHTML={{
                                  __html: formatChordWithMusicalSymbols(chordData.chord, isDarkMode)
                                }}
                              />
                            )}
                          </div>
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
    </div>
  );
});

OptimizedChordGrid.displayName = 'OptimizedChordGrid';

export default OptimizedChordGrid;
