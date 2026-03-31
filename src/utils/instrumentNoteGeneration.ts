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
import { getAccidentalPreferenceFromKey } from '@/utils/chordUtils';
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
export type InstrumentName = 'piano' | 'guitar' | 'violin' | 'flute' | 'saxophone' | 'bass';

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
const SAXOPHONE_MIN_MIDI = 60; // C4
const SAXOPHONE_MAX_MIDI = 76; // E5
const SAXOPHONE_PREFERRED_MAX_MIDI = 72; // C5
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
const SAXOPHONE_GRACE_NOTE_BEATS = 0.12;

interface SaxPhraseEvent {
  startBeat: number;
  durationBeats: number;
  velocityMultiplier: number;
  scalePosition: number;
  arpeggioOutline?: boolean;
  graceFrom?: 'below' | 'above' | null;
  ornamentType?: 'grace' | 'appoggiatura' | null;
}

interface ParsedSongKey {
  rootName: string;
  mode: 'major' | 'minor';
  scaleNoteNames: string[];
}

const CHROMATIC_SCALE_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const CHROMATIC_SCALE_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;

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

function parseSongKey(
  targetKey: string | undefined,
  fallbackRootName: string,
  chordIntervals: Set<number>,
): ParsedSongKey {
  const normalizedTargetKey = targetKey
    ?.replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .trim();
  const rootMatch = normalizedTargetKey?.match(/^([A-G][#b]?)/i);
  const parsedRoot = rootMatch
    ? `${rootMatch[1].charAt(0).toUpperCase()}${rootMatch[1].slice(1)}`
    : fallbackRootName;
  const explicitMode = normalizedTargetKey
    ? (/minor|min\b|m$/i.test(normalizedTargetKey.slice(parsedRoot.length)) ? 'minor'
      : (/major|maj\b/i.test(normalizedTargetKey.slice(parsedRoot.length)) ? 'major' : null))
    : null;
  const parsedMode: 'major' | 'minor' = explicitMode
    ?? (normalizedTargetKey ? 'major' : (chordIntervals.has(3) && !chordIntervals.has(4) ? 'minor' : 'major'));
  const accidentalPreference = getAccidentalPreferenceFromKey(normalizedTargetKey) ?? (parsedRoot.includes('b') ? 'flat' : 'sharp');
  const chromaticScale = accidentalPreference === 'flat' ? CHROMATIC_SCALE_FLATS : CHROMATIC_SCALE_SHARPS;
  const rootIndex = NOTE_INDEX_MAP[parsedRoot] ?? NOTE_INDEX_MAP[fallbackRootName] ?? 0;
  const scaleIntervals = parsedMode === 'minor' ? NATURAL_MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;

  return {
    rootName: parsedRoot,
    mode: parsedMode,
    scaleNoteNames: scaleIntervals.map((interval) => chromaticScale[(rootIndex + interval) % 12]),
  };
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
 * - **Flute**: Short chords sustain the bass/3rd at octave 5; long chords (≥4 beats)
 *              switch to the 5th at octave 5 with a syncopated re-attack
 * - **Saxophone**: Guide-tone lead phrase with syncopated accents for instrumental sections
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
      return generateViolinNotes(rootName, duration);

    case 'flute':
      return generateFluteNotes(rootName, bassName, chordTones, duration, fullBeatDelay, durationInBeats);

    case 'saxophone':
      return generateSaxophoneNotes(chordName, rootName, chordTones, duration, fullBeatDelay, durationInBeats, startTime, targetKey);

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

function generateSaxophoneNotes(
  chordName: string,
  rootName: string,
  chordTones: MidiNote[],
  duration: number,
  fullBeatDelay: number,
  durationInBeats: number,
  startTime?: number,
  targetKey?: string,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  const phraseSeed = hashPatternSeed(`${chordName}:${(startTime ?? 0).toFixed(3)}:${duration.toFixed(3)}`);
  const rootIndex = NOTE_INDEX_MAP[rootName] ?? 0;
  const chordIntervals = new Set(
    chordTones.map((tone) => {
      const toneIndex = NOTE_INDEX_MAP[tone.noteName];
      if (toneIndex === undefined) return 0;
      return (toneIndex - rootIndex + 12) % 12;
    }),
  );
  const songKey = parseSongKey(targetKey, rootName, chordIntervals);
  const scaleNoteNames = songKey.scaleNoteNames;
  const noteIndexToScaleDegree = new Map<number, number>();
  scaleNoteNames.forEach((noteName, scaleDegree) => {
    const noteIndex = NOTE_INDEX_MAP[noteName];
    if (noteIndex !== undefined) {
      noteIndexToScaleDegree.set(noteIndex, scaleDegree);
    }
  });
  const normalizeScaleDegree = (degree: number) => ((degree % scaleNoteNames.length) + scaleNoteNames.length) % scaleNoteNames.length;
  const degreeForPitchClass = (noteName: string) => {
    const noteIndex = NOTE_INDEX_MAP[noteName];
    if (noteIndex === undefined) return 0;
    const directDegree = noteIndexToScaleDegree.get(noteIndex);
    if (directDegree !== undefined) return directDegree;

    let bestDegree = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    scaleNoteNames.forEach((scaleNoteName, scaleDegree) => {
      const scaleIndex = NOTE_INDEX_MAP[scaleNoteName];
      if (scaleIndex === undefined) return;
      const forward = (noteIndex - scaleIndex + 12) % 12;
      const wrappedDistance = Math.min(forward, 12 - forward);
      if (wrappedDistance < bestDistance) {
        bestDistance = wrappedDistance;
        bestDegree = scaleDegree;
      }
    });
    return bestDegree;
  };
  const tonicDegree = degreeForPitchClass(songKey.rootName);
  const orderedChordDegrees = chordTones.reduce<number[]>((degrees, tone) => {
    const degree = degreeForPitchClass(tone.noteName);
    if (!degrees.includes(degree)) {
      degrees.push(degree);
    }
    return degrees;
  }, []);
  const chordDegrees = Array.from(new Set(orderedChordDegrees));
  const guideToneDegrees = Array.from(new Set([
    chordIntervals.has(3) ? degreeForPitchClass(CHROMATIC_SCALE_SHARPS[(rootIndex + 3) % 12]) : null,
    chordIntervals.has(4) ? degreeForPitchClass(CHROMATIC_SCALE_SHARPS[(rootIndex + 4) % 12]) : null,
    chordIntervals.has(10) ? degreeForPitchClass(CHROMATIC_SCALE_SHARPS[(rootIndex + 10) % 12]) : null,
    chordIntervals.has(11) ? degreeForPitchClass(CHROMATIC_SCALE_SHARPS[(rootIndex + 11) % 12]) : null,
  ].filter((degree): degree is number => typeof degree === 'number')));
  const guideDegrees = Array.from(new Set([
    ...guideToneDegrees,
    ...chordDegrees,
    tonicDegree,
  ].filter((degree): degree is number => typeof degree === 'number')));

  const absoluteScalePositionToNote = (scalePosition: number) => {
    const scaleLength = scaleNoteNames.length;
    const degree = normalizeScaleDegree(scalePosition);
    const octave = 4 + Math.floor(scalePosition / scaleLength);
    return {
      noteName: scaleNoteNames[degree] ?? songKey.rootName,
      octave,
    };
  };
  const diatonicNeighbor = (noteName: string, direction: 'below' | 'above') => {
    const scaleDegree = degreeForPitchClass(noteName);
    const offset = direction === 'below' ? -1 : 1;
    return scaleNoteNames[normalizeScaleDegree(scaleDegree + offset)] ?? noteName;
  };
  const nearestPositionFromPool = (referencePosition: number, degreePool: number[]): number => {
    if (degreePool.length === 0) return referencePosition;
    let bestPosition = referencePosition;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let octaveShift = -1; octaveShift <= 1; octaveShift += 1) {
      degreePool.forEach((degree) => {
        const candidate = degree + ((Math.floor(referencePosition / scaleNoteNames.length) + octaveShift) * scaleNoteNames.length);
        const distance = Math.abs(candidate - referencePosition);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPosition = candidate;
        }
      });
    }
    return bestPosition;
  };
  const beatPositionWithinMeasure = (beat: number) => {
    const normalized = beat % 2;
    return normalized < 0 ? normalized + 2 : normalized;
  };
  const isStrongHarmonicPosition = (beat: number) => {
    const position = beatPositionWithinMeasure(beat);
    return Math.abs(position) < 0.08 || Math.abs(position - 1) < 0.08;
  };
  const harmonicDegrees = Array.from(new Set([...guideDegrees, ...chordDegrees]));
  const strongAnchorDegrees = chordDegrees.length > 0 ? chordDegrees : harmonicDegrees;
  const skeletonDegrees = strongAnchorDegrees.length > 0 ? strongAnchorDegrees : guideDegrees;
  const isChordCompatibleDegree = (scalePosition: number) => harmonicDegrees.includes(normalizeScaleDegree(scalePosition));
  const constrainToHarmony = (
    scalePosition: number,
    startBeat: number,
    durationBeatsValue: number,
    preferGuideTone: boolean,
  ) => {
    const shouldAnchorToHarmony = isStrongHarmonicPosition(startBeat)
      || durationBeatsValue >= 0.9
      || preferGuideTone;
    if (!shouldAnchorToHarmony || isChordCompatibleDegree(scalePosition)) {
      return scalePosition;
    }

    const preferredPool = (isStrongHarmonicPosition(startBeat) || durationBeatsValue >= 0.9)
      ? strongAnchorDegrees
      : (preferGuideTone ? guideDegrees : harmonicDegrees);
    return nearestPositionFromPool(scalePosition, preferredPool.length > 0 ? preferredPool : guideDegrees);
  };

  const pushNote = (
    noteName: string,
    octave: number,
    startOffset: number,
    requestedDuration: number,
    velocityMultiplier: number,
  ) => {
    if (startOffset >= duration) return;

    const actualDuration = Math.min(requestedDuration, duration - startOffset);
    if (actualDuration <= 0) return;

    const name = `${noteName}${octave}`;
    let midi = noteNameToMidi(name);
    while (midi < SAXOPHONE_MIN_MIDI) {
      midi += 12;
    }
    while (midi > SAXOPHONE_MAX_MIDI) {
      midi -= 12;
    }
    while (midi > SAXOPHONE_PREFERRED_MAX_MIDI && midi - 12 >= SAXOPHONE_MIN_MIDI) {
      midi -= 12;
    }
    if (midi < SAXOPHONE_MIN_MIDI || midi > SAXOPHONE_MAX_MIDI) {
      return;
    }

    const clampedOctave = Math.floor(midi / 12) - 1;
    const clampedName = `${noteName}${clampedOctave}`;
    notes.push({
      noteName: clampedName,
      midi,
      startOffset,
      duration: actualDuration,
      velocityMultiplier,
      isBass: false,
    });
  };
  const scalePositionFromRenderedNote = (renderedNoteName: string): number | null => {
    const match = renderedNoteName.match(/^([A-G][#b]?)(\d+)$/);
    if (!match) return null;
    const [, pitchClass, octaveValue] = match;
    const octave = Number.parseInt(octaveValue, 10);
    if (!Number.isFinite(octave)) return null;
    return degreeForPitchClass(pitchClass) + ((octave - 4) * scaleNoteNames.length);
  };
  const finalizeSaxNotes = (): ScheduledNote[] => {
    const compacted: ScheduledNote[] = [];
    const sorted = [...notes].sort((a, b) => a.startOffset - b.startOffset || a.midi - b.midi);

    for (const note of sorted) {
      const previous = compacted[compacted.length - 1];
      const noteCopy = { ...note };
      const noteScalePosition = scalePositionFromRenderedNote(noteCopy.noteName);
      const startsOnStrongPosition = isStrongHarmonicPosition(noteCopy.startOffset / fullBeatDelay);
      if (
        noteScalePosition !== null
        && startsOnStrongPosition
        && noteCopy.duration >= fullBeatDelay * 0.9
        && !isChordCompatibleDegree(noteScalePosition)
      ) {
        const harmonicPosition = nearestPositionFromPool(noteScalePosition, strongAnchorDegrees);
        const harmonicPitch = absoluteScalePositionToNote(harmonicPosition);
        noteCopy.noteName = `${harmonicPitch.noteName}${harmonicPitch.octave}`;
        noteCopy.midi = noteNameToMidi(noteCopy.noteName);
      }

      if (!previous) {
        compacted.push(noteCopy);
        continue;
      }

      const previousPitchClass = previous.noteName.replace(/\d+$/, '');
      const currentPitchClass = noteCopy.noteName.replace(/\d+$/, '');
      const samePitch = previousPitchClass === currentPitchClass;
      const closeInTime = noteCopy.startOffset - previous.startOffset <= fullBeatDelay * 1.05;
      if (!samePitch || !closeInTime) {
        compacted.push(noteCopy);
        continue;
      }

      const previousScalePosition = scalePositionFromRenderedNote(previous.noteName);
      const repeatedScalePosition = scalePositionFromRenderedNote(noteCopy.noteName);
      const repeatedIsChordTone = repeatedScalePosition !== null && isChordCompatibleDegree(repeatedScalePosition);

      if (repeatedIsChordTone) {
        previous.duration = Math.max(
          previous.duration,
          (noteCopy.startOffset + noteCopy.duration) - previous.startOffset,
        );
        previous.velocityMultiplier = Math.max(previous.velocityMultiplier, noteCopy.velocityMultiplier);
        continue;
      }

      if (repeatedScalePosition !== null && previousScalePosition !== null) {
        const motionDirection = repeatedScalePosition >= previousScalePosition ? 1 : -1;
        const candidatePositions = [
          repeatedScalePosition + motionDirection,
          repeatedScalePosition - motionDirection,
          repeatedScalePosition + 1,
          repeatedScalePosition - 1,
        ];
        const alternativePosition = candidatePositions.find((candidate) => (
          candidate >= 0
          && candidate <= 13
          && candidate !== previousScalePosition
          && normalizeScaleDegree(candidate) !== normalizeScaleDegree(previousScalePosition)
        ));

        if (alternativePosition !== undefined) {
          const alternativePitch = absoluteScalePositionToNote(alternativePosition);
          compacted.push({
            ...noteCopy,
            noteName: `${alternativePitch.noteName}${alternativePitch.octave}`,
            midi: noteNameToMidi(`${alternativePitch.noteName}${alternativePitch.octave}`),
          });
          continue;
        }
      }

      if (compacted.length >= 3) {
        const thirdPrevious = compacted[compacted.length - 3];
        const secondPrevious = compacted[compacted.length - 2];
        const thirdPreviousPitchClass = thirdPrevious.noteName.replace(/\d+$/, '');
        const secondPreviousPitchClass = secondPrevious.noteName.replace(/\d+$/, '');
        if (
          thirdPreviousPitchClass === previousPitchClass
          && secondPreviousPitchClass === currentPitchClass
          && thirdPreviousPitchClass !== secondPreviousPitchClass
        ) {
          const antiOstinatoPosition = previousScalePosition !== null
            ? nearestPositionFromPool(previousScalePosition + 1, strongAnchorDegrees)
            : nearestPositionFromPool(7, strongAnchorDegrees);
          const antiOstinatoPitch = absoluteScalePositionToNote(antiOstinatoPosition);
          compacted.push({
            ...noteCopy,
            noteName: `${antiOstinatoPitch.noteName}${antiOstinatoPitch.octave}`,
            midi: noteNameToMidi(`${antiOstinatoPitch.noteName}${antiOstinatoPitch.octave}`),
          });
          continue;
        }
      }

      const harmonicFallbackPosition = previousScalePosition !== null
        ? nearestPositionFromPool(previousScalePosition + 1, harmonicDegrees)
        : nearestPositionFromPool(7, harmonicDegrees);
      const harmonicFallback = absoluteScalePositionToNote(harmonicFallbackPosition);
      compacted.push({
        ...noteCopy,
        noteName: `${harmonicFallback.noteName}${harmonicFallback.octave}`,
        midi: noteNameToMidi(`${harmonicFallback.noteName}${harmonicFallback.octave}`),
      });
    }

    const deOstinato: ScheduledNote[] = [];
    compacted.forEach((noteCopy) => {
      const window = deOstinato.slice(-3);
      if (window.length === 3) {
        const [first, second, third] = window;
        const firstPitchClass = first.noteName.replace(/\d+$/, '');
        const secondPitchClass = second.noteName.replace(/\d+$/, '');
        const thirdPitchClass = third.noteName.replace(/\d+$/, '');
        const currentPitchClass = noteCopy.noteName.replace(/\d+$/, '');
        if (
          firstPitchClass === thirdPitchClass
          && secondPitchClass === currentPitchClass
          && firstPitchClass !== secondPitchClass
        ) {
          const noteScalePosition = scalePositionFromRenderedNote(noteCopy.noteName) ?? nearestPositionFromPool(7, strongAnchorDegrees);
          const replacementPosition = nearestPositionFromPool(noteScalePosition + 1, strongAnchorDegrees);
          const replacementPitch = absoluteScalePositionToNote(replacementPosition);
          deOstinato.push({
            ...noteCopy,
            noteName: `${replacementPitch.noteName}${replacementPitch.octave}`,
            midi: noteNameToMidi(`${replacementPitch.noteName}${replacementPitch.octave}`),
          });
          return;
        }
      }

      deOstinato.push(noteCopy);
    });

    return deOstinato;
  };

  const pushPhraseEvent = (
    event: SaxPhraseEvent,
    previousScalePosition: number | null,
  ): number => {
    let targetScalePosition = Math.max(0, Math.min(event.scalePosition, 13));
    if (previousScalePosition !== null && targetScalePosition === previousScalePosition && !event.arpeggioOutline) {
      const preserveHarmony = isStrongHarmonicPosition(event.startBeat) || event.durationBeats >= 0.9;
      if (preserveHarmony) {
        targetScalePosition = nearestPositionFromPool(
          targetScalePosition + (event.velocityMultiplier >= 0.94 ? 1 : -1),
          strongAnchorDegrees,
        );
      } else {
        const upwardNeighbor = Math.min(13, targetScalePosition + 1);
        const downwardNeighbor = Math.max(0, targetScalePosition - 1);
        const preferredNeighbor = event.velocityMultiplier >= 0.94 ? upwardNeighbor : downwardNeighbor;
        targetScalePosition = preferredNeighbor !== previousScalePosition
          ? preferredNeighbor
          : (preferredNeighbor === upwardNeighbor ? downwardNeighbor : upwardNeighbor);
      }
    }
    const { noteName: targetNoteName, octave } = absoluteScalePositionToNote(targetScalePosition);
    const leap = previousScalePosition === null ? 0 : targetScalePosition - previousScalePosition;

    if (previousScalePosition !== null && !event.arpeggioOutline && Math.abs(leap) > 2 && event.durationBeats >= 0.75) {
      const availablePassingSlots = Math.max(1, Math.floor(event.durationBeats / 0.5) - 1);
      const passingCount = Math.min(Math.abs(leap) - 1, availablePassingSlots, 2);
      const splitDuration = 0.5;
      for (let passingIndex = 0; passingIndex < passingCount; passingIndex += 1) {
        const passingScalePosition = previousScalePosition + Math.sign(leap) * (passingIndex + 1);
        const { noteName: passingNoteName, octave: passingOctave } = absoluteScalePositionToNote(passingScalePosition);
        pushNote(
          passingNoteName,
          passingOctave,
          (event.startBeat + (splitDuration * passingIndex)) * fullBeatDelay,
          splitDuration * fullBeatDelay,
          Math.max(0.74, event.velocityMultiplier * 0.88),
        );
      }

      const adjustedStartBeat = event.startBeat + splitDuration * passingCount;
      const adjustedDurationBeats = Math.max(0.25, event.durationBeats - splitDuration * passingCount);
      pushNote(
        targetNoteName,
        octave,
        adjustedStartBeat * fullBeatDelay,
        adjustedDurationBeats * fullBeatDelay,
        event.velocityMultiplier,
      );
      return targetScalePosition;
    }

    const startBeat = event.startBeat;
    const startOffset = startBeat * fullBeatDelay;
    const requestedDuration = event.durationBeats * fullBeatDelay;

    if (event.graceFrom) {
      if (event.ornamentType === 'appoggiatura' && event.durationBeats >= 0.75) {
        const stepDirection = event.graceFrom === 'below' ? -1 : 1;
        const ornamentPositions = [
          Math.max(0, Math.min(13, targetScalePosition + (stepDirection * 2))),
          Math.max(0, Math.min(13, targetScalePosition + stepDirection)),
        ];
        const ornamentUnitBeats = Math.min(0.22, event.durationBeats * 0.22);
        ornamentPositions.forEach((ornamentPosition, ornamentIndex) => {
          const ornamentStartBeat = Math.max(0, startBeat - ((ornamentPositions.length - ornamentIndex) * ornamentUnitBeats));
          const ornamentDurationBeats = ornamentUnitBeats * (ornamentIndex === ornamentPositions.length - 1 ? 1.15 : 0.9);
          const ornamentPitch = absoluteScalePositionToNote(ornamentPosition);
          pushNote(
            ornamentPitch.noteName,
            ornamentPitch.octave,
            ornamentStartBeat * fullBeatDelay,
            ornamentDurationBeats * fullBeatDelay,
            Math.max(0.7, event.velocityMultiplier * (0.76 + ornamentIndex * 0.06)),
          );
        });
      } else {
        const graceStartBeat = Math.max(0, startBeat - SAXOPHONE_GRACE_NOTE_BEATS);
        const graceDurationBeats = Math.min(SAXOPHONE_GRACE_NOTE_BEATS * 0.8, Math.max(0.05, startBeat - graceStartBeat));
        const graceStartOffset = graceStartBeat * fullBeatDelay;
        const graceDuration = graceDurationBeats * fullBeatDelay;
        const graceNoteName = diatonicNeighbor(targetNoteName, event.graceFrom);

        pushNote(
          graceNoteName,
          octave,
          graceStartOffset,
          graceDuration,
          Math.max(0.66, event.velocityMultiplier * 0.76),
        );
      }
    }

    pushNote(targetNoteName, octave, startOffset, requestedDuration, event.velocityMultiplier);
    return targetScalePosition;
  };

  const baseRegister = 3;
  const primaryGuidePool = guideToneDegrees.length > 0 ? guideToneDegrees : guideDegrees;
  const anchorScalePosition = nearestPositionFromPool(
    baseRegister + primaryGuidePool[phraseSeed % Math.max(primaryGuidePool.length, 1)],
    primaryGuidePool,
  );
  const motifPatternIndex = phraseSeed % 3;
  const developmentShift = motifPatternIndex === 2 ? -1 : 1;
  const clampScalePosition = (scalePosition: number) => Math.max(0, Math.min(13, scalePosition));
  const chooseDistinctChordPosition = (
    referencePosition: number,
    direction: number,
    pool: number[],
    disallowPosition: number,
  ) => {
    const primaryCandidate = nearestPositionFromPool(referencePosition + direction, pool);
    if (primaryCandidate !== disallowPosition) return primaryCandidate;

    const fallbackCandidate = nearestPositionFromPool(referencePosition - direction, pool);
    if (fallbackCandidate !== disallowPosition) return fallbackCandidate;

    return primaryCandidate;
  };
  const buildScalePatternPositions = (
    startPosition: number,
    targetPosition: number,
    noteCount: number,
  ) => {
    if (noteCount <= 1) return [targetPosition];

    const direction = targetPosition === startPosition
      ? developmentShift || 1
      : Math.sign(targetPosition - startPosition);
    const positions = [startPosition];
    let currentPosition = startPosition;
    for (let i = 1; i < noteCount - 1; i += 1) {
      currentPosition = clampScalePosition(currentPosition + direction);
      positions.push(currentPosition);
    }
    positions.push(targetPosition);
    return positions;
  };
  const arpeggioContours: ReadonlyArray<readonly number[]> = [
    [0, 1, 2, 3], // 1 3 5 8
    [0, 2, 1, 3], // 1 5 3 8
    [0, 3, 2, 1], // 1 8 5 3
  ];
  const patternProfiles: ReadonlyArray<{
    kind: 'scale' | 'arpeggio';
    direction?: 1 | -1;
    contourIndex?: number;
  }> = [
    { kind: 'scale', direction: 1 },
    { kind: 'arpeggio', contourIndex: 0 },
    { kind: 'scale', direction: -1 },
    { kind: 'arpeggio', contourIndex: 1 },
    { kind: 'arpeggio', contourIndex: 2 },
  ];
  const buildArpeggioPatternPositions = (
    anchorPosition: number,
    arrivalPosition: number,
    contourIndex: number,
    noteCount: number,
  ) => {
    const rootDegree = orderedChordDegrees[0] ?? chordDegrees[0] ?? tonicDegree;
    const thirdDegree = orderedChordDegrees[1] ?? rootDegree;
    const fifthDegree = orderedChordDegrees[2] ?? thirdDegree;
    const rootPosition = nearestPositionFromPool(anchorPosition, [rootDegree]);
    const thirdPosition = nearestPositionFromPool(rootPosition + 1, [thirdDegree]);
    const fifthPosition = nearestPositionFromPool(Math.max(rootPosition, thirdPosition) + 1, [fifthDegree]);
    const octaveRootPosition = clampScalePosition(rootPosition + scaleNoteNames.length);
    const slots = [
      clampScalePosition(rootPosition),
      clampScalePosition(thirdPosition),
      clampScalePosition(fifthPosition),
      clampScalePosition(octaveRootPosition),
    ];
    const contour = arpeggioContours[contourIndex % arpeggioContours.length] ?? arpeggioContours[0];
    const selected = contour
      .slice(0, noteCount)
      .map((slotIndex) => slots[slotIndex] ?? slots[0])
      .map(clampScalePosition);
    if (selected.length > 0) {
      selected[selected.length - 1] = clampScalePosition(arrivalPosition);
    }
    return selected;
  };
  const buildCell = (
    cellStartBeat: number,
    startScalePosition: number,
    cellIndex: number,
    isFinalCell: boolean,
  ): SaxPhraseEvent[] => {
    const cellAnchor = nearestPositionFromPool(startScalePosition, skeletonDegrees);
    const selectedProfile = patternProfiles[(phraseSeed + cellIndex) % patternProfiles.length] ?? patternProfiles[0];
    const arrivalPool = isFinalCell
      ? [tonicDegree, ...(guideToneDegrees.length > 0 ? guideToneDegrees : strongAnchorDegrees)]
      : (guideToneDegrees.length > 0 ? guideToneDegrees : strongAnchorDegrees);
    const profileDirection = selectedProfile.direction ?? (developmentShift || 1);
    const desiredArrival = nearestPositionFromPool(
      cellAnchor + ((selectedProfile.kind === 'scale' ? 3 : 2) * profileDirection),
      arrivalPool,
    );
    const arrivalPosition = desiredArrival === cellAnchor
      ? chooseDistinctChordPosition(cellAnchor, profileDirection || 1, arrivalPool, cellAnchor)
      : desiredArrival;
    const cellKind = selectedProfile.kind;
    const cellDurations = isFinalCell
      ? [2]
      : [0.5, 0.5, 0.5, 0.5];
    const positions = cellKind === 'scale'
      ? buildScalePatternPositions(cellAnchor, arrivalPosition, cellDurations.length)
      : buildArpeggioPatternPositions(
        cellAnchor,
        arrivalPosition,
        selectedProfile.contourIndex ?? (phraseSeed + cellIndex),
        cellDurations.length,
      );

    return cellDurations.map((durationBeatsValue, stepIndex) => {
      const startBeat = cellStartBeat + cellDurations.slice(0, stepIndex).reduce((sum, current) => sum + current, 0);
      const isArrivalNote = stepIndex === cellDurations.length - 1;
      const rawScalePosition = positions[stepIndex] ?? cellAnchor;
      const durationValue = durationBeatsValue;
      const anchoredRawPosition = stepIndex === 0
        ? nearestPositionFromPool(
          rawScalePosition,
          isStrongHarmonicPosition(startBeat) ? strongAnchorDegrees : skeletonDegrees,
        )
        : (isArrivalNote ? nearestPositionFromPool(rawScalePosition, strongAnchorDegrees) : rawScalePosition);
      const preferGuideTone = stepIndex === 0 || isArrivalNote;
      const targetScalePosition = constrainToHarmony(
        anchoredRawPosition,
        startBeat,
        durationValue,
        preferGuideTone,
      );
      const arpeggioOutline = isArrivalNote
        && cellKind === 'arpeggio'
        && Math.abs(targetScalePosition - (positions[Math.max(0, stepIndex - 1)] ?? cellAnchor)) >= 2
        && chordDegrees.includes(normalizeScaleDegree(targetScalePosition));
      const shouldGrace = stepIndex === 0
        && (
          cellIndex === 0
          || isFinalCell
          || ((phraseSeed + cellIndex) % 3 === 1)
        );

      return {
        startBeat,
        durationBeats: durationValue,
        velocityMultiplier: isArrivalNote
          ? (isFinalCell ? 0.98 : 0.94)
          : (0.86 + stepIndex * 0.05),
        scalePosition: targetScalePosition,
        arpeggioOutline,
        graceFrom: shouldGrace ? (cellIndex === 0 ? 'below' : 'above') : null,
        ornamentType: shouldGrace && durationValue >= 0.5 && ((phraseSeed + cellIndex) % 2 === 0)
          ? 'appoggiatura'
          : (shouldGrace ? 'grace' : null),
      };
    });
  };

  if (durationInBeats < 2) {
    const { noteName: pickupNote, octave } = absoluteScalePositionToNote(anchorScalePosition);
    if (durationInBeats >= 1.5) {
      pushNote(diatonicNeighbor(pickupNote, 'below'), octave, 0, Math.min(duration * 0.12, fullBeatDelay * 0.14), 0.72);
      pushNote(pickupNote, octave, Math.min(duration * 0.1, fullBeatDelay * 0.12), duration * 0.9, 0.98);
      return finalizeSaxNotes();
    }
    pushNote(pickupNote, octave, 0, duration, 0.98);
    return finalizeSaxNotes();
  }

  const cellLengthBeats = 2;
  const cellCount = Math.max(1, Math.floor(durationInBeats / cellLengthBeats));
  let previousScalePosition: number | null = null;
  let currentCellAnchor = anchorScalePosition;
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const isFinalCell = cellIndex === cellCount - 1;
    const phrase = buildCell(cellIndex * cellLengthBeats, currentCellAnchor, cellIndex, isFinalCell);
    phrase.forEach((event) => {
      previousScalePosition = pushPhraseEvent(event, previousScalePosition);
    });
    currentCellAnchor = nearestPositionFromPool(
      (previousScalePosition ?? currentCellAnchor) + developmentShift,
      isFinalCell ? [tonicDegree, ...guideDegrees] : guideDegrees,
    );
  }

  const consumedBeats = cellCount * cellLengthBeats;
  const remainingBeats = durationInBeats - consumedBeats;
  if (remainingBeats > 0.25) {
    const tailTarget = constrainToHarmony(
      nearestPositionFromPool(
      (previousScalePosition ?? anchorScalePosition) + (remainingBeats >= 0.75 ? developmentShift : 0),
      harmonicDegrees,
      ),
      consumedBeats,
      remainingBeats,
      true,
    );
    previousScalePosition = pushPhraseEvent({
      startBeat: consumedBeats,
      durationBeats: remainingBeats,
      velocityMultiplier: 0.97,
      scalePosition: tailTarget,
      arpeggioOutline: false,
      graceFrom: remainingBeats >= 0.75 ? 'below' : null,
      ornamentType: remainingBeats >= 1 ? 'appoggiatura' : 'grace',
    }, previousScalePosition);
  }

  const latestNote = notes.reduce<ScheduledNote | null>((latest, note) => {
    if (!latest) return note;
    return note.startOffset >= latest.startOffset ? note : latest;
  }, null);
  const latestNoteScalePosition = latestNote ? scalePositionFromRenderedNote(latestNote.noteName) : null;
  if (latestNote && remainingBeats <= 0.25) {
    latestNote.duration = Math.max(latestNote.duration, duration - latestNote.startOffset);
    latestNote.velocityMultiplier = Math.max(latestNote.velocityMultiplier, 0.99);
  } else if (
    latestNote
    && latestNoteScalePosition !== null
    && isChordCompatibleDegree(latestNoteScalePosition)
    && latestNote.startOffset >= duration - (fullBeatDelay * 2.1)
  ) {
    latestNote.duration = Math.max(latestNote.duration, duration - latestNote.startOffset);
    latestNote.velocityMultiplier = Math.max(latestNote.velocityMultiplier, 0.99);
  } else {
    const finalResolutionPosition = nearestPositionFromPool(
      (previousScalePosition ?? anchorScalePosition) + developmentShift,
      harmonicDegrees,
    );
    const finalResolution = absoluteScalePositionToNote(finalResolutionPosition >= 7 ? finalResolutionPosition : finalResolutionPosition + 7);
    pushNote(
      finalResolution.noteName,
      finalResolution.octave,
      Math.max(0, duration - fullBeatDelay),
      fullBeatDelay,
      0.99,
    );
  }
  return finalizeSaxNotes();
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
