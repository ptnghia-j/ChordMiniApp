'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChordEvent } from '@/utils/chordToMidi';
import { isNoChordChordName } from '@/utils/chordToMidi';
import {
  resolveGuitarVoicing,
  type GuitarStrumDirection,
  type GuitarVoicingSelection,
} from '@/utils/guitarVoicing';
import {
  generateNotesForInstrument,
  mergeConsecutiveChordEvents,
  type ScheduledNote,
} from '@/utils/instrumentNoteGeneration';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import {
  ScrollingChordStrip,
  getUniformTimelineBeatWidth,
} from '@/components/piano-visualizer/ScrollingChordStrip';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { ChordCellProps } from '@/components/chord-analysis/ChordCell';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GuitarTablatureProps {
  chordEvents: ChordEvent[];
  currentTime: number;
  isPlaying?: boolean;
  bpm?: number;
  pixelsPerSecond?: number;
  timeSignature?: number;
  guitarVoicing?: Partial<GuitarVoicingSelection>;
  targetKey?: string;
  dynamicsAnalyzer?: DynamicsAnalyzer;
  accidentalPreference?: 'sharp' | 'flat' | null;
  beatRomanNumerals?: Map<number, React.ReactElement | string>;
  beatModulations?: Map<number, ChordCellProps['modulationInfo']>;
  uncorrectedChords?: string[];
  segmentationData?: SegmentationResult | null;
  className?: string;
}

interface ColumnNote {
  stringIdx: number;
  relativeFret: number;
  startX: number;
  endX: number;
}

interface ArrowGeometry {
  x: number;
  lineStartY: number;
  lineEndY: number;
  headPoints: string;
}

interface StrumColumn {
  /** X coordinate on the uniform timeline (pixels). */
  x: number;
  /** Diagram base fret (1-indexed). */
  baseFret: number;
  /** Notes rendered at the event timestamp (single-note picks or strums). */
  notes: ColumnNote[];
  /** Strum direction for arrow rendering. Null for single-note plucks. */
  direction: GuitarStrumDirection | null;
  /** True when this is the first stroke of a chord (used for a light column accent). */
  isChordStart: boolean;
  /** Precomputed in `useMemo` so playback time updates do not rebuild layout in render. */
  arrowGeometry: ArrowGeometry | null;
}

export type TablatureStrumColumnDraft = Omit<StrumColumn, 'arrowGeometry'>;

// ─── Constants ───────────────────────────────────────────────────────────────

const SWEEP_LINE_FRACTION = 0.2;
const SOFT_SYNC_DRIFT_THRESHOLD = 0.05;
const HARD_SYNC_DRIFT_THRESHOLD = 0.24;
const DRIFT_BLEND_FACTOR = 0.35;

const NUM_STRINGS = 6;
const STRING_SPACING = 28;
const TOP_PADDING = 40;
const BOTTOM_PADDING = 36;
const STAFF_HEIGHT = TOP_PADDING + (NUM_STRINGS - 1) * STRING_SPACING + BOTTOM_PADDING;

const FRET_NUMBER_FONT_SIZE = 15;
const FRET_PILL_WIDTH = 24;
const FRET_PILL_HEIGHT = 20;
const ARROW_HALF_WIDTH = 5;
const ARROW_HEAD_SIZE = 6;
const ARROW_CHORD_PADDING = 4;
const ARROW_PREFERRED_LEFT_GAP = 5;
const ARROW_MIN_LEFT_GAP = 3;
const ARROW_MIN_RIGHT_GAP = 11;

const STRUM_CLUSTER_MAX_GAP_SECONDS = 0.028;
const MIN_NOTE_TAIL_WIDTH_PX = 4;

const DEFAULT_BPM = 120;
const DEFAULT_PIXELS_PER_SECOND = 118;
const STRIP_HEIGHT = 56;
const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64] as const;

export const TABLATURE_LAYOUT = {
  stringSpacing: STRING_SPACING,
  topPadding: TOP_PADDING,
  bottomPadding: BOTTOM_PADDING,
  staffHeight: STAFF_HEIGHT,
  fretFontSize: FRET_NUMBER_FONT_SIZE,
  fretPillWidth: FRET_PILL_WIDTH,
  fretPillHeight: FRET_PILL_HEIGHT,
  arrowPreferredLeftGap: ARROW_PREFERRED_LEFT_GAP,
  arrowMinLeftGap: ARROW_MIN_LEFT_GAP,
  arrowMinRightGap: ARROW_MIN_RIGHT_GAP,
};

