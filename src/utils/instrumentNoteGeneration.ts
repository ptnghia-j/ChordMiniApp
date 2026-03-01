/**
 * Shared Instrument Note Generation Module
 *
 * Single source of truth for instrument-specific note voicing patterns.
 * Used by both:
 *   - FallingNotesCanvas.tsx (visual rendering)
 *   - soundfontChordPlaybackService.ts (audio playback)
 *
 * This ensures falling notes exactly match the audio that is played.
 */

import { noteNameToMidi, NOTE_INDEX_MAP, type ChordEvent, type MidiNote } from '@/utils/chordToMidi';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported instrument names (lowercase) */
export type InstrumentName = 'piano' | 'guitar' | 'violin' | 'flute' | 'bass';

/** A scheduled note with timing and velocity information */
export interface ScheduledNote {
  /** Note name with octave, e.g. "C3", "E5" */
  noteName: string;
  /** MIDI note number (computed from noteName) */
  midi: number;
  /** Start time offset in seconds relative to chord start */
  startOffset: number;
  /** Duration in seconds (from startOffset to end of chord) */
  duration: number;
  /** Velocity multiplier (0-1 scale, 1 = base velocity) */
  velocityMultiplier: number;
  /** Whether this is a bass note (gets velocity boost in audio) */
  isBass: boolean;
}

/** Result of generating notes for a single chord + instrument */
export interface InstrumentChordNotes {
  instrument: InstrumentName;
  chordName: string;
  notes: ScheduledNote[];
}

