import React, { useState, useEffect, useRef } from 'react';
import {
  formatChordWithMusicalSymbols,
  getResponsiveChordFontSize,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';
import { detectKey, formatKeyInfo, type KeyDetectionResult, type ChordData } from '@/services/keyDetectionService';

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
  isChatbotOpen?: boolean; // Whether the chatbot panel is open
}

const ChordGrid: React.FC<ChordGridProps> = ({
  chords,
  beats,
  beatNumbers,
  currentBeatIndex = -1,
  beatsPerMeasure,
  measuresPerRow = 4,
  timeSignature,
  onToggleFollowMode,
  isFollowModeEnabled = false,
  onToggleAudioSource,
  preferredAudioSource = 'extracted',
  isChatbotOpen = false
}) => {
  // Use the provided time signature to override beatsPerMeasure if available
  // If neither is provided, fall back to 4 as a last resort
  const actualBeatsPerMeasure = timeSignature || beatsPerMeasure || 4;

  // Log the time signature being used for debugging
  console.log('ChordGrid time signature:', {
    timeSignature,
    beatsPerMeasure,
    actualBeatsPerMeasure
  });

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

  // Key detection state
  const [keyResult, setKeyResult] = useState<KeyDetectionResult | null>(null);
  const [isDetectingKey, setIsDetectingKey] = useState(false);

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

  // Key detection effect
  useEffect(() => {
    if (chords.length > 0 && beats.length > 0 && !isDetectingKey) {
      setIsDetectingKey(true);

      // Prepare chord data for key detection
      const chordData: ChordData[] = chords.map((chord, index) => ({
        chord,
        time: beats[index] || index
      }));

      detectKey(chordData)
        .then(result => {
          setKeyResult(result);
        })
        .catch(error => {
          console.error('Failed to detect key:', error);
          setKeyResult(null);
        })
        .finally(() => {
          setIsDetectingKey(false);
        });
    }
  }, [chords, beats]); // Re-run when chord or beat data changes
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



  // Helper to determine dynamic measures per row based on time signature and chatbot state
  const getDynamicMeasuresPerRow = (timeSignature: number, chatbotOpen: boolean): number => {
    // Reduce measures per row when chatbot is open to prevent label truncation
    if (chatbotOpen) {
      if (timeSignature >= 7) {
        return 1; // Very complex time signatures: only 1 measure per row when chatbot is open
      } else if (timeSignature >= 5) {
        return 2; // Moderately complex: 2 measures per row when chatbot is open
      } else {
        return 3; // Simple time signatures: 3 measures per row when chatbot is open
      }
    } else {
      // Normal layout when chatbot is closed
      if (timeSignature >= 7) {
        return 2; // Very complex time signatures: only 2 measures per row
      } else if (timeSignature >= 5) {
        return 3; // Moderately complex: 3 measures per row
      } else {
        return 4; // Simple time signatures: 4 measures per row (default)
      }
    }
  };

  // Use dynamic measures per row instead of the fixed prop
  const dynamicMeasuresPerRow = getDynamicMeasuresPerRow(actualBeatsPerMeasure, isChatbotOpen);

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

    // Highlight current beat with distinct background and better contrast
    if (isCurrentBeat) {
      classes = `${baseClasses} bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500 dark:ring-blue-400 shadow-md`;
      // Override text color for better contrast on highlighted background
      textColor = "text-gray-800 dark:text-white";
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

  // Group chords by measure based on beat numbers from backend
  const groupedByMeasure: Array<{
    measureNumber: number;
    chords: string[];
    beats: number[];
    beatNumbers: number[];
    paddingStart: number;
    paddingEnd: number;
  }> = [];

  // Detect pickup beats by analyzing the beat number pattern from backend
  // The backend correctly identifies pickup beats by finding the regular cycle
  // We need to match the backend logic: find where the regular [1,2,3,4,5,6] pattern starts
  let pickupCount = 0;
  if (beatNumbers && beatNumbers.length > 0 && beatNumbers.length === chords.length) {
    // Look for the start of the regular cycle [1,2,3,4,5,6]
    // The pickup beats are everything before this regular cycle starts
    for (let i = 0; i < Math.min(actualBeatsPerMeasure * 2, beatNumbers.length - 5); i++) {
      // Check if we have a regular cycle starting at position i
      const slice = beatNumbers.slice(i, i + 6);
      if (slice.length === 6 &&
          slice[0] === 1 && slice[1] === 2 && slice[2] === 3 &&
          slice[3] === 4 && slice[4] === 5 && slice[5] === 6) {
        pickupCount = i;
        console.log(`Detected ${pickupCount} pickup beats - regular cycle starts at position ${i}`);
        console.log(`Beat pattern: [${beatNumbers.slice(0, Math.min(12, beatNumbers.length)).join(', ')}]`);
        break;
      }
    }

    // Fallback: if no regular cycle found, use the old method but be more conservative
    if (pickupCount === 0) {
      // Count consecutive beats with beatNum = 1 at the beginning, but stop at first non-1
      for (let i = 0; i < Math.min(actualBeatsPerMeasure, chords.length); i++) {
        if (beatNumbers[i] === 1) {
          pickupCount++;
        } else {
          break;
        }
      }

      // Only treat as pickup beats if followed by beatNum = 2 and we have reasonable count
      if (pickupCount > 0 && pickupCount < chords.length &&
          beatNumbers[pickupCount] === 2 && pickupCount < actualBeatsPerMeasure) {
        console.log(`Detected ${pickupCount} pickup beats from fallback method`);
      } else {
        pickupCount = 0;
      }
    }
  }

  // Correct approach: handle pickup beats properly by adjusting the grouping
  // Pickup beats should only affect the first measure, all subsequent measures should be complete

  // Start processing from the pickup beats
  let currentIndex = 0;

  // First measure: handle pickup beats if they exist
  if (pickupCount > 0) {
    // First measure: padding + pickup beats
    const firstMeasure = {
      measureNumber: 1,
      chords: [] as string[],
      beats: [] as number[],
      beatNumbers: [] as number[],
      paddingStart: actualBeatsPerMeasure - pickupCount,
      paddingEnd: 0
    };

    // Add padding cells at the start
    for (let p = 0; p < actualBeatsPerMeasure - pickupCount; p++) {
      firstMeasure.chords.push('');
      firstMeasure.beats.push(-1);
      firstMeasure.beatNumbers.push(-1);
    }

    // Add the pickup beats
    for (let p = 0; p < pickupCount && currentIndex < chords.length; p++) {
      firstMeasure.chords.push(chords[currentIndex]);
      firstMeasure.beats.push(beats[currentIndex]);
      firstMeasure.beatNumbers.push(beatNumbers?.[currentIndex] || 1);
      currentIndex++;
    }

    groupedByMeasure.push(firstMeasure);
  }

  // Process remaining beats into complete measures
  let measureNumber = pickupCount > 0 ? 2 : 1;
  while (currentIndex < chords.length) {
    const measure = {
      measureNumber: measureNumber,
      chords: [] as string[],
      beats: [] as number[],
      beatNumbers: [] as number[],
      paddingStart: 0,
      paddingEnd: 0
    };

    // Add beats to this measure (up to actualBeatsPerMeasure)
    for (let b = 0; b < actualBeatsPerMeasure && currentIndex < chords.length; b++) {
      measure.chords.push(chords[currentIndex]);
      measure.beats.push(beats[currentIndex]);
      measure.beatNumbers.push(beatNumbers?.[currentIndex] || ((b % actualBeatsPerMeasure) + 1));
      currentIndex++;
    }

    // Only add padding if this is the very last measure and it's incomplete
    // (This should rarely happen with proper beat detection)
    if (measure.chords.length < actualBeatsPerMeasure && currentIndex >= chords.length) {
      while (measure.chords.length < actualBeatsPerMeasure) {
        measure.chords.push('');
        measure.beats.push(-1);
        measure.beatNumbers.push(-1);
        measure.paddingEnd++;
      }
    }

    groupedByMeasure.push(measure);
    measureNumber++;
  }





  // Debug: Log measure structure
  console.log('=== CHORD GRID MEASURE GROUPING DEBUG ===');
  console.log(`Input data: ${chords.length} chords, ${beats.length} beats, ${beatNumbers?.length || 0} beatNumbers`);
  console.log(`Time signature: ${actualBeatsPerMeasure}/4, pickup beats: ${pickupCount}`);
  console.log('Beat numbers pattern:', beatNumbers?.slice(0, 20));
  console.log('Grouped measures:', groupedByMeasure.map(m => ({
    measureNum: m.measureNumber,
    paddingStart: m.paddingStart,
    paddingEnd: m.paddingEnd,
    totalBeats: m.chords.length,
    beatNumbers: m.beatNumbers,
    chords: m.chords.map(c => c || 'PAD')
  })));
  console.log('=== END CHORD GRID DEBUG ===');

  // Group measures into rows using the dynamic measures per row
  const rows: Array<typeof groupedByMeasure> = [];
  for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
    rows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
  }

  return (
    <div className="chord-grid-container mx-auto px-1 sm:px-2 relative" style={{ maxWidth: "98%" }}>

      {/* Render rows of measures */}
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="measure-row">
            {/* Grid of measures with spacing - responsive based on time signature complexity */}
            <div className={`grid gap-1 md:gap-2 ${
              dynamicMeasuresPerRow === 1 ? 'grid-cols-1' :
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
                      // Calculate global index by counting all previous beats
                      let globalIndex = 0;

                      // Count beats from all previous measures
                      for (let r = 0; r < rowIdx; r++) {
                        for (let m = 0; m < rows[r].length; m++) {
                          // Count only non-padding beats
                          const prevMeasure = rows[r][m];
                          globalIndex += prevMeasure.chords.length - prevMeasure.paddingStart - prevMeasure.paddingEnd;
                        }
                      }

                      // Count beats from previous measures in current row
                      for (let m = 0; m < measureIdx; m++) {
                        const prevMeasure = row[m];
                        globalIndex += prevMeasure.chords.length - prevMeasure.paddingStart - prevMeasure.paddingEnd;
                      }

                      // Add beats from current measure (only if not padding)
                      if (beatIdx >= measure.paddingStart && beatIdx < (measure.chords.length - measure.paddingEnd)) {
                        globalIndex += beatIdx - measure.paddingStart;
                      } else {
                        globalIndex = -1; // Mark as padding
                      }

                      // Determine if this is a padding cell
                      const isPadding = beatIdx < measure.paddingStart || beatIdx >= (measure.chords.length - measure.paddingEnd);

                      // For padding cells, don't check current beat or show labels
                      const isCurrentBeat = !isPadding && globalIndex === currentBeatIndex;
                      const showChordLabel = !isPadding && shouldShowChordLabel(globalIndex);
                      const isFirstInMeasure = beatIdx === measure.paddingStart; // First real beat after padding

                      return (
                        <div
                          id={isPadding ? `padding-${measure.measureNumber}-${beatIdx}` : `chord-${globalIndex}`}
                          key={isPadding ? `padding-${measure.measureNumber}-${beatIdx}` : `chord-${globalIndex}`}
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