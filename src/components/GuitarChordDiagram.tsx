'use client';

import React from 'react';
import Image from 'next/image';
import Chord from '@tombatossals/react-chords/lib/Chord';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';

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
  segmentationColor?: string; // Segmentation color for border styling
  showPositionSelector?: boolean; // Show position selector for multiple positions
  onPositionChange?: (positionIndex: number) => void; // Callback for position changes
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
  isFocused = false,
  segmentationColor,
  showPositionSelector = false,
  onPositionChange
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
          className="bg-white rounded-lg border flex items-center justify-center transition-colors duration-200 shadow-sm"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            borderColor: segmentationColor || '#d1d5db', // Use segmentation color or default gray
            borderWidth: segmentationColor ? '3px' : '1px' // Thicker border for segmentation
          }}
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

  // Use the centralized chord formatting function for consistency with beat/chord grid
  // This ensures both components display chord labels with the same formatting
  const getFormattedChordName = (): string => {
    if (displayName) {
      // Use provided displayName (for enharmonic corrections)
      return formatChordWithMusicalSymbols(displayName, false); // Use light mode for guitar diagrams
    } else if (chordData) {
      // Reconstruct chord name from chord data and format it
      const reconstructedChord = chordData.suffix === 'major'
        ? chordData.key
        : `${chordData.key}:${chordData.suffix}`;
      return formatChordWithMusicalSymbols(reconstructedChord, false); // Use light mode for guitar diagrams
    }
    return '';
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Chord diagram - White background for better readability */}
      <div
        className="chord-diagram-container relative bg-white rounded-lg overflow-hidden shadow-sm border transition-colors duration-200"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderColor: segmentationColor || '#d1d5db', // Use segmentation color or default gray
          borderWidth: segmentationColor ? '3px' : '1px' // Thicker border for segmentation
        }}
      >
        <Chord
          chord={chordForDiagram}
          instrument={GUITAR_INSTRUMENT}
          lite={lite}
        />
      </div>

      {/* Chord name */}
      {showChordName && (
        <span
          className={`text-center font-medium mt-2 ${
            size === 'small' ? 'text-xs' :
            size === 'medium' ? 'text-sm' :
            'text-base'
          } ${
            isFocused
              ? 'text-gray-800 dark:text-white' // Focused: darker in light mode, white in dark mode
              : 'text-gray-600 dark:text-gray-400' // Unfocused: lighter in both modes
          } transition-colors duration-200`}
          dangerouslySetInnerHTML={{
            __html: getFormattedChordName()
          }}
        />
      )}

      {/* Position selector for multiple chord positions */}
      {showPositionSelector && chordData && chordData.positions.length > 1 && (
        <div className="flex items-center justify-center mt-2 space-x-2">
          <button
            onClick={() => onPositionChange && onPositionChange(positionIndex > 0 ? positionIndex - 1 : chordData.positions.length - 1)}
            className="w-6 h-6 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            disabled={!onPositionChange}
          >
            ‹
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium min-w-[2rem] text-center">
            {positionIndex + 1}/{chordData.positions.length}
          </span>
          <button
            onClick={() => onPositionChange && onPositionChange(positionIndex < chordData.positions.length - 1 ? positionIndex + 1 : 0)}
            className="w-6 h-6 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            disabled={!onPositionChange}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
};

export default GuitarChordDiagram;
