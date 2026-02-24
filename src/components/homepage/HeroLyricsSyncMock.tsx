'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface MockLyricLine {
  time: number;
  text: string;
}

const LYRICS: MockLyricLine[] = [
  { time: 0, text: '' },
  { time: 0.5, text: 'Sunlight on the water' },
  { time: 1.5, text: 'Morning breeze so gentle and light' },
  { time: 2.5, text: 'Colors paint the sky above' },
  { time: 3.5, text: 'As darkness slowly flees' },
  { time: 4.5, text: '' },
  { time: 5.0, text: 'Oh, we dance beneath the stars' },
  { time: 6.0, text: 'Melodies carry us far' },
  { time: 7.0, text: 'Hold on tight through the night' },
  { time: 8.0, text: 'Home is where the heart resides' },
  { time: 9.0, text: '' },
  { time: 9.5, text: 'Echoes of a gentle song' },
  { time: 10.5, text: 'Guide us where we belong' },
];

const TOTAL_DURATION = 12;
const TICK_MS = 100;

interface HeroLyricsSyncMockProps {
  className?: string;
}

export default function HeroLyricsSyncMock({ className = '' }: HeroLyricsSyncMockProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isHovered, setIsHovered] = useState(false);
  const [time, setTime] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHovered) return;
    const id = setInterval(() => {
      setTime(p => {
        const next = p + TICK_MS / 1000;
        return next >= TOTAL_DURATION ? 0 : next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isHovered]);

  const activeIdx = useMemo(() => {
    for (let i = LYRICS.length - 1; i >= 0; i--) {
      if (time >= LYRICS[i].time) return i;
    }
    return 0;
  }, [time]);

  useEffect(() => {
    if (!isHovered || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-mock-line="${activeIdx}"]`) as HTMLElement | null;
    if (el) {
      const cRect = containerRef.current.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const delta = (eRect.top - cRect.top) - (containerRef.current.clientHeight / 2 - el.clientHeight / 2);
      containerRef.current.scrollBy({ top: delta, behavior: 'smooth' });
    }
  }, [activeIdx, isHovered]);

  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  };

  return (
    <div
      className={`rounded-xl border shadow-lg overflow-hidden select-none flex flex-col backdrop-blur-sm ${
        isDark ? 'bg-[#1E252E]/70 border-gray-600/40' : 'bg-white/70 border-gray-200/80'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Song title — sticky with blur */}
      <div className="relative z-10">
        <div className={`backdrop-blur-md px-4 pt-3 pb-1.5 ${
          isDark ? 'bg-[#1E252E]/60' : 'bg-white/60'
        }`}>
          <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Starlight Waltz
          </h4>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>by Luna Echo</p>
        </div>
        <div className={`h-3 bg-gradient-to-b ${
          isDark ? 'from-[#1E252E]/70' : 'from-white/70'
        } to-transparent pointer-events-none`} />
      </div>

      {/* Lyrics */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-3"
        style={{ maxHeight: '220px' }}
      >
        {LYRICS.map((line, idx) => {
          const isCurrent = idx === activeIdx;
          const isPast = idx < activeIdx;
          const isEmpty = !line.text;

          if (isEmpty) return <div key={idx} className="h-4" />;

          return (
            <div
              key={idx}
              data-mock-line={idx}
              className={`flex items-start gap-3 py-1.5 px-2 rounded-lg transition-all duration-300 ${
                isCurrent ? isDark ? 'bg-green-900/20' : 'bg-green-50' : ''
              }`}
            >
              <span className={`text-[10px] tabular-nums mt-0.5 min-w-[2.5rem] shrink-0 ${
                isCurrent
                  ? isDark ? 'text-green-400 font-semibold' : 'text-green-600 font-semibold'
                  : isDark ? 'text-gray-600' : 'text-gray-400'
              }`}>
                {fmtTime(line.time)}
              </span>
              <span className={`text-sm leading-relaxed transition-colors duration-300 ${
                isCurrent
                  ? isDark ? 'text-white font-semibold' : 'text-gray-900 font-semibold'
                  : isPast
                    ? isDark ? 'text-gray-500' : 'text-gray-400'
                    : isDark ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {line.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* Always rendered to prevent layout shift — fades out on hover */}
      <p className={`text-center text-[10px] pb-2 transition-opacity duration-200 ${
        isHovered ? 'opacity-0' : 'opacity-100'
      } ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        Hover to preview sync
      </p>
    </div>
  );
}
