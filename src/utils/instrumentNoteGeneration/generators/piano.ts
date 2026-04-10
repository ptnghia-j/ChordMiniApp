import type { ChordSignalDynamics } from '@/services/audio/audioDynamicsTypes';
import type { SegmentationResult } from '@/types/chatbotTypes';
import { noteNameToMidi, type MidiNote } from '@/utils/chordToMidi';

import {
  BASS_VELOCITY_BOOST,
  PIANO_ARPEGGIO_PATTERNS_COMMON,
  PIANO_ARPEGGIO_PATTERNS_SPARSE,
  PIANO_ARPEGGIO_PATTERNS_WALTZ,
  PIANO_INITIAL_FIFTH_BRIDGE_THRESHOLD,
  PIANO_SHORT_BLOCK_CHORD_VOLUME_REDUCTION,
  TIMING_EPSILON,
} from '../constants';
import { getActiveSegmentationSegmentForTime, hashPatternSeed, isSparsePianoSegment } from '../segmentContext';
import { clamp01, easeInOutSineCurve, mix, resolveAttack, resolveFullness, resolveMotion, resolveQuietness } from '../signalDynamics';
import type { ScheduledNote } from '../types';

export function separateRepeatedUpperPianoNotes(
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
export function generatePianoNotes(
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
