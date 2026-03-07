'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { ChordEvent, isBlackKey } from '@/utils/chordToMidi';
import {
  generateAllInstrumentVisualNotes,
  mergeConsecutiveChordEvents,
  type ActiveInstrument,
} from '@/utils/instrumentNoteGeneration';

// Re-export ActiveInstrument so existing consumers don't break
export type { ActiveInstrument } from '@/utils/instrumentNoteGeneration';

interface FallingNotesCanvasProps {
  /** Chord events to render as falling notes */
  chordEvents: ChordEvent[];
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Lowest MIDI note displayed */
  startMidi: number;
  /** Highest MIDI note displayed */
  endMidi: number;
  /** Width of each white key in pixels */
  whiteKeyWidth?: number;
  /** How many seconds of the future to show (look-ahead window) */
  lookAheadSeconds?: number;
  /** How many seconds of the past to show (trail) */
  lookBehindSeconds?: number;
  /** Height of the canvas in pixels */
  height?: number;
  /** Active instruments for instrument-specific coloring */
  activeInstruments?: ActiveInstrument[];
  /** BPM for consistent beat duration with audio playback */
  bpm?: number;
  /** Time signature (e.g. 3 for 3/4, defaults to 4) */
  timeSignature?: number;
  /** Callback: set of active MIDI notes at current time */
  onActiveNotesChange?: (notes: Set<number>, colors: Map<number, string>) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_WHITE_KEY_WIDTH = 14;

// Default colors for chord degrees / note function
const DEFAULT_NOTE_COLOR = '#60a5fa'; // blue-400
// const BASS_NOTE_COLOR = '#f97316';    // orange-500
// const ROOT_NOTE_COLOR = '#60a5fa';    // blue-400
// const THIRD_COLOR = '#34d399';        // emerald-400
// const FIFTH_COLOR = '#a78bfa';        // violet-400
// const SEVENTH_COLOR = '#f472b6';      // pink-400
// const EXTENSION_COLOR = '#fbbf24';    // amber-400

// Color palette for chord tones by interval position
// const INTERVAL_COLORS = [
//   ROOT_NOTE_COLOR,   // Root (1st)
//   THIRD_COLOR,       // 3rd
//   FIFTH_COLOR,       // 5th
//   SEVENTH_COLOR,     // 7th
//   EXTENSION_COLOR,   // 9th, 11th, 13th etc
//   '#22d3ee',         // cyan-400
//   '#fb923c',         // orange-400
// ];

// Hit line position from bottom (where notes "land")
const HIT_LINE_Y_RATIO = 0.88;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Assign a color to a note based on its position in the chord.
 *  When instruments are not active (default mode), use a single uniform color. */
function getNoteColor(_noteIndex: number, _isBass: boolean): string {
  return DEFAULT_NOTE_COLOR;
}

// Note: Instrument voicing logic is now in @/utils/instrumentNoteGeneration.ts
// (single source of truth for both visualization and audio playback)

// ─── Component ───────────────────────────────────────────────────────────────

export const FallingNotesCanvas: React.FC<FallingNotesCanvasProps> = React.memo(({
  chordEvents,
  currentTime,
  isPlaying,
  startMidi,
  endMidi,
  whiteKeyWidth = DEFAULT_WHITE_KEY_WIDTH,
  lookAheadSeconds = 4,
  lookBehindSeconds = 0.5,
  height = 300,
  activeInstruments = [],
  bpm,
  timeSignature,
  onActiveNotesChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(currentTime);
  const dprRef = useRef<number>(1);
  // Track previous active notes to avoid redundant state updates
  const prevActiveKeyRef = useRef<string>('');
  // Stable ref for the render function — avoids restarting the animation loop
  // when data changes (which would cause flickering)
  const renderFrameRef = useRef<((time: number) => void) | null>(null);
  // Smooth playback interpolation: RAF loop interpolates time between the
  // ~4 Hz timeupdate events so notes fall at a steady 60 fps.
  const isPlayingRef = useRef(isPlaying);
  const playbackBaseRef = useRef({ wallTime: 0, audioTime: currentTime });

  // Calculate total width based on white keys
  const totalWidth = useMemo(() => {
    let count = 0;
    for (let m = startMidi; m <= endMidi; m++) {
      if (!isBlackKey(m)) count++;
    }
    return count * whiteKeyWidth;
  }, [startMidi, endMidi, whiteKeyWidth]);

  // Precompute MIDI key position lookup table (O(n) once instead of O(n) per lookup)
  const { midiKeyPositions, whiteKeyXPositions } = useMemo(() => {
    const positions = new Map<number, { x: number; width: number }>();
    const whiteXs: number[] = [];
    const blackKeyWidth = Math.round(whiteKeyWidth * 0.583);

    let whiteCount = 0;
    for (let midi = startMidi; midi <= endMidi; midi++) {
      if (isBlackKey(midi)) {
        const noteIndex = midi % 12;
        const offsets: Record<number, number> = {
          1: -0.35, 3: 0.35, 6: -0.40, 8: 0.0, 10: 0.40,
        };
        const offset = offsets[noteIndex] ?? 0;
        const baseX = whiteCount * whiteKeyWidth - blackKeyWidth / 2;
        const offsetPx = offset * (whiteKeyWidth * 0.3);
        positions.set(midi, { x: baseX + offsetPx, width: blackKeyWidth });
      } else {
        const x = whiteCount * whiteKeyWidth;
        positions.set(midi, { x, width: whiteKeyWidth });
        whiteXs.push(x);
        whiteCount++;
      }
    }

    return { midiKeyPositions: positions, whiteKeyXPositions: whiteXs };
  }, [startMidi, endMidi, whiteKeyWidth]);

  // Check if we have instrument-specific coloring
  const hasInstruments = activeInstruments.length > 0;

  // Merge consecutive same-chord events (audio only plays on chord changes)
  const mergedChordEvents = useMemo(() => {
    return mergeConsecutiveChordEvents(chordEvents);
  }, [chordEvents]);

  // Precompute note positions for default (non-instrument) rendering
  const eventPositions = useMemo(() => {
    return mergedChordEvents.map(event => ({
      ...event,
      notePositions: event.notes.map((note, idx) => ({
        ...note,
        pos: midiKeyPositions.get(note.midi) ?? null,
        color: getNoteColor(idx, idx === 0 && note.octave <= 2),
        intervalIndex: idx,
      })),
    }));
  }, [mergedChordEvents, midiKeyPositions]);

  // Precompute instrument-specific visual notes when instruments are active
  // Uses shared module (single source of truth with audio playback)
  const instrumentVisualNotes = useMemo(() => {
    if (!hasInstruments || chordEvents.length === 0) return [];
    return generateAllInstrumentVisualNotes(
      chordEvents, activeInstruments, midiKeyPositions, bpm, timeSignature,
    );
  }, [chordEvents, hasInstruments, activeInstruments, midiKeyPositions, bpm, timeSignature]);

  // ─── Render Frame ────────────────────────────────────────────────────────

  const renderFrame = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Hit line position
    const hitLineY = h * HIT_LINE_Y_RATIO;

    // Time window
    const windowStart = time - lookBehindSeconds;
    const windowEnd = time + lookAheadSeconds;
    const pixelsPerSecond = hitLineY / lookAheadSeconds;

    // Draw subtle grid lines for white keys (precomputed positions)
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.08)';
    ctx.lineWidth = 0.5;
    for (const x of whiteKeyXPositions) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw hit line (subtle glow)
    const hitGradient = ctx.createLinearGradient(0, hitLineY - 2, 0, hitLineY + 2);
    hitGradient.addColorStop(0, 'rgba(96, 165, 250, 0)');
    hitGradient.addColorStop(0.5, 'rgba(96, 165, 250, 0.5)');
    hitGradient.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = hitGradient;
    ctx.fillRect(0, hitLineY - 2, w, 4);

    // Track active notes for keyboard highlighting
    const activeNotes = new Set<number>();
    const activeColors = new Map<number, string>();

    // roundRect with fallback for older browsers that lack the method
    const safeRoundRect = (
      c: CanvasRenderingContext2D,
      x: number, y: number, w: number, h: number,
      radii: number | number[],
    ) => {
      if (c.roundRect) {
        c.roundRect(x, y, w, h, radii);
      } else {
        c.rect(x, y, w, h);
      }
    };

    // Helper to draw a single note rectangle
    const drawNote = (
      noteX: number, noteW: number, drawTop: number, drawHeight: number,
      noteColor: string, isActive: boolean, opacity: number,
      labelText?: string,
    ) => {
      ctx.globalAlpha = opacity;
      const radius = Math.min(3, drawHeight / 2, noteW / 2);

      if (isActive) {
        ctx.shadowColor = noteColor;
        ctx.shadowBlur = 8;
      }

      ctx.fillStyle = noteColor;
      ctx.beginPath();
      safeRoundRect(ctx, noteX, drawTop, noteW, drawHeight, radius);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Highlight on top edge
      if (drawHeight > 6) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        safeRoundRect(ctx, noteX, drawTop, noteW, Math.min(3, drawHeight * 0.3), [radius, radius, 0, 0]);
        ctx.fill();
      }

      // Label text
      if (labelText && isActive && drawHeight > 14 && noteW > 16) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText.substring(0, 4), noteX + noteW / 2, drawTop + drawHeight / 2);
      }

