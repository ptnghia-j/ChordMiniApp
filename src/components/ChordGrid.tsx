import React from 'react';

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: number[]; // Array of corresponding beat indices or timestamps
  currentBeatIndex?: number; // Current beat index for highlighting, optional
}

const ChordGrid: React.FC<ChordGridProps> = ({ chords, beats, currentBeatIndex = -1 }) => {
  // Helper to determine chord type and apply appropriate styling
  const getChordStyle = (chord: string, isCurrentBeat: boolean) => {
    // Base classes for all chords - making these more compact
    let baseClasses = "flex flex-col items-center justify-center py-2 px-3 rounded-md transition-all duration-200";
    
    // Highlight current beat
    if (isCurrentBeat) {
      baseClasses += " transform scale-105 ring-2 ring-primary-500 shadow-md";
    } else {
      baseClasses += " shadow-sm";
    }
    
    // Apply color based on chord type
    if (chord.includes('m') && !chord.includes('maj')) {
      // Minor chords
      return isCurrentBeat
        ? `${baseClasses} bg-blue-100 border border-blue-300 text-blue-800`
        : `${baseClasses} bg-blue-50 border border-blue-200 text-blue-800`;
    } else if (chord.includes('7')) {
      // Seventh chords
      return isCurrentBeat
        ? `${baseClasses} bg-purple-100 border border-purple-300 text-purple-800`
        : `${baseClasses} bg-purple-50 border border-purple-200 text-purple-800`;
    } else if (chord.includes('sus')) {
      // Suspended chords
      return isCurrentBeat
        ? `${baseClasses} bg-yellow-100 border border-yellow-300 text-yellow-800`
        : `${baseClasses} bg-yellow-50 border border-yellow-200 text-yellow-800`;
    } else if (chord.includes('dim') || chord.includes('aug')) {
      // Diminished/Augmented chords
      return isCurrentBeat
        ? `${baseClasses} bg-red-100 border border-red-300 text-red-800`
        : `${baseClasses} bg-red-50 border border-red-200 text-red-800`;
    } else {
      // Major chords (default)
      return isCurrentBeat
        ? `${baseClasses} bg-green-100 border border-green-300 text-green-800`
        : `${baseClasses} bg-green-50 border border-green-200 text-green-800`;
    }
  };

  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 text-center p-8 bg-gray-50 rounded-lg border border-gray-200 w-full">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  return (
    <div className="chord-grid-container">
      <div className="grid grid-cols-8 md:grid-cols-12 gap-1">
        {chords.map((chord, index) => {
          const isCurrentBeat = index === currentBeatIndex;
          
          return (
            <div key={index} className={getChordStyle(chord, isCurrentBeat)}>
              <div className="text-xs text-gray-500 mb-0.5">{beats[index]}</div>
              <div className="text-lg font-heading font-bold">{chord}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChordGrid; 