import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import type { MidiNote } from '@/utils/chordToMidi';
import {
  buildGuitarStrumPattern,
  resolveGuitarVoicingMidiNotes,
  type GuitarStrumDirection,
  type GuitarVoicingSelection,
} from '@/utils/guitarVoicing';

import { TIMING_EPSILON } from '../constants';
import { hashPatternSeed } from '../segmentContext';
import { clamp01, easeInOutSineCurve, mix, resolveFullness, resolveMotion, resolveQuietness } from '../signalDynamics';
import type { ScheduledNote } from '../types';

/**
 * Step descriptor for a fingerpicking pattern.
 * - `'T'`  thumb on the lowest bass note (root of the voicing)
 * - `'T2'` alternating thumb on a secondary bass note (5th / inversion bass)
 * - number degree index into the chord tones (0 = root, 1 = 3rd, 2 = 5th, 3 = 7th)
 *          The resolver clamps the degree against the available chord-tone
 *          count so it works for triads (3), 6-string voicings, and dyads (2).
 */
type FingerpickStep = 'T' | 'T2' | number;
type FingerpickPattern = readonly FingerpickStep[];

/**
 * Standard 4/4 fingerpicking patterns (one bass + 3 upper notes per measure).
 * Sourced from the most common idioms taught to guitarists:
 *   - Reverse roll / "P-A-M-I"  → original descending feel
 *   - Forward roll / "P-I-M-A"  → ascending classical
 *   - Travis-style alt bass     → root-finger-fifth-finger
 *   - Inside-out & outside-in   → Sor / Tárrega-style arpeggios
 */
const FINGERPICK_PATTERNS_4_4: ReadonlyArray<FingerpickPattern> = [
  ['T', 2, 1, 0],     // P-A-M-I (reverse roll, descending — previous default)
  ['T', 0, 1, 2],     // P-I-M-A (forward roll, ascending)
  ['T', 1, 'T2', 1],  // Travis: thumb alternates root↔5th, finger fills
  ['T', 2, 0, 1],     // Outside-in (Sor)
  ['T', 1, 0, 2],     // Inside-out (Tárrega)
  ['T', 1, 2, 1],     // Pedal-3rd over thumb
];

/**
 * 3/4 (waltz) fingerpicking patterns — bass + 2 upper notes per measure.
 */
const FINGERPICK_PATTERNS_3_4: ReadonlyArray<FingerpickPattern> = [
  ['T', 2, 1],        // descending waltz
  ['T', 0, 2],        // ascending waltz
  ['T', 1, 2],        // 3rd-then-5th
  ['T', 'T2', 2],     // Travis waltz (alt bass on beat 2)
];

/**
 * 6/8 compound patterns — bass + 5 upper notes (or 2 bass + 4 upper).
 * These mirror the classical 6-note "Stairway"/"Romanza" rolls.
 */
const FINGERPICK_PATTERNS_6_8: ReadonlyArray<FingerpickPattern> = [
  ['T', 0, 1, 2, 1, 0], // mountain: up then back down
  ['T', 1, 2, 'T2', 2, 1], // compound Travis with alt bass mid-measure
  ['T', 2, 1, 0, 1, 2], // valley: down then back up
  ['T', 0, 1, 'T2', 1, 0], // mixed-bass forward roll
];

const FINGERPICK_TO_STRUM_THRESHOLD = 0.62;
const FINGERPICK_TO_STRUM_TRANSITION_WINDOW = 0.2;

function selectFingerpickPattern(
  timeSignature: number,
  patternSeed: number,
): FingerpickPattern {
  const library = timeSignature === 3
    ? FINGERPICK_PATTERNS_3_4
    : timeSignature === 6
      ? FINGERPICK_PATTERNS_6_8
      : FINGERPICK_PATTERNS_4_4;
  return library[patternSeed % library.length];
}

/**
 * Pick an "alt-bass" candidate from the voicing (Travis-style).
 * Preference order:
 *   1. A note above the bass within ~9 semitones whose pitch class differs
 *      from the bass (typically the 5th / 3rd of the chord).
 *   2. Otherwise the next lowest voicing note (sourceNotes[1]).
 *   3. Otherwise the bass itself.
 */
