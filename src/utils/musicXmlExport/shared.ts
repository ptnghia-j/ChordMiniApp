import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';
import {
  CHORD_STRUCTURES,
  CHORD_TYPE_ALIASES,
  NOTE_INDEX_MAP,
} from '@/utils/chordToMidi';
import { getAccidentalPreferenceFromKey } from '@/utils/chordUtils';
import { canonicalizeKeySignature } from '@/utils/keySignatureUtils';
import {
  DIVISIONS_PER_QUARTER,
  MIN_DIVISION,
} from './constants';
import type { MeasureLayoutConfig } from './types';

type MusicStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

const STEP_SEQUENCE: MusicStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_TO_PITCH_CLASS: Record<MusicStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const INTERVAL_CLASS_TO_DEGREE: Record<number, number> = {
  0: 1,
  1: 2,
  2: 2,
  3: 3,
  4: 3,
  5: 4,
  6: 5,
  7: 5,
  8: 5,
  9: 6,
  10: 7,
  11: 7,
};
const NO_CHORD_TOKENS = new Set(['N', 'N.C.', 'N/C', 'NC']);

function applyRootAccidentalPreference(
  rootToken: string,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
): string {
  const toFlatMap: Record<string, string> = {
    'C#': 'Db',
    'D#': 'Eb',
    'F#': 'Gb',
    'G#': 'Ab',
    'A#': 'Bb',
  };
  const toSharpMap: Record<string, string> = {
    Db: 'C#',
    Eb: 'D#',
    Gb: 'F#',
    Ab: 'G#',
    Bb: 'A#',
  };

  if (accidentalPreference === 'flat') {
    return toFlatMap[rootToken] ?? rootToken;
  }

  if (accidentalPreference === 'sharp') {
    return toSharpMap[rootToken] ?? rootToken;
  }

  return rootToken;
}

