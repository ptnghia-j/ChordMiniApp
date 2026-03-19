'use client';

import { useState, useEffect, useMemo } from 'react';
import { Tooltip } from '@heroui/react';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Chord Grid Data (8 measures, 2 rows, key change C→D) ──────────────────

const MEASURES: string[][] = [
  ['C', 'C', 'Am', 'Am'],
  ['F', 'F', 'G', 'G'],
  ['C', 'C', 'Em', 'Em'],
  ['Dm', 'Dm', 'G7', 'G7'],
  ['D', 'D', 'Bm', 'Bm'],
  ['G', 'G', 'A', 'A'],
  ['D', 'D', 'F#m', 'F#m'],
  ['G', 'G', 'A', 'A'],
];

const TOTAL_BEATS = MEASURES.reduce((s, m) => s + m.length, 0);
const KEY_CHANGE_START = 4 * 4;
const BEAT_INTERVAL_MS = 600;
const FLAT_CHORDS = MEASURES.flat();

const ROMAN_C: Record<string, string> = {
  C: 'I', Am: 'vi', F: 'IV', G: 'V', Em: 'iii', Dm: 'ii', G7: 'V⁷',
};
const ROMAN_D: Record<string, string> = {
  D: 'I', Bm: 'vi', G: 'IV', A: 'V', 'F#m': 'iii',
};

// ─── Lyrics Data (3 lines, LRC-style with timestamps) ──────────────────────

interface MockLyricLine { time: number; text: string }

const LYRICS: MockLyricLine[] = [
  { time: 0.5, text: 'Sunlight on the water' },
  { time: 4.5, text: 'Morning breeze so gentle and light' },
  { time: 9.0, text: 'Colors paint the sky above' },
];

// Each lyric roughly spans ~4 seconds; total ≈ 13s matches 32 beats @ 600ms
// const LYRIC_TOTAL_TIME = (TOTAL_BEATS * BEAT_INTERVAL_MS) / 1000;

// ─── Component ───────────────────────────────────────────────────────────────

interface Props { className?: string }

