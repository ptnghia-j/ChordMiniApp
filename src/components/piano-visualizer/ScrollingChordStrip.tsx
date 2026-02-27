'use client';

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { ChordEvent } from '@/utils/chordToMidi';
import { ChordCell } from '@/components/chord-analysis/ChordCell';
import { useTheme } from '@/contexts/ThemeContext';
import { useRomanNumerals } from '@/stores/uiStore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScrollingChordStripProps {
  /** Chord events with timing information */
  chordEvents: ChordEvent[];
  /** Current playback time in seconds */
  currentTime: number;
  /** Height of the strip in pixels */
  height?: number;
  /** Pixels per second of timeline (controls spread) */
  pixelsPerSecond?: number;
  /** Time signature (beats per measure) — used for measure separators */
  timeSignature?: number;
  /** Global accidental preference for consistent sharp/flat rendering */
  accidentalPreference?: 'sharp' | 'flat' | null;

  // ── ChordCell integration props ───────────────────────────────────────────

  /** Pre-computed map from beatIndex → formatted roman numeral (ReactElement|string) */
  beatRomanNumerals?: Map<number, React.ReactElement | string>;
  /** Original (uncorrected, transposed) chords array for wasCorrected detection */
  uncorrectedChords?: string[];
}

// Sweep line position as fraction of container width from left edge
const SWEEP_LINE_FRACTION = 0.2;

// Gap between chord cells (matches ChordGrid's gap-0.5 = 2px)
const CELL_GAP = 2;

// ─── Component ───────────────────────────────────────────────────────────────

