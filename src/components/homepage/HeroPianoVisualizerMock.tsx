'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { FallingNotesCanvas, type ActiveInstrument } from '@/components/piano-visualizer/FallingNotesCanvas';
import { PianoKeyboard } from '@/components/piano-visualizer/PianoKeyboard';
import { buildChordTimeline, isBlackKey } from '@/utils/chordToMidi';

const HERO_BPM = 120;
const HERO_TIME_SIGNATURE = 4;
const HERO_RANGE_START = 43; // G2
const HERO_RANGE_END = 76; // E5
const HERO_LOOK_AHEAD_SECONDS = 4.75;
const HERO_LOOK_BEHIND_SECONDS = 0.7;
const HERO_CANVAS_HEIGHT = 152;
const HERO_KEYBOARD_HEIGHT = 48;
const HERO_IDLE_TIME = 1.6;
const HERO_CHORDS = [
  'C', 'C', 'C', 'C',
  'Am7', 'Am7', 'Am7', 'Am7',
  'Fmaj7', 'Fmaj7', 'Fmaj7', 'Fmaj7',
  'G', 'G', 'G', 'G',
  'Em7', 'Em7', 'Em7', 'Em7',
  'F', 'F', 'G', 'G',
  'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7',
];
const HERO_BEATS = HERO_CHORDS.map((_, index) => index * 0.5);
const HERO_LOOP_DURATION = HERO_BEATS[HERO_BEATS.length - 1] + 0.5;
const HERO_ACTIVE_INSTRUMENTS: ActiveInstrument[] = [
  { name: 'piano', color: '#60a5fa' },
  { name: 'guitar', color: '#34d399' },
  { name: 'violin', color: '#f472b6' },
  { name: 'bass', color: '#f59e0b' },
];
const HERO_CHORD_EVENTS = buildChordTimeline(HERO_CHORDS, HERO_BEATS);

interface HeroPianoVisualizerMockProps {
  className?: string;
  preset?: 'hero' | 'feature';
}

function countWhiteKeys(startMidi: number, endMidi: number): number {
  let count = 0;
  for (let midi = startMidi; midi <= endMidi; midi += 1) {
    if (!isBlackKey(midi)) {
      count += 1;
    }
  }
  return count;
}

export default function HeroPianoVisualizerMock({
  className = '',
  preset = 'hero',
}: HeroPianoVisualizerMockProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isHovered, setIsHovered] = useState(false);
  const [currentTime, setCurrentTime] = useState(HERO_IDLE_TIME);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationStartRef = useRef<number | null>(null);
  const pausedTimeRef = useRef(HERO_IDLE_TIME);

  const visualizerConfig = useMemo(() => (
    preset === 'feature'
      ? {
          startMidi: 31, // G1 - clearer bass coverage
          endMidi: 91, // G6 - extends the upper range for flute/violin motion
          lookAheadSeconds: 5.9,
          lookBehindSeconds: 0.9,
          canvasHeight: 186,
          keyboardHeight: 52,
          minWhiteKeyWidth: 8,
        }
      : {
          startMidi: HERO_RANGE_START,
          endMidi: HERO_RANGE_END,
          lookAheadSeconds: HERO_LOOK_AHEAD_SECONDS,
          lookBehindSeconds: HERO_LOOK_BEHIND_SECONDS,
          canvasHeight: HERO_CANVAS_HEIGHT,
          keyboardHeight: HERO_KEYBOARD_HEIGHT,
          minWhiteKeyWidth: 12,
        }
  ), [preset]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      setContainerWidth(prev => (Math.abs(prev - nextWidth) >= 1 ? nextWidth : prev));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isHovered) {
      animationStartRef.current = null;
      return;
    }

    let frameId = 0;

    const animate = (timestamp: number) => {
      if (animationStartRef.current === null) {
        animationStartRef.current = timestamp - pausedTimeRef.current * 1000;
      }

      const nextTime = ((timestamp - animationStartRef.current) / 1000) % HERO_LOOP_DURATION;
      pausedTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isHovered]);

  const whiteKeyWidth = useMemo(() => {
    const whiteKeyCount = countWhiteKeys(visualizerConfig.startMidi, visualizerConfig.endMidi);
    if (containerWidth <= 0) {
      return preset === 'feature' ? 12 : 18;
    }

    return Math.max(visualizerConfig.minWhiteKeyWidth, Math.floor(containerWidth / whiteKeyCount));
  }, [containerWidth, preset, visualizerConfig]);

  const currentChord = useMemo(() => {
    const activeEvent = HERO_CHORD_EVENTS.find(
      (event) => currentTime >= event.startTime && currentTime < event.endTime,
    );

    return activeEvent?.chordName ?? HERO_CHORD_EVENTS[0]?.chordName ?? 'C';
  }, [currentTime]);

  const handleActiveNotesChange = useCallback((notes: Set<number>, colors: Map<number, string>) => {
    setActiveNotes(new Set(notes));
    setNoteColors(new Map(colors));
  }, []);

  return (
    <div
      className={`flex select-none flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm ${
        isDark ? 'border-gray-600/40 bg-[#1E252E]/70' : 'border-gray-200/80 bg-white/70'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        pausedTimeRef.current = currentTime;
        setIsHovered(false);
      }}
    >
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Piano Visualizer
          </h4>
          <div className="flex items-center gap-1.5">
            <span className={`font-varela text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
              {currentChord}
            </span>
            <span className={`rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${
              isDark ? 'border border-orange-400 bg-orange-800/40 text-orange-50' : 'border border-orange-200 bg-orange-50 text-orange-800'
            }`}>
              MIDI
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          {HERO_ACTIVE_INSTRUMENTS.map((instrument) => (
            <span
              key={instrument.name}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                isDark ? 'border-gray-600/60 bg-[#101722] text-gray-200' : 'border-gray-200 bg-white/80 text-gray-700'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: instrument.color }} />
              {instrument.name}
            </span>
          ))}
        </div>
      </div>

      <div className="px-3 pb-3">
        <div
          ref={containerRef}
          className="overflow-hidden rounded-2xl border border-white/10 bg-[#081120] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="pointer-events-none relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_48%)]" />
            <FallingNotesCanvas
              chordEvents={HERO_CHORD_EVENTS}
              currentTime={currentTime}
              isPlaying={isHovered}
              startMidi={visualizerConfig.startMidi}
              endMidi={visualizerConfig.endMidi}
              whiteKeyWidth={whiteKeyWidth}
              lookAheadSeconds={visualizerConfig.lookAheadSeconds}
              lookBehindSeconds={visualizerConfig.lookBehindSeconds}
              height={visualizerConfig.canvasHeight}
              activeInstruments={HERO_ACTIVE_INSTRUMENTS}
              bpm={HERO_BPM}
              timeSignature={HERO_TIME_SIGNATURE}
              onActiveNotesChange={handleActiveNotesChange}
            />
          </div>

          <div className="border-t border-white/10 bg-white/95 px-1 pb-1 pt-0.5 dark:bg-[#f8fafc]">
            <PianoKeyboard
              startMidi={visualizerConfig.startMidi}
              endMidi={visualizerConfig.endMidi}
              activeNotes={activeNotes}
              noteColors={noteColors}
              whiteKeyWidth={whiteKeyWidth}
              height={visualizerConfig.keyboardHeight}
            />
          </div>
        </div>
      </div>

      <p className={`py-1.5 text-center text-[10px] transition-opacity duration-200 ${
        isHovered ? 'opacity-0' : 'opacity-100'
      } ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        Hover to preview real falling-note motion
      </p>
    </div>
  );
}