      ctx.globalAlpha = 1.0;
    };

    // Helper to compute note Y position and opacity
    const computeNoteGeometry = (noteStartTime: number, noteEndTime: number) => {
      const noteTopTime = noteStartTime - time;
      const noteBottomTime = noteEndTime - time;

      const noteTopY = hitLineY - noteTopTime * pixelsPerSecond;
      const noteBottomY = hitLineY - noteBottomTime * pixelsPerSecond;

      const drawTop = Math.max(noteBottomY, 0);
      const drawBottom = Math.min(noteTopY, h);
      if (drawTop >= h || drawBottom <= 0) return null;
      const drawHeight = drawBottom - drawTop;

      let opacity = 1.0;
      if (noteTopTime < -lookBehindSeconds * 0.5) {
        opacity = Math.max(0, 1 + (noteTopTime / lookBehindSeconds));
      } else if (noteTopTime > lookAheadSeconds * 0.8) {
        opacity = Math.max(0.3, 1 - (noteTopTime - lookAheadSeconds * 0.8) / (lookAheadSeconds * 0.2));
      }

      const isActive = noteStartTime <= time && noteEndTime > time;

      return { drawTop, drawHeight, opacity, isActive };
    };

    if (hasInstruments) {
      // ─── Instrument-specific rendering ─────────────────────────────────
      for (const note of instrumentVisualNotes) {
        if (!note.pos) continue;
        if (note.endTime < windowStart || note.startTime > windowEnd) continue;

        const geom = computeNoteGeometry(note.startTime, note.endTime);
        if (!geom) continue;

        const { x, width } = note.pos;
        const noteX = x + 1;
        const noteW = width - 2;

        if (geom.isActive) {
          activeNotes.add(note.midi);
          activeColors.set(note.midi, note.color);
        }

        drawNote(noteX, noteW, geom.drawTop, geom.drawHeight, note.color, geom.isActive, geom.opacity);
      }
    } else {
      // ─── Default interval-based coloring ─────────────────────────────────
      for (const event of eventPositions) {
        if (event.endTime < windowStart || event.startTime > windowEnd) continue;

        for (const noteData of event.notePositions) {
          if (!noteData.pos) continue;

          const geom = computeNoteGeometry(event.startTime, event.endTime);
          if (!geom) continue;

          const { x, width } = noteData.pos;
          const noteX = x + 1;
          const noteW = width - 2;

          if (geom.isActive) {
            activeNotes.add(noteData.midi);
            activeColors.set(noteData.midi, noteData.color);
          }

          const label = noteData.intervalIndex === 0 ? event.chordName : undefined;
          drawNote(noteX, noteW, geom.drawTop, geom.drawHeight, noteData.color, geom.isActive, geom.opacity, label);
        }
      }
    }

    ctx.restore();

    // Only notify parent when active notes actually changed (prevents excessive re-renders)
    const activeKey = [...activeNotes].sort((a, b) => a - b).join(',');
    if (activeKey !== prevActiveKeyRef.current) {
      prevActiveKeyRef.current = activeKey;
      onActiveNotesChange?.(activeNotes, activeColors);
    }
  }, [eventPositions, instrumentVisualNotes, whiteKeyXPositions, lookAheadSeconds, lookBehindSeconds, onActiveNotesChange, hasInstruments]);

  // Keep renderFrameRef in sync with the latest renderFrame callback.
  useEffect(() => {
    renderFrameRef.current = renderFrame;
  }, [renderFrame]);

  // Re-render when data changes (instrument toggles, chord events, etc.)
  // without touching the animation loop.
  useEffect(() => {
    if (!isPlayingRef.current) {
      // Paused — render immediately so the user sees updated visuals.
      renderFrameRef.current?.(lastTimeRef.current);
    }
    // During playback the RAF loop will pick up changes on the next frame
    // automatically because it reads renderFrameRef.current.
  }, [renderFrame]);

  // ─── Sync base time when currentTime changes from parent ─────────────────
  // The browser fires timeupdate at ~4 Hz.  We do NOT restart the RAF loop
  // here — we just update the interpolation anchor so the running loop
  // smoothly catches up.

  useEffect(() => {
    lastTimeRef.current = currentTime;
    playbackBaseRef.current = {
      wallTime: performance.now(),
      audioTime: currentTime,
    };

    // When paused (seeking), render the new position immediately.
    if (!isPlayingRef.current) {
      renderFrameRef.current?.(currentTime);
    }
  }, [currentTime]);

  // ─── Animation Loop ──────────────────────────────────────────────────────
  // Starts / stops ONLY when `isPlaying` toggles.
  // During playback the loop interpolates time at 60 fps using
  // performance.now() so notes fall smoothly between the ~4 Hz
  // timeupdate events from the <audio> element.

  useEffect(() => {
    isPlayingRef.current = isPlaying;

    if (isPlaying) {
      // Anchor interpolation from current known position.
      playbackBaseRef.current = {
        wallTime: performance.now(),
        audioTime: lastTimeRef.current,
      };

      const animate = () => {
        const { wallTime, audioTime } = playbackBaseRef.current;
        const elapsed = (performance.now() - wallTime) / 1000;
        const displayTime = audioTime + elapsed;
        lastTimeRef.current = displayTime;
        renderFrameRef.current?.(displayTime);
        animFrameRef.current = requestAnimationFrame(animate);
      };

      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      // Stopped — render one final frame at the exact current time.
      renderFrameRef.current?.(lastTimeRef.current);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [isPlaying]);

  // ─── Canvas Sizing ───────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    canvas.width = totalWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${height}px`;

    // Render with latest known time after resize
    renderFrameRef.current?.(lastTimeRef.current);
  }, [totalWidth, height]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: totalWidth, height }}
      role="img"
      aria-label="Falling notes piano roll visualization"
    />
  );
});

FallingNotesCanvas.displayName = 'FallingNotesCanvas';

export default FallingNotesCanvas;