/** Y coordinate of a string line. String 0 (Low E) sits at the bottom of the staff. */
function getStringY(stringIdx: number): number {
  return TOP_PADDING + (NUM_STRINGS - 1 - stringIdx) * STRING_SPACING;
}

/** Format the displayed fret number for a string; returns null when nothing should render. */
function formatFret(relativeFret: number, baseFret: number): string | null {
  if (relativeFret === -1) return 'x';
  if (relativeFret === 0) return '0';
  return String(baseFret + relativeFret - 1);
}

function resolveVoicingStringMidis(voicing: ReturnType<typeof resolveGuitarVoicing>): Array<number | null> {
  if (!voicing?.frets || voicing.baseFret === undefined) {
    return [];
  }

  return voicing.frets.map((relativeFret, stringIdx) => {
    if (stringIdx >= STANDARD_TUNING_MIDI.length || relativeFret < 0) {
      return null;
    }

    const absoluteFret = relativeFret === 0
      ? 0
      : voicing.baseFret! + relativeFret - 1;
    return STANDARD_TUNING_MIDI[stringIdx] + voicing.capoFret + absoluteFret;
  });
}

function clusterScheduledNotes(notes: ScheduledNote[]): ScheduledNote[][] {
  if (notes.length === 0) {
    return [];
  }

  const sorted = [...notes].sort((a, b) => a.startOffset - b.startOffset);
  const clusters: ScheduledNote[][] = [];
  let currentCluster: ScheduledNote[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (current.startOffset - previous.startOffset <= STRUM_CLUSTER_MAX_GAP_SECONDS) {
      currentCluster.push(current);
    } else {
      clusters.push(currentCluster);
      currentCluster = [current];
    }
  }

  clusters.push(currentCluster);
  return clusters;
}

function mapClusterNotesToStrings(
  cluster: ScheduledNote[],
  stringMidis: Array<number | null>,
): Array<{ stringIdx: number; note: ScheduledNote }> {
  const usedStrings = new Set<number>();

  return cluster
    .slice()
    .sort((a, b) => a.startOffset - b.startOffset)
    .map((note) => {
      const exactMatch = stringMidis.findIndex((stringMidi, stringIdx) => (
        stringMidi === note.midi && !usedStrings.has(stringIdx)
      ));

      if (exactMatch >= 0) {
        usedStrings.add(exactMatch);
        return { stringIdx: exactMatch, note };
      }

      let bestStringIdx = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let stringIdx = 0; stringIdx < stringMidis.length; stringIdx += 1) {
        if (usedStrings.has(stringIdx)) continue;
        const stringMidi = stringMidis[stringIdx];
        if (stringMidi === null) continue;
        const distance = Math.abs(stringMidi - note.midi);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestStringIdx = stringIdx;
        }
      }

      if (bestStringIdx >= 0) {
        usedStrings.add(bestStringIdx);
        return { stringIdx: bestStringIdx, note };
      }

      return null;
    })
    .filter((mapped): mapped is { stringIdx: number; note: ScheduledNote } => mapped !== null);
}

function inferStrumDirection(mappedNotes: Array<{ stringIdx: number; note: ScheduledNote }>): GuitarStrumDirection | null {
  if (mappedNotes.length < 2) {
    return null;
  }

  const ordered = [...mappedNotes].sort((a, b) => a.note.startOffset - b.note.startOffset);
  const firstStringIdx = ordered[0].stringIdx;
  const lastStringIdx = ordered[ordered.length - 1].stringIdx;

  if (lastStringIdx === firstStringIdx) {
    return null;
  }

  return lastStringIdx > firstStringIdx ? 'down' : 'up';
}

