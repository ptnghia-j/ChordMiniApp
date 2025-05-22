import React, { useState, useEffect, useRef } from 'react';
import { formatChordWithMusicalSymbols, getResponsiveChordFontSize, getChordLabelStyles } from '@/utils/chordFormatting';

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: number[]; // Array of corresponding beat indices or timestamps
  currentBeatIndex?: number; // Current beat index for highlighting, optional
  beatsPerMeasure?: number; // Number of beats per measure, defaults to 4
  measuresPerRow?: number; // Number of measures to display per row, defaults to 4
  timeSignature?: number; // Time signature (beats per measure), defaults to 4
}

const ChordGrid: React.FC<ChordGridProps> = ({
  chords,
  beats,
  currentBeatIndex = -1,
  beatsPerMeasure = 4,
  measuresPerRow = 4,
  timeSignature = 4
}) => {
  // Use the provided time signature to override beatsPerMeasure if available
  const actualBeatsPerMeasure = timeSignature || beatsPerMeasure;

  // Debug log for time signature
  console.log(`ChordGrid using time signature: ${timeSignature || 4}/4 (actualBeatsPerMeasure: ${actualBeatsPerMeasure})`);
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

  // Helper to determine chord type and apply appropriate styling
  const getChordStyle = (chord: string, isCurrentBeat: boolean, showLabel: boolean, isFirstInMeasure: boolean) => {
    // Base classes for all cells - fully detached with complete border
    // Using border-gray-300 instead of border-gray-200 for 1.5x darker borders
    let baseClasses = "flex flex-col items-start justify-center aspect-square transition-all duration-200 border border-gray-300 rounded-sm overflow-hidden";

    // All cells have white background by default
    let classes = `${baseClasses} bg-white`;

    // Use a single text color for all chord types (minimalist approach)
    let textColor = "text-gray-800";

    // Highlight current beat with distinct background
    if (isCurrentBeat) {
      classes = `${baseClasses} bg-blue-100 ring-2 ring-blue-500 shadow-md`;
    }

    return `${classes} ${textColor}`;
  };

  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-700 text-center p-4 bg-gray-50 rounded-lg border border-gray-200 w-full">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  // Debug information
  console.log(`ChordGrid rendering with ${chords.length} chords and ${beats.length} beats`);
  console.log('First 5 chords:', chords.slice(0, 5));
  console.log('Unique chords:', [...new Set(chords)].length);

  // Group chords by measure for better visualization
  const groupedByMeasure = [];
  for (let i = 0; i < chords.length; i += actualBeatsPerMeasure) {
    const measureChords = chords.slice(i, i + actualBeatsPerMeasure);
    const measureBeats = beats.slice(i, i + actualBeatsPerMeasure);
    groupedByMeasure.push({ measureNumber: getMeasureNumber(i), chords: measureChords, beats: measureBeats });
  }

  // Group measures into rows - always use 4 for layout consistency
  // The responsive grid will handle the actual display
  const rows = [];
  for (let i = 0; i < groupedByMeasure.length; i += 4) {
    rows.push(groupedByMeasure.slice(i, i + 4));
  }

  return (
    <div className="chord-grid-container mx-auto px-1 sm:px-2" style={{ maxWidth: "98%" }}>
      {/* Render rows of measures */}
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="measure-row">
            {/* Grid of measures with spacing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1 md:gap-2">
              {row.map((measure, measureIdx) => (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="relative border-l-[3px] border-gray-600"
                  style={{
                    paddingLeft: '4px'
                  }}
                >
                  {/* Chord cells for this measure */}
                  <div className="grid grid-cols-4 gap-1 auto-rows-fr">
                    {measure.chords.map((chord, beatIdx) => {
                      const globalIndex = (rowIdx * measuresPerRow + measureIdx) * beatsPerMeasure + beatIdx;
                      const isCurrentBeat = globalIndex === currentBeatIndex;
                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isFirstInMeasure = beatIdx === 0;

                      return (
                        <div
                          id={`chord-${globalIndex}`}
                          key={`chord-${globalIndex}`}
                          className={`${getChordStyle(chord, isCurrentBeat, showChordLabel, isFirstInMeasure)} w-full h-full min-h-[3.75rem]`}
                        >
                          {/* Only show chord name if it's a new chord */}
                          {showChordLabel ? (
                            <div
                              className={getResponsiveChordFontSize(chord)}
                              style={getChordLabelStyles(chord)}
                              dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(chord) }}
                            />
                          ) : (
                            <div className="text-sm md:text-base font-bold opacity-0" style={getChordLabelStyles('')}>·</div>
                          )}
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