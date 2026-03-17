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
import {
  buildGuitarStrumPattern,
  resolveGuitarVoicingMidiNotes,
  type GuitarVoicingSelection,
} from '@/utils/guitarVoicing';

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
const SAXOPHONE_MAX_MIDI = 84; // C6

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
        duration, fullBeatDelay, durationInBeats, isLongChord, startTime, timeSignature, segmentationData,
      );

    case 'guitar':
      return generateGuitarNotes(
        chordName,
        chordTones,
        duration,
        beatDuration,
        timeSignature,
        guitarVoicing,
        targetKey,
      );

    case 'violin':
      return generateViolinNotes(rootName, duration);

    case 'flute':
      return generateFluteNotes(rootName, bassName, chordTones, duration, fullBeatDelay, durationInBeats);

    case 'saxophone':
      return generateSaxophoneNotes(chordName, rootName, chordTones, duration, fullBeatDelay, durationInBeats, startTime);

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

  const useRepeatingPattern = isLongChord && durationInBeats >= patternBeats;
  const patternSeed = hashPatternSeed(`${chordName}:${chordStartTime.toFixed(3)}:${timeSignature}:${duration.toFixed(3)}`);

  const clampDuration = (startOffset: number, requestedDuration: number) => {
    const remaining = duration - startOffset;
    return Math.max(0, Math.min(requestedDuration, remaining));
  };

  const pushSingleChord = (
    startOffset: number,
    noteDuration: number,
    volumeReduction: number,
    skipFifth: boolean = false,
  ) => {
    notes.push({
      noteName: bassNoteName,
      midi: bassMidi,
      startOffset,
      duration: noteDuration,
      velocityMultiplier: (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * volumeReduction,
      isBass: !!bassEntry,
    });

    for (let toneIdx = 0; toneIdx < chordTones.length; toneIdx++) {
      // Skip the 5th (index 2) when requested — differentiates piano from guitar
      if (skipFifth && toneIdx === 2) continue;
      const tone = chordTones[toneIdx];
      const name = `${tone.noteName}4`;
      const midi = noteNameToMidi(name);
      if (midi === bassMidi) continue;
      notes.push({
        noteName: name,
        midi,
        startOffset,
        duration: noteDuration,
        velocityMultiplier: volumeReduction,
        isBass: false,
      });
    }
  };

  if (!useRepeatingPattern) {
    pushSingleChord(0, duration, PIANO_SHORT_BLOCK_CHORD_VOLUME_REDUCTION, false);
    return notes;
  }

  const isWaltz = timeSignature === 3 || isCompoundTime;
  const activeSegment = getActiveSegmentationSegmentForTime(segmentationData, chordStartTime);
  const shouldUseSparsePattern = isSparsePianoSegment(activeSegment);
  const upperVoicing = chordTones.map((tone, index) => ({
    noteName: `${tone.noteName}${index >= 3 ? 5 : 4}`,
    midi: noteNameToMidi(`${tone.noteName}${index >= 3 ? 5 : 4}`),
    velocity: 0.84 + index * 0.05,
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
    (bassEntry ? BASS_VELOCITY_BOOST : 1.0) * 0.98,
    !!bassEntry,
  );

  const bridgeStartOffset = stepDuration;
  const shouldScheduleBridge = useInitialFifthBridge
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

  for (let stepIndex = upperStartStep; stepIndex * stepDuration < duration - TIMING_EPSILON; stepIndex += 1) {
    if (upperVoicing.length === 0) {
      break;
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
      current.velocity,
      false,
    );
  }

  return notes;
}

function generateGuitarNotes(
  chordName: string,
  chordTones: MidiNote[],
  duration: number,
  beatDuration: number,
  timeSignature: number,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string,
): ScheduledNote[] {
  const voicingNotes = resolveGuitarVoicingMidiNotes(chordName, guitarVoicing, targetKey)
    .sort((a, b) => a.midi - b.midi);
  const sourceNotes = voicingNotes.length > 0 ? voicingNotes : chordTones;
  if (sourceNotes.length === 0) {
    return [];
  }

  const strums = buildGuitarStrumPattern(duration, beatDuration, timeSignature);
  const notes: ScheduledNote[] = [];
  const stringSweepDelay = Math.min(0.018, Math.max(0.008, beatDuration * 0.04));
  const measureDuration = Math.max(beatDuration, beatDuration * Math.max(1, timeSignature));
  const accentedDownStrumVelocity = 0.98;
  const softerStrumVelocity = 0.68;
  const accentTimingTolerance = Math.max(0.0001, stringSweepDelay * 0.5);

  for (const strum of strums) {
    const orderedNotes = strum.direction === 'down' ? sourceNotes : [...sourceNotes].reverse();
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

  const scaleIntervals = (() => {
    const hasMinorThird = chordIntervals.has(3);
    const hasMajorThird = chordIntervals.has(4);
    const hasFlatFive = chordIntervals.has(6);
    const hasPerfectFive = chordIntervals.has(7);
    const hasMinorSeventh = chordIntervals.has(10);
    const hasMajorSeventh = chordIntervals.has(11);

    if (hasMinorThird && hasFlatFive) return [0, 1, 3, 5, 6, 8, 10];
    if (hasMajorThird && hasMinorSeventh) return [0, 2, 4, 5, 7, 9, 10];
    if (hasMinorThird && hasMajorSeventh) return [0, 2, 3, 5, 7, 9, 11];
    if (hasMinorThird) return [0, 2, 3, 5, 7, 9, 10];
    if (hasMajorThird && hasMajorSeventh) return [0, 2, 4, 6, 7, 9, 11];
    if (hasMajorThird && !hasPerfectFive) return [0, 2, 4, 6, 8, 9, 11];
    return [0, 2, 4, 5, 7, 9, 11];
  })();

  const arpeggioIntervals = Array.from(chordIntervals)
    .filter((interval) => interval !== 0)
    .sort((a, b) => a - b);
  arpeggioIntervals.unshift(0);

  const scaleNoteNames = scaleIntervals.map((interval) => {
    const scaleIndex = (rootIndex + interval) % 12;
    return CHROMATIC_SCALE[scaleIndex];
  });
  const arpeggioNoteNames = arpeggioIntervals.map((interval) => {
    const scaleIndex = (rootIndex + interval) % 12;
    return CHROMATIC_SCALE[scaleIndex];
  });

  const runPatterns: ReadonlyArray<readonly number[]> = [
    [0, 1, 2, 3],
    [2, 1, 0, 1],
    [0, 2, 1, 3],
    [3, 2, 1, 0],
  ];
  const arpPatterns: ReadonlyArray<readonly number[]> = [
    [0, 1, 2, 1],
    [0, 2, 1, 2],
    [0, 1, 2, 3],
    [0, 2, 3, 1],
  ];
  const selectedRunPattern = runPatterns[phraseSeed % runPatterns.length];
  const selectedArpPattern = arpPatterns[(phraseSeed >> 2) % arpPatterns.length];
  const resolveSaxOctave = (
    stepIndex: number,
    totalSteps: number,
    useScaleRun: boolean,
    phraseCycleIndex: number,
  ) => {
    const shouldLeanLower = ((phraseSeed + phraseCycleIndex) % 2) === 0;
    if (totalSteps <= 1) {
      return shouldLeanLower ? 4 : 5;
    }

    if (useScaleRun) {
      if (stepIndex === totalSteps - 1) return 5;
      return stepIndex <= 1 ? 4 : 5;
    }

    if (shouldLeanLower) {
      return stepIndex === totalSteps - 1 ? 5 : 4;
    }

    return stepIndex === 0 ? 4 : 5;
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

  if (durationInBeats < 2) {
    const pickupNote = arpeggioNoteNames[Math.min(1, arpeggioNoteNames.length - 1)] ?? rootName;
    pushNote(pickupNote, 4, 0, duration, 0.98);
    return notes;
  }

  if (durationInBeats < PIANO_PATTERN_MIN_BEATS) {
    const stepDuration = Math.max(fullBeatDelay * 0.8, 0.22);
    const phrase = durationInBeats < 3
      ? selectedArpPattern.slice(0, 3)
      : selectedRunPattern;

    phrase.forEach((patternIndex, stepIndex) => {
      const source = durationInBeats < 3 ? arpeggioNoteNames : scaleNoteNames;
      const noteName = source[patternIndex % source.length] ?? rootName;
      const octave = resolveSaxOctave(stepIndex, phrase.length, durationInBeats >= 3, 0);
      const startOffset = stepIndex * stepDuration;
      pushNote(noteName, octave, startOffset, stepDuration * 0.9, stepIndex === phrase.length - 1 ? 1.04 : 0.94);
    });
    return notes;
  }

  const cycleDuration = fullBeatDelay * 2;
  const stepDuration = Math.max(fullBeatDelay * 0.8, 0.2);
  for (let cycleStart = 0; cycleStart < duration - fullBeatDelay * 0.5; cycleStart += cycleDuration) {
    const useScaleRun = ((Math.round(cycleStart / cycleDuration) + phraseSeed) % 2) === 0;
    const phrase = useScaleRun ? selectedRunPattern : selectedArpPattern;
    const source = useScaleRun ? scaleNoteNames : arpeggioNoteNames;
    const phraseCycleIndex = Math.round(cycleStart / cycleDuration);

    phrase.forEach((patternIndex, stepIndex) => {
      const noteName = source[patternIndex % source.length] ?? rootName;
      const octave = resolveSaxOctave(stepIndex, phrase.length, useScaleRun, phraseCycleIndex);
      const startOffset = cycleStart + stepIndex * (stepDuration * 0.6);
      const velocity = useScaleRun
        ? (stepIndex === phrase.length - 1 ? 1.02 : 0.92 + stepIndex * 0.03)
        : (stepIndex === 0 ? 1.0 : 0.95);
      pushNote(noteName, octave, startOffset, stepDuration * (useScaleRun ? 0.7 : 0.85), velocity);
    });
  }

  const resolutionNote = arpeggioNoteNames[(phraseSeed + 1) % arpeggioNoteNames.length] ?? rootName;
  pushNote(resolutionNote, 5, Math.max(0, duration - fullBeatDelay * 0.8), fullBeatDelay * 0.8, 0.96);
  return notes;
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
        guitarVoicing,
        targetKey,
      });

      for (const sn of scheduled) {
        notes.push({
          midi: sn.midi,
          startTime: startTime + sn.startOffset,
          endTime: startTime + sn.startOffset + sn.duration,
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