function pickAlternateBass(sourceNotes: MidiNote[]): MidiNote {
  if (sourceNotes.length <= 1) return sourceNotes[0];
  const bass = sourceNotes[0];
  const lowerPool = sourceNotes.slice(1).filter((note) => note.midi - bass.midi <= 9);
  const differingPitch = lowerPool.find((note) => note.noteName !== bass.noteName);
  return differingPitch ?? sourceNotes[1] ?? bass;
}

/**
 * Resolve a degree-pattern step into a concrete voiced note.
 *   - The chord tones list (root, 3rd, 5th, 7th) provides the *target pitch
 *     class* via `chordTones[degree % length]`.
 *   - The treble pool (sourceNotes minus the bass) provides the *registered*
 *     candidates. We pick the candidate whose pitch class matches and is
 *     closest to the previous note (smooth voice-leading), tie-breaking by
 *     higher pitch when there is no previous note yet.
 *   - When no chord-tone match exists in the voicing, we fall back to the
 *     treble window indexed by the degree, modulo its length.
 */
function resolveDegreeNote(
  degree: number,
  chordTonesNames: string[],
  upperPool: MidiNote[],
  trebleWindow: MidiNote[],
  previousMidi: number | null,
): MidiNote {
  const targetName = chordTonesNames[degree % Math.max(1, chordTonesNames.length)];
  const matches = upperPool.filter((note) => note.noteName === targetName);
  if (matches.length > 0) {
    return matches.reduce((best, candidate) => {
      if (previousMidi === null) {
        return candidate.midi > best.midi ? candidate : best;
      }
      const bestDistance = Math.abs(best.midi - previousMidi);
      const candidateDistance = Math.abs(candidate.midi - previousMidi);
      if (candidateDistance !== bestDistance) {
        return candidateDistance < bestDistance ? candidate : best;
      }
      return candidate.midi > best.midi ? candidate : best;
    });
  }
  const fallbackIndex = trebleWindow.length > 0 ? degree % trebleWindow.length : 0;
  return trebleWindow[fallbackIndex] ?? upperPool[upperPool.length - 1] ?? upperPool[0];
}

interface ResolvedFingerpickStep {
  note: MidiNote;
  isBass: boolean;
}

function resolveFingerpickPattern(
  pattern: FingerpickPattern,
  sourceNotes: MidiNote[],
  chordTones: MidiNote[],
): ResolvedFingerpickStep[] {
  const bass = sourceNotes[0];
  const altBass = pickAlternateBass(sourceNotes);
  const upperPool = sourceNotes.length > 1 ? sourceNotes.slice(1) : sourceNotes;
  const chordToneNames = Array.from(new Set(
    (chordTones.length > 0 ? chordTones : upperPool).map((note) => note.noteName),
  ));
  const trebleWindow = upperPool.slice(Math.max(0, upperPool.length - Math.min(3, upperPool.length)));

  let previousMidi: number | null = null;
  return pattern.map((step) => {
    if (step === 'T') {
      previousMidi = bass.midi;
      return { note: bass, isBass: true };
    }
    if (step === 'T2') {
      previousMidi = altBass.midi;
      return { note: altBass, isBass: true };
    }
    const note = resolveDegreeNote(step, chordToneNames, upperPool, trebleWindow, previousMidi);
    previousMidi = note.midi;
    return { note, isBass: false };
  });
}

/**
 * Metric-accent scalar in [0, 1] for a single strum stroke. Real guitarists
 * don't strum every beat at the same volume — beat 1 is the "bomb", beat 3
 * (in 4/4) is the secondary anchor, backbeats are restrained, and off-beat
 * upstrokes are heavily ghosted. Returning a 0–1 scale lets the caller lerp
 * between a ghost-velocity floor and the full accented-downstroke ceiling,
 * and apply a non-linear curve so weak strokes are pulled down harder than
 * strong ones.
 *
 *   1.00 — measure downbeat (beat 1, down)
 *   0.80 — secondary accent (beat 3 in 4/4, beat 4 in 6/8)
 *   0.48 — on-beat backbeat downstroke (beats 2/4 in 4/4)
 *   0.36 — on-beat upstroke (uncommon; still softer than a down)
 *   0.28 — syncopated off-beat downstroke (anticipation push)
 *   0.19 — off-beat upstroke (ghost strum — soft, slightly lifted so 2& is
 *         audible under the backbeat without approaching beat 3)
 */
