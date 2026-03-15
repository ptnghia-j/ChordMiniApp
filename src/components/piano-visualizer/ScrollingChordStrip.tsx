'use client';

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { ChordEvent } from '@/utils/chordToMidi';
import { ChordCell } from '@/components/chord-analysis/ChordCell';
import { useTheme } from '@/contexts/ThemeContext';
import { useRomanNumerals, useShowSegmentation } from '@/stores/uiStore';
import type { SegmentationResult } from '@/types/chatbotTypes';
import { getSegmentationColorForBeatIndex } from '@/utils/chordFormatting';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScrollingChordStripProps {
  /** Chord events with timing information */
  chordEvents: ChordEvent[];
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether audio is currently playing (enables 60 fps RAF scrolling) */
  isPlaying?: boolean;
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
  /** Optional segmentation result used for section coloring */
  segmentationData?: SegmentationResult | null;
}

// Sweep line position as fraction of container width from left edge
const SWEEP_LINE_FRACTION = 0.2;

// Gap between chord cells (matches ChordGrid's gap-0.5 = 2px)
const CELL_GAP = 2;
const MIN_TIMELINE_BEAT_WIDTH = 36;
const SOFT_SYNC_DRIFT_THRESHOLD = 0.05;
const HARD_SYNC_DRIFT_THRESHOLD = 0.24;
const DRIFT_BLEND_FACTOR = 0.35;

function getEffectiveTimelineBeats(timeSignature: number): number {
  if (timeSignature >= 6 && timeSignature % 3 === 0) {
    return Math.max(2, timeSignature / 3);
  }

  return Math.max(1, timeSignature);
}

export function getUniformTimelineBeatWidth(
  chordEvents: ChordEvent[],
  pixelsPerSecond: number,
  timeSignature: number,
): number {
  const intervals = chordEvents
    .map((event) => event.endTime - event.startTime)
    .filter((duration) => duration > 0)
    .sort((a, b) => a - b);

  const medianInterval = intervals.length > 0
    ? intervals[Math.floor(intervals.length / 2)]
    : 0.5;

  const effectiveTimelineBeats = getEffectiveTimelineBeats(timeSignature);
  const measureScale = effectiveTimelineBeats < 4
    ? 4 / effectiveTimelineBeats
    : 1;

  const rawBeatWidth = medianInterval * pixelsPerSecond;
  const minBeatWidth = MIN_TIMELINE_BEAT_WIDTH * measureScale;

  return Math.max(rawBeatWidth, minBeatWidth);
}

// ─── Enharmonic sharp↔flat maps for normalization ────────────────────────────

const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
};

/**
 * Normalize a chord name so enharmonic equivalents (C#m vs Dbm) compare equal.
 * Applies the given accidental preference to both root and bass notes.
 */