export function resolveStrumArrowX(
  labelLeftX: number,
  previousLabelRightX: number | null,
): number {
  const minViewportX = ARROW_HALF_WIDTH + 2;
  const preferredX = labelLeftX - ARROW_PREFERRED_LEFT_GAP;

  if (previousLabelRightX === null) {
    return Math.max(minViewportX, preferredX);
  }

  const minXFromPrevious = previousLabelRightX + ARROW_MIN_RIGHT_GAP;
  const maxXBeforeLabel = labelLeftX - ARROW_MIN_LEFT_GAP;
  const resolvedX = Math.min(
    Math.max(preferredX, minXFromPrevious),
    maxXBeforeLabel,
  );

  return Math.max(minViewportX, resolvedX);
}

export function buildStrumArrowGeometry(
  direction: GuitarStrumDirection | null,
  stringIndices: number[],
  x: number,
): ArrowGeometry | null {
  if (!direction || stringIndices.length === 0) {
    return null;
  }

  const noteYs = stringIndices.map((stringIdx) => getStringY(stringIdx));
  const highestNoteY = Math.min(...noteYs);
  const lowestNoteY = Math.max(...noteYs);
  const chordTopY = highestNoteY - (FRET_PILL_HEIGHT / 2) - ARROW_CHORD_PADDING;
  const chordBottomY = lowestNoteY + (FRET_PILL_HEIGHT / 2) + ARROW_CHORD_PADDING;

  // In this tab layout, bottom string = lowest pitch and top string = highest pitch.
  // Downstrum should therefore point bottom -> top (ascending pitch), while
  // upstrum points top -> bottom.
  if (direction === 'down') {
    const tipY = chordTopY;
    return {
      x,
      lineStartY: chordBottomY,
      lineEndY: tipY,
      headPoints: [
        `${x},${tipY}`,
        `${x - ARROW_HALF_WIDTH},${tipY + ARROW_HEAD_SIZE}`,
        `${x + ARROW_HALF_WIDTH},${tipY + ARROW_HEAD_SIZE}`,
      ].join(' '),
    };
  }

  const tipY = chordBottomY;
  return {
    x,
    lineStartY: chordTopY,
    lineEndY: tipY,
    headPoints: [
      `${x},${tipY}`,
      `${x - ARROW_HALF_WIDTH},${tipY - ARROW_HEAD_SIZE}`,
      `${x + ARROW_HALF_WIDTH},${tipY - ARROW_HEAD_SIZE}`,
    ].join(' '),
  };
}

/**
 * Second-pass layout: resolves arrow X against the previous column's fret labels
 * and builds SVG arrow geometry once per data change (not on every `currentTime` tick).
 */
export function attachArrowLayoutToColumns(columns: readonly TablatureStrumColumnDraft[]): StrumColumn[] {
  let previousLabelRightEdge: number | null = null;

  return columns.map((column) => {
    const leftMostNoteX = Math.min(...column.notes.map((note) => note.startX));
    const rightMostNoteX = Math.max(...column.notes.map((note) => note.startX));
    const labelLeftX = leftMostNoteX - (FRET_PILL_WIDTH / 2);
    const labelRightX = rightMostNoteX + (FRET_PILL_WIDTH / 2);
    const arrowX = resolveStrumArrowX(labelLeftX, previousLabelRightEdge);
    previousLabelRightEdge = labelRightX;

    const arrowGeometry = buildStrumArrowGeometry(
      column.direction,
      column.notes.map((note) => note.stringIdx),
      arrowX,
    );

    return { ...column, arrowGeometry };
  });
}

interface TablatureStaffSvgProps {
  innerWidth: number;
  columns: StrumColumn[];
}