/** Parameters for note generation */
export interface NoteGenerationParams {
  /** The chord event with notes, timing, etc. */
  chordName: string;
  /** Parsed chord notes from ChordEvent (MidiNote[]) */
  chordNotes: MidiNote[];
  /** Total duration of the chord in seconds */
  duration: number;
  /** Average beat duration in seconds (60 / BPM) */
  beatDuration: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Volume reduction for short chord clusters */
export const CLUSTER_VOLUME_REDUCTION = 0.75;

/** Bass note velocity boost multiplier */
export const BASS_VELOCITY_BOOST = 1.25;

// Chromatic scale for note name resolution
const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Merge consecutive chord events with the same chord name into single events.
 * The audio playback service only triggers on chord changes, so the visualization
 * should mirror that behavior — one visual event per chord change, spanning the
 * full duration until the next change.
 */
export function mergeConsecutiveChordEvents(events: ChordEvent[]): ChordEvent[] {
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
 * Estimate average beat duration from raw chord events.
 */
export function estimateBeatDuration(events: ChordEvent[]): number {
  if (events.length < 2) return 0.5; // fallback
  const totalSpan = events[events.length - 1].endTime - events[0].startTime;
  return totalSpan / events.length;
}

/**
 * Get beat duration from BPM.
 */
export function beatDurationFromBpm(bpm: number): number {
  if (bpm <= 0 || !isFinite(bpm)) return 0.5;
  return 60 / bpm;
}

// ─── Core Note Generation ────────────────────────────────────────────────────

/**
 * Generate scheduled notes for a single instrument playing a single chord.
 *
 * Patterns:
 * - **Piano**: Bass-first (bass note immediate, upper notes after 1 beat delay) for long chords (≥2 beats);
 *              all notes simultaneously for short chords
 * - **Guitar**: Octave-aware arpeggiation with half-beat spacing:
 *   - Short (<2 beats): cluster at octave 3
 *   - Medium (2-3 beats): Root(2)→Fifth(3)→Third(4)
 *   - Long (3-5 beats): +Root(3)
 *   - Very Long (5-7 beats): Root(2)→Fifth(3)→Third(4)→Fifth(4)→Root(4)
 *   - Extra Long (≥7 beats): ascend+descend (9 notes)
 * - **Violin**: Root note only at octave 5 (sustained)
 * - **Flute**: Bass/root note at octave 4 (sustained)
 * - **Bass**: Single low note (E-B → octave 1, C-D# → octave 2)
 */
export function generateNotesForInstrument(
  instrument: InstrumentName,
  params: NoteGenerationParams,
): ScheduledNote[] {
  const { chordNotes, duration, beatDuration } = params;

  // Separate bass (octave 2) from main chord tones (octave 4/5)
  const bassEntry = chordNotes.find(n => n.octave === 2);
  const chordTones = chordNotes.filter(n => n.octave !== 2);
  if (chordTones.length === 0 && instrument !== 'bass') return [];

  const rootName = chordTones.length > 0 ? chordTones[0].noteName : (bassEntry?.noteName ?? 'C');
  const bassName = bassEntry ? bassEntry.noteName : rootName;

  const halfBeatDelay = beatDuration / 2;
  const fullBeatDelay = beatDuration;

  // Duration measured in beats
  const durationInBeats = duration / beatDuration;
  const isLongChord = durationInBeats >= 2;

  switch (instrument) {
    case 'piano':
      return generatePianoNotes(
        chordTones, bassEntry, rootName, bassName,
        duration, fullBeatDelay, isLongChord,
      );

    case 'guitar':
      return generateGuitarNotes(
        chordTones, rootName,
        duration, halfBeatDelay, durationInBeats, isLongChord,
      );

    case 'violin':
      return generateViolinNotes(rootName, duration);

    case 'flute':
      return generateFluteNotes(bassName, duration);

    case 'bass':
      return generateBassNotes(bassName, duration);

    default:
      return [];
  }
}

// ─── Instrument-Specific Generators ──────────────────────────────────────────

function generatePianoNotes(
  chordTones: MidiNote[],
  bassEntry: MidiNote | undefined,
  rootName: string,
  bassName: string,
  duration: number,
  fullBeatDelay: number,
  isLongChord: boolean,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];

  // Bass note MIDI
  const bassNoteName = bassEntry ? `${bassName}2` : `${rootName}3`;
  const bassMidi = noteNameToMidi(bassNoteName);

  if (isLongChord) {
    // ── BASS-FIRST PATTERN ──
    // Bass note plays immediately
    notes.push({
      noteName: bassNoteName,
      midi: bassMidi,
      startOffset: 0,
      duration: duration,
      velocityMultiplier: bassEntry ? BASS_VELOCITY_BOOST : 1.0,
      isBass: !!bassEntry,
    });

    // Upper chord tones at octave 3, delayed by one full beat
    for (const tone of chordTones) {
      const name = `${tone.noteName}3`;
      const midi = noteNameToMidi(name);
      if (midi === bassMidi) continue; // skip duplicate
      notes.push({
        noteName: name,
        midi,
        startOffset: fullBeatDelay,
        duration: duration - fullBeatDelay,
        velocityMultiplier: 1.0,
        isBass: false,
      });
    }
  } else {
    // ── CLUSTER PATTERN (short chords) ──
    // Bass note
    notes.push({
      noteName: bassNoteName,
      midi: bassMidi,
      startOffset: 0,
      duration: duration,
      velocityMultiplier: bassEntry ? BASS_VELOCITY_BOOST * CLUSTER_VOLUME_REDUCTION : CLUSTER_VOLUME_REDUCTION,
      isBass: !!bassEntry,
    });

    // All chord tones simultaneously
    for (const tone of chordTones) {
      const name = `${tone.noteName}3`;
      const midi = noteNameToMidi(name);
      if (midi === bassMidi) continue;
      notes.push({
        noteName: name,
        midi,
        startOffset: 0,
        duration: duration,
        velocityMultiplier: CLUSTER_VOLUME_REDUCTION,
        isBass: false,
      });
    }
  }

  return notes;
}

function generateGuitarNotes(
  chordTones: MidiNote[],
  _rootName: string,
  duration: number,
  halfBeatDelay: number,
  durationInBeats: number,
  isLongChord: boolean,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];