export default function HeroChordGridLyricsMock({ className = '' }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isHovered, setIsHovered] = useState(false);
  const [beat, setBeat] = useState(0);
  const [showRoman, setShowRoman] = useState(true);

  useEffect(() => {
    if (!isHovered) return;
    const id = setInterval(() => setBeat(p => (p + 1) % TOTAL_BEATS), BEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isHovered]);

  // Current simulated time in seconds
  const simTime = (beat * BEAT_INTERVAL_MS) / 1000;

  // Active lyric index
  const activeIdx = useMemo(() => {
    for (let i = LYRICS.length - 1; i >= 0; i--) {
      if (simTime >= LYRICS[i].time) return i;
    }
    return -1;
  }, [simTime]);

  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  };

  return (
    <div
      className={`rounded-xl p-3 sm:p-4 border shadow-lg select-none backdrop-blur-sm ${
        isDark ? 'bg-[#1E252E]/70 border-gray-600/40' : 'bg-white/70 border-gray-200/80'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
        <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Chord Progression &amp; Lyrics
        </h4>
        <div className="flex items-center gap-2">
          <Tooltip content="Toggle Roman Numeral Analysis" placement="top">
            <button
              onClick={() => setShowRoman(v => !v)}
              className={`rounded-lg px-2 py-0.5 text-xs font-medium border transition-colors cursor-pointer ${
                showRoman
                  ? isDark ? 'bg-purple-800/40 border-purple-400 text-purple-100' : 'bg-purple-50 border-purple-300 text-purple-800'
                  : isDark ? 'bg-gray-700/40 border-gray-500 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-500'
              }`}
            >Roman</button>
          </Tooltip>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-blue-800/40 border border-blue-400 text-blue-50' : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>4/4</span>
        </div>
      </div>

      {/* Chord Grid — 8 measures, 2 rows */}
      <div className="flex flex-wrap gap-y-1">
        {MEASURES.map((measure, mIdx) => {
          const measureStartBeat = mIdx * 4;
          return (
            <div key={mIdx} className="w-1/2 md:w-1/4 px-[2px]">
              <div className={`grid grid-cols-4 gap-[2px] border-l-[3px] pl-1 ${
                isDark ? 'border-gray-500/60' : 'border-gray-400'
              }`}>
                {measure.map((chord, bIdx) => {
                  const globalIdx = measureStartBeat + bIdx;
                  const isHighlighted = globalIdx === beat;
                  const isEmpty = !chord;
                  const inKeyChange = globalIdx >= KEY_CHANGE_START;
                  const prevChord = globalIdx > 0 ? FLAT_CHORDS[globalIdx - 1] || '' : '';
                  const showLabel = !!chord && chord !== prevChord;
                  const roman = showLabel
                    ? (inKeyChange ? ROMAN_D[chord] : ROMAN_C[chord])
                    : undefined;
                  const isModulationCell = !isHighlighted && !isEmpty
                    && (globalIdx === KEY_CHANGE_START || globalIdx === KEY_CHANGE_START + 1);
                  const modulationStyle = isModulationCell
                    ? {
                        backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
                        border: isDark ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(34, 197, 94, 0.25)',
                      }
                    : undefined;

                  const cell = (
                    <div
                      key={bIdx}
                      className={`flex flex-col items-center justify-center rounded-sm transition-all duration-150 ${
                        showRoman ? 'aspect-[1/1.25]' : 'aspect-square'
                      } ${
                        isHighlighted
                          ? isDark ? 'bg-blue-800 border border-blue-400 text-blue-100' : 'bg-blue-100 border border-blue-600 text-blue-900'
                          : isEmpty
                            ? isDark ? 'bg-[#111720]/80 border border-gray-600/40' : 'bg-gray-100 border border-gray-300'
                            : modulationStyle
                              ? isDark ? 'text-gray-200' : 'text-gray-900'
                              : isDark ? 'bg-[#111720] border border-gray-600/50 text-gray-200' : 'bg-white border border-gray-300 text-gray-900'
                      }`}
                      style={modulationStyle}
                    >
                      {showLabel && (
                        <span className="font-varela text-[10px] sm:text-xs leading-none">{chord}</span>
                      )}
                      {showRoman && roman && (
                        <span className={`font-varela font-semibold leading-none mt-0.5 ${
                          isHighlighted ? 'text-blue-200' : isModulationCell ? 'text-green-600 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'
                        }`} style={{ fontSize: '8px' }}>{roman}</span>
                      )}
                    </div>
                  );

                  if (isModulationCell) {
                    return (
                      <Tooltip key={bIdx} content="Key change: C Major → D Major" placement="top" size="sm">
                        {cell}
                      </Tooltip>
                    );
                  }
                  return cell;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact Lyrics — 3 lines, LRC-style timestamps */}
      <div className={`mt-2 pt-2 border-t ${isDark ? 'border-gray-600/40' : 'border-gray-200'}`}>
        <div className="space-y-0.5">
          {LYRICS.map((line, idx) => {
            const isCurrent = isHovered && idx === activeIdx;
            const isPast = isHovered && idx < activeIdx;
            return (
              <div
                key={idx}
                className={`flex items-center gap-2.5 px-2 py-1 rounded-md transition-all duration-300 ${
                  isCurrent ? (isDark ? 'bg-green-900/20' : 'bg-green-50') : ''
                }`}
              >
                <span className={`text-[10px] tabular-nums min-w-[2.2rem] shrink-0 ${
                  isCurrent
                    ? isDark ? 'text-green-400 font-semibold' : 'text-green-600 font-semibold'
                    : isDark ? 'text-gray-600' : 'text-gray-400'
                }`}>{fmtTime(line.time)}</span>
                <span className={`text-xs leading-snug transition-colors duration-300 ${
                  isCurrent
                    ? isDark ? 'text-white font-semibold' : 'text-gray-900 font-semibold'
                    : isPast
                      ? isDark ? 'text-gray-500' : 'text-gray-400'
                      : isDark ? 'text-gray-400' : 'text-gray-600'
                }`}>{line.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover hint */}
      <p className={`text-center text-[10px] mt-1.5 transition-opacity duration-200 ${
        isHovered ? 'opacity-0' : 'opacity-100'
      } ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        Hover to preview playback
      </p>
    </div>
  );
}