function normalizeChordName(
  chord: string,
  pref: 'sharp' | 'flat' | null | undefined,
): string {
  if (!chord || !pref) return chord;
  // Normalize root
  const m = chord.match(/^([A-G][#b]?)(.*)/);
  if (!m) return chord;
 
  let [, root] = m
  const [,, rest] = m;

  if (pref === 'flat' && root.includes('#')) root = SHARP_TO_FLAT[root] ?? root;
  else if (pref === 'sharp' && root.includes('b') && root.length === 2) root = FLAT_TO_SHARP[root] ?? root;
  // Normalize bass note after slash
  const slashIdx = rest.indexOf('/');
  if (slashIdx !== -1) {
    const prefix = rest.slice(0, slashIdx + 1);
    const bass = rest.slice(slashIdx + 1);
    const bm = bass.match(/^([A-G][#b]?)(.*)/);
    if (bm) {
      let [, br] = bm;
      const [,, brest] = bm;
      if (pref === 'flat' && br.includes('#')) br = SHARP_TO_FLAT[br] ?? br;
      else if (pref === 'sharp' && br.includes('b') && br.length === 2) br = FLAT_TO_SHARP[br] ?? br;
      return root + prefix + br + brest;
    }
  }
  return root + rest;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ScrollingChordStrip = React.memo<ScrollingChordStripProps>(({
  chordEvents,
  currentTime,
  isPlaying = false,
  height = 40,
  pixelsPerSecond = 100,
  timeSignature = 4,
  accidentalPreference,
  beatRomanNumerals,
  uncorrectedChords,
  segmentationData,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stripInnerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // ── RAF interpolation refs ────────────────────────────────────────────────
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(isPlaying);
  const playbackBaseRef = useRef({ wallTime: 0, audioTime: currentTime });
  const ppsRef = useRef(pixelsPerSecond);
  const sweepRef = useRef(0);

  // Time-to-normalized-X mapping ref (updated by useMemo, read by RAF)
  const timeToNormalizedXRef = useRef<(time: number) => number>((t) => t * pixelsPerSecond);

  // Use shared theme context (replaces manual dark mode detection)
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Read roman numeral toggle from UI store
  const { showRomanNumerals } = useRomanNumerals();
  const showSegmentation = useShowSegmentation();

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth((prev) => (
          Math.abs(prev - entry.contentRect.width) >= 1 ? entry.contentRect.width : prev
        ));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sweep line x position
  const sweepLineX = containerWidth * SWEEP_LINE_FRACTION;

  // Keep refs current so the RAF closure always uses the latest values
  // without restarting the loop.
  useEffect(() => { isPlayingRef.current = isPlaying; });
  useEffect(() => { ppsRef.current = pixelsPerSecond; }, [pixelsPerSecond]);
  useEffect(() => { sweepRef.current = sweepLineX; }, [sweepLineX]);

  // ── Sync interpolation anchor on every parent currentTime update ──────────
  useEffect(() => {
    if (isPlaying) {
      const now = performance.now() / 1000;
      const projectedTime = playbackBaseRef.current.audioTime + (now - playbackBaseRef.current.wallTime);
      const drift = currentTime - projectedTime;

      if (Math.abs(drift) >= SOFT_SYNC_DRIFT_THRESHOLD) {
        const correctedTime = Math.abs(drift) >= HARD_SYNC_DRIFT_THRESHOLD
          ? currentTime
          : projectedTime + drift * DRIFT_BLEND_FACTOR;

        playbackBaseRef.current = {
          wallTime: now,
          audioTime: correctedTime,
        };
      }
    } else {
      playbackBaseRef.current = {
        wallTime: performance.now() / 1000,
        audioTime: currentTime,
      };
    }
    // When paused, immediately position the strip
    if (!isPlaying && stripInnerRef.current) {
      const normalizedX = timeToNormalizedXRef.current(currentTime);
      stripInnerRef.current.style.transform =
        `translateX(${-normalizedX + sweepRef.current}px)`;
    }
  }, [currentTime, isPlaying]);

  // ── RAF loop: smooth 60 fps scrolling during playback ─────────────────────
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    // Anchor from current props
    playbackBaseRef.current = {
      wallTime: performance.now() / 1000,
      audioTime: currentTime,
    };

    const animate = () => {
      if (!isPlayingRef.current) return;
      const now = performance.now() / 1000;
      const elapsed = now - playbackBaseRef.current.wallTime;
      const interpolatedTime = playbackBaseRef.current.audioTime + elapsed;
      const sweep = sweepRef.current;
      const normalizedX = timeToNormalizedXRef.current(interpolatedTime);
      if (stripInnerRef.current) {
        stripInnerRef.current.style.transform =
          `translateX(${-normalizedX + sweep}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-compute chord box positions, show-label flags, and measure separators
  // Uses UNIFORM cell widths (median beat interval) so cells don't shrink/grow.
  const { chordBoxes, measureSeparators, totalWidth, timeToNormalizedX } = useMemo(() => {
    const identityMapping = (t: number) => t * pixelsPerSecond;
    if (chordEvents.length === 0) {
      return { chordBoxes: [], measureSeparators: [], totalWidth: 0, timeToNormalizedX: identityMapping };
    }

    const uniformBeatWidth = getUniformTimelineBeatWidth(
      chordEvents,
      pixelsPerSecond,
      timeSignature,
    );

    // ── Build time→normalizedX mapping ─────────────────────────────────────
    // For a given playback time, find which event it falls in and interpolate
    // to the uniform-grid x position.
    const timeToNormalizedX = (time: number): number => {
      if (chordEvents.length === 0) return time * pixelsPerSecond;

      const firstEvent = chordEvents[0];
      const firstEventX = firstEvent.beatIndex * uniformBeatWidth;

      // Before first event
      if (time <= firstEvent.startTime) {
        // Preserve the chord grid's absolute beat offset. Shift cells have no
        // duration, but they still occupy visual beat slots before playback
        // reaches the first timed event.
        return firstEventX;
      }

      // After last event
      const lastIdx = chordEvents.length - 1;
      const lastEvent = chordEvents[lastIdx];
      if (time >= lastEvent.endTime) {
        // Continue scrolling past the end at uniform rate
        const overshoot = time - lastEvent.endTime;
        const lastEventSpan = Math.max(lastEvent.beatCount ?? 1, 1);
        return (lastEvent.beatIndex + lastEventSpan) * uniformBeatWidth + overshoot * pixelsPerSecond;
      }

      // Binary search for the event containing `time`
      let lo = 0, hi = lastIdx;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (chordEvents[mid].endTime <= time) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      const event = chordEvents[lo];
      const eventDuration = event.endTime - event.startTime;
      const fraction = eventDuration > 0
        ? (time - event.startTime) / eventDuration
        : 0;
      const eventBeatSpan = Math.max(event.beatCount ?? 1, 1);
      return (event.beatIndex + fraction * eventBeatSpan) * uniformBeatWidth;
    };


    // ── Build chord boxes with uniform positions ──────────────────────────
    const boxes = chordEvents.map((event, idx) => {
      const eventBeatSpan = Math.max(event.beatCount ?? 1, 1);
      const uniformX = event.beatIndex * uniformBeatWidth;
      const isMeasureStart = idx > 0 && event.beatIndex % timeSignature === 0;

      // Show chord label only when the chord VISUALLY differs from the
      // previous *visible* event.  This is critical because
      // buildChordTimeline skips N.C./empty beats – so two identical chords
      // separated by an empty beat appear adjacent in the strip.  Comparing
      // only against the previous event (not the full array) prevents
      // false-positive "new chord" labels.  We also normalize enharmonic
      // spellings (C# ↔ Db) via accidentalPreference so visually identical
      // chords are treated as equal.
      let showLabel: boolean;
      if (!event.chordName) {
        showLabel = false;
      } else if (idx === 0) {
        showLabel = true;
      } else {
        const prevEventChord = chordEvents[idx - 1]?.chordName ?? '';
        const normCurrent = normalizeChordName(event.chordName, accidentalPreference);
        const normPrev    = normalizeChordName(prevEventChord,  accidentalPreference);
        showLabel = normCurrent !== normPrev;
      }

      return {
        chordName: event.chordName,
        beatIndex: event.beatIndex,
        startTime: event.startTime,
        endTime: event.endTime,
        x: uniformX + CELL_GAP / 2,
        width: Math.max(eventBeatSpan * uniformBeatWidth - CELL_GAP, 2),
        index: idx,
        isMeasureStart,
        separatorX: uniformX,
        showLabel,
      };
    });

    // Collect measure separator x-positions
    const separators = boxes
      .filter((box) => box.isMeasureStart)
      .map((box) => box.separatorX);

    return {
      chordBoxes: boxes,
      measureSeparators: separators,
      totalWidth: boxes.length > 0
        ? boxes[boxes.length - 1].separatorX + boxes[boxes.length - 1].width + CELL_GAP / 2
        : 0,
      timeToNormalizedX,
    };
  }, [chordEvents, pixelsPerSecond, timeSignature, accidentalPreference]);

  // Sync the mapping function to a ref so the RAF closure always uses the latest version
  useEffect(() => { timeToNormalizedXRef.current = timeToNormalizedX; }, [timeToNormalizedX]);

  // ── Stable ChordCell callbacks (memoized to avoid re-renders) ─────────────

  /** ChordCell's getChordStyle — returns transparent layout-only classes so the
   *  outer positioned div controls background / border colouring. */
  const stripGetChordStyle = useCallback(
    () => 'relative flex flex-col items-center justify-center',
    [],
  );

  /** ChordCell's getDynamicFontSize — fixed text-sm for compact strip cells. */
  const stripGetDynamicFontSize = useCallback(() => 'text-sm', []);

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
      {/* Scrolling chord strip – transform is driven by RAF/effect, not inline */}
      <div
        ref={stripInnerRef}
        className="absolute top-0 bottom-0"
        style={{
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
          const segmentationColor = showSegmentation && segmentationData && !isPast && !isEmpty
            ? getSegmentationColorForBeatIndex(box.beatIndex, [], segmentationData, true, undefined, box.startTime)
            : undefined;
          const hasSegmentationOverlay = Boolean(segmentationColor);
          const containerClass = `${isActive
            ? showSegmentation && segmentationData && !isEmpty
              ? 'border-blue-400 dark:border-blue-500 text-blue-800 dark:text-blue-100'
              : 'bg-blue-50 dark:bg-blue-900/50 border-blue-400 dark:border-blue-500 text-blue-800 dark:text-blue-100'
            : isPast
              ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500'
              : isEmpty
                ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-600/40'
                : showSegmentation && segmentationData
                  ? 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100'
                  : 'bg-white dark:bg-content-bg border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100'}`;

          const containerStyle = {
            left: box.x,
            width: box.width,
          };

          return (
            <div
              key={box.index}
              className={`absolute top-[1px] bottom-[1px] rounded-sm border overflow-hidden ${containerClass}`}
              style={containerStyle}
            >
              {hasSegmentationOverlay && (
                <>
                  <div className="absolute inset-0 pointer-events-none bg-slate-950/50 dark:bg-black/60" />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: segmentationColor }}
                  />
                  <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-black/20 dark:ring-white/10" />
                </>
              )}

              <div className="relative z-[1] h-full">
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
                  segmentationClassName={undefined}
                />
              </div>
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
});

ScrollingChordStrip.displayName = 'ScrollingChordStrip';

export default ScrollingChordStrip;
