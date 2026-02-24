'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tooltip } from '@heroui/react';
import { useTheme } from '@/contexts/ThemeContext';
import { Varela_Round } from 'next/font/google';

const varelaRound = Varela_Round({ weight: '400', subsets: ['latin'], display: 'swap' });

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

const ROMAN_C: Record<string, string> = {
  C: 'I', Am: 'vi', F: 'IV', G: 'V', Em: 'iii', Dm: 'ii', G7: 'V⁷',
};
const ROMAN_D: Record<string, string> = {
  D: 'I', Bm: 'vi', G: 'IV', A: 'V', 'F#m': 'iii',
};

interface HeroChordGridMockProps {
  className?: string;
}

export default function HeroChordGridMock({ className = '' }: HeroChordGridMockProps) {
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

  const flatChords = useMemo(() => MEASURES.flat(), []);

  return (
    <div
      className={`rounded-xl p-3 sm:p-4 border shadow-lg select-none backdrop-blur-sm ${
        isDark ? 'bg-[#1E252E]/70 border-gray-600/40' : 'bg-white/70 border-gray-200/80'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Chord Progression
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
            >
              Roman
            </button>
          </Tooltip>
          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
            isDark ? 'bg-blue-800/40 border border-blue-400 text-blue-50' : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>4/4</span>
        </div>
      </div>

      {/* Single unified grid */}
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

                  const prevChord = globalIdx > 0 ? flatChords[globalIdx - 1] || '' : '';
                  const showLabel = !!chord && chord !== prevChord;

                  const roman = showLabel
                    ? (inKeyChange ? ROMAN_D[chord] : ROMAN_C[chord])
                    : undefined;

                  // Only the first chord of the new key (D) and its repeat get the green tint
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
                        <span className={`${varelaRound.className} text-[10px] sm:text-xs leading-none`}>
                          {chord}
                        </span>
                      )}
                      {showRoman && roman && (
                        <span className={`${varelaRound.className} font-semibold leading-none mt-0.5 ${
                          isHighlighted ? 'text-blue-200' : isModulationCell ? 'text-green-600 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'
                        }`} style={{ fontSize: '8px' }}>
                          {roman}
                        </span>
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

      {/* Always rendered to prevent layout shift — fades out on hover */}
      <p className={`text-center text-[10px] mt-2 transition-opacity duration-200 ${
        isHovered ? 'opacity-0' : 'opacity-100'
      } ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        Hover to preview playback
      </p>
    </div>
  );
}
