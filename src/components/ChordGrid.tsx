import React from 'react';

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: number[]; // Array of corresponding beat indices or timestamps
  currentBeatIndex?: number; // Current beat index for highlighting, optional
  beatsPerMeasure?: number; // Number of beats per measure, defaults to 4
  measuresPerRow?: number; // Number of measures to display per row, defaults to 4
}

const ChordGrid: React.FC<ChordGridProps> = ({
  chords,
  beats,
  currentBeatIndex = -1,
  beatsPerMeasure = 4,
  measuresPerRow = 4
}) => {
  // Helper to determine if this beat should show a chord label
  const shouldShowChordLabel = (index: number): boolean => {
    // Always show the first chord
    if (index === 0) return true;

    // Show chord if it's different from the previous chord
    return chords[index] !== chords[index - 1];
  };

  // Helper to determine if this beat is the first beat of a measure
  const isFirstBeatOfMeasure = (index: number): boolean => {
    return index % beatsPerMeasure === 0;
  };

  // Helper to get measure number (1-based)
  const getMeasureNumber = (index: number): number => {
    return Math.floor(index / beatsPerMeasure) + 1;
  };

  // Helper to determine chord type and apply appropriate styling
  const getChordStyle = (chord: string, isCurrentBeat: boolean, showLabel: boolean, isFirstInMeasure: boolean) => {
    // Base classes for all cells - fully detached with complete border
    let baseClasses = "flex flex-col items-center justify-center aspect-square transition-all duration-200 border border-gray-200 rounded-sm overflow-hidden";

    // All cells have white background by default
    let classes = `${baseClasses} bg-white`;

    // Apply text color based on chord type for better readability
    let textColor = "text-gray-900";

    if (chord !== 'N/C') {
      if (chord.includes('m') && !chord.includes('maj')) {
        // Minor chords
        textColor = "text-blue-800";
      } else if (chord.includes('7')) {
        // Seventh chords
        textColor = "text-purple-800";
      } else if (chord.includes('sus')) {
        // Suspended chords
        textColor = "text-yellow-800";
      } else if (chord.includes('dim') || chord.includes('aug')) {
        // Diminished/Augmented chords
        textColor = "text-red-800";
      } else {
        // Major chords
        textColor = "text-green-800";
      }
    }

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

  // Group chords by measure for better visualization
  const groupedByMeasure = [];
  for (let i = 0; i < chords.length; i += beatsPerMeasure) {
    const measureChords = chords.slice(i, i + beatsPerMeasure);
    const measureBeats = beats.slice(i, i + beatsPerMeasure);
    groupedByMeasure.push({ measureNumber: getMeasureNumber(i), chords: measureChords, beats: measureBeats });
  }

  // Group measures into rows - always use 4 for layout consistency
  // The responsive grid will handle the actual display
  const rows = [];
  for (let i = 0; i < groupedByMeasure.length; i += 4) {
    rows.push(groupedByMeasure.slice(i, i + 4));
  }

  return (
    <div className="chord-grid-container mx-auto px-1 sm:px-2 md:px-4" style={{ maxWidth: "95%" }}>
      {/* Render rows of measures */}
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="measure-row">
            {/* Grid of measures with spacing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              {row.map((measure, measureIdx) => (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="relative border-l border-gray-300"
                  style={{
                    paddingLeft: '4px'
                  }}
                >
                  {/* Chord cells for this measure */}
                  <div className="grid grid-cols-4 gap-1">
                    {measure.chords.map((chord, beatIdx) => {
                      const globalIndex = (rowIdx * measuresPerRow + measureIdx) * beatsPerMeasure + beatIdx;
                      const isCurrentBeat = globalIndex === currentBeatIndex;
                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isFirstInMeasure = beatIdx === 0;

                      return (
                        <div
                          id={`chord-${globalIndex}`}
                          key={`chord-${globalIndex}`}
                          className={`${getChordStyle(chord, isCurrentBeat, showChordLabel, isFirstInMeasure)} w-full h-full min-h-[2.5rem]`}
                        >
                          {/* Only show chord name if it's a new chord */}
                          {showChordLabel ? (
                            <div className="text-xs sm:text-sm md:text-base lg:text-lg font-bold p-1 text-center">{chord}</div>
                          ) : (
                            <div className="text-xs sm:text-sm md:text-base lg:text-lg font-bold opacity-0 p-1">·</div>
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