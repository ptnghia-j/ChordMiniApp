'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { isBlackKey, NOTE_NAMES } from '@/utils/chordToMidi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PianoKeyboardProps {
  /** Lowest MIDI note to display */
  startMidi: number;
  /** Highest MIDI note to display */
  endMidi: number;
  /** Set of currently active (highlighted) MIDI note numbers */
  activeNotes: Set<number>;
  /** Map of MIDI note → color for active notes */
  noteColors?: Map<number, string>;
  /** Width of each white key in pixels */
  whiteKeyWidth?: number;
  /** Height of the keyboard in pixels */
  height?: number;
  /** Callback when a key is clicked */
  onKeyClick?: (midi: number) => void;
}

// ─── Key Layout Constants ────────────────────────────────────────────────────

// White key width relative units
const DEFAULT_WHITE_KEY_WIDTH = 14;
const WHITE_KEY_HEIGHT = 80;
const BLACK_KEY_HEIGHT = 50;

// Black key offsets within a white key (percentage from left edge)
// These match standard piano proportions
const BLACK_KEY_OFFSETS: Record<number, number> = {
  1: -0.35,   // C# sits between C and D
  3: 0.35,    // D# sits between D and E
  6: -0.40,   // F# sits between F and G
  8: 0.0,     // G# sits between G and A
  10: 0.40,   // A# sits between A and B
};

// ─── Component ───────────────────────────────────────────────────────────────

export const PianoKeyboard: React.FC<PianoKeyboardProps> = React.memo(({
  startMidi,
  endMidi,
  activeNotes,
  noteColors,
  whiteKeyWidth = DEFAULT_WHITE_KEY_WIDTH,
  height = WHITE_KEY_HEIGHT,
  onKeyClick,
}) => {
  // Build key layout
  const { whiteKeys, blackKeys, totalWhiteKeys } = useMemo(() => {
    const whites: Array<{ midi: number; index: number; noteName: string; octave: number }> = [];
    const blacks: Array<{ midi: number; whiteKeyIndex: number; noteName: string; octave: number; offset: number }> = [];

    let whiteIndex = 0;

    for (let midi = startMidi; midi <= endMidi; midi++) {
      const noteIndex = midi % 12;
      const octave = Math.floor(midi / 12) - 1;
      const noteName = NOTE_NAMES[noteIndex];

      if (isBlackKey(midi)) {
        // Find the white key this black key is between
        const offset = BLACK_KEY_OFFSETS[noteIndex] ?? 0;
        blacks.push({
          midi,
          whiteKeyIndex: whiteIndex - 1, // Sits above the previous white key boundary
          noteName,
          octave,
          offset,
        });
      } else {
        whites.push({ midi, index: whiteIndex, noteName, octave });
        whiteIndex++;
      }
    }

    return { whiteKeys: whites, blackKeys: blacks, totalWhiteKeys: whiteIndex };
  }, [startMidi, endMidi]);

  const blackKeyWidth = Math.round(whiteKeyWidth * 0.583);
  const whiteKeyHeight = height;
  const blackKeyHeight = height * (BLACK_KEY_HEIGHT / WHITE_KEY_HEIGHT);
  const totalWidth = totalWhiteKeys * whiteKeyWidth;

  return (
    <div
      className="piano-keyboard relative select-none"
      style={{ width: totalWidth, height: whiteKeyHeight }}
      role="group"
      aria-label="Piano keyboard"
    >
      {/* White keys */}
      {whiteKeys.map((key) => {
        const isActive = activeNotes.has(key.midi);
        const color = noteColors?.get(key.midi);
        const isC = key.noteName === 'C';

        return (
          <motion.button
            key={`white-${key.midi}`}
            className={`
              absolute top-0 border rounded-b-sm
              transition-colors duration-75
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
              ${isActive
                ? 'border-transparent'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-100 hover:bg-gray-50 dark:hover:bg-gray-200'
              }
            `}
            style={{
              left: key.index * whiteKeyWidth,
              width: whiteKeyWidth,
              height: whiteKeyHeight,
              zIndex: 1,
              ...(isActive ? { backgroundColor: color || '#60a5fa' } : {}),
            }}
            animate={isActive ? {
              boxShadow: `0 0 12px 2px ${color || '#60a5fa'}80`,
            } : {
              boxShadow: '0 0 0px 0px transparent',
            }}
            transition={{ duration: 0.05 }}
            onClick={() => onKeyClick?.(key.midi)}
            aria-label={`${key.noteName}${key.octave}`}
            aria-pressed={isActive}
          >
            {/* Show note label for C notes */}
            {isC && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-medium text-gray-400 dark:text-gray-500 pointer-events-none">
                C{key.octave}
              </span>
            )}
          </motion.button>
        );
      })}

      {/* Black keys (rendered on top) */}
      {blackKeys.map((key) => {
        const isActive = activeNotes.has(key.midi);
        const color = noteColors?.get(key.midi);

        // Position: center on the boundary between two white keys, with offset
        const baseLeft = (key.whiteKeyIndex + 1) * whiteKeyWidth - blackKeyWidth / 2;
        const offsetPx = key.offset * (whiteKeyWidth * 0.3);

        return (
          <motion.button
            key={`black-${key.midi}`}
            className={`
              absolute top-0 rounded-b-md
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
              ${isActive
                ? ''
                : 'bg-gray-900 dark:bg-gray-800 hover:bg-gray-700 dark:hover:bg-gray-700'
              }
            `}
            style={{
              left: baseLeft + offsetPx,
              width: blackKeyWidth,
              height: blackKeyHeight,
              zIndex: 2,
              ...(isActive ? { backgroundColor: color || '#3b82f6' } : {}),
            }}
            animate={isActive ? {
              boxShadow: `0 0 10px 2px ${color || '#3b82f6'}80`,
            } : {
              boxShadow: '0 0 0px 0px transparent',
            }}
            transition={{ duration: 0.05 }}
            onClick={() => onKeyClick?.(key.midi)}
            aria-label={`${key.noteName}${key.octave}`}
            aria-pressed={isActive}
          />
        );
      })}
    </div>
  );
});

// Display name for React DevTools
PianoKeyboard.displayName = 'PianoKeyboard';

export default PianoKeyboard;
