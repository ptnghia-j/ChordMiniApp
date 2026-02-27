'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { ChordEvent, isBlackKey, noteNameToMidi, NOTE_INDEX_MAP } from '@/utils/chordToMidi';

// ─── Types ───────────────────────────────────────────────────────────────────

/** An active instrument with name and display color */
export interface ActiveInstrument {
  name: string;
  color: string;
}

/** A visual note generated for instrument-specific rendering */
interface VisualNote {
  midi: number;
  startTime: number;
  endTime: number;
  color: string;
  chordName: string;
  pos: { x: number; width: number } | null;
}

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

// ─── Instrument Voicing Generator ────────────────────────────────────────────

/**
 * Merge consecutive chord events with the same chord name into single events.
 * The audio playback service only triggers on chord changes, so the visualization
 * should mirror that behavior — one visual event per chord change, spanning the
 * full duration until the next change.
 */
function mergeConsecutiveChordEvents(events: ChordEvent[]): ChordEvent[] {
  if (events.length === 0) return [];

  const merged: ChordEvent[] = [];
  let current = { ...events[0] };

  for (let i = 1; i < events.length; i++) {
    if (events[i].chordName === current.chordName) {
      // Same chord — extend endTime
      current.endTime = events[i].endTime;
    } else {
      // Chord changed — push previous and start new
      merged.push(current);
      current = { ...events[i] };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Generates instrument-specific visual notes from chord events,
 * replicating the exact voicing/timing patterns from soundfontChordPlaybackService.
 *
 * Key behaviors matched from the audio service:
 * - Only generates notes on chord CHANGES (not every beat)
 * - Piano: Bass-first pattern (bass note first, upper notes after one beat delay)
 *          for long chords (≥2 beats); cluster for short chords
 * - Guitar: Octave-aware arpeggiation with half-beat spacing
 *           Short (<2 beats): cluster; Medium (2-3): 3 notes;
 *           Long (3-5): 4 notes; Very Long (5-7): 5 notes; Extra Long (≥7): 9 notes
 * - Violin (octave 5): Root note only (sustained)
 * - Flute (octave 4): Bass/root note only (sustained)
 * - Bass (octave 1-2): Single low note (E-B → oct 1, C-D# → oct 2)
 */
function generateInstrumentVisualNotes(
  events: ChordEvent[],
  instruments: ActiveInstrument[],
  posLookup: Map<number, { x: number; width: number }>,
): VisualNote[] {
  const notes: VisualNote[] = [];

  // Merge consecutive beats with same chord — audio only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);

  // Estimate average beat duration from the raw events for timing calculations
  let avgBeatDuration = 0.5; // fallback
  if (events.length >= 2) {
    const totalSpan = events[events.length - 1].endTime - events[0].startTime;
    avgBeatDuration = totalSpan / events.length;
  }
  const halfBeatDelay = avgBeatDuration / 2;
  const fullBeatDelay = avgBeatDuration;

  for (const event of merged) {
    const { chordName, notes: chordNotes, startTime, endTime } = event;
    const duration = endTime - startTime;

    // Duration measured in beats
    const durationInBeats = duration / avgBeatDuration;
    const isLongChord = durationInBeats >= 2;

    // Separate bass (octave 2) from main chord tones (octave 4/5)
    const bassEntry = chordNotes.find(n => n.octave === 2);
    const chordTones = chordNotes.filter(n => n.octave !== 2);
    if (chordTones.length === 0) continue;

    const rootName = chordTones[0].noteName;
    const bassName = bassEntry ? bassEntry.noteName : rootName;

    for (const inst of instruments) {
      const name = inst.name.toLowerCase();
      const color = inst.color;

      switch (name) {
        case 'piano': {
          if (isLongChord) {
            // ── PIANO BASS-FIRST PATTERN (matches soundfontChordPlaybackService) ──
            // Bass note plays immediately
            const bassMidi = bassEntry
              ? noteNameToMidi(`${bassName}2`)
              : noteNameToMidi(`${rootName}3`);
            notes.push({
              midi: bassMidi, startTime, endTime, color, chordName,
              pos: posLookup.get(bassMidi) ?? null,
            });

            // Upper chord tones at octave 3, delayed by one full beat
            const upperStartTime = startTime + fullBeatDelay;
            for (const tone of chordTones) {
              const midi = noteNameToMidi(`${tone.noteName}3`);
              if (midi === bassMidi) continue;
              notes.push({
                midi, startTime: upperStartTime, endTime, color, chordName,
                pos: posLookup.get(midi) ?? null,
              });
            }
          } else {
            // ── PIANO CLUSTER (short chords, <2 beats) ──
            // All notes play simultaneously at octave 3
            const bassMidi = bassEntry
              ? noteNameToMidi(`${bassName}2`)
              : noteNameToMidi(`${rootName}3`);
            notes.push({
              midi: bassMidi, startTime, endTime, color, chordName,
              pos: posLookup.get(bassMidi) ?? null,
            });
            for (const tone of chordTones) {
              const midi = noteNameToMidi(`${tone.noteName}3`);
              if (midi === bassMidi) continue;
              notes.push({
                midi, startTime, endTime, color, chordName,
                pos: posLookup.get(midi) ?? null,
              });
            }
          }
          break;
        }
        case 'guitar': {
          if (isLongChord && chordTones.length >= 2) {
            // ── GUITAR ARPEGGIATION (matches soundfontChordPlaybackService) ──
            // Octave-aware patterns based on duration in beats
            const rootIdx = 0;
            const thirdIdx = chordTones.length >= 2 ? 1 : 0;
            const fifthIdx = chordTones.length >= 3 ? 2 : (chordTones.length >= 2 ? 1 : 0);

            // Helper to create a note name at a target octave
            const noteAtOctave = (idx: number, oct: number) => ({
              noteName: chordTones[idx].noteName, oct,
            });

            let arpPattern: Array<{ noteName: string; oct: number }>;

            if (durationInBeats < 3) {
              // MEDIUM (2-3 beats): Root(2) → Fifth(3) → Third(4)
              arpPattern = [
                noteAtOctave(rootIdx, 2),
                noteAtOctave(fifthIdx, 3),
                noteAtOctave(thirdIdx, 4),
              ];
            } else if (durationInBeats < 5) {
              // LONG (3-5 beats): Root(2) → Fifth(3) → Third(4) → Root(3)
              arpPattern = [
                noteAtOctave(rootIdx, 2),
                noteAtOctave(fifthIdx, 3),
                noteAtOctave(thirdIdx, 4),
                noteAtOctave(rootIdx, 3),
              ];
            } else if (durationInBeats < 7) {
              // VERY LONG (5-7 beats): Root(2) → Fifth(3) → Third(4) → Fifth(4) → Root(4)
              arpPattern = [
                noteAtOctave(rootIdx, 2),
                noteAtOctave(fifthIdx, 3),
                noteAtOctave(thirdIdx, 4),
                noteAtOctave(fifthIdx, 4),
                noteAtOctave(rootIdx, 4),
              ];
            } else {
              // EXTRA LONG (≥7 beats): Ascend then descend
              arpPattern = [
                noteAtOctave(rootIdx, 2),
                noteAtOctave(fifthIdx, 3),
                noteAtOctave(thirdIdx, 4),
                noteAtOctave(fifthIdx, 4),
                noteAtOctave(rootIdx, 4),
                noteAtOctave(fifthIdx, 4),
                noteAtOctave(thirdIdx, 4),
                noteAtOctave(rootIdx, 3),
                noteAtOctave(rootIdx, 2),
              ];
            }

            // Each arp note is spaced by half a beat
            for (let i = 0; i < arpPattern.length; i++) {
              const { noteName, oct } = arpPattern[i];
              const midi = noteNameToMidi(`${noteName}${oct}`);
              const noteStart = startTime + i * halfBeatDelay;
              notes.push({
                midi, startTime: noteStart, endTime, color, chordName,
                pos: posLookup.get(midi) ?? null,
              });
            }
          } else {
            // ── GUITAR CLUSTER (short chords, <2 beats) ──
            // All chord tones at octave 3 simultaneously
            for (const tone of chordTones) {
              const midi = noteNameToMidi(`${tone.noteName}3`);
              notes.push({
                midi, startTime, endTime, color, chordName,
                pos: posLookup.get(midi) ?? null,
              });
            }
          }
          break;
        }
        case 'violin': {
          // Root note at octave 5 (sustained)
          const midi = noteNameToMidi(`${rootName}5`);
          notes.push({
            midi, startTime, endTime, color, chordName,
            pos: posLookup.get(midi) ?? null,
          });
          break;
        }
        case 'flute': {
          // Bass/root at octave 4 (sustained)
          const midi = noteNameToMidi(`${bassName}4`);
          notes.push({
            midi, startTime, endTime, color, chordName,
            pos: posLookup.get(midi) ?? null,
          });
          break;
        }
        case 'bass': {
          // Single low note: E-B → octave 1, C-D# → octave 2
          // Matches: bassIdx > NOTE_INDEX_MAP['D#'] (i.e., > 3) → octave 1
          const noteIdx = NOTE_INDEX_MAP[bassName];
          const octave = (noteIdx !== undefined && noteIdx > 3) ? 1 : 2;
          const midi = noteNameToMidi(`${bassName}${octave}`);
          notes.push({
            midi, startTime, endTime, color, chordName,
            pos: posLookup.get(midi) ?? null,
          });
          break;
        }
      }
    }
  }

  return notes;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const FallingNotesCanvas: React.FC<FallingNotesCanvasProps> = ({
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
  onActiveNotesChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(currentTime);
  const dprRef = useRef<number>(1);
  // Track previous active notes to avoid redundant state updates
  const prevActiveKeyRef = useRef<string>('');

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
  const instrumentVisualNotes = useMemo(() => {
    if (!hasInstruments || chordEvents.length === 0) return [];
    return generateInstrumentVisualNotes(
      chordEvents, activeInstruments, midiKeyPositions,
    );
  }, [chordEvents, hasInstruments, activeInstruments, midiKeyPositions]);

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
      ctx.roundRect(noteX, drawTop, noteW, drawHeight, radius);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Highlight on top edge
      if (drawHeight > 6) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.roundRect(noteX, drawTop, noteW, Math.min(3, drawHeight * 0.3), [radius, radius, 0, 0]);
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

  // ─── Animation Loop ──────────────────────────────────────────────────────

  useEffect(() => {
    lastTimeRef.current = currentTime;

    const render = () => {
      renderFrame(lastTimeRef.current);
      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    // Always render at least once when currentTime changes
    renderFrame(currentTime);

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(render);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [currentTime, isPlaying, renderFrame]);

  // Update time ref when currentTime changes (for animation loop to read latest)
  useEffect(() => {
    lastTimeRef.current = currentTime;
  }, [currentTime]);

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

    // Initial render
    renderFrame(currentTime);
  }, [totalWidth, height, renderFrame, currentTime]);

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{ width: totalWidth, height }}
      role="img"
      aria-label="Falling notes piano roll visualization"
    />
  );
};

export default FallingNotesCanvas;
