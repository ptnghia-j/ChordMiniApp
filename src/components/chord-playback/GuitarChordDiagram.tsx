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
  soundingChordName?: string; // The actual sounding chord name (when capo is active)
  isFocused?: boolean; // Whether this chord diagram is currently focused/active
  customWidth?: number; // Override size preset width for responsive sizing
  customHeight?: number; // Override size preset height for responsive sizing
  segmentationColor?: string; // Segmentation color for border styling
  showPositionSelector?: boolean; // Show position selector for multiple positions
  onPositionChange?: (positionIndex: number) => void; // Callback for position changes
  capoFret?: number; // Capo fret position (0 = no capo, 1-12 = capo position)
  capoLabelMode?: 'shape' | 'sound'; // Whether to show shape name or sounding name
  // Roman numeral analysis props
  showRomanNumerals?: boolean;
  romanNumeral?: React.ReactElement | string;
  labelClassName?: string;
  romanNumeralClassName?: string;

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
  soundingChordName,
  isFocused = false,
  customWidth,
  customHeight,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  segmentationColor,
  showPositionSelector = false,
  onPositionChange,
  capoFret = 0,
  capoLabelMode = 'shape',
  showRomanNumerals = false,
  romanNumeral,
  labelClassName,
  romanNumeralClassName
}) => {
  // Size configurations - responsive sizing
  const sizeConfig = {
    small: { width: 70, height: 90 },
    medium: { width: 90, height: 115 },
    large: { width: 140, height: 175 }
  };

  // Compute dimensions: use custom overrides for responsive sizing, or fall back to presets
  const { width: presetWidth, height: presetHeight } = sizeConfig[size];
  const width = customWidth ?? presetWidth;
  const height = customHeight ?? presetHeight;

  // Return quarter rest SVG for N.C. (No Chord)
  if (!chordData || !chordData.positions || chordData.positions.length === 0) {
    const restSize = Math.min(width * 0.6, height * 0.6); // Scale rest to 60% of container

    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div
          className={`flex items-center justify-center transition-all duration-200 rounded-lg ${
            isFocused
              ? 'ring-2 ring-blue-500/60 dark:ring-blue-400/60 bg-blue-50 dark:bg-blue-900/30'
              : ''
          }`}
          style={{
            width: `${width}px`,
            height: `${height}px`,
          }}
        >
          <Image
            src="/quarter_rest.svg"
            alt="No Chord"
            width={restSize}
            height={restSize}
            className="quarter-rest-responsive transition-all duration-200 brightness-[0.4] dark:brightness-100 dark:invert"
          />
        </div>
        {showChordName && (
          <span className={`font-varela text-center font-medium mt-1 ${
            size === 'small' ? 'text-xs' :
            size === 'medium' ? 'text-sm' :
            'text-base'
          } ${
            isFocused
              ? 'text-blue-600 dark:text-blue-400 font-semibold' // Focused: blue colored
              : 'text-gray-500 dark:text-gray-400' // Unfocused: lighter
          } transition-all duration-200 ${labelClassName || ''}`}>
            No Chord
          </span>
        )}

        {/* Roman numeral display for No Chord */}
        {showRomanNumerals && romanNumeral && (
          <div
            className={`font-varela text-center font-semibold mt-0.5 text-blue-700 dark:text-blue-300 ${
              size === 'small' ? 'text-xs' :
              size === 'medium' ? 'text-sm' :
              'text-base'
            }`}
            title={`Roman numeral: ${typeof romanNumeral === 'string' ? romanNumeral : romanNumeral.toString()}`}
          >
            {React.isValidElement(romanNumeral)
              ? romanNumeral
              : typeof romanNumeral === 'string'
              ? romanNumeral.replace(/\|/g, '/')
              : romanNumeral
            }
          </div>
        )}
      </div>
    );
  }

  // Get the position to display (default to first position)
  const position = chordData.positions[Math.min(positionIndex, chordData.positions.length - 1)];

  // Adjust frets and baseFret when capo is active
  // When capo > 0:
  //   - baseFret shifts up by capoFret (removes bold nut, shows fret number)
  //   - Open strings (fret 0) are fretted by the capo, not open anymore
  //     We keep them as 0 visually but the baseFret offset handles the position
  //   - Muted strings (-1) remain muted
  const adjustedBaseFret = capoFret > 0
    ? position.baseFret + capoFret
    : position.baseFret || 1;

  // Convert chord data to format expected by react-chords
  const chordForDiagram = {
    frets: position.frets,
    fingers: position.fingers,
    barres: position.barres || [],
    capo: position.capo || false,
    baseFret: adjustedBaseFret
  };

  // Helper to derive accidental preference from a chord name
  const deriveAccidentalPreference = (name?: string): 'sharp' | 'flat' | undefined => {
    if (!name) return undefined;
    if (/[b♭]/.test(name)) return 'flat';
    if (/[#♯]/.test(name)) return 'sharp';
    return undefined;
  };

  // Use the centralized chord formatting function for consistency with beat/chord grid
  // For guitar chord diagrams, prioritize the actual chord data name over displayName
  // since guitar diagrams don't support inversions and should show the lookup name
  // Determine which chord name to display based on capo label mode
  const getFormattedChordName = (): string => {
    // When capo is active and mode is 'sound', show the sounding chord name
    if (capoFret > 0 && capoLabelMode === 'sound' && soundingChordName) {
      const accidentalPreference = deriveAccidentalPreference(soundingChordName);
      return formatChordWithMusicalSymbols(soundingChordName, false, accidentalPreference);
    }

    const accidentalPreference = deriveAccidentalPreference(displayName);

    if (chordData) {
      // Map DB key conventions to standard enharmonics for display
      const keyForDisplay = chordData.key === 'Csharp' ? 'C#'
        : chordData.key === 'Fsharp' ? 'F#'
        : chordData.key;

      // Reconstruct chord name from chord data (lookup name without slash inversions)
      const reconstructedChord = chordData.suffix === 'major'
        ? keyForDisplay
        : `${keyForDisplay}:${chordData.suffix}`;

      return formatChordWithMusicalSymbols(reconstructedChord, false, accidentalPreference); // Light mode
    } else if (displayName) {
      // Fallback to displayName; keep the grid's enharmonic preference
      return formatChordWithMusicalSymbols(displayName, false, accidentalPreference);
    }
    return '';
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Chord diagram - transparent, sits directly on parent background */}
      <div
        className={`chord-diagram-container relative overflow-hidden transition-all duration-200 rounded-lg ${
          isFocused
            ? 'ring-2 ring-blue-500/60 dark:ring-blue-400/60 bg-blue-50 dark:bg-blue-900/30'
            : ''
        }`}
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        <div className="chord-diagram-svg">
          <Chord
            chord={chordForDiagram}
            instrument={GUITAR_INSTRUMENT}
            lite={lite}
          />
        </div>
      </div>

      {/* Chord name */}
      {showChordName && (
        <span
          className={`font-varela text-center font-medium mt-1 ${
            size === 'small' ? 'text-xs' :
            size === 'medium' ? 'text-sm' :
            'text-base'
          } ${
            isFocused
              ? 'text-blue-600 dark:text-blue-400 font-semibold' // Focused: blue colored
              : 'text-gray-600 dark:text-gray-400' // Unfocused: lighter in both modes
          } transition-all duration-200 ${labelClassName || ''}`}
          dangerouslySetInnerHTML={{
            __html: getFormattedChordName()
          }}
        />
      )}

      {/* Roman numeral display */}
      {showRomanNumerals && romanNumeral && (
        <div
          className={`font-varela text-center font-semibold mt-0.5 text-blue-700 dark:text-blue-300 ${
            size === 'small' ? 'text-xs' :
            size === 'medium' ? 'text-sm' :
            'text-base'
          } ${romanNumeralClassName || ''}`}
          title={`Roman numeral: ${typeof romanNumeral === 'string' ? romanNumeral : romanNumeral.toString()}`}
        >
          {typeof romanNumeral === 'string'
            ? romanNumeral.replace(/\|/g, '/')
            : romanNumeral
          }
        </div>
      )}

      {/* Position selector for multiple chord positions */}
      {showPositionSelector && chordData && chordData.positions.length > 1 && (
        <div className="relative z-[70] flex items-center justify-center mt-1.5 space-x-2">
          <button
            onClick={() => onPositionChange && onPositionChange(positionIndex > 0 ? positionIndex - 1 : chordData.positions.length - 1)}
            className="w-6 h-6 flex items-center justify-center text-xs bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 rounded-full hover:bg-gray-300/70 dark:hover:bg-gray-500/70 transition-colors"
            disabled={!onPositionChange}
            aria-label="Previous chord position"
          >
            ‹
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium min-w-[2rem] text-center">
            {positionIndex + 1}/{chordData.positions.length}
          </span>
          <button
            onClick={() => onPositionChange && onPositionChange(positionIndex < chordData.positions.length - 1 ? positionIndex + 1 : 0)}
            className="w-6 h-6 flex items-center justify-center text-xs bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 rounded-full hover:bg-gray-300/70 dark:hover:bg-gray-500/70 transition-colors"
            disabled={!onPositionChange}
            aria-label="Next chord position"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
};

export default GuitarChordDiagram;
