'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_NOTES: { chord: string; notes: number[]; startBeat: number; duration: number }[] = [
  { chord: 'C', notes: [60, 64, 67], startBeat: 0, duration: 4 },
  { chord: 'Am', notes: [57, 60, 64], startBeat: 4, duration: 4 },
  { chord: 'F', notes: [53, 57, 60], startBeat: 8, duration: 4 },
  { chord: 'G', notes: [55, 59, 62], startBeat: 12, duration: 4 },
  { chord: 'C', notes: [60, 64, 67], startBeat: 16, duration: 4 },
  { chord: 'Em', notes: [52, 55, 59], startBeat: 20, duration: 2 },
  { chord: 'Am', notes: [57, 60, 64], startBeat: 22, duration: 2 },
  { chord: 'F', notes: [53, 57, 60], startBeat: 24, duration: 4 },
  { chord: 'G', notes: [55, 59, 62], startBeat: 28, duration: 4 },
  { chord: 'C', notes: [60, 64, 67], startBeat: 32, duration: 4 },
];

const TOTAL_BEATS = 36;
const BEAT_INTERVAL_MS = 600;

const RANGE_START = 48; // C3
const RANGE_END = 72;   // C5

const WHITE_KEYS: number[] = (() => {
  const whites: number[] = [];
  for (let m = RANGE_START; m <= RANGE_END; m++) {
    if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) whites.push(m);
  }
  return whites;
})();

function isBlack(midi: number) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function getKeyX(midi: number, kw: number): number {
  let wi = 0;
  for (let m = RANGE_START; m < midi; m++) {
    if (!isBlack(m)) wi++;
  }
  return isBlack(midi) ? wi * kw - kw * 0.3 : wi * kw;
}

const COLORS = ['#60a5fa', '#34d399', '#f87171'];

// ─── Component ───────────────────────────────────────────────────────────────

interface HeroPianoVisualizerMockProps {
  className?: string;
}

export default function HeroPianoVisualizerMock({ className = '' }: HeroPianoVisualizerMockProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isHovered, setIsHovered] = useState(false);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (!isHovered) return;
    const id = setInterval(() => setBeat(p => (p + 1) % TOTAL_BEATS), BEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isHovered]);

  const activeNotes = useMemo(() => {
    const s = new Set<number>();
    for (const n of MOCK_NOTES) {
      if (beat >= n.startBeat && beat < n.startBeat + n.duration) {
        n.notes.forEach(m => s.add(m));
      }
    }
    return s;
  }, [beat]);

  const currentChord = useMemo(() => {
    for (let i = MOCK_NOTES.length - 1; i >= 0; i--) {
      if (beat >= MOCK_NOTES[i].startBeat) return MOCK_NOTES[i].chord;
    }
    return 'C';
  }, [beat]);

  const canvasW = 320;
  const canvasH = 140;
  const keyWidth = canvasW / WHITE_KEYS.length;
  const keyboardH = 32;
  const lookAhead = 14;
  const lookBehind = 3;
  const beatPx = canvasH / lookAhead;

  return (
    <div
      className={`rounded-xl border shadow-lg overflow-hidden select-none flex flex-col backdrop-blur-sm ${
        isDark ? 'bg-[#1E252E]/70 border-gray-600/40' : 'bg-white/70 border-gray-200/80'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex justify-between items-center">
          <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Piano Visualizer
          </h4>
          <div className="flex items-center gap-1.5">
            <span className={`font-varela text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
              {currentChord}
            </span>
            <span className={`rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${
              isDark ? 'bg-orange-800/40 border border-orange-400 text-orange-50' : 'bg-orange-50 border border-orange-200 text-orange-800'
            }`}>MIDI</span>
          </div>
        </div>
      </div>

      {/* Canvas + keyboard */}
      <div style={{ background: isDark ? '#0a0f1a' : '#111827' }}>
        <svg width="100%" viewBox={`0 0 ${canvasW} ${canvasH}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="heroFadeTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isDark ? '#0a0f1a' : '#111827'} stopOpacity="1" />
              <stop offset="20%" stopColor={isDark ? '#0a0f1a' : '#111827'} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {WHITE_KEYS.map((_, i) => (
            <line key={i} x1={i * keyWidth} y1={0} x2={i * keyWidth} y2={canvasH}
              stroke="#1e293b" strokeWidth="0.5" />
          ))}

          {/* Notes */}
          {MOCK_NOTES.map((ng, gi) => {
            const startY = canvasH - (ng.startBeat - beat + lookBehind) * beatPx;
            const h = ng.duration * beatPx;
            const color = COLORS[gi % COLORS.length];

            return ng.notes
              .filter(m => m >= RANGE_START && m <= RANGE_END)
              .map((midi, ni) => {
                const x = getKeyX(midi, keyWidth);
                const w = isBlack(midi) ? keyWidth * 0.6 : keyWidth - 1;
                const y = startY - h;
                if (y > canvasH || y + h < 0) return null;
                const playing = beat >= ng.startBeat && beat < ng.startBeat + ng.duration;
                return (
                  <rect key={`${gi}-${ni}`} x={x + 0.5} y={Math.max(0, y)}
                    width={w} height={Math.min(h, canvasH - Math.max(0, y))}
                    rx={2} fill={color} opacity={playing ? 0.9 : 0.45}
                    className="transition-opacity duration-150" />
                );
              });
          })}

          <rect x="0" y="0" width={canvasW} height={canvasH * 0.2} fill="url(#heroFadeTop)" />
          <line x1="0" y1={canvasH - lookBehind * beatPx} x2={canvasW}
            y2={canvasH - lookBehind * beatPx} stroke="#60a5fa" strokeWidth="1.5" opacity="0.6" />
        </svg>

        {/* Mini keyboard */}
        <div className="relative" style={{ height: keyboardH }}>
          <div className="flex h-full">
            {WHITE_KEYS.map((midi) => (
              <div
                key={midi}
                className="border-r transition-colors duration-75"
                style={{
                  flex: 1,
                  height: '100%',
                  backgroundColor: activeNotes.has(midi) ? '#60a5fa' : (isDark ? '#d4d4d8' : '#f4f4f5'),
                  borderColor: isDark ? '#52525b' : '#a1a1aa',
                  borderBottomLeftRadius: 3,
                  borderBottomRightRadius: 3,
                }}
              />
            ))}
          </div>
          {(() => {
            let wi = 0;
            const blacks: React.ReactNode[] = [];
            const pct = (v: number) => `${(v / WHITE_KEYS.length) * 100}%`;
            for (let midi = RANGE_START; midi <= RANGE_END; midi++) {
              if (isBlack(midi)) {
                blacks.push(
                  <div key={midi} className="absolute top-0 transition-colors duration-75"
                    style={{
                      left: pct(wi - 0.3),
                      width: pct(0.6),
                      height: '60%',
                      backgroundColor: activeNotes.has(midi) ? '#3b82f6' : (isDark ? '#27272a' : '#18181b'),
                      borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
                    }} />
                );
              } else {
                wi++;
              }
            }
            return blacks;
          })()}
        </div>
      </div>

      {/* Hover hint */}
      <p className={`text-center text-[10px] py-1.5 transition-opacity duration-200 ${
        isHovered ? 'opacity-0' : 'opacity-100'
      } ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        Hover to preview playback
      </p>
    </div>
  );
}
