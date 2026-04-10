import { noteNameToMidi, NOTE_INDEX_MAP, type MidiNote } from '@/utils/chordToMidi';

import { CHROMATIC_SCALE, PIANO_PATTERN_MIN_BEATS } from '../constants';
import { hashPatternSeed } from '../segmentContext';
import type { ScheduledNote } from '../types';

export function generateViolinNotes(
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

export function generateMelodyViolinNotes(
  rootName: string,
  duration: number,
): ScheduledNote[] {
  return generateViolinNotes(rootName, duration);
}

export function generateFluteNotes(
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

export function generateBassNotes(
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

export function generateSaxophoneNotes(): ScheduledNote[] {
  return [];
}