function parseChordContextForSpelling(
  chordName: string | undefined,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
): {
  rootStep: MusicStep;
  rootPitchClass: number;
  intervals: number[];
} | null {
  const normalizedChordName = chordName
    ?.replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .trim();

  if (!normalizedChordName || NO_CHORD_TOKENS.has(normalizedChordName.toUpperCase())) {
    return null;
  }

  const [baseChord] = normalizedChordName.split('/');
  const match = baseChord?.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) {
    return null;
  }

  const [, rootLetter, rootAccidental, rawChordType] = match;
  const normalizedRootToken = `${rootLetter.toUpperCase()}${rootAccidental ?? ''}`;
  const rootToken = applyRootAccidentalPreference(normalizedRootToken, accidentalPreference);
  const rootMatch = rootToken.match(/^([A-G])([#b]?)$/);

  if (!rootMatch) {
    return null;
  }

  const [, resolvedRootStep] = rootMatch;
  const rootStep = resolvedRootStep as MusicStep;
  const rootPitchClass = NOTE_INDEX_MAP[rootToken];

  if (rootPitchClass === undefined) {
    return null;
  }

  const cleanedType = (rawChordType ?? '')
    .replace(/^[^A-Za-z0-9#b°ø+]+/, '')
    .replace(/\s+/g, '');
  const normalizedChordType = CHORD_TYPE_ALIASES[cleanedType]
    ?? CHORD_TYPE_ALIASES[cleanedType.toLowerCase()]
    ?? 'major';
  const intervals = CHORD_STRUCTURES[normalizedChordType];

  if (!intervals || intervals.length === 0) {
    return null;
  }

  return {
    rootStep,
    rootPitchClass,
    intervals,
  };
}

function resolveChordAwarePitch(
  pitchClass: number,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
  chordName?: string,
): { step: MusicStep; alter?: number } | null {
  const chordContext = parseChordContextForSpelling(chordName, accidentalPreference);
  if (!chordContext) {
    return null;
  }

  const relativePitchClass = (pitchClass - chordContext.rootPitchClass + 12) % 12;
  const matchingIntervals = chordContext.intervals.filter((interval) => ((interval % 12) + 12) % 12 === relativePitchClass);

  if (matchingIntervals.length === 0) {
    return null;
  }

  const intervalClass = ((matchingIntervals[0] % 12) + 12) % 12;
  const degree = INTERVAL_CLASS_TO_DEGREE[intervalClass];
  if (!degree) {
    return null;
  }

  const rootStepIndex = STEP_SEQUENCE.indexOf(chordContext.rootStep);
  const targetStep = STEP_SEQUENCE[(rootStepIndex + degree - 1) % STEP_SEQUENCE.length];
  const targetNaturalPitchClass = STEP_TO_PITCH_CLASS[targetStep];
  const alter = ((pitchClass - targetNaturalPitchClass + 18) % 12) - 6;

  if (alter < -2 || alter > 2) {
    return null;
  }

  return alter === 0
    ? { step: targetStep }
    : { step: targetStep, alter };
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getKeyAccidentalPreference(
  keySignature?: string | null,
): 'sharp' | 'flat' | null | undefined {
  return getAccidentalPreferenceFromKey(keySignature);
}

export function formatLeadSheetChordLabel(chordName: string, keySignature?: string | null): string {
  if (!chordName || chordName === 'N' || chordName === 'N/C' || chordName === 'N.C.') {
    return '';
  }

  const accidentalPreference = getKeyAccidentalPreference(keySignature) ?? undefined;
  const formatted = formatChordWithMusicalSymbols(chordName, false, accidentalPreference);
  return stripHtmlTags(formatted);
}

export function normalizeKeySignature(value?: string | null): string {
  const normalizedValue = canonicalizeKeySignature(value) ?? value;

  return normalizedValue
    ?.trim()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/\s+/g, ' ')
    .toLowerCase() ?? '';
}

export function getKeyFifths(keySignature?: string | null): number {
  const normalized = normalizeKeySignature(keySignature);
  if (!normalized) {
    return 0;
  }

  const majorMap: Record<string, number> = {
    cb: -7,
    gb: -6,
    db: -5,
    ab: -4,
    eb: -3,
    bb: -2,
    f: -1,
    c: 0,
    g: 1,
    d: 2,
    a: 3,
    e: 4,
    b: 5,
    'f#': 6,
    'c#': 7,
  };

  const minorMap: Record<string, number> = {
    ab: -7,
    eb: -6,
    bb: -5,
    f: -4,
    c: -3,
    g: -2,
    d: -1,
    a: 0,
    e: 1,
    b: 2,
    'f#': 3,
    'c#': 4,
    'g#': 5,
    'd#': 6,
    'a#': 7,
  };

  const match = normalized.match(/^([a-g](?:#|b)?)(?:\s+(major|minor))?$/);
  if (!match) {
    return 0;
  }

  const [, root, quality] = match;
  if (quality === 'minor') {
    return minorMap[root] ?? 0;
  }

  return majorMap[root] ?? 0;
}

export function pitchToMusicXml(
  pitch: number,
  accidentalPreference: 'sharp' | 'flat' | null | undefined,
  chordName?: string,
): { step: string; alter?: number; octave: number } {
  const normalized = Math.max(0, Math.min(127, Math.round(pitch)));
  const octave = Math.floor(normalized / 12) - 1;
  const pitchClass = normalized % 12;
  const chordAwarePitch = resolveChordAwarePitch(pitchClass, accidentalPreference, chordName);

  if (chordAwarePitch) {
    return {
      step: chordAwarePitch.step,
      alter: chordAwarePitch.alter,
      octave,
    };
  }

  if (accidentalPreference === 'flat') {
    switch (pitchClass) {
      case 0: return { step: 'C', octave };
      case 1: return { step: 'D', alter: -1, octave };
      case 2: return { step: 'D', octave };
      case 3: return { step: 'E', alter: -1, octave };
      case 4: return { step: 'E', octave };
      case 5: return { step: 'F', octave };
      case 6: return { step: 'G', alter: -1, octave };
      case 7: return { step: 'G', octave };
      case 8: return { step: 'A', alter: -1, octave };
      case 9: return { step: 'A', octave };
      case 10: return { step: 'B', alter: -1, octave };
      default: return { step: 'B', octave };
    }
  }

  switch (pitchClass) {
    case 0: return { step: 'C', octave };
    case 1: return { step: 'C', alter: 1, octave };
    case 2: return { step: 'D', octave };
    case 3: return { step: 'D', alter: 1, octave };
    case 4: return { step: 'E', octave };
    case 5: return { step: 'F', octave };
    case 6: return { step: 'F', alter: 1, octave };
    case 7: return { step: 'G', octave };
    case 8: return { step: 'G', alter: 1, octave };
    case 9: return { step: 'A', octave };
    case 10: return { step: 'A', alter: 1, octave };
    default: return { step: 'B', octave };
  }
}

export function secondsToDivisions(seconds: number, bpm: number): number {
  return Math.round(seconds * (bpm / 60) * DIVISIONS_PER_QUARTER);
}

export function divisionsToSeconds(divisions: number, bpm: number): number {
  if (bpm <= 0) {
    return 0;
  }

  return divisions * (60 / (bpm * DIVISIONS_PER_QUARTER));
}

export function secondsToGenericDivisions(
  seconds: number,
  bpm: number,
  divisionsPerQuarter: number,
): number {
  return Math.round(seconds * (bpm / 60) * divisionsPerQuarter);
}

export function beatPositionToGenericDivisions(
  beatPosition: number,
  divisionsPerQuarter: number,
): number {
  return Math.round(beatPosition * divisionsPerQuarter);
}

export function divisionsToGenericSeconds(
  divisions: number,
  bpm: number,
  divisionsPerQuarter: number,
): number {
  if (bpm <= 0) {
    return 0;
  }

  return divisions * (60 / (bpm * divisionsPerQuarter));
}

export function quantizeDivision(value: number): number {
  return Math.max(0, Math.round(value / MIN_DIVISION) * MIN_DIVISION);
}

export function buildMeasureLayout(
  transferDivisions: number,
  divisionsPerMeasure: number,
): MeasureLayoutConfig {
  const normalizedTransfer = Math.max(0, Math.round(transferDivisions));
  const pickupDivisions = divisionsPerMeasure > 0
    ? normalizedTransfer % divisionsPerMeasure
    : 0;

  return {
    divisionsPerMeasure,
    firstMeasureDivisions: pickupDivisions > 0 ? pickupDivisions : divisionsPerMeasure,
  };
}

export function getMeasureStartDivision(
  measureIndex: number,
  layout: MeasureLayoutConfig,
): number {
  if (measureIndex <= 0) {
    return 0;
  }

  return layout.firstMeasureDivisions + ((measureIndex - 1) * layout.divisionsPerMeasure);
}

export function getMeasureLengthDivisions(
  measureIndex: number,
  layout: MeasureLayoutConfig,
): number {
  return measureIndex === 0 ? layout.firstMeasureDivisions : layout.divisionsPerMeasure;
}

export function getMeasureIndexForDivision(
  division: number,
  layout: MeasureLayoutConfig,
): number {
  if (division < layout.firstMeasureDivisions) {
    return 0;
  }

  if (layout.divisionsPerMeasure <= 0) {
    return 0;
  }

  return 1 + Math.floor((division - layout.firstMeasureDivisions) / layout.divisionsPerMeasure);
}

export function getBeatGroupSize(timeSignature: number): number {
  if (timeSignature >= 6 && timeSignature % 3 === 0) {
    return DIVISIONS_PER_QUARTER * 3;
  }

  return DIVISIONS_PER_QUARTER;
}

export function getGenericBeatGroupSize(
  timeSignature: number,
  divisionsPerQuarter: number,
): number {
  if (timeSignature >= 6 && timeSignature % 3 === 0) {
    return divisionsPerQuarter * 3;
  }

  return divisionsPerQuarter;
}

export function isCompoundTime(timeSignature: number): boolean {
  return timeSignature >= 6 && timeSignature % 3 === 0;
}

export function fitsWithinGroup(start: number, duration: number, groupSize: number): boolean {
  if (groupSize <= 0) {
    return false;
  }

  const groupStart = Math.floor(start / groupSize) * groupSize;
  return start + duration <= groupStart + groupSize;
}
