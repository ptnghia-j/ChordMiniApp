import React, { useState, useEffect, useRef } from 'react';
import {
  formatChordWithMusicalSymbols,
  getResponsiveChordFontSize,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: number[]; // Array of corresponding beat indices or timestamps
  beatNumbers?: number[]; // Array of beat numbers within measures (1-based)
  currentBeatIndex?: number; // Current beat index for highlighting, optional
  beatsPerMeasure?: number; // Number of beats per measure, defaults to 4
  measuresPerRow?: number; // Number of measures to display per row, defaults to 4
  timeSignature?: number; // Time signature (beats per measure), defaults to 4
  onToggleFollowMode?: () => void; // Function to toggle auto-scroll mode
  isFollowModeEnabled?: boolean; // Whether auto-scroll is enabled
  onToggleAudioSource?: () => void; // Function to toggle audio source
  preferredAudioSource?: 'extracted' | 'youtube'; // Current audio source
}

const ChordGrid: React.FC<ChordGridProps> = ({
  chords,
  beats,
  beatNumbers,
  currentBeatIndex = -1,
  beatsPerMeasure = 4,
  measuresPerRow = 4,
  timeSignature = 4,
  onToggleFollowMode,
  isFollowModeEnabled = false,
  onToggleAudioSource,
  preferredAudioSource = 'extracted'
}) => {
  // Use the provided time signature to override beatsPerMeasure if available
  const actualBeatsPerMeasure = timeSignature || beatsPerMeasure;

  // Helper to get the appropriate CSS grid columns class based on time signature
  const getGridColumnsClass = (beatsPerMeasure: number): string => {
    switch (beatsPerMeasure) {
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-3';
      case 4:
        return 'grid-cols-4';
      case 5:
        return 'grid-cols-5';
      case 6:
        return 'grid-cols-6';
      case 7:
        return 'grid-cols-7';
      case 8:
        return 'grid-cols-8';
      case 9:
        return 'grid-cols-9';
      case 10:
        return 'grid-cols-10';
      case 11:
        return 'grid-cols-11';
      case 12:
        return 'grid-cols-12';
      default:
        // For unusual time signatures, fall back to a flexible grid
        console.warn(`Unusual time signature: ${beatsPerMeasure}/4, using flexible grid`);
        return 'grid-cols-4'; // Default fallback
    }
  };

  // Debug log for time signature
  console.log(`ChordGrid using time signature: ${timeSignature || 4}/4 (actualBeatsPerMeasure: ${actualBeatsPerMeasure})`);
  console.log(`Grid will use ${getGridColumnsClass(actualBeatsPerMeasure)} for ${actualBeatsPerMeasure} beats per measure`);
  console.log(`timeSignature prop value:`, timeSignature);
  console.log(`beatsPerMeasure prop value:`, beatsPerMeasure);
  // Reference to the grid container for measuring cell size
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState<number>(0);

  // Set up resize observer to track cell size changes
  useEffect(() => {
    if (!gridContainerRef.current) return;

    const updateCellSize = () => {
      if (gridContainerRef.current) {
        const cells = gridContainerRef.current.querySelectorAll('.chord-cell');
        if (cells.length > 0) {
          const firstCell = cells[0] as HTMLElement;
          const width = firstCell.offsetWidth;
          setCellSize(width);
        }
      }
    };

    // Initial size calculation
    updateCellSize();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      updateCellSize();
    });

    resizeObserver.observe(gridContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [chords.length]); // Re-run when chord data changes
  // Helper to determine if this beat should show a chord label
  const shouldShowChordLabel = (index: number): boolean => {
    // Always show the first chord
    if (index === 0) return true;

    // Show chord if it's different from the previous chord
    // Make sure we're not comparing undefined values
    if (index < chords.length && index - 1 < chords.length) {
      return chords[index] !== chords[index - 1];
    }

    // Default to showing the chord if we can't determine
    return true;
  };

  // Helper to determine if this beat is the first beat of a measure
  const isFirstBeatOfMeasure = (index: number): boolean => {
    return index % actualBeatsPerMeasure === 0;
  };

  // Helper to get measure number (1-based)
  const getMeasureNumber = (index: number): number => {
    return Math.floor(index / actualBeatsPerMeasure) + 1;
  };



  // Helper to determine dynamic measures per row based on time signature
  const getDynamicMeasuresPerRow = (timeSignature: number): number => {
    // For complex time signatures, reduce measures per row to prevent cramping
    if (timeSignature >= 7) {
      return 2; // Very complex time signatures: only 2 measures per row
    } else if (timeSignature >= 5) {
      return 3; // Moderately complex: 3 measures per row
    } else {
      return 4; // Simple time signatures: 4 measures per row (default)
    }
  };

  // Use dynamic measures per row instead of the fixed prop
  const dynamicMeasuresPerRow = getDynamicMeasuresPerRow(actualBeatsPerMeasure);

  // Helper to determine chord type and apply appropriate styling
  const getChordStyle = (chord: string, isCurrentBeat: boolean, showLabel: boolean, isFirstInMeasure: boolean, isPadding: boolean = false) => {
    // Base classes for all cells - fully detached with complete border
    // Using border-gray-300 instead of border-gray-200 for 1.5x darker borders
    let baseClasses = "flex flex-col items-start justify-center aspect-square transition-all duration-200 border border-gray-300 dark:border-gray-600 rounded-sm overflow-hidden";

    // Handle padding cells with more distinct greyed-out appearance
    if (isPadding) {
      let classes = `${baseClasses} bg-gray-200 dark:bg-gray-600 opacity-75`;
      let textColor = "text-gray-500 dark:text-gray-400";
      return `${classes} ${textColor}`;
    }

    // All regular cells have white background by default
    let classes = `${baseClasses} bg-white dark:bg-gray-800`;

    // Use a single text color for all chord types (minimalist approach)
    let textColor = "text-gray-800 dark:text-gray-200";

    // Highlight current beat with distinct background
    if (isCurrentBeat) {
      classes = `${baseClasses} bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500 dark:ring-blue-400 shadow-md`;
    }

    return `${classes} ${textColor}`;
  };

  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-700 dark:text-gray-300 text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 w-full transition-colors duration-300">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  // Debug information
  console.log(`ChordGrid rendering with ${chords.length} chords and ${beats.length} beats`);
  console.log('First 5 chords:', chords.slice(0, 5));
  console.log('Unique chords:', [...new Set(chords)].length);

  // Helper to create a padding cell (greyed out)
  const createPaddingCell = () => ({
    chord: '',
    beat: -1,
    isPadding: true
  });

  // Group chords by measure with proper padding for pickup beats and incomplete measures
  const groupedByMeasure: Array<{
    measureNumber: number;
    chords: string[];
    beats: number[];
    paddingStart: number;
    paddingEnd: number;
  }> = [];

  // Detect if we have pickup beats (anacrusis) by analyzing the beat position data
  let startOffset = 0;
  if (chords.length > 0) {
    // If we have beat number data from the backend, use it to detect pickup beats accurately
    if (beatNumbers && beatNumbers.length > 0 && beatNumbers.length === chords.length) {
      // Look for the pattern where the first few beats have the same beat number (indicating pickup beats)
      // Backend shows pattern like [1,1,1,2,3,4,5,6,1,2,3,4,5,6...] for 3 pickup beats in 6/8 time

      // Count consecutive beats with beatNum = 1 at the beginning
      let pickupCount = 0;
      for (let i = 0; i < Math.min(actualBeatsPerMeasure, chords.length); i++) {
        // Count all beats with beatNum = 1 at the beginning until we find beatNum = 2
        if (beatNumbers[i] === 1) {
          pickupCount++;
        } else {
          // Stop when we find the first beat that's not beatNum = 1
          break;
        }
      }

      // Only treat as pickup beats if:
      // 1. We have fewer than a full measure of beats with beatNum = 1
      // 2. The next beat after the 1s is beatNum = 2 (indicating start of regular measure)
      if (pickupCount > 0 && pickupCount < actualBeatsPerMeasure) {
        // Check if the beat after the pickup beats is beatNum = 2
        if (pickupCount < chords.length && beatNumbers[pickupCount] === 2) {
          startOffset = actualBeatsPerMeasure - pickupCount;
        } else {
          // If not followed by beatNum = 2, don't treat as pickup beats
          pickupCount = 0;
          startOffset = 0;
        }
      } else {
        // If we have a full measure or more of beatNum = 1, don't treat as pickup
        pickupCount = 0;
        startOffset = 0;
      }

      // Debug: Log the beat number pattern for analysis
      console.log(`Beat numbers pattern: [${beatNumbers.slice(0, Math.min(20, beatNumbers.length)).join(', ')}...]`);
      console.log(`Detected ${pickupCount} pickup beats, startOffset: ${startOffset}`);
    } else {
      // Fallback: use the remainder calculation for incomplete measures
      const remainderBeats = chords.length % actualBeatsPerMeasure;
      if (remainderBeats !== 0 && chords.length >= actualBeatsPerMeasure) {
        startOffset = actualBeatsPerMeasure - remainderBeats;
      }
    }
  }

  // Debug: Log detected startOffset
  console.log(`Detected startOffset for pickup beats: ${startOffset}`);

  // Process measures with padding
  for (let i = 0; i < chords.length; i += actualBeatsPerMeasure) {
    const measureChords = chords.slice(i, i + actualBeatsPerMeasure);
    const measureBeats = beats.slice(i, i + actualBeatsPerMeasure);
    const measureNumber = getMeasureNumber(i);

    // Create the measure data with proper padding
    const measureData = {
      measureNumber,
      chords: [] as string[],
      beats: [] as number[],
      paddingStart: 0,
      paddingEnd: 0
    };

    // Handle first measure with potential pickup beats
    if (i === 0 && startOffset > 0) {
      // Add padding at the beginning for pickup beats
      measureData.paddingStart = startOffset;
      for (let p = 0; p < startOffset; p++) {
        measureData.chords.push('');
        measureData.beats.push(-1);
      }
    }

    // Add the actual chords and beats
    measureData.chords.push(...measureChords);
    measureData.beats.push(...measureBeats);

    // Handle incomplete measures by adding padding at the end
    const totalBeatsInMeasure = measureData.chords.length;
    if (totalBeatsInMeasure < actualBeatsPerMeasure) {
      const paddingNeeded = actualBeatsPerMeasure - totalBeatsInMeasure;
      measureData.paddingEnd = paddingNeeded;
      for (let p = 0; p < paddingNeeded; p++) {
        measureData.chords.push('');
        measureData.beats.push(-1);
      }
    }

    groupedByMeasure.push(measureData);
  }

  // Debug: Log measure structure
  console.log('Grouped measures with padding:', groupedByMeasure.map(m => ({
    measureNum: m.measureNumber,
    paddingStart: m.paddingStart,
    paddingEnd: m.paddingEnd,
    totalBeats: m.chords.length,
    chords: m.chords
  })));

  // Group measures into rows using the dynamic measures per row
  const rows: Array<typeof groupedByMeasure> = [];
  for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
    rows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
  }

  return (
    <div className="chord-grid-container mx-auto px-1 sm:px-2 relative" style={{ maxWidth: "98%" }}>
      {/* Time signature indicator */}
      {timeSignature && timeSignature !== 4 && (
        <div className="mb-3 flex items-center justify-center">
          <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Time Signature: {timeSignature}/4 ({actualBeatsPerMeasure} beats per measure)
            </span>
          </div>
        </div>
      )}

      {/* Render rows of measures */}
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="measure-row">
            {/* Grid of measures with spacing - responsive based on time signature complexity */}
            <div className={`grid gap-1 md:gap-2 ${
              dynamicMeasuresPerRow === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              dynamicMeasuresPerRow === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}>
              {row.map((measure, measureIdx) => (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="border-l-[3px] border-gray-600 dark:border-gray-400 transition-colors duration-300"
                  style={{
                    paddingLeft: '4px'
                  }}
                >
                  {/* Chord cells for this measure - dynamic grid based on time signature */}
                  <div className={`grid gap-1 auto-rows-fr ${getGridColumnsClass(actualBeatsPerMeasure)}`}>
                    {measure.chords.map((chord, beatIdx) => {
                      // Calculate global index, accounting for padding
                      const measureStartIndex = (rowIdx * dynamicMeasuresPerRow + measureIdx) * actualBeatsPerMeasure;
                      const globalIndex = measureStartIndex + beatIdx - measure.paddingStart;

                      // Determine if this is a padding cell
                      const isPadding = beatIdx < measure.paddingStart || beatIdx >= (measure.chords.length - measure.paddingEnd);

                      // For padding cells, don't check current beat or show labels
                      const isCurrentBeat = !isPadding && globalIndex === currentBeatIndex;
                      const showChordLabel = !isPadding && shouldShowChordLabel(globalIndex);
                      const isFirstInMeasure = beatIdx === measure.paddingStart; // First real beat after padding

                      return (
                        <div
                          id={isPadding ? `padding-${measureStartIndex}-${beatIdx}` : `chord-${globalIndex}`}
                          key={isPadding ? `padding-${measureStartIndex}-${beatIdx}` : `chord-${globalIndex}`}
                          className={`${getChordStyle(chord, isCurrentBeat, showChordLabel, isFirstInMeasure, isPadding)} w-full h-full min-h-[3.75rem]`}
                        >
                          {/* Only show chord name if it's a new chord and not padding */}
                          <div style={getChordContainerStyles()}>
                            {!isPadding && showChordLabel && chord ? (
                              <div
                                className={getResponsiveChordFontSize(chord)}
                                style={getChordLabelStyles(chord)}
                                dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(chord) }}
                              />
                            ) : (
                              <div className="opacity-0" style={getChordLabelStyles('')}>·</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChordGrid;