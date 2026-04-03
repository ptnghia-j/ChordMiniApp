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

import {
  noteNameToMidi,
  NOTE_INDEX_MAP,
  isNoChordChordName,
  type ChordEvent,
  type MidiNote,
} from '@/utils/chordToMidi';
import type { SegmentationResult, SongSegment } from '@/types/chatbotTypes';
import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import {
  buildGuitarStrumPattern,
  resolveGuitarVoicingMidiNotes,
  type GuitarVoicingSelection,
} from '@/utils/guitarVoicing';
import { getInstrumentVisualSustainTailSeconds } from '@/services/chord-playback/instrumentEnvelopeConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported instrument names (lowercase) */
export type InstrumentName = 'piano' | 'guitar' | 'violin' | 'melodyViolin' | 'flute' | 'saxophone' | 'bass';

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

export interface PlaybackAdjustmentOptions {
  instrumentName: InstrumentName;
  elapsedInChord?: number;
  latePianoOnsetGraceSeconds?: number;
  latePianoMinAudibleSeconds?: number;
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
  /** Absolute start time of this chord/event in the song timeline */
  startTime?: number;
  /** Time signature (beats per measure, e.g. 3 for 3/4, default 4) */
  timeSignature?: number;
  /** Optional song segmentation for section-aware pattern shaping */
  segmentationData?: SegmentationResult | null;
  /** Optional signal-derived intensity snapshot for this chord window */
  signalDynamics?: ChordSignalDynamics | null;
  /** Shared guitar diagram/capo selection to keep playback aligned with diagrams */
  guitarVoicing?: Partial<GuitarVoicingSelection>;
  /** Enharmonic target key used when resolving capo-transposed shape names */
  targetKey?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PIANO_SHORT_BLOCK_CHORD_VOLUME_REDUCTION = 0.92;

/** Bass note velocity boost multiplier */
export const BASS_VELOCITY_BOOST = 1.25;

/** Minimum chord length (in beats) required for the piano repeating rhythm pattern */
export const PIANO_PATTERN_MIN_BEATS = 4;

/** Small epsilon for floating-point comparisons in timing math */
const TIMING_EPSILON = 1e-6;

// Chromatic scale for note name resolution
const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const PIANO_ARPEGGIO_PATTERNS_COMMON: ReadonlyArray<readonly number[]> = [
  [0, 1, 2, 1],
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 1, 3, 2],
  [0, 2, 3, 1],
];

const PIANO_ARPEGGIO_PATTERNS_WALTZ: ReadonlyArray<readonly number[]> = [
  [0, 1, 2],
  [0, 2, 1],
  [0, 1, 3],
  [0, 2, 3],
];

const PIANO_ARPEGGIO_PATTERNS_SPARSE: ReadonlyArray<readonly number[]> = [
  [0, 2],
  [0, 3],
  [0, 2, 1],
];

const PIANO_INITIAL_FIFTH_BRIDGE_THRESHOLD = 0.55;
export const DEFAULT_LATE_PIANO_ONSET_GRACE_SECONDS = 0.18;
export const DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS = 0.12;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mix(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp01(amount);
}

function easeInOutSineCurve(value: number): number {
  const clamped = clamp01(value);
  return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
}

function resolveQuietness(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.28;
  return signalDynamics.quietness ?? (signalDynamics.intensityBand === 'quiet' ? 1 : 0);
}

function resolveFullness(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.45;
  return signalDynamics.fullness ?? (signalDynamics.intensityBand === 'loud' ? 1 : signalDynamics.intensityBand === 'medium' ? 0.5 : 0);
}

function resolveMotion(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.4;
  return signalDynamics.motion ?? clamp01(signalDynamics.spectralFlux * 0.6 + signalDynamics.onsetStrength * 0.4);
}

function resolveAttack(signalDynamics?: ChordSignalDynamics | null): number {
  if (!signalDynamics) return 0.32;
  return signalDynamics.attack ?? clamp01(signalDynamics.onsetStrength);
}

function separateRepeatedUpperPianoNotes(
  notes: ScheduledNote[],
  stepDuration: number,
): ScheduledNote[] {
  const repeatedGap = Math.max(0.02, Math.min(0.045, stepDuration * 0.12));
  const minimumVisibleDuration = Math.max(0.04, Math.min(0.09, stepDuration * 0.32));
  const nextStartByIndex = new Map<number, number>();
  const noteIndexesByMidi = new Map<number, number[]>();

  notes.forEach((note, index) => {
    if (note.isBass) return;
    const indexes = noteIndexesByMidi.get(note.midi) ?? [];
    indexes.push(index);
    noteIndexesByMidi.set(note.midi, indexes);
  });

  noteIndexesByMidi.forEach((indexes) => {
    for (let index = 0; index < indexes.length - 1; index += 1) {
      const currentIndex = indexes[index];
      const nextIndex = indexes[index + 1];
      const nextStart = notes[nextIndex]?.startOffset;
      if (currentIndex === undefined || nextStart === undefined) continue;
      nextStartByIndex.set(currentIndex, nextStart);
    }
  });

  return notes.map((note, index) => {
    const nextStart = nextStartByIndex.get(index);
    if (nextStart === undefined) {
      return note;
    }

    const desiredEnd = nextStart - repeatedGap;
    const minimumEnd = note.startOffset + minimumVisibleDuration;
    const trimmedEnd = Math.max(minimumEnd, desiredEnd);
    const trimmedDuration = Math.min(note.duration, trimmedEnd - note.startOffset);

    if (trimmedDuration >= note.duration || trimmedDuration <= 0) {
      return note;
    }

    return {
      ...note,
      duration: trimmedDuration,
    };
  });
}

export function adjustScheduledNotesForPlayback(
  scheduledNotes: ScheduledNote[],
  options: PlaybackAdjustmentOptions,
): ScheduledNote[] {
  const {
    instrumentName,
    elapsedInChord = 0,
    latePianoOnsetGraceSeconds = DEFAULT_LATE_PIANO_ONSET_GRACE_SECONDS,
    latePianoMinAudibleSeconds = DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
  } = options;

  return scheduledNotes
    .map((scheduledNote) => {
      const originalEndOffset = scheduledNote.startOffset + scheduledNote.duration;
      const shouldRecoverLatePianoOnset = instrumentName === 'piano'
        && scheduledNote.startOffset <= 0.0001
        && elapsedInChord > 0
        && elapsedInChord <= latePianoOnsetGraceSeconds;

      if (originalEndOffset <= elapsedInChord) {
        if (shouldRecoverLatePianoOnset) {
          return {
            ...scheduledNote,
            startOffset: 0,
            duration: Math.min(
              scheduledNote.duration,
              Math.max(
                latePianoMinAudibleSeconds,
                scheduledNote.duration * 0.75,
              ),
            ),
          } satisfies ScheduledNote;
        }
        return null;
      }

      const adjustedStartOffset = Math.max(0, scheduledNote.startOffset - elapsedInChord);
      const adjustedDuration = originalEndOffset - Math.max(elapsedInChord, scheduledNote.startOffset);
      const shouldClampLatePianoOnset = shouldRecoverLatePianoOnset
        && adjustedStartOffset <= 0.0001
        && adjustedDuration < latePianoMinAudibleSeconds;

      if (adjustedDuration <= 0) {
        if (shouldRecoverLatePianoOnset) {
          return {
            ...scheduledNote,
            startOffset: 0,
            duration: Math.min(
              scheduledNote.duration,
              Math.max(
                latePianoMinAudibleSeconds,
                scheduledNote.duration * 0.75,
              ),
            ),
          } satisfies ScheduledNote;
        }
        return null;
      }

      if (shouldClampLatePianoOnset) {
        return {
          ...scheduledNote,
          startOffset: 0,
          duration: Math.min(
            scheduledNote.duration,
            Math.max(
              latePianoMinAudibleSeconds,
              scheduledNote.duration * 0.75,
            ),
          ),
        } satisfies ScheduledNote;
      }

      return {
        ...scheduledNote,
        startOffset: adjustedStartOffset,
        duration: adjustedDuration,
      } satisfies ScheduledNote;
    })
    .filter((scheduledNote): scheduledNote is ScheduledNote => scheduledNote !== null);
}

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
  let current: ChordEvent = {
    ...events[0],
    beatCount: events[0].beatCount ?? 1,
  };

  for (let i = 1; i < events.length; i++) {
    const isContiguous = Math.abs(events[i].startTime - current.endTime) <= TIMING_EPSILON;
    if (events[i].chordName === current.chordName && isContiguous) {
      // Same chord — extend endTime
      current.endTime = events[i].endTime;
      current.beatCount = (current.beatCount ?? 1) + (events[i].beatCount ?? 1);
    } else {
      // Chord changed — push previous and start new
      merged.push(current);
      current = {
        ...events[i],
        beatCount: events[i].beatCount ?? 1,
      };
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

function hashPatternSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getActiveSegmentationSegmentForTime(
  segmentationData: SegmentationResult | null | undefined,
  timeInSeconds: number,
): SongSegment | null {
  if (!segmentationData?.segments?.length) {
    return null;
  }

  const segments = segmentationData.segments;
  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const segment = segments[mid];

    if (timeInSeconds < segment.startTime) {
      hi = mid - 1;
    } else if (timeInSeconds >= segment.endTime) {
      lo = mid + 1;
    } else {
      return segment;
    }
  }

  return null;
}

function isSparsePianoSegment(segment: SongSegment | null): boolean {
  if (!segment) {
    return false;
  }

  const descriptor = `${segment.label || ''} ${segment.type || ''}`.trim().toLowerCase();
  return descriptor.includes('intro') || descriptor.includes('outro');
}

// ─── Core Note Generation ────────────────────────────────────────────────────

/**
 * Generate scheduled notes for a single instrument playing a single chord.
 *
 * Patterns:
 * - **Piano**: For chords lasting at least one pattern unit, repeat an arpeggio for the
 *              full chord duration; shorter chords play the full chord once, voiced in
 *              octaves 3 and 4
 * - **Guitar**: Octave-aware arpeggiation with half-beat spacing:
 *   - Short (<2 beats): cluster at octave 3
 *   - Medium (2-3 beats): Root(2)→Fifth(3)→Third(4)
 *   - Long (3-5 beats): +Root(3)
 *   - Very Long (5-7 beats): Root(2)→Fifth(3)→Third(4)→Fifth(4)→Root(4)
 *   - Extra Long (≥7 beats): ascend+descend (9 notes)
 * - **Violin**: Root note only at octave 6 (sustained)
 * - **Melody Violin**: Audio-only lane reserved for Sheet Sage melodic playback
 * - **Flute**: Short chords sustain the bass/3rd at octave 5; long chords (≥4 beats)
 *              switch to the 5th at octave 5 with a syncopated re-attack
 * - **Saxophone**: Reserved for melodic transcription playback, not chord-pattern generation
 * - **Bass**: Single low note (E-B → octave 1, C-D# → octave 2)
 */
export function generateNotesForInstrument(
  instrument: InstrumentName,
  params: NoteGenerationParams,
): ScheduledNote[] {
  const {
    chordName,
    chordNotes,
    duration,
    beatDuration,
    startTime,
    segmentationData,
    signalDynamics,
    timeSignature = 4,
    guitarVoicing,
    targetKey,
  } = params;

  if (isNoChordChordName(chordName) || chordNotes.length === 0) {
    return [];
  }

  // Separate bass (octave 2) from main chord tones (octave 4/5)
  const bassEntry = chordNotes.find(n => n.octave === 2);
  const chordTones = chordNotes.filter(n => n.octave !== 2);
  if (chordTones.length === 0 && instrument !== 'bass') return [];

  const rootName = chordTones.length > 0 ? chordTones[0].noteName : (bassEntry?.noteName ?? 'C');
  const bassName = bassEntry ? bassEntry.noteName : rootName;

  const fullBeatDelay = beatDuration;

  // Duration measured in beats
  const durationInBeats = duration / beatDuration;
  const isLongChord = durationInBeats >= 2;

  switch (instrument) {
    case 'piano':
      return generatePianoNotes(
        chordTones, bassEntry, chordName, rootName, bassName,
        duration,
        fullBeatDelay,
        durationInBeats,
        isLongChord,
        startTime,
        timeSignature,
        segmentationData,
        signalDynamics,
      );

    case 'guitar':
      return generateGuitarNotes(
        chordName,
        chordTones,
        duration,
        beatDuration,
        timeSignature,
        signalDynamics,
        guitarVoicing,
        targetKey,
      );

    case 'violin':
    case 'melodyViolin':
      return generateViolinNotes(rootName, duration);

    case 'flute':
      return generateFluteNotes(rootName, bassName, chordTones, duration, fullBeatDelay, durationInBeats);

    case 'saxophone':
      return [];

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
  chordName: string,
  rootName: string,
  bassName: string,
  duration: number,
  fullBeatDelay: number,
  durationInBeats: number,
  isLongChord: boolean,
  startTime?: number,
  timeSignature: number = 4,
  segmentationData?: SegmentationResult | null,
  signalDynamics?: ChordSignalDynamics | null,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  // For compound time (6/8), the repeating pattern unit is 3 beats (one compound beat group),
  // not the full 6-beat measure. This lets chords spanning a half-measure (3 beats)
  // still get the waltz "oom-pah-pah" feel — matching the 3/4 strategy.
  const isCompoundTime = timeSignature === 6;
  const patternBeats = isCompoundTime ? 3 : timeSignature;
  const chordStartTime = startTime ?? 0;

  // Bass note MIDI (raised to octave 3)
  const bassNoteName = `${bassEntry ? bassName : rootName}3`;
  const bassMidi = noteNameToMidi(bassNoteName);
  const lowBassNoteName = `${bassEntry ? bassName : rootName}2`;
  const lowBassMidi = noteNameToMidi(lowBassNoteName);

  const useRepeatingPattern = isLongChord && durationInBeats >= patternBeats;
  const patternSeed = hashPatternSeed(`${chordName}:${chordStartTime.toFixed(3)}:${timeSignature}:${duration.toFixed(3)}`);

  const clampDuration = (startOffset: number, requestedDuration: number) => {
    const remaining = duration - startOffset;
    return Math.max(0, Math.min(requestedDuration, remaining));
  };

  const quietness = resolveQuietness(signalDynamics);
  const fullness = resolveFullness(signalDynamics);
  const motion = resolveMotion(signalDynamics);
  const attack = resolveAttack(signalDynamics);
  const bassOctaveBlend = clamp01(fullness * 0.78 + attack * 0.22);
  const shouldAddBassOctave = lowBassMidi >= 21 && bassOctaveBlend >= 0.66;

  const pushBassFoundation = (
    startOffset: number,
    noteDuration: number,
    volumeReduction: number,
    addOctaveBelow: boolean = false,
  ) => {
    if (addOctaveBelow) {
      notes.push({
        noteName: lowBassNoteName,
        midi: lowBassMidi,
        startOffset,
        duration: noteDuration,
        velocityMultiplier: (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * volumeReduction * mix(0.82, 0.98, bassOctaveBlend),
        isBass: true,
      });
    }

    notes.push({
      noteName: bassNoteName,
      midi: bassMidi,
      startOffset,
      duration: noteDuration,
      velocityMultiplier: (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * volumeReduction,
      isBass: !!bassEntry,
    });
  };

  const pushSingleChord = (
    startOffset: number,
    noteDuration: number,
    volumeReduction: number,
    options: {
      skipFifth?: boolean;
      dropUpperExtensions?: boolean;
      fifthVelocityScale?: number;
      upperVelocityScale?: number;
      addBassOctaveBelow?: boolean;
    } = {},
  ) => {
    pushBassFoundation(startOffset, noteDuration, volumeReduction, options.addBassOctaveBelow ?? false);

    for (let toneIdx = 0; toneIdx < chordTones.length; toneIdx++) {
      // Skip the 5th (index 2) when requested — differentiates piano from guitar
      if (options.skipFifth && toneIdx === 2) continue;
      if (options.dropUpperExtensions && toneIdx >= 3) continue;
      const tone = chordTones[toneIdx];
      const name = `${tone.noteName}4`;
      const midi = noteNameToMidi(name);
      if (midi === bassMidi) continue;
      const toneVelocityScale = toneIdx === 2
        ? (options.fifthVelocityScale ?? 1)
        : toneIdx >= 3
          ? (options.upperVelocityScale ?? 1)
          : 1;
      notes.push({
        noteName: name,
        midi,
        startOffset,
        duration: noteDuration,
        velocityMultiplier: volumeReduction * toneVelocityScale,
        isBass: false,
      });
    }
  };

  const pushUpperChordAttack = (
    startOffset: number,
    noteDuration: number,
    volumeReduction: number,
    options: {
      skipFifth?: boolean;
      dropUpperExtensions?: boolean;
      fifthVelocityScale?: number;
      upperVelocityScale?: number;
    } = {},
  ) => {
    for (let toneIdx = 0; toneIdx < chordTones.length; toneIdx++) {
      if (options.skipFifth && toneIdx === 2) continue;
      if (options.dropUpperExtensions && toneIdx >= 3) continue;
      const tone = chordTones[toneIdx];
      const name = `${tone.noteName}4`;
      const midi = noteNameToMidi(name);
      if (midi === bassMidi) continue;
      const toneVelocityScale = toneIdx === 2
        ? (options.fifthVelocityScale ?? 1)
        : toneIdx >= 3
          ? (options.upperVelocityScale ?? 1)
          : 1;
      notes.push({
        noteName: name,
        midi,
        startOffset,
        duration: noteDuration,
        velocityMultiplier: volumeReduction * toneVelocityScale,
        isBass: false,
      });
    }
  };

  if (!useRepeatingPattern) {
    const shortChordVolume = mix(0.8, 1.0, easeInOutSineCurve(fullness));
    pushSingleChord(
      0,
      duration,
      mix(PIANO_SHORT_BLOCK_CHORD_VOLUME_REDUCTION, shortChordVolume, 0.72),
      {
        skipFifth: quietness > 0.84 && fullness < 0.32,
        dropUpperExtensions: quietness > 0.58 && fullness < 0.46,
        fifthVelocityScale: mix(0.46, 1.0, easeInOutSineCurve(fullness + (1 - quietness) * 0.35)),
        upperVelocityScale: mix(0.58, 1.06, easeInOutSineCurve(fullness * 0.75 + motion * 0.25)),
        addBassOctaveBelow: shouldAddBassOctave,
      },
    );
    return notes;
  }

  const isWaltz = timeSignature === 3 || isCompoundTime;
  const activeSegment = getActiveSegmentationSegmentForTime(segmentationData, chordStartTime);
  const segmentSparseLift = isSparsePianoSegment(activeSegment) ? 0.56 : 0;
  const sparseBlend = clamp01(Math.max(segmentSparseLift, quietness * 0.9 - fullness * 0.2));
  const fullAttackBlend = clamp01(fullness * 0.7 + attack * 0.3);
  const shouldUseSparsePattern = sparseBlend > 0.76;
  const upperVoicing = chordTones.map((tone, index) => ({
    noteName: `${tone.noteName}${index >= 3 ? 5 : 4}`,
    midi: noteNameToMidi(`${tone.noteName}${index >= 3 ? 5 : 4}`),
    velocity: (0.82 + index * 0.05) * mix(0.76, 1.06, fullness * 0.72 + motion * 0.28),
  }));

  const bridgeTone = chordTones.length >= 3
    ? chordTones[2]
    : (chordTones.length >= 2 ? chordTones[chordTones.length - 1] : null);
  const useInitialFifthBridge = Boolean(
    bridgeTone
    && upperVoicing.length >= 2
    && (patternSeed % 1000) / 1000 < PIANO_INITIAL_FIFTH_BRIDGE_THRESHOLD
  );
  const bridgeVoicing = bridgeTone ? {
    noteName: `${bridgeTone.noteName}3`,
    midi: noteNameToMidi(`${bridgeTone.noteName}3`),
    velocity: 0.9,
  } : null;

  const patternLibrary = shouldUseSparsePattern
    ? PIANO_ARPEGGIO_PATTERNS_SPARSE
    : (isWaltz ? PIANO_ARPEGGIO_PATTERNS_WALTZ : PIANO_ARPEGGIO_PATTERNS_COMMON);
  const selectedPattern = patternLibrary[patternSeed % patternLibrary.length];
  const stepDuration = Math.max(fullBeatDelay, 0.18);

  const pushArpeggiatedNote = (
    noteName: string,
    midi: number,
    startOffset: number,
    velocityMultiplier: number,
    isBassNote: boolean,
  ) => {
    const noteDuration = clampDuration(startOffset, duration - startOffset);
    if (noteDuration <= 0 || midi < 0) {
      return;
    }

    notes.push({
      noteName,
      midi,
      startOffset,
      duration: noteDuration,
      velocityMultiplier,
      isBass: isBassNote,
    });
  };

  pushArpeggiatedNote(
    bassNoteName,
    bassMidi,
    0,
    (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * mix(0.9, 1.02, easeInOutSineCurve(1 - quietness * 0.45 + fullness * 0.18)),
    !!bassEntry,
  );
  if (shouldAddBassOctave) {
    pushArpeggiatedNote(
      lowBassNoteName,
      lowBassMidi,
      0,
      (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * mix(0.76, 0.94, bassOctaveBlend),
      true,
    );
  }

  if (fullAttackBlend > 0.14) {
    pushUpperChordAttack(
      0,
      Math.min(duration, Math.max(stepDuration * 1.15, fullBeatDelay * 0.9)),
      mix(0.3, 0.98, easeInOutSineCurve(fullAttackBlend)),
      {
        skipFifth: quietness > 0.86 && fullAttackBlend < 0.48,
        dropUpperExtensions: sparseBlend > 0.7 && fullAttackBlend < 0.62,
        fifthVelocityScale: mix(0.52, 1.0, fullAttackBlend),
        upperVelocityScale: mix(0.64, 1.08, fullAttackBlend),
      },
    );
  }

  const bridgeStartOffset = stepDuration;
  const shouldScheduleBridge = fullAttackBlend < 0.74
    && useInitialFifthBridge
    && bridgeVoicing
    && bridgeStartOffset < duration - TIMING_EPSILON;

  if (shouldScheduleBridge) {
    pushArpeggiatedNote(
      bridgeVoicing.noteName,
      bridgeVoicing.midi,
      bridgeStartOffset,
      bridgeVoicing.velocity,
      false,
    );
  }

  const upperStartStep = shouldScheduleBridge ? 2 : 1;
  const skipModulo = sparseBlend > 0.82 ? 2 : sparseBlend > 0.56 ? 3 : 0;

  for (let stepIndex = upperStartStep; stepIndex * stepDuration < duration - TIMING_EPSILON; stepIndex += 1) {
    if (upperVoicing.length === 0) {
      break;
    }

    if (skipModulo > 0) {
      const sequenceIndex = stepIndex - upperStartStep;
      if (sequenceIndex > 0 && sequenceIndex % skipModulo === skipModulo - 1) {
        continue;
      }
    }

    const startOffset = stepIndex * stepDuration;
    const patternIndex = (stepIndex - upperStartStep) % selectedPattern.length;
    const sourceIndex = selectedPattern[patternIndex] ?? 0;
    const resolvedIndex = sourceIndex % upperVoicing.length;
    const current = upperVoicing[resolvedIndex];

    pushArpeggiatedNote(
      current.noteName,
      current.midi,
      startOffset,
      current.velocity * mix(0.72, 1.02, 1 - sparseBlend * 0.65),
      false,
    );
  }

  return separateRepeatedUpperPianoNotes(notes, stepDuration);
}

function generateGuitarNotes(
  chordName: string,
  chordTones: MidiNote[],
  duration: number,
  beatDuration: number,
  timeSignature: number,
  signalDynamics?: ChordSignalDynamics | null,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string,
): ScheduledNote[] {
  const voicingNotes = resolveGuitarVoicingMidiNotes(chordName, guitarVoicing, targetKey)
    .sort((a, b) => a.midi - b.midi);
  const sourceNotes = voicingNotes.length > 0 ? voicingNotes : chordTones;
  if (sourceNotes.length === 0) {
    return [];
  }

  const quietness = resolveQuietness(signalDynamics);
  const fullness = resolveFullness(signalDynamics);
  const motion = resolveMotion(signalDynamics);
  const fingerpickBlend = clamp01(quietness * 1.08 - fullness * 0.28);

  if (fingerpickBlend > 0.84) {
    const notes: ScheduledNote[] = [];
    const upperPool = sourceNotes.length > 1 ? sourceNotes.slice(1) : sourceNotes;
    const stepOffsets = timeSignature === 3
      ? [0, beatDuration, beatDuration * 2]
      : timeSignature === 6
        ? [0, beatDuration, beatDuration * 2, beatDuration * 3, beatDuration * 4, beatDuration * 5]
        : [0, beatDuration, beatDuration * 2, beatDuration * 3];
    const cycleDuration = Math.max(beatDuration, beatDuration * Math.max(1, timeSignature === 6 ? 6 : timeSignature));

    for (let cycleStart = 0; cycleStart < duration - TIMING_EPSILON; cycleStart += cycleDuration) {
      for (let stepIndex = 0; stepIndex < stepOffsets.length; stepIndex += 1) {
        const startOffset = cycleStart + stepOffsets[stepIndex];
        if (startOffset >= duration) break;

        const targetNote = stepIndex === 0
          ? sourceNotes[0]
          : upperPool[(stepIndex - 1) % upperPool.length];
        if (!targetNote) continue;

        const nextStart = stepIndex + 1 < stepOffsets.length
          ? cycleStart + stepOffsets[stepIndex + 1]
          : Math.min(duration, cycleStart + cycleDuration);
        notes.push({
          noteName: targetNote.name,
          midi: targetNote.midi,
          startOffset,
          duration: Math.max(beatDuration * 0.8, nextStart - startOffset),
          velocityMultiplier: stepIndex === 0
            ? mix(0.84, 0.94, easeInOutSineCurve(1 - quietness * 0.55))
            : mix(0.66, 0.78, easeInOutSineCurve(motion * 0.4 + fullness * 0.25)),
          isBass: stepIndex === 0,
        });
      }
    }

    return notes;
  }

  const strums = buildGuitarStrumPattern(duration, beatDuration, timeSignature);
  const notes: ScheduledNote[] = [];
  const trimmedVoiceCount = quietness > 0.58 ? 5 : quietness > 0.32 ? 6 : sourceNotes.length;
  const strummedNotes = sourceNotes.length > trimmedVoiceCount
    ? [sourceNotes[0], ...sourceNotes.slice(sourceNotes.length - Math.max(1, trimmedVoiceCount - 1))]
    : sourceNotes;
  const stringSweepDelay = mix(0.018, 0.008, fullness * 0.72 + motion * 0.28);
  const measureDuration = Math.max(beatDuration, beatDuration * Math.max(1, timeSignature));
  const accentedDownStrumVelocity = mix(0.84, 1.02, easeInOutSineCurve(fullness * 0.72 + motion * 0.28));
  const softerStrumVelocity = mix(0.56, 0.72, easeInOutSineCurve(fullness * 0.68 + motion * 0.32));
  const accentTimingTolerance = Math.max(0.0001, stringSweepDelay * 0.5);

  for (const strum of strums) {
    const orderedNotes = strum.direction === 'down' ? strummedNotes : [...strummedNotes].reverse();
    const positionInMeasure = strum.startOffset % measureDuration;
    const isMeasureAccent = strum.direction === 'down'
      && (positionInMeasure < accentTimingTolerance
        || Math.abs(positionInMeasure - measureDuration) < accentTimingTolerance);
    const velocityBase = isMeasureAccent ? accentedDownStrumVelocity : softerStrumVelocity;

    orderedNotes.forEach((note, stringIndex) => {
      const startOffset = strum.startOffset + stringIndex * stringSweepDelay;
      if (startOffset >= duration) return;

      const remaining = duration - startOffset;
      const sustainTail = stringSweepDelay * 1.5;
      const velocityStep = stringIndex === 0 ? 1 : Math.max(0.76, 1 - stringIndex * 0.035);

      notes.push({
        noteName: note.name,
        midi: note.midi,
        startOffset,
        duration: Math.min(duration - startOffset + sustainTail, remaining + stringSweepDelay * 2),
        velocityMultiplier: velocityBase * velocityStep,
        isBass: stringIndex === 0 && strum.direction === 'down',
      });
    });
  }

  return notes;
}

function generateViolinNotes(
  rootName: string,
  duration: number,
): ScheduledNote[] {
  const name = `${rootName}6`;
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
  rootName: string,
  bassName: string,
  chordTones: MidiNote[],
  duration: number,
  fullBeatDelay: number,
  durationInBeats: number,
): ScheduledNote[] {
  const phraseSeed = hashPatternSeed(`${rootName}:${bassName}:${duration.toFixed(3)}:${fullBeatDelay.toFixed(3)}`);
  const useLongPattern = durationInBeats >= PIANO_PATTERN_MIN_BEATS;
  const upperNeighbor = chordTones.length >= 3
    ? chordTones[2].noteName
    : (chordTones.length >= 2 ? chordTones[1].noteName : rootName);
  const supportTone = bassName === rootName && chordTones.length >= 2
    ? chordTones[1].noteName
    : bassName;

  const pushFluteNote = (
    noteName: string,
    startOffset: number,
    requestedDuration: number,
    velocityMultiplier: number,
  ): ScheduledNote | null => {
    if (startOffset >= duration) return null;
    const actualDuration = Math.min(requestedDuration, duration - startOffset);
    if (actualDuration <= 0) return null;
    const name = `${noteName}5`;
    return {
      noteName: name,
      midi: noteNameToMidi(name),
      startOffset,
      duration: actualDuration,
      velocityMultiplier,
      isBass: false,
    };
  };

  if (!useLongPattern) {
    const primaryTone = (phraseSeed % 2 === 0) ? supportTone : upperNeighbor;
    const ornamentOffset = Math.min(fullBeatDelay * 1.1, duration * 0.58);
    const introNote = pushFluteNote(primaryTone, 0, Math.max(fullBeatDelay * 0.95, ornamentOffset), 0.96);
    const ornamentNote = durationInBeats >= 1.5
      ? pushFluteNote(upperNeighbor, ornamentOffset, Math.max(fullBeatDelay * 0.45, duration - ornamentOffset), 0.88)
      : null;

    return [introNote, ornamentNote].filter((note): note is ScheduledNote => note !== null);
  }

  const phrase: Array<[string, number, number, number]> = [
    [supportTone, 0, Math.max(fullBeatDelay * 0.9, fullBeatDelay * 1.1), 0.95],
    [upperNeighbor, fullBeatDelay * 1.25, fullBeatDelay * 0.55, 0.86],
    [supportTone, fullBeatDelay * 2, Math.max(fullBeatDelay * 0.7, duration - fullBeatDelay * 2), 0.91],
  ];

  return phrase
    .map(([noteName, startOffset, requestedDuration, velocityMultiplier]) => (
      pushFluteNote(noteName, startOffset, requestedDuration, velocityMultiplier)
    ))
    .filter((note): note is ScheduledNote => note !== null);
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

/** A visual note with timing and coloring information for canvas rendering */
export interface VisualNote {
  midi: number;
  startTime: number;
  endTime: number;
  color: string;
  chordName: string;
}

export interface PositionedVisualNote extends VisualNote {
  pos: { x: number; width: number } | null;
}

export interface SignalDynamicsSource {
  getSignalDynamics(time: number, chordDuration?: number): ChordSignalDynamics | null;
}

/**
 * Generate visual notes for all instruments across all chord events.
 */
export function generateAllInstrumentVisualNotes(
  events: ChordEvent[],
  instruments: ActiveInstrument[],
  bpm?: number,
  timeSignature?: number,
  segmentationData?: SegmentationResult | null,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string,
  signalDynamicsSource?: SignalDynamicsSource | null,
  playbackTime?: number,
): VisualNote[] {
  const notes: VisualNote[] = [];

  // Merge consecutive beats with same chord — audio only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);
  // Use BPM-based beat duration when available (matches audio path exactly).
  // Fall back to estimated beat duration from raw events when beat counts are unavailable.
  const bd = bpm ? beatDurationFromBpm(bpm) : estimateBeatDuration(events);

  for (const event of merged) {
    const { chordName, notes: chordNotes, startTime, endTime } = event;
    const duration = endTime - startTime;
    const eventBeatCount = Math.max(1, event.beatCount ?? 1);
    const eventBeatDuration = duration > 0 ? duration / eventBeatCount : bd;
    const signalDynamics = signalDynamicsSource?.getSignalDynamics(startTime, duration) ?? null;

    for (const inst of instruments) {
      const instrumentName = inst.name.toLowerCase() as InstrumentName;
      const color = inst.color;

      const scheduled = generateNotesForInstrument(instrumentName, {
        chordName,
        chordNotes,
        duration,
        beatDuration: eventBeatDuration,
        startTime,
        timeSignature,
        segmentationData,
        signalDynamics,
        guitarVoicing,
        targetKey,
      });
      const visualScheduled = playbackTime !== undefined
        ? scheduled
          .map((sn) => {
            const elapsedInChord = Math.max(0, playbackTime - startTime);
            const originalEndOffset = sn.startOffset + sn.duration;

            if (originalEndOffset > elapsedInChord) {
              return sn;
            }

            const recovered = adjustScheduledNotesForPlayback([sn], {
              instrumentName,
              elapsedInChord,
            })[0];

            if (!recovered) {
              return null;
            }

            return {
              ...recovered,
              startOffset: Math.max(0, playbackTime - startTime),
            } satisfies ScheduledNote;
          })
          .filter((sn): sn is ScheduledNote => sn !== null)
        : scheduled;

      for (const sn of visualScheduled) {
        const visualTail = getInstrumentVisualSustainTailSeconds(instrumentName);
        const noteStartTime = startTime + sn.startOffset;
        const symbolicEndTime = noteStartTime + sn.duration;
        const clippedVisualEndTime = Math.min(endTime, symbolicEndTime + visualTail);
        notes.push({
          midi: sn.midi,
          startTime: noteStartTime,
          // Keep the audible tail within the active chord window so the piano roll
          // stays notation-like instead of showing cross-chord overlap.
          endTime: clippedVisualEndTime,
          color,
          chordName,
        });
      }
    }
  }

  return notes;
}

export function attachVisualNotePositions(
  notes: VisualNote[],
  posLookup: Map<number, { x: number; width: number }>,
): PositionedVisualNote[] {
  return notes.map((note) => ({
    ...note,
    pos: posLookup.get(note.midi) ?? null,
  }));
}
