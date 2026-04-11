import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import type { MidiNote } from '@/utils/chordToMidi';
import {
  buildGuitarStrumPattern,
  resolveGuitarVoicingMidiNotes,
  type GuitarVoicingSelection,
} from '@/utils/guitarVoicing';

import { TIMING_EPSILON } from '../constants';
import { clamp01, easeInOutSineCurve, mix, resolveFullness, resolveMotion, resolveQuietness } from '../signalDynamics';
import type { ScheduledNote } from '../types';

function buildAlternatingFingerpickTrebleSequence(
  sourceNotes: MidiNote[],
  chordTones: MidiNote[],
): MidiNote[] {
  const upperPool = sourceNotes.length > 1 ? sourceNotes.slice(1) : sourceNotes;
  if (upperPool.length <= 1) {
    return upperPool;
  }

  const chordToneNames = Array.from(new Set(
    (chordTones.length > 0 ? chordTones : upperPool).map((note) => note.noteName),
  ));
  const degreePattern = chordToneNames.length >= 3
    ? [1, 0, 2, 0]
    : chordToneNames.length === 2
      ? [1, 0, 1, 0]
      : [0];
  const trebleWindow = upperPool.slice(Math.max(0, upperPool.length - Math.min(3, upperPool.length)));
  const fallbackPattern = trebleWindow.length >= 3
    ? [0, 2, 1, 2]
    : trebleWindow.length === 2
      ? [0, 1, 0, 1]
      : [0];

  let previousMidi: number | null = null;

  return degreePattern.map((degreeIndex, patternIndex) => {
    const targetNoteName = chordToneNames[degreeIndex] ?? chordToneNames[0];
    const matchingCandidates = upperPool.filter((note) => note.noteName === targetNoteName);

    if (matchingCandidates.length > 0) {
      const preferredCandidate = matchingCandidates.reduce((best, candidate) => {
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

      previousMidi = preferredCandidate.midi;
      return preferredCandidate;
    }

    const fallbackCandidate = trebleWindow[fallbackPattern[patternIndex % fallbackPattern.length] ?? 0] ?? upperPool[upperPool.length - 1];
    previousMidi = fallbackCandidate.midi;
    return fallbackCandidate;
  });
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

  if (fingerpickBlend > 0.84) {
    const notes: ScheduledNote[] = [];
    const upperPool = sourceNotes.length > 1 ? sourceNotes.slice(1) : sourceNotes;
    const alternatingTrebleSequence = buildAlternatingFingerpickTrebleSequence(sourceNotes, chordTones);
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
          : alternatingTrebleSequence[(stepIndex - 1) % alternatingTrebleSequence.length]
            ?? upperPool[(stepIndex - 1) % upperPool.length];
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