function resolveStrumAccentScale(
  positionInMeasure: number,
  beatDuration: number,
  timeSignature: number,
  direction: GuitarStrumDirection,
): number {
  if (beatDuration <= 0) return direction === 'down' ? 1 : 0.19;
  const beatIndexExact = positionInMeasure / beatDuration;
  const beatIndex = Math.round(beatIndexExact);
  const onBeat = Math.abs(beatIndexExact - beatIndex) < 0.15;

  if (direction === 'up') {
    return onBeat ? 0.36 : 0.19;
  }

  if (!onBeat) {
    return 0.28;
  }

  if (beatIndex === 0) return 1.0;

  if (timeSignature === 4) {
    return beatIndex === 2 ? 0.80 : 0.48;
  }
  if (timeSignature === 3) {
    return beatIndex === 2 ? 0.58 : 0.40;
  }
  if (timeSignature === 6) {
    return beatIndex === 3 ? 0.74 : 0.36;
  }
  const half = Math.floor(timeSignature / 2);
  return beatIndex === half ? 0.70 : 0.40;
}

export function generateGuitarNotes(
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
  const strumTransitionBlend = easeInOutSineCurve(
    clamp01((FINGERPICK_TO_STRUM_THRESHOLD - fingerpickBlend) / FINGERPICK_TO_STRUM_TRANSITION_WINDOW),
  );
  const bassVelocity = mix(0.84, 0.94, easeInOutSineCurve(1 - quietness * 0.55));
  const altBassVelocity = bassVelocity * 0.92; // slightly softer to keep root accent
  const upperVelocity = mix(0.66, 0.78, easeInOutSineCurve(motion * 0.4 + fullness * 0.25));

  // Lowered from 0.84 → 0.62 so fingerpicking is the prevailing texture and
  // we only escalate to strumming when the audio is clearly fuller/louder.
  if (fingerpickBlend > FINGERPICK_TO_STRUM_THRESHOLD) {
    const notes: ScheduledNote[] = [];
    const stepOffsets = timeSignature === 3
      ? [0, beatDuration, beatDuration * 2]
      : timeSignature === 6
        ? [0, beatDuration, beatDuration * 2, beatDuration * 3, beatDuration * 4, beatDuration * 5]
        : [0, beatDuration, beatDuration * 2, beatDuration * 3];
    const cycleDuration = Math.max(beatDuration, beatDuration * Math.max(1, timeSignature === 6 ? 6 : timeSignature));

    // Per-chord seed gives variety: each new chord rolls a different idiom
    // from the pattern library while staying deterministic for the same chord
    // boundaries (so the visualizer matches playback).
    const patternSeed = hashPatternSeed(
      `${chordName}:${duration.toFixed(3)}:${beatDuration.toFixed(3)}:${timeSignature}`,
    );
    const pattern = selectFingerpickPattern(timeSignature, patternSeed);
    const resolvedPattern = resolveFingerpickPattern(pattern, sourceNotes, chordTones);

    for (let cycleStart = 0; cycleStart < duration - TIMING_EPSILON; cycleStart += cycleDuration) {
      for (let stepIndex = 0; stepIndex < stepOffsets.length; stepIndex += 1) {
        const startOffset = cycleStart + stepOffsets[stepIndex];
        if (startOffset >= duration) break;

        const stepResolution = resolvedPattern[stepIndex % resolvedPattern.length];
        if (!stepResolution) continue;

        const patternStep = pattern[stepIndex % pattern.length];
        const isPrimaryBass = patternStep === 'T';
        const isAltBass = patternStep === 'T2';

        const nextStart = stepIndex + 1 < stepOffsets.length
          ? cycleStart + stepOffsets[stepIndex + 1]
          : Math.min(duration, cycleStart + cycleDuration);
        notes.push({
          noteName: stepResolution.note.name,
          midi: stepResolution.note.midi,
          startOffset,
          duration: Math.max(beatDuration * 0.8, nextStart - startOffset),
          velocityMultiplier: isPrimaryBass
            ? bassVelocity
            : isAltBass
              ? altBassVelocity
              : upperVelocity,
          isBass: stepResolution.isBass,
        });
      }
    }

    return notes;
  }

  const strums = buildGuitarStrumPattern(duration, beatDuration, timeSignature, signalDynamics);
  const notes: ScheduledNote[] = [];
  const trimmedVoiceCount = quietness > 0.58 ? 5 : quietness > 0.32 ? 6 : sourceNotes.length;
  const transitionVoiceFloor = Math.min(sourceNotes.length, 4);
  const transitionedVoiceCount = Math.max(
    1,
    Math.round(mix(transitionVoiceFloor, trimmedVoiceCount, strumTransitionBlend)),
  );
  const strummedNotes = sourceNotes.length > transitionedVoiceCount
    ? [sourceNotes[0], ...sourceNotes.slice(sourceNotes.length - Math.max(1, transitionedVoiceCount - 1))]
    : sourceNotes;
  const stringSweepDelay = mix(0.018, 0.008, fullness * 0.72 + motion * 0.28);
  const measureDuration = Math.max(beatDuration, beatDuration * Math.max(1, timeSignature));
  // Ceiling of the dynamic range — beat-1 downstrokes hit this level.
  const baseAccentedDownStrumVelocity = mix(0.90, 1.08, easeInOutSineCurve(fullness * 0.72 + motion * 0.28));
  const transitionEntryStrumVelocity = Math.max(bassVelocity * 0.94, upperVelocity + 0.1);
  const accentedDownStrumVelocity = mix(
    transitionEntryStrumVelocity,
    baseAccentedDownStrumVelocity,
    strumTransitionBlend,
  );
  // Floor of the dynamic range — off-beat ghost upstrokes sit here. Pulled
  // down hard (~0.18–0.30) so ghost strokes genuinely whisper against the
  // beat-1 "bomb" rather than sitting in the same loudness neighbourhood.
  const baseGhostStrumVelocity = mix(0.18, 0.30, easeInOutSineCurve(fullness * 0.5 + motion * 0.5));
  const transitionGhostStrumVelocity = Math.max(
    baseGhostStrumVelocity,
    Math.min(transitionEntryStrumVelocity - 0.18, upperVelocity * 0.58),
  );
  const ghostStrumVelocity = mix(
    transitionGhostStrumVelocity,
    baseGhostStrumVelocity,
    strumTransitionBlend,
  );
  // Weak off-beat upstrokes also catch fewer strings — real players rake
  // only the top ~3 strings on ghost ups. This compounds the velocity
  // taper with a textural one, making weak strokes feel genuinely lighter.
  const ghostStrumStringCount = Math.max(2, Math.min(strummedNotes.length, 3));
  // Power curve applied to the accent scale before mixing. Exponents > 1
  // pull middle-range scales (0.3–0.6) closer to the ghost floor while
  // leaving the beat-1 peak (scale = 1) untouched, so the gap between
  // strong and weak strokes widens without capping the accent.
  const accentCurveExponent = mix(1.08, 1.6, strumTransitionBlend);

  for (const strum of strums) {
    const positionInMeasure = strum.startOffset % measureDuration;
    const accentScale = resolveStrumAccentScale(
      positionInMeasure,
      beatDuration,
      timeSignature,
      strum.direction,
    );
    const shapedAccent = Math.pow(accentScale, accentCurveExponent);
    const velocityBase = mix(ghostStrumVelocity, accentedDownStrumVelocity, shapedAccent);

    // Ghost strokes (both off-beat ups and the syncopated off-beat downs)
    // only rake the top strings; on-beat strokes use the full voicing.
    const isGhostStroke = accentScale <= 0.32;
    const voicingForStroke = isGhostStroke
      ? strummedNotes.slice(Math.max(0, strummedNotes.length - ghostStrumStringCount))
      : strummedNotes;
    const orderedNotes = strum.direction === 'down' ? voicingForStroke : [...voicingForStroke].reverse();

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
        isBass: stringIndex === 0 && strum.direction === 'down' && accentScale >= 0.7,
      });
    });
  }

  return notes;
}