  if (isLongChord && chordTones.length >= 2) {
    // ── ARPEGGIATION ──
    const rootIdx = 0;
    const thirdIdx = chordTones.length >= 2 ? 1 : 0;
    const fifthIdx = chordTones.length >= 3 ? 2 : (chordTones.length >= 2 ? 1 : 0);

    const noteAtOctave = (idx: number, oct: number) => ({
      noteName: chordTones[idx].noteName,
      oct,
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

    for (let i = 0; i < arpPattern.length; i++) {
      const { noteName, oct } = arpPattern[i];
      const fullName = `${noteName}${oct}`;
      const midi = noteNameToMidi(fullName);
      const startOffset = i * halfBeatDelay;
      notes.push({
        noteName: fullName,
        midi,
        startOffset,
        duration: duration - startOffset,
        velocityMultiplier: oct === 2 ? BASS_VELOCITY_BOOST : 1.0,
        isBass: oct === 2,
      });
    }
  } else {
    // ── CLUSTER (short chords) ──
    for (const tone of chordTones) {
      const name = `${tone.noteName}3`;
      const midi = noteNameToMidi(name);
      notes.push({
        noteName: name,
        midi,
        startOffset: 0,
        duration: duration,
        velocityMultiplier: CLUSTER_VOLUME_REDUCTION,
        isBass: false,
      });
    }
  }

  return notes;
}

function generateViolinNotes(
  rootName: string,
  duration: number,
): ScheduledNote[] {
  const name = `${rootName}5`;
  const midi = noteNameToMidi(name);
  return [{
    noteName: name,
    midi,
    startOffset: 0,
    duration,
    velocityMultiplier: 1.0,
    isBass: false,
  }];
}

function generateFluteNotes(
  bassName: string,
  duration: number,
): ScheduledNote[] {
  const name = `${bassName}4`;
  const midi = noteNameToMidi(name);
  return [{
    noteName: name,
    midi,
    startOffset: 0,
    duration,
    velocityMultiplier: 1.0,
    isBass: false,
  }];
}

function generateBassNotes(
  bassName: string,
  duration: number,
): ScheduledNote[] {
  // E-B → octave 1, C-D# → octave 2
  const noteIdx = NOTE_INDEX_MAP[bassName];
  const octave = (noteIdx !== undefined && noteIdx > 3) ? 1 : 2; // D# index is 3; E=4 and above → oct 1
  const canonical = noteIdx !== undefined ? CHROMATIC_SCALE[noteIdx] : bassName;
  const name = `${canonical}${octave}`;
  const midi = noteNameToMidi(name);
  return [{
    noteName: name,
    midi,
    startOffset: 0,
    duration,
    velocityMultiplier: 1.0,
    isBass: true,
  }];
}

// ─── Batch Generation for Visualization ──────────────────────────────────────

/** Active instrument descriptor (matches existing interface in FallingNotesCanvas) */
export interface ActiveInstrument {
  name: string;
  color: string;
}

/** A visual note with position information for canvas rendering */
export interface VisualNote {
  midi: number;
  startTime: number;
  endTime: number;
  color: string;
  chordName: string;
  pos: { x: number; width: number } | null;
}

/**
 * Generate visual notes for all instruments across all chord events.
 * This is the visualization entry point — it produces VisualNote[] from
 * ChordEvent[] + ActiveInstrument[].
 */
export function generateAllInstrumentVisualNotes(
  events: ChordEvent[],
  instruments: ActiveInstrument[],
  posLookup: Map<number, { x: number; width: number }>,
): VisualNote[] {
  const notes: VisualNote[] = [];

  // Merge consecutive beats with same chord — audio only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);

  // Estimate average beat duration from the raw events for timing calculations
  const avgBeatDuration = estimateBeatDuration(events);

  for (const event of merged) {
    const { chordName, notes: chordNotes, startTime, endTime } = event;
    const duration = endTime - startTime;

    for (const inst of instruments) {
      const instrumentName = inst.name.toLowerCase() as InstrumentName;
      const color = inst.color;

      const scheduled = generateNotesForInstrument(instrumentName, {
        chordName,
        chordNotes,
        duration,
        beatDuration: avgBeatDuration,
      });

      for (const sn of scheduled) {
        notes.push({
          midi: sn.midi,
          startTime: startTime + sn.startOffset,
          endTime: endTime,
          color,
          chordName,
          pos: posLookup.get(sn.midi) ?? null,
        });
      }
    }
  }

  return notes;
}
