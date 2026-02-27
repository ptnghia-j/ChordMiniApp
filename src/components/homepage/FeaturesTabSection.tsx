'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, Tab, Tooltip } from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

// ============================================================
// Mock Data
// ============================================================

const MEASURES: string[][] = [
  ['C', 'C', 'C', 'C'],
  ['Am', 'Am', 'Am', 'Am'],
  ['F', 'F', 'F', 'F'],
  ['G', 'G', 'G', 'G'],
  ['C', 'C', 'C', 'C'],
  ['Em', 'Em', 'Am', 'Am'],
  ['F', 'F', 'G', 'G'],
  ['C', 'C', 'C', 'C'],
  ['Dm', 'Dm', 'Dm', 'Dm'],
  ['G', 'G', 'G7', 'G7'],
  ['Am', 'Am', 'F', 'F'],
  ['G', 'G', 'C', ''],
];

const ROMAN: Record<string, string> = {
  C: 'I', Am: 'vi', F: 'IV', G: 'V', Dm: 'ii', Em: 'iii', G7: 'V⁷',
};

const TOTAL_BEATS = MEASURES.reduce((s, m) => s + m.length, 0);
const BEAT_INTERVAL_MS = 800;

// Flat chord list for quick lookup
const FLAT_CHORDS: string[] = MEASURES.flat();

// Unique chord progression (consecutive duplicates collapsed)
interface ProgressionEntry { chord: string; startBeat: number }
const UNIQUE_PROGRESSION: ProgressionEntry[] = (() => {
  const result: ProgressionEntry[] = [];
  let last = '';
  FLAT_CHORDS.forEach((chord, i) => {
    if (chord && chord !== last) {
      result.push({ chord, startBeat: i });
      last = chord;
    }
  });
  return result;
})();

const CHORD_SHAPES: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0], Am: [-1, 0, 2, 2, 1, 0],
  F: [1, 3, 3, 2, 1, 1], G: [3, 2, 0, 0, 0, 3],
  Dm: [-1, -1, 0, 2, 3, 1], Em: [0, 2, 2, 0, 0, 0],
  G7: [3, 2, 0, 0, 0, 1],
};

interface LyricWord { text: string; chord?: string }
interface MockLyricLine { section?: string; words: LyricWord[]; beatRange: [number, number] }

const LYRIC_LINES: MockLyricLine[] = [
  { section: 'Verse',
    words: [{ text: 'Sunlight', chord: 'C' }, { text: ' on the ' }, { text: 'water,', chord: 'Am' }, { text: ' morning breeze' }],
    beatRange: [0, 8] },
  { words: [{ text: 'Colors', chord: 'F' }, { text: ' paint the ' }, { text: 'sky', chord: 'G' }, { text: ' as darkness flees' }],
    beatRange: [8, 16] },
  { section: 'Chorus',
    words: [{ text: 'Oh,', chord: 'C' }, { text: ' we ' }, { text: 'dance', chord: 'Em' }, { text: ' beneath the sky' }],
    beatRange: [16, 24] },
  { words: [{ text: 'Stars', chord: 'F' }, { text: ' will ' }, { text: 'guide', chord: 'Dm' }, { text: ' us through the ' }, { text: 'night', chord: 'G' }],
    beatRange: [24, 32] },
  { words: [{ text: 'Hold', chord: 'C' }, { text: ' on ' }, { text: 'tight,', chord: 'Am' }, { text: " we'll be " }, { text: 'alright', chord: 'F' }],
    beatRange: [32, 40] },
  { words: [{ text: 'Home', chord: 'G' }, { text: ' is where the ' }, { text: 'heart', chord: 'C' }, { text: ' resides' }],
    beatRange: [40, 48] },
];