export const ScrollingChordStrip: React.FC<ScrollingChordStripProps> = ({
  chordEvents,
  currentTime,
  height = 40,
  pixelsPerSecond = 100,
  timeSignature = 4,
  accidentalPreference,
  beatRomanNumerals,
  uncorrectedChords,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Use shared theme context (replaces manual dark mode detection)
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Read roman numeral toggle from UI store
  const { showRomanNumerals } = useRomanNumerals();

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sweep line x position
  const sweepLineX = containerWidth * SWEEP_LINE_FRACTION;

  // Translation: current time aligns with sweep line
  const translateX = -currentTime * pixelsPerSecond + sweepLineX;

  // Pre-compute chord box positions, show-label flags, and measure separators
  const { chordBoxes, measureSeparators, totalWidth } = useMemo(() => {
    if (chordEvents.length === 0) return { chordBoxes: [], measureSeparators: [], totalWidth: 0 };

    const firstBeatIndex = chordEvents[0].beatIndex;

    const boxes = chordEvents.map((event, idx) => {
      const rawX = event.startTime * pixelsPerSecond;
      const rawWidth = Math.max((event.endTime - event.startTime) * pixelsPerSecond, 4);
      const isMeasureStart = idx > 0 && (event.beatIndex - firstBeatIndex) % timeSignature === 0;

      // Show chord label only on chord changes (matching ChordGrid behavior)
      const prevChord = idx > 0 ? chordEvents[idx - 1].chordName : '';
      const showLabel = !!event.chordName && event.chordName !== prevChord;

      return {
        chordName: event.chordName,
        beatIndex: event.beatIndex,
        startTime: event.startTime,
        endTime: event.endTime,
        x: rawX + CELL_GAP / 2,
        width: Math.max(rawWidth - CELL_GAP, 2),
        index: idx,
        isMeasureStart,
        separatorX: rawX,
        showLabel,
      };
    });

    // Collect measure separator x-positions
    const separators = boxes
      .filter((box) => box.isMeasureStart)
      .map((box) => box.separatorX);

    const last = chordEvents[chordEvents.length - 1];
    return {
      chordBoxes: boxes,
      measureSeparators: separators,
      totalWidth: last.endTime * pixelsPerSecond,
    };
  }, [chordEvents, pixelsPerSecond, timeSignature]);

  // ── Stable ChordCell callbacks (memoized to avoid re-renders) ─────────────

  /** ChordCell's getChordStyle — returns transparent layout-only classes so the
   *  outer positioned div controls background / border colouring. */
  const stripGetChordStyle = useCallback(
    () => 'relative flex flex-col items-center justify-center',
    [],
  );

  /** ChordCell's getDynamicFontSize — fixed text-xs for compact strip cells. */
  const stripGetDynamicFontSize = useCallback(() => 'text-xs', []);

  /** No-op beat click handler (strip is non-interactive). */
  const noopBeatClick = useCallback(() => {}, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (chordEvents.length === 0) {
    return (
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-sm flex items-center justify-center"
        style={{ height }}
      >
        <span className="font-varela text-xs text-gray-500">No chord events</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-sm"
      style={{ height }}
    >
      {/* Scrolling chord strip */}
      <div
        className="absolute top-0 bottom-0"
        style={{
          transform: `translateX(${translateX}px)`,
          width: totalWidth + containerWidth,
          willChange: 'transform',
        }}
      >
        {/* Measure separators — matching ChordGrid's border-l-[3px] */}
        {measureSeparators.map((x, i) => (
          <div
            key={`sep-${i}`}
            className="absolute top-0 bottom-0 border-l-[3px] border-gray-600 dark:border-gray-400 z-[1]"
            style={{ left: x }}
          />
        ))}

        {/* Chord boxes — rendered using ChordCell for unified formatting,
            roman numerals, enharmonic corrections, and corrected chord styling */}
        {chordBoxes.map((box) => {
          const isActive = currentTime >= box.startTime && currentTime < box.endTime;
          const isPast = currentTime >= box.endTime;
          const isEmpty = !box.chordName;

          // Roman numeral — only set on chord-change beats
          const romanNumeral =
            showRomanNumerals && box.showLabel && beatRomanNumerals
              ? beatRomanNumerals.get(box.beatIndex)
              : undefined;

          // Corrected chord detection (compare with uncorrected/transposed original)
          const wasCorrected =
            !isEmpty &&
            !!uncorrectedChords &&
            box.beatIndex < uncorrectedChords.length &&
            uncorrectedChords[box.beatIndex] !== box.chordName;

          return (
            <div
              key={box.index}
              className={`absolute top-[1px] bottom-[1px] rounded-sm border overflow-hidden transition-colors duration-75 ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/50 border-blue-400 dark:border-blue-500 text-blue-800 dark:text-blue-100'
                  : isPast
                    ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                    : isEmpty
                      ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-600/40'
                      : 'bg-white dark:bg-content-bg border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100'
              }`}
              style={{
                left: box.x,
                width: box.width,
              }}
            >
              <ChordCell
                compact
                chord={box.chordName}
                globalIndex={box.beatIndex}
                displayChord={box.chordName}
                isEmpty={isEmpty}
                wasCorrected={wasCorrected}
                cellSize={height - 2}
                isDarkMode={isDarkMode}
                showChordLabel={box.showLabel && box.width > 20}
                isClickable={false}
                onBeatClick={noopBeatClick}
                getChordStyle={stripGetChordStyle}
                getDynamicFontSize={stripGetDynamicFontSize}
                showRomanNumerals={showRomanNumerals}
                romanNumeral={romanNumeral}
                accidentalPreference={accidentalPreference ?? undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Sweep line (stationary) */}
      <div
        className="absolute top-0 bottom-0 z-10 pointer-events-none"
        style={{ left: sweepLineX - 1 }}
      >
        <div className="w-0.5 h-full bg-blue-400/80 shadow-[0_0_8px_2px_rgba(96,165,250,0.4)]" />
        {/* Small triangle indicator at top */}
        <div
          className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid rgba(96,165,250,0.8)',
          }}
        />
      </div>

      {/* Edge fade — light mode */}
      <div
        className="absolute inset-0 pointer-events-none z-20 dark:hidden"
        style={{
          background:
            'linear-gradient(to right, rgb(255 255 255) 0%, transparent 8%, transparent 92%, rgb(255 255 255) 100%)',
        }}
      />
      {/* Edge fade — dark mode */}
      <div
        className="absolute inset-0 pointer-events-none z-20 hidden dark:block"
        style={{
          background:
            'linear-gradient(to right, rgb(24 24 27) 0%, transparent 8%, transparent 92%, rgb(24 24 27) 100%)',
        }}
      />
    </div>
  );
};

export default ScrollingChordStrip;
