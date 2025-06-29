'use client';

import React, { useMemo, useCallback, memo } from 'react';
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

  // Memoized measures grouping
  const measures = useMemo(() => {
    const measureGroups = [];
    for (let i = 0; i < processedChords.length; i += timeSignature) {
      measureGroups.push(processedChords.slice(i, i + timeSignature));
    }
    return measureGroups;
  }, [processedChords, timeSignature]);

  // Memoized click handler
  const handleCellClick = useCallback((index: number) => {
    if (!onBeatClick || !beats[index] || beats[index] < 0) return;
    onBeatClick(index, beats[index]);
  }, [onBeatClick, beats]);

  // Memoized cell styling
  const getCellStyle = useCallback((chord: { chord: string; index: number; isEmpty: boolean; isClickable: boolean }, index: number) => {
    const isCurrentBeat = index === currentBeatIndex;
    const baseClasses = 'flex items-center justify-center aspect-square border border-gray-300 dark:border-gray-600 rounded-sm transition-colors duration-200';
    
    if (chord.isEmpty) {
      return `${baseClasses} bg-gray-100 dark:bg-gray-800`;
    }
    
    if (isCurrentBeat) {
      return `${baseClasses} bg-blue-100 dark:bg-blue-600 ring-2 ring-blue-500 dark:ring-blue-300 text-gray-800 dark:text-white`;
    }
    
    if (chord.isClickable) {
      return `${baseClasses} bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer text-gray-800 dark:text-gray-100`;
    }
    
    return `${baseClasses} bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100`;
  }, [currentBeatIndex]);

  // Memoized grid columns class
  const getGridColumns = useCallback((beatsPerMeasure: number) => {
    switch (beatsPerMeasure) {
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      case 4: return 'grid-cols-4';
      case 6: return 'grid-cols-6';
      case 8: return 'grid-cols-4'; // Display 8/8 as 2 rows of 4
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

      {/* Measures Grid */}
      <div className="space-y-3">
        {measures.map((measure, measureIndex) => (
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
                        className="text-sm font-medium leading-tight"
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
        ))}
      </div>
    </div>
  );
});

OptimizedChordGrid.displayName = 'OptimizedChordGrid';

export default OptimizedChordGrid;