const TAB_CONTENT = {
  'chord-grid': {
    title: 'Beat & Chord Grid',
    description: 'Real-time chord progression visualization synchronized with audio playback.',
    features: [
      { text: 'AI-powered chord detection with multiple models (Chord-CNN-LSTM, BTC)', color: 'blue' },
      { text: 'Beat-aligned grid with automatic time signature detection', color: 'blue' },
      { text: 'Roman numeral analysis & key detection via Gemini AI', color: 'blue' },
      { text: 'Interactive click-to-seek playback navigation', color: 'blue' },
    ],
  },
  guitar: {
    title: 'Guitar Chord Diagrams',
    description: 'Interactive guitar fingering charts with accurate voicings from the official chord database.',
    features: [
      { text: 'Verified fingering patterns with multiple chord positions', color: 'green' },
      { text: 'Animated chord progression synced with audio playback', color: 'green' },
      { text: 'Responsive layout adapting to any screen size', color: 'green' },
      { text: 'Proper musical notation with ♯ and ♭ symbols', color: 'green' },
    ],
  },
  lyrics: {
    title: 'Lead Sheet & Lyrics',
    description: 'Synchronized lyrics with chord annotations and AI-powered translation support.',
    features: [
      { text: 'Word-level timing synchronization via Music.ai', color: 'purple' },
      { text: 'Chords positioned precisely above corresponding words', color: 'purple' },
      { text: 'Multi-language translation powered by Gemini AI', color: 'purple' },
      { text: 'AI chat assistant for contextual music theory Q&A', color: 'purple' },
    ],
  },
  'piano-visualizer': {
    title: 'Piano Visualizer & MIDI Export',
    description: 'Interactive piano roll visualization with falling notes synced to chord progressions and multi-instrument support.',
    features: [
      { text: 'Falling notes visualization with real-time chord playback', color: 'orange' },
      { text: 'Full 88-key piano keyboard with active note highlighting', color: 'orange' },
      { text: 'Multi-instrument support: Piano, Guitar, Violin, Flute, Bass', color: 'orange' },
      { text: 'One-click MIDI export of chord progressions', color: 'orange' },
    ],
  },
};

// ============================================================
// Shared helpers
// ============================================================

function useBeatAnimation() {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBeat((p) => (p + 1) % TOTAL_BEATS), BEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return beat;
}

function useProgressionIndex(beat: number): number {
  return useMemo(() => {
    for (let i = UNIQUE_PROGRESSION.length - 1; i >= 0; i--) {
      if (beat >= UNIQUE_PROGRESSION[i].startBeat) return i;
    }
    return 0;
  }, [beat]);
}

// ============================================================
// Shared chord grid — labels only on chord changes
// ============================================================

