'use client';

import React from 'react';
import Image from 'next/image';
import Chord from '@tombatossals/react-chords/lib/Chord';

interface ChordPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
  midi?: number[];
}

interface ChordData {
  key: string;
  suffix: string;
  positions: ChordPosition[];
}

interface GuitarChordDiagramProps {
  chordData: ChordData | null;
  positionIndex?: number; // Which position to display (default: 0)
  size?: 'small' | 'medium' | 'large';
  className?: string;
  showChordName?: boolean;
  lite?: boolean; // Simplified rendering
  displayName?: string; // Override chord name display (for enharmonic corrections)
  isFocused?: boolean; // Whether this chord diagram is currently focused/active
}

// Standard guitar instrument configuration
const GUITAR_INSTRUMENT = {
  strings: 6,
  fretsOnChord: 4,
  name: 'Guitar',
  keys: [],
  tunings: {
    standard: ['E', 'A', 'D', 'G', 'B', 'E']
  }
};

export const GuitarChordDiagram: React.FC<GuitarChordDiagramProps> = ({
  chordData,
  positionIndex = 0,
  size = 'medium',
  className = '',
  showChordName = true,
  lite = false,
  displayName,
  isFocused = false
}) => {
  // Size configurations - responsive sizing
  const sizeConfig = {
    small: { width: 70, height: 90 },
    medium: { width: 90, height: 115 },
    large: { width: 140, height: 175 }
  };

  // Return quarter rest SVG for N.C. (No Chord)
  if (!chordData || !chordData.positions || chordData.positions.length === 0) {
    const { width, height } = sizeConfig[size];
    const restSize = Math.min(width * 0.6, height * 0.6); // Scale rest to 60% of container

    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div
          className="bg-white rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center transition-colors duration-200 shadow-sm"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <Image
            src="/quarter_rest.svg"
            alt="No Chord"
            width={restSize}
            height={restSize}
            className="quarter-rest-responsive transition-opacity duration-200"
            style={{
              filter: 'brightness(0.4)' // Make it darker for better visibility
            }}
          />
        </div>
        {showChordName && (
          <span className={`text-center font-medium mt-2 ${
            size === 'small' ? 'text-xs' :
            size === 'medium' ? 'text-sm' :
            'text-base'
          } ${
            isFocused
              ? 'text-gray-600 dark:text-gray-300' // Focused: slightly darker
              : 'text-gray-500 dark:text-gray-400' // Unfocused: lighter
          } transition-colors duration-200`}>
            No Chord
          </span>
        )}
      </div>
    );
  }

  // Get the position to display (default to first position)
  const position = chordData.positions[Math.min(positionIndex, chordData.positions.length - 1)];

  // Convert chord data to format expected by react-chords
  const chordForDiagram = {
    frets: position.frets,
    fingers: position.fingers,
    barres: position.barres || [],
    capo: position.capo || false,
    baseFret: position.baseFret || 1
  };

  const { width, height } = sizeConfig[size];

  // Chord name for display with proper formatting and Unicode symbols
  const formatChordName = (key: string, suffix: string): string => {
    // Convert ASCII sharp/flat symbols to Unicode musical symbols
    const displayName = key
      .replace(/#/g, '♯')  // Sharp (#) → ♯ (U+266F)
      .replace(/b/g, '♭'); // Flat (b) → ♭ (U+266D)

    // Add suffix formatting
    if (suffix === 'major') {
      // Major chords don't need suffix
      return displayName;
    } else if (suffix === 'minor') {
      return displayName + 'm';
    } else if (suffix === 'dim') {
      return displayName + '°';
    } else if (suffix === 'aug') {
      return displayName + '+';
    } else {
      return displayName + suffix;
    }
  };

  // Use displayName if provided (for enharmonic corrections), otherwise format from chord data
  // Apply Unicode symbol conversion to displayName as well
  const chordName = displayName
    ? displayName.replace(/#/g, '♯').replace(/b/g, '♭')
    : formatChordName(chordData.key, chordData.suffix);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Chord diagram - Force light background for better visibility */}
      <div
        className="chord-diagram-container relative bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-600 transition-colors duration-200"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        <Chord
          chord={chordForDiagram}
          instrument={GUITAR_INSTRUMENT}
          lite={lite}
        />
      </div>

      {/* Chord name */}
      {showChordName && (
        <span className={`text-center font-medium mt-2 ${
          size === 'small' ? 'text-xs' :
          size === 'medium' ? 'text-sm' :
          'text-base'
        } ${
          isFocused
            ? 'text-gray-800 dark:text-white' // Focused: darker in light mode, white in dark mode
            : 'text-gray-600 dark:text-gray-400' // Unfocused: lighter in both modes
        } transition-colors duration-200`}>
          {chordName}
        </span>
      )}
    </div>
  );
};

export default GuitarChordDiagram;