/** Isolated from playback time so `currentTime` ticks do not reconcile hundreds of SVG nodes. */
const TablatureStaffSvg = React.memo(function TablatureStaffSvg({ innerWidth, columns }: TablatureStaffSvgProps) {
  return (
    <svg
      width={innerWidth}
      height={STAFF_HEIGHT}
      className="block"
      aria-hidden="true"
    >
      {columns.map((column, colIdx) => (
        <g key={`col-${colIdx}`}>
          {column.isChordStart && (
            <line
              x1={column.x}
              x2={column.x}
              y1={TOP_PADDING - 2}
              y2={STAFF_HEIGHT - BOTTOM_PADDING + 2}
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth={1}
            />
          )}

          {column.notes.map((note, noteIdx) => {
            const y = getStringY(note.stringIdx);
            const tailStartX = note.startX + (FRET_PILL_WIDTH / 2) - 1;
            if (note.endX <= tailStartX + 1) {
              return null;
            }
            return (
              <line
                key={`tail-${colIdx}-${noteIdx}`}
                x1={tailStartX}
                x2={note.endX}
                y1={y}
                y2={y}
                className="stroke-blue-300/80 dark:stroke-blue-200/70"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}

          {column.notes.map((note, noteIdx) => {
            const relativeFret = note.relativeFret;
            const label = formatFret(relativeFret, column.baseFret);
            if (label === null) return null;
            const y = getStringY(note.stringIdx);
            const isMuted = label === 'x';
            return (
              <g key={`fret-${colIdx}-${noteIdx}`}>
                <rect
                  x={note.startX - FRET_PILL_WIDTH / 2}
                  y={y - FRET_PILL_HEIGHT / 2}
                  width={FRET_PILL_WIDTH}
                  height={FRET_PILL_HEIGHT}
                  rx={3}
                  className="fill-white dark:fill-content-bg"
                />
                <text
                  x={note.startX}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={FRET_NUMBER_FONT_SIZE}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  className={isMuted
                    ? 'fill-gray-400 dark:fill-gray-500'
                    : 'fill-gray-800 dark:fill-gray-100 font-semibold'}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {column.arrowGeometry && (
            <>
              <line
                x1={column.arrowGeometry.x}
                x2={column.arrowGeometry.x}
                y1={column.arrowGeometry.lineStartY}
                y2={column.arrowGeometry.lineEndY}
                className="stroke-slate-600 dark:stroke-slate-300"
                strokeWidth={1}
                strokeLinecap="round"
              />
              <polygon
                points={column.arrowGeometry.headPoints}
                className="fill-slate-600 dark:fill-slate-300"
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
});

TablatureStaffSvg.displayName = 'TablatureStaffSvg';

const TablatureStringLines = React.memo(function TablatureStringLines() {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height={STAFF_HEIGHT}
      aria-hidden="true"
    >
      {Array.from({ length: NUM_STRINGS }, (_, stringIdx) => {
        const y = getStringY(stringIdx);
        const strokeWidth = stringIdx === 0 ? 1.4 : stringIdx === 1 ? 1.2 : 1;
        return (
          <line
            key={`string-${stringIdx}`}
            x1={0}
            x2="100%"
            y1={y}
            y2={y}
            className="stroke-gray-400 dark:stroke-gray-500"
            strokeWidth={strokeWidth}
          />
        );
      })}
    </svg>
  );
});

TablatureStringLines.displayName = 'TablatureStringLines';

export const GuitarTablature = React.memo<GuitarTablatureProps>(({
  chordEvents,
  currentTime,
  isPlaying = false,
  bpm = DEFAULT_BPM,
  pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND,
  timeSignature = 4,
  guitarVoicing,
  targetKey,
  dynamicsAnalyzer,
  accidentalPreference,
  beatRomanNumerals,
  beatModulations,
  uncorrectedChords,
  segmentationData,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // RAF interpolation refs (mirrors ScrollingChordStrip so both scroll in lock-step).
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(isPlaying);
  const playbackBaseRef = useRef({ wallTime: 0, audioTime: currentTime });
  const sweepRef = useRef(0);
  const timeToNormalizedXRef = useRef<(time: number) => number>((t) => t * pixelsPerSecond);

  // ── Build strum columns for every playable chord event ──────────────────────
  const { columns, totalWidth, timeToNormalizedX } = useMemo(() => {
    const identityMapping = (t: number) => t * pixelsPerSecond;
    if (chordEvents.length === 0) {
      return { columns: [] as StrumColumn[], totalWidth: 0, timeToNormalizedX: identityMapping };
    }

    const uniformBeatWidth = getUniformTimelineBeatWidth(chordEvents, pixelsPerSecond, timeSignature);

    const mapTime = (time: number): number => {
      const firstEvent = chordEvents[0];
      const firstEventX = firstEvent.beatIndex * uniformBeatWidth;
      if (time <= firstEvent.startTime) return firstEventX;

      const lastIdx = chordEvents.length - 1;
      const lastEvent = chordEvents[lastIdx];
      if (time >= lastEvent.endTime) {
        const overshoot = time - lastEvent.endTime;
        const lastEventSpan = Math.max(lastEvent.beatCount ?? 1, 1);
        return (lastEvent.beatIndex + lastEventSpan) * uniformBeatWidth + overshoot * pixelsPerSecond;
      }

      let lo = 0;
      let hi = lastIdx;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (chordEvents[mid].endTime <= time) lo = mid + 1;
        else hi = mid;
      }
      const event = chordEvents[lo];
      const eventDuration = event.endTime - event.startTime;
      const fraction = eventDuration > 0 ? (time - event.startTime) / eventDuration : 0;
      const eventBeatSpan = Math.max(event.beatCount ?? 1, 1);
      return (event.beatIndex + fraction * eventBeatSpan) * uniformBeatWidth;
    };

    const playbackEvents = mergeConsecutiveChordEvents(
      chordEvents.filter((event) => event.notes.length > 0),
    );
    const playbackTotalDuration = playbackEvents.length > 0
      ? playbackEvents[playbackEvents.length - 1].endTime
      : undefined;

    const columnDrafts: TablatureStrumColumnDraft[] = [];
    for (let i = 0; i < playbackEvents.length; i += 1) {
      const event = playbackEvents[i];
      if (isNoChordChordName(event.chordName)) continue;

      const voicing = resolveGuitarVoicing(event.chordName, guitarVoicing, targetKey);
      if (!voicing || !voicing.frets || voicing.baseFret === undefined) continue;
      const stringMidis = resolveVoicingStringMidis(voicing);

      const duration = event.endTime - event.startTime;
      if (duration <= 0) continue;
      const beatSpan = Math.max(event.beatCount ?? 1, 1);
      const beatDuration = beatSpan > 0
        ? duration / beatSpan
        : (60 / Math.max(1, bpm));
      const nextChordName = playbackEvents[i + 1]?.chordName;
      const signalDynamics = dynamicsAnalyzer?.getSignalDynamics(event.startTime, duration) ?? null;

      const scheduled = generateNotesForInstrument('guitar', {
        chordName: event.chordName,
        chordNotes: event.notes,
        duration,
        beatDuration,
        startTime: event.startTime,
        totalDuration: playbackTotalDuration,
        timeSignature,
        segmentationData,
        signalDynamics,
        guitarVoicing,
        targetKey,
        nextChordName,
      });

      const noteClusters = clusterScheduledNotes(scheduled);
      noteClusters.forEach((cluster, clusterIdx) => {
        const mappedNotes = mapClusterNotesToStrings(cluster, stringMidis);
        if (mappedNotes.length === 0) {
          return;
        }

        const clusterStartOffset = Math.min(...mappedNotes.map((entry) => entry.note.startOffset));
        const direction = inferStrumDirection(mappedNotes);
        const notes: ColumnNote[] = mappedNotes.map(({ stringIdx, note }) => {
          const relativeFret = voicing.frets![stringIdx];
          const noteStartTime = event.startTime + note.startOffset;
          const noteEndTime = Math.min(event.endTime, noteStartTime + note.duration);
          const startX = mapTime(noteStartTime);
          const endX = Math.max(startX + MIN_NOTE_TAIL_WIDTH_PX, mapTime(noteEndTime));

          return {
            stringIdx,
            relativeFret,
            startX,
            endX,
          };
        });

        columnDrafts.push({
          x: mapTime(event.startTime + clusterStartOffset),
          baseFret: voicing.baseFret!,
          notes,
          direction,
          isChordStart: clusterIdx === 0,
        });
      });
    }

    const lastEvent = chordEvents[chordEvents.length - 1];
    const lastEventSpan = Math.max(lastEvent.beatCount ?? 1, 1);
    const computedTotalWidth = (lastEvent.beatIndex + lastEventSpan) * uniformBeatWidth;

    const columns = attachArrowLayoutToColumns(columnDrafts);
    return { columns, totalWidth: computedTotalWidth, timeToNormalizedX: mapTime };
  }, [
    bpm,
    chordEvents,
    dynamicsAnalyzer,
    guitarVoicing,
    pixelsPerSecond,
    segmentationData,
    targetKey,
    timeSignature,
  ]);

  // Sync timeToNormalizedX ref for the RAF closure.
  useEffect(() => { timeToNormalizedXRef.current = timeToNormalizedX; }, [timeToNormalizedX]);

  // Measure container width so the sweep line tracks responsive layout changes.
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

  const sweepLineX = containerWidth * SWEEP_LINE_FRACTION;

  useEffect(() => { isPlayingRef.current = isPlaying; });
  useEffect(() => { sweepRef.current = sweepLineX; }, [sweepLineX]);

  // Sync interpolation anchor when the parent's currentTime advances/jumps.
  useEffect(() => {
    if (isPlaying) {
      const now = performance.now() / 1000;
      const projectedTime = playbackBaseRef.current.audioTime + (now - playbackBaseRef.current.wallTime);
      const drift = currentTime - projectedTime;
      if (Math.abs(drift) >= SOFT_SYNC_DRIFT_THRESHOLD) {
        const correctedTime = Math.abs(drift) >= HARD_SYNC_DRIFT_THRESHOLD
          ? currentTime
          : projectedTime + drift * DRIFT_BLEND_FACTOR;
        playbackBaseRef.current = { wallTime: now, audioTime: correctedTime };
      }
    } else {
      playbackBaseRef.current = { wallTime: performance.now() / 1000, audioTime: currentTime };
    }
    if (!isPlaying && innerRef.current) {
      const normalizedX = timeToNormalizedXRef.current(currentTime);
      innerRef.current.style.transform = `translateX(${-normalizedX + sweepRef.current}px)`;
    }
  }, [currentTime, isPlaying]);

  // RAF loop mirrors ScrollingChordStrip: 60fps interpolation during playback.
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    playbackBaseRef.current = { wallTime: performance.now() / 1000, audioTime: currentTime };
    const animate = () => {
      if (!isPlayingRef.current) return;
      const now = performance.now() / 1000;
      const elapsed = now - playbackBaseRef.current.wallTime;
      const interpolatedTime = playbackBaseRef.current.audioTime + elapsed;
      const normalizedX = timeToNormalizedXRef.current(interpolatedTime);
      if (innerRef.current) {
        innerRef.current.style.transform = `translateX(${-normalizedX + sweepRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty state
  if (chordEvents.length === 0) {
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-sm flex items-center justify-center ${className}`}
        style={{ height: STRIP_HEIGHT + STAFF_HEIGHT }}
      >
        <span className="font-varela text-xs text-gray-500">No chord events</span>
      </div>
    );
  }

  const innerWidth = totalWidth + containerWidth;

  return (
    <div className={`guitar-tablature ${className}`}>
      {/* Chord timeline strip on top — identical to Piano tab */}
      <ScrollingChordStrip
        chordEvents={chordEvents}
        currentTime={currentTime}
        isPlaying={isPlaying}
        height={STRIP_HEIGHT}
        pixelsPerSecond={pixelsPerSecond}
        timeSignature={timeSignature}
        accidentalPreference={accidentalPreference}
        beatRomanNumerals={beatRomanNumerals}
        beatModulations={beatModulations}
        uncorrectedChords={uncorrectedChords}
        segmentationData={segmentationData}
      />

      {/* Scrolling 6-string tab staff */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-sm bg-white dark:bg-content-bg mt-1 border border-gray-200 dark:border-gray-700"
        style={{ height: STAFF_HEIGHT }}
      >
        {/* Static string lines — memoized child skips reconcile while `currentTime` updates */}
        <TablatureStringLines />

        {/* Scrolling inner layer with strum columns */}
        <div
          ref={innerRef}
          className="absolute top-0 bottom-0"
          style={{ width: innerWidth, willChange: 'transform' }}
        >
          <TablatureStaffSvg innerWidth={innerWidth} columns={columns} />
        </div>

        {/* Stationary sweep line */}
        <div
          className="absolute top-0 bottom-0 z-10 pointer-events-none"
          style={{ left: sweepLineX - 1 }}
        >
          <div className="w-0.5 h-full bg-blue-400/80 shadow-[0_0_8px_2px_rgba(96,165,250,0.4)]" />
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
    </div>
  );
});

GuitarTablature.displayName = 'GuitarTablature';

export default GuitarTablature;