function ChordGrid({
  isDark, currentBeat, showRomanNumerals, measures,
}: {
  isDark: boolean; currentBeat: number; showRomanNumerals: boolean; measures: string[][];
}) {
  return (
    <div className="flex flex-wrap gap-y-1">
      {measures.map((measure, mIdx) => (
        <div key={mIdx} className="w-1/2 md:w-1/3 lg:w-1/4 px-[2px]">
          <div className={`grid grid-cols-4 gap-[2px] border-l-[3px] pl-1 ${
            isDark ? 'border-gray-500/60' : 'border-gray-400'
          }`}>
            {measure.map((chord, beatIdx) => {
              const globalIdx = mIdx * 4 + beatIdx;
              const isHighlighted = globalIdx === currentBeat;
              const isEmpty = !chord;

              const prevChord = globalIdx > 0
                ? measures[Math.floor((globalIdx - 1) / 4)]?.[(globalIdx - 1) % 4] || ''
                : '';
              const showLabel = !!chord && chord !== prevChord;
              const roman = showLabel ? ROMAN[chord] : undefined;

              return (
                <div
                  key={beatIdx}
                  className={`flex flex-col items-center justify-center rounded-sm border transition-all duration-150 ${
                    showRomanNumerals ? 'aspect-[1/1.25]' : 'aspect-square'
                  } ${
                    isHighlighted
                      ? isDark
                        ? 'bg-blue-800 border-blue-400 text-blue-100'
                        : 'bg-blue-100 border-blue-600 text-blue-900'
                      : isEmpty
                        ? isDark ? 'bg-[#111720]/80 border-gray-600/40' : 'bg-gray-100 border-gray-300'
                        : isDark ? 'bg-[#111720] border-gray-600/50 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {showLabel && (
                    <span className={`font-varela text-[10px] sm:text-xs lg:text-sm leading-none`}>
                      {chord}
                    </span>
                  )}
                  {showRomanNumerals && roman && (
                    <span className={`font-varela font-semibold leading-none mt-0.5 ${
                      isHighlighted ? 'text-blue-200 dark:text-blue-200' : 'text-blue-700 dark:text-blue-300'
                    }`} style={{ fontSize: '8px' }}>
                      {roman}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Mockup: Beat & Chord Grid (with Roman numeral toggle)
// ============================================================

function ChordGridMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const [showRoman, setShowRoman] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Chord Progression
        </h4>
        <div className="flex items-center gap-2">
          <Tooltip content="Toggle Roman Numeral Analysis" placement="top">
            <button
              onClick={() => setShowRoman((v) => !v)}
              className={`rounded-lg px-2 py-0.5 text-xs font-medium border transition-colors cursor-pointer ${
                showRoman
                  ? isDark
                    ? 'bg-purple-800/40 border-purple-400 text-purple-100'
                    : 'bg-purple-50 border-purple-300 text-purple-800'
                  : isDark
                    ? 'bg-gray-700/40 border-gray-500 text-gray-400 hover:border-purple-400 hover:text-purple-300'
                    : 'bg-gray-50 border-gray-300 text-gray-500 hover:border-purple-300 hover:text-purple-700'
              }`}
            >Roman</button>
          </Tooltip>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-blue-800/40 border border-blue-400 text-blue-50' : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>Time: 4/4</span>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-green-800/40 border border-green-400 text-green-50' : 'bg-green-50 border border-green-200 text-green-800'
          }`}>Key: C Major</span>
        </div>
      </div>
      <ChordGrid isDark={isDark} currentBeat={currentBeat} showRomanNumerals={showRoman} measures={MEASURES} />
    </motion.div>
  );
}

// ============================================================
// Mockup: Guitar Chord Diagrams (animated sliding window)
// ============================================================

function MiniChordDiagram({ frets, name, isActive, isDark }: {
  frets: number[]; name: string; isActive: boolean; isDark: boolean;
}) {
  const w = 52, h = 64;
  const pad = { top: 13, side: 7, bottom: 2 };
  const stringSp = (w - pad.side * 2) / 5;
  const fretSp = (h - pad.top - pad.bottom) / 4;
  const stroke = isDark ? '#e5e7eb' : '#6b7280';
  const dot = isActive ? '#3b82f6' : isDark ? '#d1d5db' : '#374151';

  return (
    <div className="flex flex-col items-center">
      <div className={`rounded-lg p-1 transition-colors duration-300 ${
        isActive
          ? isDark ? 'bg-blue-900/40 border border-blue-500/50' : 'bg-blue-50 border border-blue-200'
          : 'border border-transparent'
      }`}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <line x1={pad.side} y1={pad.top} x2={w - pad.side} y2={pad.top} stroke={stroke} strokeWidth="2.5" />
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`s${i}`} x1={pad.side + stringSp * i} y1={pad.top} x2={pad.side + stringSp * i} y2={h - pad.bottom} stroke={stroke} strokeWidth="0.8" opacity="0.5" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={`f${i}`} x1={pad.side} y1={pad.top + fretSp * (i + 1)} x2={w - pad.side} y2={pad.top + fretSp * (i + 1)} stroke={stroke} strokeWidth="0.6" opacity="0.4" />
          ))}
          {frets.map((fret, i) => {
            const x = pad.side + stringSp * i;
            if (fret === -1) return <text key={`d${i}`} x={x} y={pad.top - 3} textAnchor="middle" fontSize="6" fill={stroke}>×</text>;
            if (fret === 0) return <circle key={`d${i}`} cx={x} cy={pad.top - 5} r="2" fill="none" stroke={stroke} strokeWidth="1" />;
            return <circle key={`d${i}`} cx={x} cy={pad.top + fretSp * (fret - 0.5)} r="3" fill={dot} />;
          })}
        </svg>
      </div>
      <span className={`font-varela text-[10px] sm:text-xs mt-0.5 transition-colors duration-300 ${
        isActive ? 'text-blue-500 dark:text-blue-400 font-semibold' : isDark ? 'text-gray-500' : 'text-gray-400'
      }`}>{name}</span>
    </div>
  );
}

function GuitarMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const progIdx = useProgressionIndex(currentBeat);

  const VISIBLE_COUNT = 5;
  const CENTER_OFFSET = 2;
  const visibleWindow = useMemo(() => {
    let start = Math.max(0, progIdx - CENTER_OFFSET);
    const end = Math.min(UNIQUE_PROGRESSION.length, start + VISIBLE_COUNT);
    if (end - start < VISIBLE_COUNT) start = Math.max(0, end - VISIBLE_COUNT);
    return UNIQUE_PROGRESSION.slice(start, end);
  }, [progIdx]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg space-y-3 ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <div>
        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Chord Progression
        </h4>
        <ChordGrid isDark={isDark} currentBeat={currentBeat} showRomanNumerals={false} measures={MEASURES} />
      </div>

      <div className={`border-t ${isDark ? 'border-gray-600/40' : 'border-gray-200'}`} />

      <div>
        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Guitar Chord Diagrams
        </h4>
        <div className="flex justify-center items-end gap-1 sm:gap-2 md:gap-3 min-h-[90px]">
          <AnimatePresence mode="popLayout">
            {visibleWindow.map((entry) => {
              const isCurrent = entry === UNIQUE_PROGRESSION[progIdx];
              return (
                <motion.div
                  key={`${entry.chord}-${entry.startBeat}`}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: isCurrent ? 1.12 : 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{ opacity: isCurrent ? 1 : 0.5 }}
                >
                  <MiniChordDiagram
                    name={entry.chord}
                    frets={CHORD_SHAPES[entry.chord] || [0, 0, 0, 0, 0, 0]}
                    isActive={isCurrent}
                    isDark={isDark}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Mockup: Lyrics & Chord Sync
// ============================================================

function LyricsMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const activeIdx = LYRIC_LINES.findIndex(
    (l) => currentBeat >= l.beatRange[0] && currentBeat < l.beatRange[1]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      <h4 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
        Lead Sheet
      </h4>
      <div className="space-y-0.5">
        {LYRIC_LINES.map((line, idx) => {
          const isActive = idx === activeIdx;
          const isPast = idx < activeIdx;
          const lineProgress = isActive
            ? Math.min(1, (currentBeat - line.beatRange[0]) / (line.beatRange[1] - line.beatRange[0]))
            : 0;
          const totalChars = line.words.reduce((s, w) => s + w.text.length, 0);
          const colorPos = isActive ? Math.floor(lineProgress * totalChars) : 0;

          return (
            <div key={idx}>
              {line.section && (
                <div className="mb-1.5 mt-2 first:mt-0">
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide ${
                    isDark ? 'bg-[#111720] border border-gray-600 text-gray-400' : 'bg-gray-100 border border-gray-300 text-gray-500'
                  }`}>{line.section}</span>
                </div>
              )}
              <motion.div
                animate={{
                  backgroundColor: isActive
                    ? isDark ? 'rgba(30, 64, 175, 0.15)' : 'rgba(219, 234, 254, 0.7)'
                    : 'transparent',
                  borderLeftColor: isActive
                    ? isDark ? '#3b82f6' : '#60a5fa'
                    : 'transparent',
                  scale: isActive ? 1.01 : 1,
                }}
                transition={{ duration: 0.3 }}
                className="px-2 sm:px-3 py-1.5 rounded-md border-l-3 border-transparent"
              >
                <div className="flex flex-wrap">
                  {(() => {
                    let off = 0;
                    return line.words.map((word, wi) => {
                      const start = off;
                      off += word.text.length;
                      return (
                        <div key={wi} className="relative inline-flex flex-col justify-end" style={{ whiteSpace: 'pre-wrap' }}>
                          {word.chord && (
                            <div className="relative mb-0.5">
                              <span className={`font-varela text-[10px] sm:text-xs font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                {word.chord}
                              </span>
                              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: isDark ? '#475569' : '#94a3b8' }} />
                            </div>
                          )}
                          <span className={`text-xs sm:text-sm ${word.chord ? 'font-medium' : ''}`}>
                            {isActive ? (
                              word.text.split('').map((ch, ci) => {
                                const played = (start + ci) < colorPos;
                                return (
                                  <span key={ci} style={{
                                    color: played ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#d1d5db' : '#374151'),
                                    transition: 'color 80ms',
                                  }}>{ch}</span>
                                );
                              })
                            ) : (
                              <span style={{
                                color: isPast ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#6b7280' : '#9ca3af'),
                                transition: 'color 0.4s',
                              }}>{word.text}</span>
                            )}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================================
// Mockup: Piano Visualizer (falling notes + keyboard)
// ============================================================

// MIDI note data for the visualizer mockup
const PIANO_MOCK_NOTES: { chord: string; notes: number[]; startBeat: number; duration: number }[] = [
  { chord: 'C', notes: [60, 64, 67], startBeat: 0, duration: 4 },
  { chord: 'Am', notes: [57, 60, 64], startBeat: 4, duration: 4 },
  { chord: 'F', notes: [53, 57, 60], startBeat: 8, duration: 4 },
  { chord: 'G', notes: [55, 59, 62], startBeat: 12, duration: 4 },
  { chord: 'C', notes: [60, 64, 67], startBeat: 16, duration: 4 },
  { chord: 'Em', notes: [52, 55, 59], startBeat: 20, duration: 2 },
  { chord: 'Am', notes: [57, 60, 64], startBeat: 22, duration: 2 },
  { chord: 'F', notes: [53, 57, 60], startBeat: 24, duration: 4 },
  { chord: 'G', notes: [55, 59, 62], startBeat: 28, duration: 4 },
  { chord: 'Dm', notes: [50, 53, 57], startBeat: 32, duration: 4 },
  { chord: 'G', notes: [55, 59, 62], startBeat: 36, duration: 2 },
  { chord: 'G7', notes: [55, 59, 62, 65], startBeat: 38, duration: 2 },
  { chord: 'Am', notes: [57, 60, 64], startBeat: 40, duration: 2 },
  { chord: 'F', notes: [53, 57, 60], startBeat: 42, duration: 2 },
  { chord: 'G', notes: [55, 59, 62], startBeat: 44, duration: 2 },
  { chord: 'C', notes: [60, 64, 67], startBeat: 46, duration: 2 },
];

// White keys in range C3 (48) to C5 (72) — 15 white keys
const VISUALIZER_RANGE_START = 48;
const VISUALIZER_RANGE_END = 72;
const VISUALIZER_WHITE_KEYS: number[] = (() => {
  const whites: number[] = [];
  for (let midi = VISUALIZER_RANGE_START; midi <= VISUALIZER_RANGE_END; midi++) {
    const pc = midi % 12;
    if ([0, 2, 4, 5, 7, 9, 11].includes(pc)) whites.push(midi);
  }
  return whites;
})();

function isBlackKey(midi: number) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function getMockKeyX(midi: number, keyWidth: number): number {
  // Position based on white key index
  let whiteIdx = 0;
  for (let m = VISUALIZER_RANGE_START; m < midi; m++) {
    if (!isBlackKey(m)) whiteIdx++;
  }
  if (isBlackKey(midi)) {
    return whiteIdx * keyWidth - keyWidth * 0.3;
  }
  return whiteIdx * keyWidth;
}

const INSTRUMENT_PALETTE = [
  { name: 'Piano', color: '#60a5fa' },
  { name: 'Guitar', color: '#34d399' },
  { name: 'Bass', color: '#f87171' },
];

function PianoVisualizerMockup({ isDark, currentBeat }: { isDark: boolean; currentBeat: number }) {
  const canvasW = 320;
  const canvasH = 160;
  const keyWidth = canvasW / VISUALIZER_WHITE_KEYS.length;
  const keyboardH = 36;
  const lookAhead = 16; // beats visible above
  const lookBehind = 4;
  const beatPx = canvasH / lookAhead;

  // Active notes at current beat
  const activeNotes = useMemo(() => {
    const notes = new Set<number>();
    for (const n of PIANO_MOCK_NOTES) {
      if (currentBeat >= n.startBeat && currentBeat < n.startBeat + n.duration) {
        n.notes.forEach(m => notes.add(m));
      }
    }
    return notes;
  }, [currentBeat]);

  // Current chord for strip display
  const currentChord = useMemo(() => {
    for (let i = PIANO_MOCK_NOTES.length - 1; i >= 0; i--) {
      if (currentBeat >= PIANO_MOCK_NOTES[i].startBeat) return PIANO_MOCK_NOTES[i].chord;
    }
    return 'C';
  }, [currentBeat]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl p-3 sm:p-4 border shadow-lg ${
        isDark ? 'bg-[#1E252E] border-gray-600/60' : 'bg-white border-gray-200'
      }`}
    >
      {/* Header with instrument legend */}
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Piano Visualizer
        </h4>
        <div className="flex items-center gap-2">
          {INSTRUMENT_PALETTE.map((inst) => (
            <div key={inst.name} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: inst.color }} />
              <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{inst.name}</span>
            </div>
          ))}
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-orange-800/40 border border-orange-400 text-orange-50' : 'bg-orange-50 border border-orange-200 text-orange-800'
          }`}>MIDI</span>
        </div>
      </div>

      {/* Current chord indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Playing:</span>
        <span className={`font-varela text-sm font-semibold ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>{currentChord}</span>
      </div>

      {/* Falling notes + keyboard container */}
      <div className="rounded-lg overflow-hidden" style={{ background: isDark ? '#0a0f1a' : '#111827' }}>
        {/* Falling notes area */}
        <svg width="100%" viewBox={`0 0 ${canvasW} ${canvasH}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isDark ? '#0a0f1a' : '#111827'} stopOpacity="1" />
              <stop offset="20%" stopColor={isDark ? '#0a0f1a' : '#111827'} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines for white keys */}
          {VISUALIZER_WHITE_KEYS.map((midi, i) => (
            <line
              key={`grid-${midi}`}
              x1={i * keyWidth} y1={0}
              x2={i * keyWidth} y2={canvasH}
              stroke={isDark ? '#1e293b' : '#1e293b'}
              strokeWidth="0.5"
            />
          ))}

          {/* Falling note rectangles */}
          {PIANO_MOCK_NOTES.map((noteGroup, gi) => {
            const noteStartY = canvasH - (noteGroup.startBeat - currentBeat + lookBehind) * beatPx;
            const noteH = noteGroup.duration * beatPx;
            const colorIdx = gi % INSTRUMENT_PALETTE.length;
            const color = INSTRUMENT_PALETTE[colorIdx].color;

            return noteGroup.notes
              .filter(m => m >= VISUALIZER_RANGE_START && m <= VISUALIZER_RANGE_END)
              .map((midi, ni) => {
                const x = getMockKeyX(midi, keyWidth);
                const w = isBlackKey(midi) ? keyWidth * 0.6 : keyWidth - 1;
                const y = noteStartY - noteH;

                // Skip notes completely out of view
                if (y > canvasH || y + noteH < 0) return null;

                const isCurrentlyPlaying = currentBeat >= noteGroup.startBeat && currentBeat < noteGroup.startBeat + noteGroup.duration;

                return (
                  <rect
                    key={`${gi}-${ni}`}
                    x={x + 0.5}
                    y={Math.max(0, y)}
                    width={w}
                    height={Math.min(noteH, canvasH - Math.max(0, y))}
                    rx={2}
                    fill={color}
                    opacity={isCurrentlyPlaying ? 0.9 : 0.5}
                    className="transition-opacity duration-150"
                  />
                );
              });
          })}

          {/* Top fade overlay */}
          <rect x="0" y="0" width={canvasW} height={canvasH * 0.2} fill="url(#fadeTop)" />

          {/* Sweep line at bottom */}
          <line x1="0" y1={canvasH - lookBehind * beatPx} x2={canvasW} y2={canvasH - lookBehind * beatPx}
            stroke="#60a5fa" strokeWidth="1.5" opacity="0.6" />
        </svg>

        {/* Mini piano keyboard */}
        <div className="relative" style={{ height: keyboardH }}>
          {/* White keys */}
          <div className="flex h-full">
            {VISUALIZER_WHITE_KEYS.map((midi) => {
              const isActive = activeNotes.has(midi);
              return (
                <div
                  key={midi}
                  className="border-r transition-colors duration-75"
                  style={{
                    flex: 1,
                    height: '100%',
                    backgroundColor: isActive ? '#60a5fa' : (isDark ? '#d4d4d8' : '#f4f4f5'),
                    borderColor: isDark ? '#52525b' : '#a1a1aa',
                    borderBottomLeftRadius: 3,
                    borderBottomRightRadius: 3,
                  }}
                />
              );
            })}
          </div>
          {/* Black keys */}
          {(() => {
            let whiteIdx = 0;
            const blacks: React.ReactNode[] = [];
            const pct = (v: number) => `${(v / VISUALIZER_WHITE_KEYS.length) * 100}%`;
            for (let midi = VISUALIZER_RANGE_START; midi <= VISUALIZER_RANGE_END; midi++) {
              if (isBlackKey(midi)) {
                const isActive = activeNotes.has(midi);
                blacks.push(
                  <div
                    key={midi}
                    className="absolute top-0 transition-colors duration-75"
                    style={{
                      left: pct(whiteIdx - 0.3),
                      width: pct(0.6),
                      height: '60%',
                      backgroundColor: isActive ? '#3b82f6' : (isDark ? '#27272a' : '#18181b'),
                      borderBottomLeftRadius: 2,
                      borderBottomRightRadius: 2,
                    }}
                  />
                );
              } else {
                whiteIdx++;
              }
            }
            return blacks;
          })()}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Feature Content Panel
// ============================================================

const COLOR_MAP: Record<string, string> = { blue: 'text-blue-500', green: 'text-green-500', purple: 'text-purple-500', orange: 'text-orange-500' };

function FeatureContent({ title, description, features }: {
  title: string; description: string; features: { text: string; color: string }[];
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
      className="flex flex-col justify-center h-full space-y-4"
    >
      <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
      <ul className="space-y-3 mt-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-gray-600 dark:text-gray-400">
            <span className={`${COLOR_MAP[f.color] || 'text-blue-500'} mt-1.5 text-xs flex-shrink-0`}>●</span>
            <span className="text-sm leading-relaxed">{f.text}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ============================================================
// Main Export
// ============================================================

export default function FeaturesTabSection() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<string>('chord-grid');
  const beat = useBeatAnimation();

  return (
    <section id="features" className="relative py-20 bg-gray-50 dark:bg-slate-900 transition-colors duration-300 overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        {isDark ? (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%)' }} />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255, 235, 59, 0.2) 0%, transparent 60%)' }} />
        )}
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">Features</h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Powerful music analysis tools for chord recognition, beat detection, and lyrics synchronization
          </p>
        </motion.div>

        <Tabs
          aria-label="Feature tabs"
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as string)}
          variant="underlined"
          color="primary"
          classNames={{ tabList: 'gap-4 sm:gap-6 w-full justify-center mb-8', tab: 'text-sm sm:text-base py-2', panel: 'pt-0' }}
        >
          <Tab key="chord-grid" title="Beat & Chord Grid">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-3"><ChordGridMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['chord-grid']} /></div>
            </div>
          </Tab>
          <Tab key="guitar" title="Guitar Tab">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-3"><GuitarMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT.guitar} /></div>
            </div>
          </Tab>
          <Tab key="lyrics" title="Lyrics Sync">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-3"><LyricsMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT.lyrics} /></div>
            </div>
          </Tab>
          <Tab key="piano-visualizer" title="Piano Visualizer">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-3"><PianoVisualizerMockup isDark={isDark} currentBeat={beat} /></div>
              <div className="lg:col-span-2"><FeatureContent {...TAB_CONTENT['piano-visualizer']} /></div>
            </div>
          </Tab>
        </Tabs>
      </div>
    </section>
  );
}
