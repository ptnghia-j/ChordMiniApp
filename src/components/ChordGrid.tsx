import React, { useEffect, useRef, useState } from 'react';
import {
  formatChordWithMusicalSymbols,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';


interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: number[]; // Array of corresponding beat timestamps
  currentBeatIndex?: number; // Current beat index for highlighting, optional
  timeSignature?: number; // Time signature (beats per measure), defaults to 4
  keySignature?: string; // Key signature (e.g., 'C Major')
  isDetectingKey?: boolean; // Whether key detection is in progress
  isChatbotOpen?: boolean; // Whether the chatbot panel is open
  isLyricsPanelOpen?: boolean; // Whether the lyrics panel is open
  hasPickupBeats?: boolean; // Whether the grid includes pickup beats
  pickupBeatsCount?: number; // Number of pickup beats
}

const ChordGrid: React.FC<ChordGridProps> = ({
  chords,
  beats,
  currentBeatIndex = -1,
  timeSignature = 4,
  keySignature,
  isDetectingKey = false,
  isChatbotOpen = false,
  isLyricsPanelOpen = false,
  hasPickupBeats = false,
  pickupBeatsCount = 0
}) => {
  // Use simple time signature - no complex beat source logic
  const actualBeatsPerMeasure = timeSignature;

  // Enhanced optimal beat shift calculation with comprehensive debugging
  const calculateOptimalShift = (chords: string[], timeSignature: number): number => {
    if (chords.length === 0) {
      console.log('Beat shift calculation: No chords available, returning shift 0');
      return 0;
    }

    console.log('\n=== BEAT SHIFT OPTIMIZATION DEBUG ===');
    console.log(`Input: ${chords.length} chords, ${timeSignature}/4 time signature`);
    console.log('First 12 chords:', chords.slice(0, 12));

    let bestShift = 0;
    let maxDownbeatChords = 0;
    const shiftResults: Array<{shift: number, downbeatChords: number, downbeatPositions: number[], chordLabels: string[]}> = [];

    // Test each possible shift value (0 to timeSignature-1)
    for (let shift = 0; shift < timeSignature; shift++) {
      let downbeatChordCount = 0;
      const downbeatPositions: number[] = [];
      const chordLabels: string[] = [];

      // Count non-empty chord labels that fall on downbeats (first beat of measures)
      for (let i = shift; i < chords.length; i += timeSignature) {
        const chord = chords[i];
        const isValidChord = chord && chord !== '' && chord !== 'N.C.' && chord !== 'N/C';

        downbeatPositions.push(i);
        chordLabels.push(chord || 'empty');

        if (isValidChord) {
          downbeatChordCount++;
        }
      }

      shiftResults.push({
        shift,
        downbeatChords: downbeatChordCount,
        downbeatPositions,
        chordLabels
      });

      if (downbeatChordCount > maxDownbeatChords) {
        maxDownbeatChords = downbeatChordCount;
        bestShift = shift;
      }

      console.log(`Shift ${shift}: ${downbeatChordCount} valid chords on downbeats`);
      console.log(`  Downbeat positions: [${downbeatPositions.slice(0, 6).join(', ')}${downbeatPositions.length > 6 ? '...' : ''}]`);
      console.log(`  Chord labels: [${chordLabels.slice(0, 6).join(', ')}${chordLabels.length > 6 ? '...' : ''}]`);
    }

    console.log(`\n🎯 OPTIMAL SHIFT SELECTED: ${bestShift}`);
    console.log(`📊 RESULTS SUMMARY:`);
    shiftResults.forEach(result => {
      const isSelected = result.shift === bestShift;
      console.log(`  Shift ${result.shift}: ${result.downbeatChords} downbeat chords ${isSelected ? '← SELECTED' : ''}`);
    });

    // Show before/after comparison
    const beforeDownbeats = shiftResults[0]; // Shift 0 (original)
    const afterDownbeats = shiftResults[bestShift];
    console.log(`\n📈 IMPROVEMENT: ${beforeDownbeats.downbeatChords} → ${afterDownbeats.downbeatChords} downbeat chords (+${afterDownbeats.downbeatChords - beforeDownbeats.downbeatChords})`);
    console.log('=== END BEAT SHIFT OPTIMIZATION DEBUG ===\n');

    return bestShift;
  };

  // Calculate and apply optimal shift automatically
  const optimalShift = calculateOptimalShift(chords, actualBeatsPerMeasure);

  // Apply visual shift to chord data (shift chord labels forward in the grid)
  const shiftedChords = chords.length > 0 ? [
    ...chords.slice(optimalShift),
    ...chords.slice(0, optimalShift)
  ] : chords;

  // Enhanced debug logging with shift verification
  console.log(`\n🎼 CHORD GRID LAYOUT DEBUG:`);
  console.log(`📊 Grid Info: ${chords.length} chords, ${timeSignature}/4 time signature`);
  console.log(`🔄 Applied Shift: ${optimalShift} beats for optimal downbeat alignment`);

  // Verify the shift was applied correctly
  if (optimalShift > 0 && chords.length > 0) {
    console.log(`✅ SHIFT VERIFICATION:`);
    console.log(`  Original first 6 chords: [${chords.slice(0, 6).join(', ')}]`);
    console.log(`  Shifted first 6 chords:  [${shiftedChords.slice(0, 6).join(', ')}]`);
    console.log(`  Expected shift pattern: Original[${optimalShift}:] + Original[0:${optimalShift}]`);

    // Verify downbeat alignment in shifted data
    const shiftedDownbeatChords = [];
    for (let i = 0; i < shiftedChords.length; i += timeSignature) {
      shiftedDownbeatChords.push(shiftedChords[i] || 'empty');
    }
    console.log(`  Shifted downbeat chords: [${shiftedDownbeatChords.slice(0, 6).join(', ')}${shiftedDownbeatChords.length > 6 ? '...' : ''}]`);
  } else if (optimalShift === 0) {
    console.log(`ℹ️  No shift applied (optimal shift = 0)`);
  }
  console.log(`🎼 END CHORD GRID LAYOUT DEBUG\n`);

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

  // Removed complex debug logging
  // Reference to the grid container for measuring cell size
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState<number>(0);
  const [screenWidth, setScreenWidth] = useState<number>(1200); // Default for SSR



  // FIX 4: Dynamic font sizing system based on cell size
  const getDynamicFontSize = (cellSize: number, chordLength: number = 1): string => {
    if (cellSize === 0) return 'text-sm'; // Default fallback

    // Base font size calculation: scale with cell size
    // Smaller cells (mobile/complex time signatures) get smaller fonts
    // Larger cells (desktop/simple time signatures) get larger fonts
    let baseFontSize: number;

    if (cellSize < 60) {
      baseFontSize = 10; // Very small cells (mobile, complex time signatures)
    } else if (cellSize < 80) {
      baseFontSize = 12; // Small cells
    } else if (cellSize < 100) {
      baseFontSize = 14; // Medium cells
    } else if (cellSize < 120) {
      baseFontSize = 16; // Large cells
    } else {
      baseFontSize = 18; // Very large cells (wide screens)
    }

    // Adjust for chord complexity (longer chord names get slightly smaller fonts)
    if (chordLength > 4) {
      baseFontSize = Math.max(8, baseFontSize - 2);
    } else if (chordLength > 2) {
      baseFontSize = Math.max(8, baseFontSize - 1);
    }

    // Convert to Tailwind CSS classes
    if (baseFontSize <= 10) return 'text-xs';
    if (baseFontSize <= 12) return 'text-sm';
    if (baseFontSize <= 14) return 'text-base';
    if (baseFontSize <= 16) return 'text-lg';
    return 'text-xl';
  };

  // Set up resize observer to track cell size changes and screen width
  useEffect(() => {
    // Initialize screen width
    if (typeof window !== 'undefined') {
      setScreenWidth(window.innerWidth);
    }

    const updateSizes = () => {
      // Update screen width
      if (typeof window !== 'undefined') {
        setScreenWidth(window.innerWidth);
      }

      // Update cell size
      if (gridContainerRef.current) {
        const cells = gridContainerRef.current.querySelectorAll('.chord-cell');
        if (cells.length > 0) {
          const firstCell = cells[0] as HTMLElement;
          const width = firstCell.offsetWidth;
          setCellSize(width);

          // Debug: Log cell size changes for font sizing
          console.log(`ChordGrid cell size updated: ${width}px, dynamic font class: ${getDynamicFontSize(width)}`);
        }
      }
    };

    // Initial size calculation
    updateSizes();

    // Set up window resize listener for screen width
    const handleResize = () => {
      updateSizes();
    };

    window.addEventListener('resize', handleResize);

    // Set up resize observer for cell size
    let resizeObserver: ResizeObserver | null = null;
    if (gridContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateSizes();
      });
      resizeObserver.observe(gridContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [chords.length, actualBeatsPerMeasure]); // Re-run when chord data or time signature changes


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





  // Enhanced dynamic measures per row calculation with screen width awareness
  const getDynamicMeasuresPerRow = (timeSignature: number, chatbotOpen: boolean, lyricsPanelOpen: boolean, currentScreenWidth: number): number => {
    // Use the current screen width from state

    // Determine screen category
    const isMobile = currentScreenWidth < 768;
    const isTablet = currentScreenWidth >= 768 && currentScreenWidth < 1024;
    const isDesktop = currentScreenWidth >= 1024 && currentScreenWidth < 1440;
    const isLargeDesktop = currentScreenWidth >= 1440;

    // Check if any panel is open
    const anyPanelOpen = chatbotOpen || lyricsPanelOpen;

    // Base calculation targeting optimal cell count per screen size
    let targetCellsPerRow: number;
    let maxMeasuresPerRow: number;

    if (isMobile) {
      targetCellsPerRow = anyPanelOpen ? 4 : 6; // More conservative when panels are open
      maxMeasuresPerRow = anyPanelOpen ? 1 : 2;
    } else if (isTablet) {
      targetCellsPerRow = anyPanelOpen ? 8 : 12; // Reduce when panels are open
      maxMeasuresPerRow = anyPanelOpen ? 3 : 4;
    } else if (isDesktop) {
      targetCellsPerRow = anyPanelOpen ? 12 : 18; // Significant reduction when panels are open
      maxMeasuresPerRow = anyPanelOpen ? 4 : 6;
    } else { // Large desktop
      targetCellsPerRow = anyPanelOpen ? 16 : 24; // Still reduce for large screens
      maxMeasuresPerRow = anyPanelOpen ? 6 : 8;
    }

    // Calculate base measures per row
    let measuresPerRow = Math.max(1, Math.floor(targetCellsPerRow / timeSignature));

    // Apply additional reduction if panels are open (more aggressive than before)
    if (anyPanelOpen) {
      measuresPerRow = Math.max(1, Math.floor(measuresPerRow * 0.8)); // Slightly less aggressive than before
    }

    // Apply time signature complexity limits
    if (timeSignature >= 7) {
      maxMeasuresPerRow = Math.min(maxMeasuresPerRow, anyPanelOpen ? 2 : 3); // Very complex: max 2-3 measures
    } else if (timeSignature >= 5) {
      maxMeasuresPerRow = Math.min(maxMeasuresPerRow, anyPanelOpen ? 3 : 4); // Moderate: max 3-4 measures
    }

    // Ensure we don't exceed screen-appropriate maximums
    measuresPerRow = Math.min(measuresPerRow, maxMeasuresPerRow);

    console.log(`Screen-aware layout: width=${currentScreenWidth}px, timeSignature=${timeSignature}, chatbot=${chatbotOpen}, lyrics=${lyricsPanelOpen}, anyPanel=${anyPanelOpen}, targetCells=${targetCellsPerRow}, calculatedMeasures=${measuresPerRow}, maxAllowed=${maxMeasuresPerRow}, totalCells=${measuresPerRow * timeSignature}`);

    return measuresPerRow;
  };

  // Use dynamic measures per row with current screen width
  const dynamicMeasuresPerRow = getDynamicMeasuresPerRow(actualBeatsPerMeasure, isChatbotOpen, isLyricsPanelOpen, screenWidth);

  // Enhanced chord styling with pickup beat support
  const getChordStyle = (chord: string, isCurrentBeat: boolean, beatIndex: number) => {
    // Base classes for all cells
    const baseClasses = "flex flex-col items-start justify-center aspect-square transition-all duration-200 border border-gray-300 dark:border-gray-600 rounded-sm overflow-hidden";

    // Determine cell type
    const isEmpty = chord === '';
    const isPickupBeat = hasPickupBeats && beatIndex < timeSignature && beatIndex >= (timeSignature - pickupBeatsCount);

    // Default styling
    let classes = `${baseClasses} bg-white dark:bg-gray-800`;
    let textColor = "text-gray-800 dark:text-gray-200";

    // Empty cell styling (greyed out)
    if (isEmpty) {
      classes = `${baseClasses} bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600`;
      textColor = "text-gray-400 dark:text-gray-500";
    }
    // Pickup beat styling (slightly different background)
    else if (isPickupBeat) {
      classes = `${baseClasses} bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700`;
      textColor = "text-blue-800 dark:text-blue-200";
    }

    // Highlight current beat (overrides other styling)
    if (isCurrentBeat) {
      if (isEmpty) {
        // Don't highlight empty cells as strongly
        classes = `${baseClasses} bg-gray-200 dark:bg-gray-600 ring-1 ring-gray-400 dark:ring-gray-500`;
        textColor = "text-gray-600 dark:text-gray-400";
      } else {
        classes = `${baseClasses} bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500 dark:ring-blue-400 shadow-md`;
        textColor = "text-gray-800 dark:text-white";
      }
    }

    return `${classes} ${textColor}`;
  };

  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-700 dark:text-gray-300 text-center p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 w-full transition-colors duration-300">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  // Enhanced measure grouping with proper pickup beat handling using shifted chords
  const groupedByMeasure: Array<{
    measureNumber: number;
    chords: string[];
    beats: number[];
    isPickupMeasure?: boolean;
  }> = [];

  // Proper measure grouping that respects musical measure boundaries
  let currentIndex = 0;
  let measureNumber = 0; // Start at 0 for pickup measure

  while (currentIndex < shiftedChords.length) {
    const measure = {
      measureNumber: measureNumber,
      chords: [] as string[],
      beats: [] as number[],
      isPickupMeasure: measureNumber === 0 && hasPickupBeats
    };

    // For pickup measure, include all beats up to the time signature
    // For regular measures, include exactly the time signature number of beats
    const beatsInThisMeasure = actualBeatsPerMeasure;

    for (let b = 0; b < beatsInThisMeasure && currentIndex < shiftedChords.length; b++) {
      measure.chords.push(shiftedChords[currentIndex]);
      measure.beats.push(beats[currentIndex]);
      currentIndex++;
    }

    // Pad incomplete measures to maintain consistent grid layout
    while (measure.chords.length < actualBeatsPerMeasure) {
      measure.chords.push(''); // Empty cell for padding
      measure.beats.push(-1); // Invalid beat index for padding
    }

    groupedByMeasure.push(measure);
    measureNumber++;
  }


  // Enhanced debug output for measure grouping with shift verification
  console.log(`\n🎵 MEASURE GROUPING DEBUG:`);
  console.log(`📊 Grid: ${groupedByMeasure.length} measures, ${actualBeatsPerMeasure}/4 time signature`);
  console.log(`🔄 Applied shift: ${optimalShift} beats`);

  // Show first few measures with their chord content
  console.log('📋 First 3 measures structure:');
  groupedByMeasure.slice(0, 3).forEach((m, i) => {
    console.log(`  Measure ${i}: [${m.chords.join(', ')}] ${m.isPickupMeasure ? '(pickup)' : ''}`);
  });

  // Debug: Verify sequential beat progression using shifted chords
  const allShiftedBeats = groupedByMeasure.flatMap(m => m.chords);
  console.log(`🎼 Shifted chord sequence (first 12): [${allShiftedBeats.slice(0, 12).join(', ')}]`);

  // Compare with original sequence for verification
  console.log(`📊 Original chord sequence (first 12): [${chords.slice(0, 12).join(', ')}]`);
  console.log(`✅ Shift verification: Original[${optimalShift}:] should match Shifted[0:]`);
  console.log(`   Original[${optimalShift}:${optimalShift + 6}]: [${chords.slice(optimalShift, optimalShift + 6).join(', ')}]`);
  console.log(`   Shifted[0:6]: [${allShiftedBeats.slice(0, 6).join(', ')}]`);
  console.log(`🎵 END MEASURE GROUPING DEBUG\n`);

  // Group measures into rows using the dynamic measures per row
  const rows: Array<typeof groupedByMeasure> = [];
  for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
    rows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
  }

  return (
    <div ref={gridContainerRef} className="chord-grid-container mx-auto px-1 sm:px-2 relative" style={{ maxWidth: "98%" }}>

      {/* Header section with improved layout - title left, tags right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        {/* Left side - Title */}
        <div className="flex items-center">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Chord Progression
          </h3>
        </div>

        {/* Right side - Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time signature tag */}
          <div className="bg-blue-50 dark:bg-blue-200 border border-blue-200 dark:border-blue-300 rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-900">
              Time: {timeSignature}/4
            </span>
          </div>

          {/* Key signature tag */}
          {keySignature && (
            <div className="bg-green-50 dark:bg-green-200 border border-green-200 dark:border-green-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-green-800 dark:text-green-900">
                Key: {keySignature}
              </span>
            </div>
          )}

          {/* Key detection loading indicator */}
          {isDetectingKey && (
            <div className="bg-gray-50 dark:bg-gray-200 border border-gray-200 dark:border-gray-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-700">
                Detecting key...
              </span>
            </div>
          )}

          {/* Pickup beats indicator */}
          {hasPickupBeats && pickupBeatsCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-200 border border-blue-200 dark:border-blue-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-900">
                Pickup: {pickupBeatsCount} beat{pickupBeatsCount > 1 ? 's' : ''}
              </span>
            </div>
          )}


        </div>


      </div>

      {/* Render rows of measures */}
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="measure-row">
            {/* Grid of measures with aggressive responsive layout to prevent fall-through */}
            <div className={`grid gap-1 md:gap-2 ${
              // More aggressive responsive grid that reaches target measures per row faster
              dynamicMeasuresPerRow === 1 ? 'grid-cols-1' :
              dynamicMeasuresPerRow === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              dynamicMeasuresPerRow === 3 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' :
              dynamicMeasuresPerRow === 4 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4' :
              dynamicMeasuresPerRow === 5 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
              dynamicMeasuresPerRow === 6 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6' :
              dynamicMeasuresPerRow === 7 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7' :
              dynamicMeasuresPerRow === 8 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8' :
              dynamicMeasuresPerRow === 9 ? 'grid-cols-1 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9' :
              dynamicMeasuresPerRow === 10 ? 'grid-cols-1 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10' :
              'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' // Fallback
            }`}>
              {row.map((measure, measureIdx) => {
                return (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="border-l-[3px] border-gray-600 dark:border-gray-400 transition-colors duration-300"
                  style={{
                    paddingLeft: '4px'
                  }}
                >
                  {/* Chord cells for this measure - consistent grid based on time signature */}
                  <div className={`grid gap-1 auto-rows-fr ${getGridColumnsClass(actualBeatsPerMeasure)}`}>
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

                      // CRITICAL FIX: Adjust currentBeatIndex to account for visual shift
                      // The beat animation needs to be shifted to match the shifted chord positions
                      const adjustedCurrentBeatIndex = currentBeatIndex !== undefined && currentBeatIndex >= 0
                        ? (currentBeatIndex + optimalShift) % chords.length
                        : -1;

                      const isCurrentBeat = globalIndex === adjustedCurrentBeatIndex;
                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isEmpty = chord === '';

                      return (
                        <div
                          id={`chord-${globalIndex}`}
                          key={`chord-${globalIndex}`}
                          className={`${getChordStyle(chord, isCurrentBeat, globalIndex)} w-full h-full min-h-[3.75rem] chord-cell`}
                        >
                          {/* Enhanced chord display with pickup beat support */}
                          <div style={getChordContainerStyles()}>
                            {!isEmpty && showChordLabel && chord ? (
                              <div
                                className={`${getDynamicFontSize(cellSize, chord.length)} font-medium leading-tight`}
                                style={getChordLabelStyles(chord)}
                                dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(chord) }}
                              />
                            ) : isEmpty ? (
                              // Empty cell - no content
                              <div className="opacity-0" style={getChordLabelStyles('')}>·</div>
                            ) : (
                              // Non-empty cell but no label to show
                              <div className="opacity-0" style={getChordLabelStyles('')}>·</div>
                            )}
                          </div>
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
};

export default ChordGrid;