'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, addToast, closeToast, ToastProvider } from '@heroui/react';
import GuitarChordDiagram from '@/components/chord-playback/GuitarChordDiagram';
import AppTooltip from '@/components/common/AppTooltip';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';
import { defaultToastClassNames, mergeToastClassNames } from '@/utils/toastStyles';

interface ExtractionWaitPanelProps {
  queueStatus?: 'queued' | 'active' | 'released' | 'cancelled' | 'expired' | null;
  queuePosition?: number | null;
  estimatedWaitSeconds?: number | null;
  statusMessage?: string;
}

type Mark = 'X' | 'O' | null;
type GameMode = 'quiz' | 'ear' | 'guitar' | 'xo';
type QuizResult = 'correct' | 'incorrect' | null;
type ScaleType = 'major' | 'natural minor';
type EarQuestionType = 'degree' | 'progression' | 'quality';
type MiniGameNoticeId = 'intro' | 'modes';

interface QuizScore {
  correct: number;
  attempted: number;
}

interface ChordLabelQuizQuestion {
  type: 'label';
  notes: string[];
  answer: string;
  options: string[];
}

interface ChordToneQuizQuestion {
  type: 'tone';
  chord: string;
  missing: string;
  tones: string[];
  options: string[];
}

interface ScaleDegreeQuizQuestion {
  type: 'degree';
  chord: string;
  qualityText: string;
  answer: string;
  options: string[];
}

interface ScaleNoteQuizQuestion {
  type: 'scale';
  prompt: string;
  tonic: string;
  scaleType: ScaleType;
  answer: string;
  options: string[];
}

interface SecondaryDominantQuizQuestion {
  type: 'secondary';
  key: string;
  progression: string[];
  answer: string;
  options: string[];
}

type QuizQuestion =
  | ChordLabelQuizQuestion
  | ChordToneQuizQuestion
  | ScaleDegreeQuizQuestion
  | ScaleNoteQuizQuestion
  | SecondaryDominantQuizQuestion;

interface EarTrainingQuestion {
  type: EarQuestionType;
  prompt: string;
  answer: string;
  options: string[];
  tonic?: string;
  scaleType?: ScaleType;
  degree?: number;
  targetNote?: string;
  progression?: string[];
  chord?: string;
  qualityKey?: string;
}

interface ChordPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
}

interface GuitarChordQuestion {
  answer: string;
  options: string[];
  chordData: {
    key: string;
    suffix: string;
    positions: ChordPosition[];
  };
}

interface ChordQualitySpec {
  suffix: string;
  qualityText: string;
  intervals: number[];
  labelDistractors: string[];
}

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_INDEX: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  'E#': 5, F: 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_KEY_QUALITIES = ['M', 'm', 'm', 'M', 'M', 'm', 'dim'] as const;
const NATURAL_MINOR_KEY_QUALITIES = ['m', 'dim', 'M', 'm', 'm', 'M', 'M'] as const;
const ROMAN_BASES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SCALE_DEGREE_NAMES = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading tone'];
const NATURAL_MINOR_DEGREE_NAMES = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'subtonic'];

const CHORD_QUALITIES: Record<string, ChordQualitySpec> = {
  major: { suffix: '', qualityText: 'major', intervals: [0, 4, 7], labelDistractors: ['m', 'sus4', 'dim'] },
  minor: { suffix: 'm', qualityText: 'minor', intervals: [0, 3, 7], labelDistractors: ['', 'sus2', '7'] },
  dominant7: { suffix: '7', qualityText: 'dominant seventh', intervals: [0, 4, 7, 10], labelDistractors: ['', 'm7', 'maj7'] },
  maj7: { suffix: 'maj7', qualityText: 'major seventh', intervals: [0, 4, 7, 11], labelDistractors: ['7', 'm7', 'dim'] },
  colonMaj7: { suffix: ':maj7', qualityText: 'major seventh', intervals: [0, 4, 7, 11], labelDistractors: ['7', 'm7', 'dim'] },
  minor7: { suffix: 'm7', qualityText: 'minor seventh', intervals: [0, 3, 7, 10], labelDistractors: ['7', 'maj7', 'm7b5'] },
  diminished: { suffix: 'dim', qualityText: 'diminished', intervals: [0, 3, 6], labelDistractors: ['m', 'aug', 'sus4'] },
  halfDiminished: { suffix: 'm7b5', qualityText: 'half-diminished seventh', intervals: [0, 3, 6, 10], labelDistractors: ['m7', 'dim', '7'] },
  sus4: { suffix: 'sus4', qualityText: 'suspended fourth', intervals: [0, 5, 7], labelDistractors: ['', 'm', 'sus2'] },
};

const LABEL_ROOTS = ['C', 'G', 'F', 'D', 'A', 'Bb', 'E', 'F#', 'Eb', 'Ab', 'B', 'C#'];
const LABEL_QUALITY_KEYS = ['major', 'dominant7', 'maj7', 'major', 'minor7', 'sus4', 'diminished', 'colonMaj7', 'halfDiminished'];
const TONE_ROOTS = ['D', 'E', 'Bb', 'D', 'G', 'C#', 'F', 'Ab', 'B', 'Eb', 'A', 'F#'];
const TONE_QUALITY_KEYS = ['minor', 'dominant7', 'maj7', 'colonMaj7', 'sus4', 'minor7', 'halfDiminished', 'dominant7'];
const DEGREE_KEYS = ['A', 'C', 'A', 'A', 'G', 'Eb', 'D', 'F', 'Bb', 'E'];
const DEGREE_NUMBERS = [4, 6, 6, 4, 2, 5, 3, 7, 2, 5];
const DEGREE_EXTENSION_KEYS = ['triad', 'triad', 'triad', 'maj7', 'm7', '7', 'm7', 'dim', 'm7', '7'];
const SCALE_ROOTS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'B', 'F#'];
const SCALE_DEGREES = [3, 6, 2, 7, 4, 5, 6, 2, 7, 3];
const SECONDARY_KEYS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb', 'E'];
const SECONDARY_TARGET_DEGREES = [5, 2, 6, 3, 4];
const EAR_ROOTS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'E', 'Eb'];
const EAR_DEGREES = [3, 5, 6, 2, 7, 4, 1];
const EAR_PROGRESSIONS = [
  { numerals: 'I - V - vi - IV', degrees: [1, 5, 6, 4] },
  { numerals: 'i - VI - III - VII', degrees: [1, 6, 3, 7], scaleType: 'natural minor' as ScaleType },
  { numerals: 'I - vi - IV - V', degrees: [1, 6, 4, 5] },
  { numerals: 'i - iv - VII - III', degrees: [1, 4, 7, 3], scaleType: 'natural minor' as ScaleType },
];
const EAR_QUALITY_KEYS = ['major', 'minor', 'dominant7', 'maj7', 'minor7', 'diminished', 'sus4'];
const MINI_GAME_TABS: Array<[GameMode, string, string]> = [
  ['quiz', 'Quiz', 'Short music theory questions: scales, chord labels, roman numerals, and tonicization.'],
  ['ear', 'Ear', 'Play a reference sound, then identify scale degrees, progressions, or chord quality.'],
  ['guitar', 'Guitar', 'Read the guitar chord diagram and choose the matching chord name.'],
  ['xo', 'X/O', 'A quick single-player X/O board. You play X; O responds automatically.'],
];
const MINI_GAME_NOTICES = [
  {
    id: 'intro' as MiniGameNoticeId,
    title: 'Mini Games While You Wait',
    description: 'Play inside the empty analysis area while extraction or inference finishes.',
    color: 'primary' as const,
  },
  {
    id: 'modes' as MiniGameNoticeId,
    title: 'Choose a Mode',
    description: 'Quiz covers theory, Ear plays sounds, Guitar shows chord shapes, and X/O is a quick board game.',
    color: 'success' as const,
  },
];

const GUITAR_QUESTIONS: GuitarChordQuestion[] = [
  {
    answer: 'C',
    options: ['C', 'G', 'Am', 'D'],
    chordData: {
      key: 'C',
      suffix: 'major',
      positions: [{ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'G',
    options: ['Em', 'G', 'D', 'C'],
    chordData: {
      key: 'G',
      suffix: 'major',
      positions: [{ frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'Am',
    options: ['A', 'Am', 'C', 'Em'],
    chordData: {
      key: 'A',
      suffix: 'minor',
      positions: [{ frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'D',
    options: ['Dm', 'D', 'G', 'A7'],
    chordData: {
      key: 'D',
      suffix: 'major',
      positions: [{ frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'E',
    options: ['E', 'Em', 'A', 'B7'],
    chordData: {
      key: 'E',
      suffix: 'major',
      positions: [{ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'Em',
    options: ['E', 'Em', 'G', 'C'],
    chordData: {
      key: 'E',
      suffix: 'minor',
      positions: [{ frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'Dm',
    options: ['D', 'Dm', 'Am', 'F'],
    chordData: {
      key: 'D',
      suffix: 'minor',
      positions: [{ frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'F',
    options: ['F', 'C', 'G', 'Dm'],
    chordData: {
      key: 'F',
      suffix: 'major',
      positions: [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barres: [1] }],
    },
  },
  {
    answer: 'Bm',
    options: ['B7', 'Bm', 'D', 'F#m'],
    chordData: {
      key: 'B',
      suffix: 'minor',
      positions: [{ frets: [-1, 2, 4, 4, 3, 2], fingers: [1, 1, 3, 4, 2, 1], baseFret: 2, barres: [2] }],
    },
  },
  {
    answer: 'A',
    options: ['A', 'Am', 'D', 'E'],
    chordData: {
      key: 'A',
      suffix: 'major',
      positions: [{ frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'C7',
    options: ['C', 'C7', 'F', 'G7'],
    chordData: {
      key: 'C',
      suffix: '7',
      positions: [{ frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'G7',
    options: ['G', 'G7', 'C', 'D7'],
    chordData: {
      key: 'G',
      suffix: '7',
      positions: [{ frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'B7',
    options: ['B7', 'Bm', 'E', 'Em'],
    chordData: {
      key: 'B',
      suffix: '7',
      positions: [{ frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'A7',
    options: ['A', 'A7', 'D', 'E7'],
    chordData: {
      key: 'A',
      suffix: '7',
      positions: [{ frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0], baseFret: 1, barres: [] }],
    },
  },
  {
    answer: 'D7',
    options: ['D', 'D7', 'G', 'Am'],
    chordData: {
      key: 'D',
      suffix: '7',
      positions: [{ frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1, barres: [] }],
    },
  },
];

function ChordSymbol({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(value) }}
    />
  );
}

function getFormattedChordText(value: string): string {
  return formatChordWithMusicalSymbols(value)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAccidentalPreference(root: string): 'flat' | 'sharp' {
  return root.includes('b') ? 'flat' : 'sharp';
}

function getNote(root: string, semitoneOffset: number, preference = getAccidentalPreference(root)): string {
  const normalizedRoot = root.replace(/♯/g, '#').replace(/♭/g, 'b');
  const rootIndex = NOTE_INDEX[normalizedRoot] ?? 0;
  const scale = preference === 'flat' ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  return scale[(rootIndex + semitoneOffset + 1200) % 12];
}

function getScaleSteps(scaleType: ScaleType): number[] {
  return scaleType === 'natural minor' ? NATURAL_MINOR_SCALE_STEPS : MAJOR_SCALE_STEPS;
}

function getScaleDegreeNames(scaleType: ScaleType): string[] {
  return scaleType === 'natural minor' ? NATURAL_MINOR_DEGREE_NAMES : SCALE_DEGREE_NAMES;
}

function getScaleNotes(root: string, scaleType: ScaleType): string[] {
  return getScaleSteps(scaleType).map((step) => getNote(root, step, getAccidentalPreference(root)));
}

function getScaleDisplayName(root: string, scaleType: ScaleType): string {
  return `${getFormattedChordText(root)} ${scaleType}`;
}

function getChordLabel(root: string, quality: ChordQualitySpec, inversion?: string): string {
  return `${root}${quality.suffix}${inversion ? `/${inversion}` : ''}`;
}

function getChordNotes(root: string, quality: ChordQualitySpec, inversion?: string): string[] {
  const notes = quality.intervals.map((interval) => getNote(root, interval));
  if (!inversion) return notes;

  const inversionInterval = inversion === '3'
    ? quality.intervals.find((interval) => interval === 3 || interval === 4)
    : inversion === '5'
      ? 7
      : inversion === 'b7'
        ? 10
        : null;

  if (inversionInterval === null || inversionInterval === undefined) {
    return notes;
  }

  const bassNote = getNote(root, inversionInterval);
  return [bassNote, ...notes.filter((note) => note !== bassNote)];
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function rotateOptions(options: string[], seed: number): string[] {
  const normalized = uniqueValues(options).slice(0, 4);
  if (normalized.length < 4) {
    return normalized;
  }
  const offset = seed % normalized.length;
  return [...normalized.slice(offset), ...normalized.slice(0, offset)];
}

function getNeighborNoteOptions(root: string, answer: string, seed: number): string[] {
  const normalizedAnswer = answer.replace(/♯/g, '#').replace(/♭/g, 'b');
  const answerIndex = NOTE_INDEX[normalizedAnswer] ?? 0;
  const preference = getAccidentalPreference(root);
  const scale = preference === 'flat' ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  return rotateOptions([
    scale[(answerIndex + 11) % 12],
    answer,
    scale[(answerIndex + 1) % 12],
    scale[(answerIndex + 2 + seed) % 12],
  ], seed + 1);
}

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createRandomScaleQuestion(): ScaleNoteQuizQuestion {
  const tonic = SCALE_ROOTS[Math.floor(Math.random() * SCALE_ROOTS.length)];
  const scaleType: ScaleType = Math.random() < 0.3 ? 'natural minor' : 'major';
  const degree = SCALE_DEGREES[Math.floor(Math.random() * SCALE_DEGREES.length)];
  const scaleNotes = getScaleNotes(tonic, scaleType);
  const degreeName = getScaleDegreeNames(scaleType)[degree - 1];
  const answer = scaleNotes[degree - 1];
  const chromaticOptions = getNeighborNoteOptions(tonic, answer, Math.floor(Math.random() * 12));

  return {
    type: 'scale',
    prompt: `Degree ${degree} (${degreeName}) in ${getScaleDisplayName(tonic, scaleType)}`,
    tonic,
    scaleType,
    answer,
    options: shuffleArray(chromaticOptions),
  };
}

function createRandomLabelQuestion(): ChordLabelQuizQuestion {
  const root = LABEL_ROOTS[Math.floor(Math.random() * LABEL_ROOTS.length)];
  const qualityKey = LABEL_QUALITY_KEYS[Math.floor(Math.random() * LABEL_QUALITY_KEYS.length)];
  const quality = CHORD_QUALITIES[qualityKey];
  const inversion = Math.random() < 0.25
    ? (Math.random() < 0.5 ? '3' : '5')
    : undefined;
  const answer = getChordLabel(root, quality, inversion);
  const distractorLabels = quality.labelDistractors.map((suffix) => `${root}${suffix}${inversion ? `/${inversion}` : ''}`);
  const specialInversionDistractor = inversion === '3' ? `${root}${quality.suffix ? 'm' : 'm'}/${getNote(root, 4)}` : null;

  const allOptions = uniqueValues([
    answer,
    ...distractorLabels,
    ...(specialInversionDistractor ? [specialInversionDistractor] : []),
  ]);

  return {
    type: 'label',
    notes: getChordNotes(root, quality, inversion),
    answer,
    options: shuffleArray(allOptions).slice(0, 4),
  };
}

function createRandomToneQuestion(): ChordToneQuizQuestion {
  const root = TONE_ROOTS[Math.floor(Math.random() * TONE_ROOTS.length)];
  const qualityKey = TONE_QUALITY_KEYS[Math.floor(Math.random() * TONE_QUALITY_KEYS.length)];
  const quality = CHORD_QUALITIES[qualityKey];
  const chord = getChordLabel(root, quality);
  const notes = getChordNotes(root, quality);
  const missingIndex = Math.floor(Math.random() * notes.length);
  const missing = notes[missingIndex];
  const chromaticOptions = getNeighborNoteOptions(root, missing, Math.floor(Math.random() * 12));

  return {
    type: 'tone',
    chord,
    missing,
    tones: notes.map((note, index) => index === missingIndex ? '?' : note),
    options: shuffleArray(chromaticOptions),
  };
}

function getRomanForDegree(degree: number, quality: 'M' | 'm' | 'dim', extensionKey: string): string {
  const base = ROMAN_BASES[degree - 1] || 'I';
  const roman = quality === 'm'
    ? base.toLowerCase()
    : quality === 'dim'
      ? `${base.toLowerCase()}°`
      : base;

  if (extensionKey === 'maj7') return `${roman}M7`;
  if (extensionKey === 'm7') return `${roman}m7`;
  if (extensionKey === '7') return `${roman}7`;
  return roman;
}

function getDegreeChordSuffix(quality: 'M' | 'm' | 'dim', extensionKey: string): string {
  if (extensionKey === 'maj7') return ':maj7';
  if (extensionKey === 'm7') return quality === 'm' ? 'm7' : 'maj7';
  if (extensionKey === '7') return '7';
  if (quality === 'm') return 'm';
  if (quality === 'dim') return 'dim';
  return '';
}

function createRandomDegreeQuestion(): ScaleDegreeQuizQuestion {
  const key = DEGREE_KEYS[Math.floor(Math.random() * DEGREE_KEYS.length)];
  const degree = DEGREE_NUMBERS[Math.floor(Math.random() * DEGREE_NUMBERS.length)];
  const extensionKey = DEGREE_EXTENSION_KEYS[Math.floor(Math.random() * DEGREE_EXTENSION_KEYS.length)];
  const quality = MAJOR_KEY_QUALITIES[degree - 1];
  const chordRoot = getNote(key, MAJOR_SCALE_STEPS[degree - 1], getAccidentalPreference(key));
  const chord = `${chordRoot}${getDegreeChordSuffix(quality, extensionKey)}`;
  const roman = getRomanForDegree(degree, quality, extensionKey);
  const answer = `${roman} chord of ${key} major`;
  const wrongCaseRoman = quality === 'm'
    ? roman.toUpperCase()
    : roman.toLowerCase();
  const wrongDegree = ((degree + 1) % 7) + 1;
  const wrongKey = DEGREE_KEYS[Math.floor(Math.random() * DEGREE_KEYS.length)];

  const allOptions = uniqueValues([
    answer,
    `${wrongCaseRoman} chord of ${key} major`,
    `${getRomanForDegree(wrongDegree, MAJOR_KEY_QUALITIES[wrongDegree - 1], extensionKey)} chord of ${wrongKey} major`,
    'All are wrong',
  ]);

  return {
    type: 'degree',
    chord,
    qualityText: `${getFormattedChordText(chord)} in ${key} major`,
    answer,
    options: shuffleArray(allOptions).slice(0, 4),
  };
}

function createRandomSecondaryQuestion(): SecondaryDominantQuizQuestion {
  const key = SECONDARY_KEYS[Math.floor(Math.random() * SECONDARY_KEYS.length)];
  const targetDegree = SECONDARY_TARGET_DEGREES[Math.floor(Math.random() * SECONDARY_TARGET_DEGREES.length)];
  const keyNotes = getScaleNotes(key, 'major');
  const targetRoot = keyNotes[targetDegree - 1];
  const targetQuality = MAJOR_KEY_QUALITIES[targetDegree - 1];
  const targetRoman = getRomanForDegree(targetDegree, targetQuality, 'triad');
  const targetChord = `${targetRoot}${getDegreeChordSuffix(targetQuality, 'triad')}`;
  const secondaryRoot = getNote(targetRoot, 7, getAccidentalPreference(targetRoot));
  const secondaryChord = `${secondaryRoot}7`;
  const tonicChord = key;
  const dominantChord = `${keyNotes[4]}7`;
  const answer = `V7/${targetRoman} tonicizing ${targetRoman}`;
  const wrongTargetDegree = SECONDARY_TARGET_DEGREES[Math.floor(Math.random() * SECONDARY_TARGET_DEGREES.length)];
  const wrongTargetQuality = MAJOR_KEY_QUALITIES[wrongTargetDegree - 1];
  const wrongTargetRoman = getRomanForDegree(wrongTargetDegree, wrongTargetQuality, 'triad');

  const allOptions = uniqueValues([
    answer,
    `V7/${wrongTargetRoman} tonicizing ${wrongTargetRoman}`,
    `${getRomanForDegree(targetDegree, targetQuality, '7')} borrowed from ${key} minor`,
    'No tonicization is present',
  ]);

  return {
    type: 'secondary',
    key,
    progression: [tonicChord, secondaryChord, targetChord, dominantChord, tonicChord],
    answer,
    options: shuffleArray(allOptions).slice(0, 4),
  };
}

function createScaleQuestion(sequenceIndex: number): ScaleNoteQuizQuestion {
  const tonic = SCALE_ROOTS[sequenceIndex % SCALE_ROOTS.length];
  const scaleType: ScaleType = sequenceIndex % 3 === 2 ? 'natural minor' : 'major';
  const degree = SCALE_DEGREES[sequenceIndex % SCALE_DEGREES.length];
  const scaleNotes = getScaleNotes(tonic, scaleType);
  const degreeName = getScaleDegreeNames(scaleType)[degree - 1];
  const answer = scaleNotes[degree - 1];
  const chromaticOptions = getNeighborNoteOptions(tonic, answer, sequenceIndex + 2);

  return {
    type: 'scale',
    prompt: `Degree ${degree} (${degreeName}) in ${getScaleDisplayName(tonic, scaleType)}`,
    tonic,
    scaleType,
    answer,
    options: rotateOptions([
      answer,
      ...chromaticOptions.filter((option) => option !== answer),
    ], sequenceIndex),
  };
}

function createLabelQuestion(sequenceIndex: number): ChordLabelQuizQuestion {
  const root = LABEL_ROOTS[sequenceIndex % LABEL_ROOTS.length];
  const qualityKey = LABEL_QUALITY_KEYS[sequenceIndex % LABEL_QUALITY_KEYS.length];
  const quality = CHORD_QUALITIES[qualityKey];
  const inversion = sequenceIndex >= 3 && sequenceIndex % 5 === 3
    ? (sequenceIndex % 10 === 3 ? '3' : '5')
    : undefined;
  const answer = getChordLabel(root, quality, inversion);
  const distractorLabels = quality.labelDistractors.map((suffix) => `${root}${suffix}${inversion ? `/${inversion}` : ''}`);
  const specialInversionDistractor = inversion === '3' ? `${root}${quality.suffix ? 'm' : 'm'}/${getNote(root, 4)}` : null;

  return {
    type: 'label',
    notes: getChordNotes(root, quality, inversion),
    answer,
    options: rotateOptions([
      answer,
      ...distractorLabels,
      ...(specialInversionDistractor ? [specialInversionDistractor] : []),
    ], sequenceIndex),
  };
}

function createToneQuestion(sequenceIndex: number): ChordToneQuizQuestion {
  const root = TONE_ROOTS[sequenceIndex % TONE_ROOTS.length];
  const qualityKey = TONE_QUALITY_KEYS[sequenceIndex % TONE_QUALITY_KEYS.length];
  const quality = CHORD_QUALITIES[qualityKey];
  const chord = getChordLabel(root, quality);
  const notes = getChordNotes(root, quality);
  const missingIndex = Math.min(notes.length - 1, sequenceIndex === 0 ? 1 : (sequenceIndex + 2) % notes.length);
  const missing = notes[missingIndex];

  return {
    type: 'tone',
    chord,
    missing,
    tones: notes.map((note, index) => index === missingIndex ? '?' : note),
    options: getNeighborNoteOptions(root, missing, sequenceIndex),
  };
}

function createDegreeQuestion(sequenceIndex: number): ScaleDegreeQuizQuestion {
  const key = DEGREE_KEYS[sequenceIndex % DEGREE_KEYS.length];
  const degree = DEGREE_NUMBERS[sequenceIndex % DEGREE_NUMBERS.length];
  const extensionKey = DEGREE_EXTENSION_KEYS[sequenceIndex % DEGREE_EXTENSION_KEYS.length];
  const quality = MAJOR_KEY_QUALITIES[degree - 1];
  const chordRoot = getNote(key, MAJOR_SCALE_STEPS[degree - 1], getAccidentalPreference(key));
  const chord = `${chordRoot}${getDegreeChordSuffix(quality, extensionKey)}`;
  const roman = getRomanForDegree(degree, quality, extensionKey);
  const answer = `${roman} chord of ${key} major`;
  const wrongCaseRoman = quality === 'm'
    ? roman.toUpperCase()
    : roman.toLowerCase();
  const wrongDegree = ((degree + 1) % 7) + 1;
  const wrongKey = DEGREE_KEYS[(sequenceIndex + 2) % DEGREE_KEYS.length];

  return {
    type: 'degree',
    chord,
    qualityText: `${getFormattedChordText(chord)} in ${key} major`,
    answer,
    options: rotateOptions([
      answer,
      `${wrongCaseRoman} chord of ${key} major`,
      `${getRomanForDegree(wrongDegree, MAJOR_KEY_QUALITIES[wrongDegree - 1], extensionKey)} chord of ${wrongKey} major`,
      'All are wrong',
    ], sequenceIndex),
  };
}

function createSecondaryQuestion(sequenceIndex: number): SecondaryDominantQuizQuestion {
  const key = SECONDARY_KEYS[sequenceIndex % SECONDARY_KEYS.length];
  const targetDegree = SECONDARY_TARGET_DEGREES[sequenceIndex % SECONDARY_TARGET_DEGREES.length];
  const keyNotes = getScaleNotes(key, 'major');
  const targetRoot = keyNotes[targetDegree - 1];
  const targetQuality = MAJOR_KEY_QUALITIES[targetDegree - 1];
  const targetRoman = getRomanForDegree(targetDegree, targetQuality, 'triad');
  const targetChord = `${targetRoot}${getDegreeChordSuffix(targetQuality, 'triad')}`;
  const secondaryRoot = getNote(targetRoot, 7, getAccidentalPreference(targetRoot));
  const secondaryChord = `${secondaryRoot}7`;
  const tonicChord = key;
  const dominantChord = `${keyNotes[4]}7`;
  const answer = `V7/${targetRoman} tonicizing ${targetRoman}`;
  const wrongTargetDegree = SECONDARY_TARGET_DEGREES[(sequenceIndex + 2) % SECONDARY_TARGET_DEGREES.length];
  const wrongTargetQuality = MAJOR_KEY_QUALITIES[wrongTargetDegree - 1];
  const wrongTargetRoman = getRomanForDegree(wrongTargetDegree, wrongTargetQuality, 'triad');

  return {
    type: 'secondary',
    key,
    progression: [tonicChord, secondaryChord, targetChord, dominantChord, tonicChord],
    answer,
    options: rotateOptions([
      answer,
      `V7/${wrongTargetRoman} tonicizing ${wrongTargetRoman}`,
      `${getRomanForDegree(targetDegree, targetQuality, '7')} borrowed from ${key} minor`,
      'No tonicization is present',
    ], sequenceIndex),
  };
}

function createQuizQuestion(index: number): QuizQuestion {
  if (index < 12) {
    const mode = index % 4;
    const sequenceIndex = Math.floor(index / 4);
    if (mode === 0) return createScaleQuestion(sequenceIndex);
    if (mode === 1) return createLabelQuestion(sequenceIndex);
    if (mode === 2) return createToneQuestion(sequenceIndex);
    return createDegreeQuestion(sequenceIndex);
  }

  const mode = (index - 12) % 5;
  const sequenceIndex = Math.floor((index - 12) / 5) + 3;
  if (mode === 0) return createScaleQuestion(sequenceIndex);
  if (mode === 1) return createLabelQuestion(sequenceIndex);
  if (mode === 2) return createToneQuestion(sequenceIndex);
  if (mode === 3) return createDegreeQuestion(sequenceIndex);
  return createSecondaryQuestion(sequenceIndex);
}

export function generateQuizQuestions(): QuizQuestion[] {
  if (process.env.NODE_ENV === 'test') {
    const questions: QuizQuestion[] = [];
    for (let i = 0; i < 20; i++) {
      questions.push(createQuizQuestion(i));
    }
    return questions;
  }

  const questions: QuizQuestion[] = [];
  const types: Array<'scale' | 'label' | 'tone' | 'degree' | 'secondary'> = [
    'scale', 'label', 'tone', 'degree', 'secondary'
  ];

  for (let i = 0; i < 20; i++) {
    const type = types[i % types.length];
    if (type === 'scale') questions.push(createRandomScaleQuestion());
    else if (type === 'label') questions.push(createRandomLabelQuestion());
    else if (type === 'tone') questions.push(createRandomToneQuestion());
    else if (type === 'degree') questions.push(createRandomDegreeQuestion());
    else questions.push(createRandomSecondaryQuestion());
  }

  return shuffleArray(questions);
}

function getDiatonicTriadLabel(tonic: string, scaleType: ScaleType, degree: number): string {
  const scaleNotes = getScaleNotes(tonic, scaleType);
  const qualities = scaleType === 'natural minor' ? NATURAL_MINOR_KEY_QUALITIES : MAJOR_KEY_QUALITIES;
  return `${scaleNotes[degree - 1]}${getDegreeChordSuffix(qualities[degree - 1], 'triad')}`;
}

function createEarQuestion(index: number): EarTrainingQuestion {
  const mode = index % 3;
  const sequenceIndex = Math.floor(index / 3);

  if (mode === 0) {
    const tonic = EAR_ROOTS[sequenceIndex % EAR_ROOTS.length];
    const scaleType: ScaleType = sequenceIndex % 4 === 3 ? 'natural minor' : 'major';
    const degree = EAR_DEGREES[sequenceIndex % EAR_DEGREES.length];
    const degreeName = getScaleDegreeNames(scaleType)[degree - 1];
    const targetNote = getScaleNotes(tonic, scaleType)[degree - 1];
    const answer = `${degree} (${degreeName})`;
    const wrongDegreeA = (degree % 7) + 1;
    const wrongDegreeB = ((degree + 2) % 7) + 1;

    return {
      type: 'degree',
      prompt: `Reference: ${getScaleDisplayName(tonic, scaleType)} tonic, then one mystery pitch`,
      tonic,
      scaleType,
      degree,
      targetNote,
      answer,
      options: rotateOptions([
        answer,
        `${wrongDegreeA} (${getScaleDegreeNames(scaleType)[wrongDegreeA - 1]})`,
        `${wrongDegreeB} (${getScaleDegreeNames(scaleType)[wrongDegreeB - 1]})`,
        'Not in the scale',
      ], sequenceIndex),
    };
  }

  if (mode === 1) {
    const pattern = EAR_PROGRESSIONS[sequenceIndex % EAR_PROGRESSIONS.length];
    const tonic = EAR_ROOTS[(sequenceIndex + 1) % EAR_ROOTS.length];
    const scaleType = pattern.scaleType || 'major';
    const progression = pattern.degrees.map((degree) => getDiatonicTriadLabel(tonic, scaleType, degree));
    const alternateA = EAR_PROGRESSIONS[(sequenceIndex + 1) % EAR_PROGRESSIONS.length].numerals;
    const alternateB = EAR_PROGRESSIONS[(sequenceIndex + 2) % EAR_PROGRESSIONS.length].numerals;

    return {
      type: 'progression',
      prompt: `Reference: ${getScaleDisplayName(tonic, scaleType)} chord. What is the progression relative to the tonic chord?`,
      tonic,
      scaleType,
      progression,
      answer: pattern.numerals,
      options: rotateOptions([
        pattern.numerals,
        alternateA,
        alternateB,
        scaleType === 'major' ? 'I - IV - ii - V' : 'i - v - VI - VII',
      ], sequenceIndex),
    };
  }

  const root = EAR_ROOTS[(sequenceIndex + 2) % EAR_ROOTS.length];
  const qualityKey = EAR_QUALITY_KEYS[sequenceIndex % EAR_QUALITY_KEYS.length];
  const quality = CHORD_QUALITIES[qualityKey];
  const chord = getChordLabel(root, quality);

  return {
    type: 'quality',
    prompt: 'Listen to the chord quality',
    chord,
    qualityKey,
    answer: quality.qualityText,
    options: rotateOptions([
      quality.qualityText,
      'major',
      'minor',
      'dominant seventh',
      'major seventh',
      'diminished',
    ], sequenceIndex),
  };
}

export function generateEarQuestions(): EarTrainingQuestion[] {
  if (process.env.NODE_ENV === 'test') {
    const questions: EarTrainingQuestion[] = [];
    for (let i = 0; i < 20; i++) {
      questions.push(createEarQuestion(i));
    }
    return questions;
  }

  const questions: EarTrainingQuestion[] = [];
  const types: Array<'degree' | 'progression' | 'quality'> = ['degree', 'progression', 'quality'];

  for (let i = 0; i < 20; i++) {
    const type = types[i % types.length];
    if (type === 'degree') {
      const tonic = EAR_ROOTS[Math.floor(Math.random() * EAR_ROOTS.length)];
      const scaleType: ScaleType = Math.random() < 0.25 ? 'natural minor' : 'major';
      const degree = EAR_DEGREES[Math.floor(Math.random() * EAR_DEGREES.length)];
      const degreeName = getScaleDegreeNames(scaleType)[degree - 1];
      const targetNote = getScaleNotes(tonic, scaleType)[degree - 1];
      const answer = `${degree} (${degreeName})`;
      const wrongDegreeA = (degree % 7) + 1;
      const wrongDegreeB = ((degree + 2) % 7) + 1;

      questions.push({
        type: 'degree',
        prompt: `Reference: ${getScaleDisplayName(tonic, scaleType)} tonic, then one mystery pitch`,
        tonic,
        scaleType,
        degree,
        targetNote,
        answer,
        options: shuffleArray(uniqueValues([
          answer,
          `${wrongDegreeA} (${getScaleDegreeNames(scaleType)[wrongDegreeA - 1]})`,
          `${wrongDegreeB} (${getScaleDegreeNames(scaleType)[wrongDegreeB - 1]})`,
          'Not in the scale',
        ])),
      });
    } else if (type === 'progression') {
      const pattern = EAR_PROGRESSIONS[Math.floor(Math.random() * EAR_PROGRESSIONS.length)];
      const tonic = EAR_ROOTS[Math.floor(Math.random() * EAR_ROOTS.length)];
      const scaleType = pattern.scaleType || 'major';
      const progression = pattern.degrees.map((d) => getDiatonicTriadLabel(tonic, scaleType, d));
      
      const altPatterns = EAR_PROGRESSIONS.filter((p) => p.numerals !== pattern.numerals);
      const alternateA = altPatterns[0]?.numerals || 'I - vi - IV - V';
      const alternateB = altPatterns[1]?.numerals || 'i - iv - VII - III';

      questions.push({
        type: 'progression',
        prompt: `Reference: ${getScaleDisplayName(tonic, scaleType)} chord. What is the progression relative to the tonic chord?`,
        tonic,
        scaleType,
        progression,
        answer: pattern.numerals,
        options: shuffleArray(uniqueValues([
          pattern.numerals,
          alternateA,
          alternateB,
          scaleType === 'major' ? 'I - IV - ii - V' : 'i - v - VI - VII',
        ])),
      });
    } else {
      const root = EAR_ROOTS[Math.floor(Math.random() * EAR_ROOTS.length)];
      const qualityKey = EAR_QUALITY_KEYS[Math.floor(Math.random() * EAR_QUALITY_KEYS.length)];
      const quality = CHORD_QUALITIES[qualityKey];
      const chord = getChordLabel(root, quality);

      questions.push({
        type: 'quality',
        prompt: 'Listen to the chord quality',
        chord,
        qualityKey,
        answer: quality.qualityText,
        options: shuffleArray(uniqueValues([
          quality.qualityText,
          'major',
          'minor',
          'dominant seventh',
          'major seventh',
          'diminished',
        ])),
      });
    }
  }

  return shuffleArray(questions);
}

export function generateGuitarQuestions(): GuitarChordQuestion[] {
  if (process.env.NODE_ENV === 'test') {
    const questions: GuitarChordQuestion[] = [];
    for (let i = 0; i < 20; i++) {
      questions.push(GUITAR_QUESTIONS[i % GUITAR_QUESTIONS.length]);
    }
    return questions;
  }

  const shuffledBase = shuffleArray(GUITAR_QUESTIONS);
  const extraNeeded = 20 - shuffledBase.length;
  const extras: GuitarChordQuestion[] = [];
  for (let i = 0; i < extraNeeded; i++) {
    extras.push(GUITAR_QUESTIONS[Math.floor(Math.random() * GUITAR_QUESTIONS.length)]);
  }

  const list = [...shuffledBase, ...extras];
  
  return shuffleArray(list).map((q) => ({
    ...q,
    options: shuffleArray(uniqueValues([...q.options, q.answer])),
  }));
}

function getNoteMidi(note: string, octave = 4): number {
  const normalized = note.replace(/♯/g, '#').replace(/♭/g, 'b');
  return (octave + 1) * 12 + (NOTE_INDEX[normalized] ?? 0);
}

function midiToFrequency(midi: number): number {
  return 440 * (2 ** ((midi - 69) / 12));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

function playTone(
  context: AudioContext,
  midi: number,
  startTime: number,
  duration: number,
  type: OscillatorType,
  peakGain: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(midiToFrequency(midi), startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.03);
  
  // Sustain the note and fade out at the very end (release phase)
  const releaseTime = Math.min(0.2, duration * 0.35);
  gain.gain.setValueAtTime(peakGain, startTime + duration - releaseTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playChord(
  context: AudioContext,
  root: string,
  intervals: number[],
  startTime: number,
  duration: number,
  instrumentSeed: number,
) {
  const rootMidi = getNoteMidi(root, 4);
  const waveforms: OscillatorType[] = ['triangle', 'sine', 'sawtooth'];
  intervals.forEach((interval, index) => {
    playTone(
      context,
      rootMidi + interval + (index >= 3 ? 12 : 0),
      startTime + index * 0.015,
      duration,
      waveforms[(instrumentSeed + index) % waveforms.length],
      index === 0 ? 0.055 : 0.038,
    );
  });
}

function getChordRootAndQuality(chord: string): { root: string; quality: ChordQualitySpec } {
  const rootMatch = chord.match(/^[A-G](?:#|b)?/);
  const root = rootMatch?.[0] || 'C';
  const suffix = chord.slice(root.length);
  const quality = Object.values(CHORD_QUALITIES).find((candidate) => candidate.suffix === suffix)
    || CHORD_QUALITIES.major;
  return { root, quality };
}

async function playEarQuestion(question: EarTrainingQuestion) {
  const context = getAudioContext();
  if (!context) return;
  await context.resume().catch(() => undefined);
  const start = context.currentTime + 0.04;

  if (question.type === 'degree' && question.tonic && question.targetNote) {
    const tonicMidi = getNoteMidi(question.tonic, 4);
    const targetMidi = tonicMidi + getScaleSteps(question.scaleType || 'major')[(question.degree || 1) - 1];
    // Sustained note playback: increased duration and adjusted intervals
    playTone(context, tonicMidi, start, 0.8, 'sine', 0.08);
    playTone(context, targetMidi, start + 1.0, 1.2, 'triangle', 0.075);
    return;
  }

  if (question.type === 'progression' && question.progression) {
    // Play the tonic reference chord first
    const refQuality = question.scaleType === 'natural minor' ? CHORD_QUALITIES.minor : CHORD_QUALITIES.major;
    playChord(context, question.tonic || 'C', refQuality.intervals, start, 1.0, 0);

    // Pause briefly, then play the progression loop
    const progressionStart = start + 1.6;
    question.progression.forEach((chord, index) => {
      const { root, quality } = getChordRootAndQuality(chord);
      playChord(context, root, quality.intervals, progressionStart + index * 0.85, 0.75, index);
    });
    return;
  }

  if (question.type === 'quality' && question.chord) {
    const { root, quality } = getChordRootAndQuality(question.chord);
    playTone(context, getNoteMidi(root, 4), start, 0.5, 'sine', 0.07);
    playChord(context, root, quality.intervals, start + 0.7, 1.5, question.answer.length);
  }
}

function ScorePill({ score }: { score: QuizScore }) {
  return (
    <span className="rounded-full bg-default-100 px-2.5 py-1 text-xs font-semibold text-default-600 dark:bg-white/10 dark:text-gray-300">
      {score.correct}/{score.attempted}
    </span>
  );
}

function getWinner(board: Mark[]): Mark {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function getAutomaticMove(board: Mark[]): number | null {
  const available = board
    .map((mark, index) => mark ? null : index)
    .filter((index): index is number => index !== null);

  for (const index of available) {
    const candidate = [...board];
    candidate[index] = 'O';
    if (getWinner(candidate) === 'O') return index;
  }

  for (const index of available) {
    const candidate = [...board];
    candidate[index] = 'X';
    if (getWinner(candidate) === 'X') return index;
  }

  if (available.includes(4)) return 4;
  return available[0] ?? null;
}

function getQuizAnswer(question: QuizQuestion): string {
  return question.type === 'tone' ? question.missing : question.answer;
}

function CompletionScreen({
  score,
  onReplay,
  title,
}: {
  score: QuizScore;
  onReplay: () => void;
  title: string;
}) {
  const percentage = Math.round((score.correct / 20) * 100);
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-foreground">{title} Completed!</h3>
        <p className="text-sm text-default-500 font-medium">You&apos;ve finished all 20 questions.</p>
      </div>
      
      <div className="relative flex items-center justify-center">
        <div className="flex flex-col items-center justify-center rounded-full bg-default-100 dark:bg-white/5 w-28 h-28 border-4 border-primary">
          <span className="text-3xl font-bold text-foreground">{score.correct}</span>
          <span className="text-xs text-default-500">out of 20</span>
        </div>
      </div>

      <div className="text-sm font-semibold text-primary">
        Accuracy: {percentage}%
      </div>

      <Button
        color="primary"
        radius="sm"
        onPress={onReplay}
        className="font-semibold px-6"
      >
        Play Again
      </Button>
    </div>
  );
}

export default function ExtractionWaitPanel({
  queueStatus: _queueStatus,
  queuePosition: _queuePosition,
  estimatedWaitSeconds: _estimatedWaitSeconds,
  statusMessage: _statusMessage,
}: ExtractionWaitPanelProps) {
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(null));
  const [gameMode, setGameMode] = useState<GameMode>('quiz');
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0);
  const [earQuestionIndex, setEarQuestionIndex] = useState(0);
  const [guitarQuestionIndex, setGuitarQuestionIndex] = useState(0);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() => generateQuizQuestions());
  const [earQuestions, setEarQuestions] = useState<EarTrainingQuestion[]>(() => generateEarQuestions());
  const [guitarQuestions, setGuitarQuestions] = useState<GuitarChordQuestion[]>(() => generateGuitarQuestions());

  const [quizResult, setQuizResult] = useState<QuizResult>(null);
  const [earResult, setEarResult] = useState<QuizResult>(null);
  const [guitarResult, setGuitarResult] = useState<QuizResult>(null);
  const [quizScore, setQuizScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [earScore, setEarScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [guitarScore, setGuitarScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [currentQuestionHasMistake, setCurrentQuestionHasMistake] = useState(false);
  const [wrongSelections, setWrongSelections] = useState<string[]>([]);
  const winner = useMemo(() => getWinner(board), [board]);
  const isDraw = !winner && board.every(Boolean);
  const isPlayerTurn = !winner && !isDraw && board.filter(Boolean).length % 2 === 0;
  const status = winner
    ? (winner === 'X' ? 'You win' : 'O wins')
    : isDraw
      ? 'Draw'
      : (isPlayerTurn ? 'Your turn' : 'O thinking');
  const quizQuestion = quizQuestions[quizQuestionIndex] || quizQuestions[0];
  const earQuestion = earQuestions[earQuestionIndex] || earQuestions[0];
  const guitarQuestion = guitarQuestions[guitarQuestionIndex] || guitarQuestions[0];

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;

    const toastKeys: string[] = [];

    MINI_GAME_NOTICES.forEach((notice) => {
      const key = addToast({
        title: notice.title,
        description: notice.description,
        color: 'default',
        timeout: 0, // Never auto-close
        shouldShowTimeoutProgress: false,
        classNames: mergeToastClassNames({
          base: 'minigame-toast',
          icon: notice.color === 'primary' ? 'text-primary-500' : 'text-success-500',
          title: notice.color === 'primary' ? 'text-primary-600 dark:text-blue-400' : 'text-success-600 dark:text-success-400',
        }),
      });
      if (key) {
        toastKeys.push(key);
      }
    });

    return () => {
      toastKeys.forEach((key) => {
        closeToast(key);
      });
    };
  }, []);

  const handleCellClick = (index: number) => {
    if (!isPlayerTurn || board[index] || winner || isDraw) return;
    setBoard((current) => {
      const next = [...current];
      next[index] = 'X';

      if (getWinner(next) || next.every(Boolean)) {
        return next;
      }

      const automaticMove = getAutomaticMove(next);
      if (automaticMove !== null) {
        next[automaticMove] = 'O';
      }
      return next;
    });
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
  };

  const answerQuizQuestion = (option: string) => {
    if (quizResult === 'correct') return;
    const isCorrect = option === getQuizAnswer(quizQuestion);
    if (isCorrect) {
      const gotItRight = !currentQuestionHasMistake && wrongSelections.length === 0;
      setQuizScore((current) => ({
        correct: current.correct + (gotItRight ? 1 : 0),
        attempted: current.attempted + 1,
      }));
      setQuizResult('correct');
      window.setTimeout(() => {
        setQuizQuestionIndex((current) => current + 1);
        setQuizResult(null);
        setCurrentQuestionHasMistake(false);
        setWrongSelections([]);
      }, 450);
    } else {
      setCurrentQuestionHasMistake(true);
      setWrongSelections((prev) => [...prev, option]);
      setQuizResult('incorrect');
    }
  };

  const answerEarQuestion = (option: string) => {
    if (earResult === 'correct') return;
    const isCorrect = option === earQuestion.answer;
    if (isCorrect) {
      const gotItRight = !currentQuestionHasMistake && wrongSelections.length === 0;
      setEarScore((current) => ({
        correct: current.correct + (gotItRight ? 1 : 0),
        attempted: current.attempted + 1,
      }));
      setEarResult('correct');
      window.setTimeout(() => {
        setEarQuestionIndex((current) => current + 1);
        setEarResult(null);
        setCurrentQuestionHasMistake(false);
        setWrongSelections([]);
      }, 450);
    } else {
      setCurrentQuestionHasMistake(true);
      setWrongSelections((prev) => [...prev, option]);
      setEarResult('incorrect');
    }
  };

  const answerGuitarQuestion = (option: string) => {
    if (guitarResult === 'correct') return;
    const isCorrect = option === guitarQuestion.answer;
    if (isCorrect) {
      const gotItRight = !currentQuestionHasMistake && wrongSelections.length === 0;
      setGuitarScore((current) => ({
        correct: current.correct + (gotItRight ? 1 : 0),
        attempted: current.attempted + 1,
      }));
      setGuitarResult('correct');
      window.setTimeout(() => {
        setGuitarQuestionIndex((current) => current + 1);
        setGuitarResult(null);
        setCurrentQuestionHasMistake(false);
        setWrongSelections([]);
      }, 450);
    } else {
      setCurrentQuestionHasMistake(true);
      setWrongSelections((prev) => [...prev, option]);
      setGuitarResult('incorrect');
    }
  };

  const handleQuizReplay = () => {
    setQuizQuestions(generateQuizQuestions());
    setQuizScore({ correct: 0, attempted: 0 });
    setQuizQuestionIndex(0);
    setQuizResult(null);
    setCurrentQuestionHasMistake(false);
    setWrongSelections([]);
  };

  const handleEarReplay = () => {
    setEarQuestions(generateEarQuestions());
    setEarScore({ correct: 0, attempted: 0 });
    setEarQuestionIndex(0);
    setEarResult(null);
    setCurrentQuestionHasMistake(false);
    setWrongSelections([]);
  };

  const handleGuitarReplay = () => {
    setGuitarQuestions(generateGuitarQuestions());
    setGuitarScore({ correct: 0, attempted: 0 });
    setGuitarQuestionIndex(0);
    setGuitarResult(null);
    setCurrentQuestionHasMistake(false);
    setWrongSelections([]);
  };

  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-default-300/70 bg-default-50/60 p-6 dark:border-gray-800 dark:bg-gray-900/20">
      <div className="w-full max-w-[420px] rounded-lg border border-default-200 bg-content1/85 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/45">
        <div className="mb-4 text-center space-y-1">
          <h3 className="text-base font-bold text-foreground">Mini Games</h3>
          <p className="text-xs text-default-500 leading-normal">
            Practice your theory skills and ear training while the audio analysis is processing. Or just play a quick game of tic-tac-toe to pass the time!
          </p>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-2">
          {MINI_GAME_TABS.map(([mode, label, helpText]) => (
            <AppTooltip key={mode} content={helpText} placement="top">
              <Button
                size="sm"
                variant={gameMode === mode ? 'solid' : 'flat'}
                color={gameMode === mode ? 'primary' : 'default'}
                radius="sm"
                onPress={() => {
                  setGameMode(mode);
                  setCurrentQuestionHasMistake(false);
                  setWrongSelections([]);
                }}
                className="h-8 px-2 text-xs"
              >
                {label}
              </Button>
            </AppTooltip>
          ))}
        </div>

        {gameMode === 'xo' && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{status}</p>
              <Button
                size="sm"
                variant="flat"
                radius="sm"
                onPress={reset}
                className="h-8 px-3 text-xs"
              >
                Reset
              </Button>
            </div>
            <div className="mx-auto grid aspect-square max-w-[260px] grid-cols-3 gap-2 rounded-lg border-2 border-default-400 bg-default-200/80 p-2 shadow-inner dark:border-white/30 dark:bg-white/10">
              {board.map((mark, index) => (
                <Button
                  key={index}
                  type="button"
                  variant="flat"
                  radius="sm"
                  isDisabled={!isPlayerTurn || Boolean(mark) || Boolean(winner) || isDraw}
                  onPress={() => handleCellClick(index)}
                  className="h-auto min-h-0 min-w-0 aspect-square border border-default-400 bg-content1 text-2xl font-bold shadow-sm data-[hover=true]:border-primary data-[hover=true]:bg-primary/10 data-[disabled=true]:opacity-100 dark:border-white/25 dark:bg-slate-950/80 dark:data-[hover=true]:border-primary"
                  aria-label={`Cell ${index + 1}`}
                >
                  {mark}
                </Button>
              ))}
            </div>
          </>
        )}

        {gameMode === 'quiz' && (
          quizScore.attempted >= 20 ? (
            <CompletionScreen score={quizScore} onReplay={handleQuizReplay} title="Theory Quiz" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {quizQuestion.type === 'label'
                    ? 'Name the chord'
                    : quizQuestion.type === 'tone'
                      ? 'Find the missing tone'
                      : quizQuestion.type === 'scale'
                        ? 'Find the scale note'
                        : quizQuestion.type === 'secondary'
                          ? 'Find the tonicization'
                          : 'Find the scale degree'}
                </p>
                <ScorePill score={quizScore} />
              </div>
              <div className="rounded-md bg-default-100 px-4 py-3 text-center dark:bg-white/10">
                {quizQuestion.type === 'label' && (
                  <>
                    <p className="text-xs font-medium uppercase text-default-500">Notes</p>
                    <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-foreground">
                      {quizQuestion.notes.map((note, index) => (
                        <span key={`${note}-${index}`} className="inline-flex items-center gap-2">
                          <ChordSymbol value={note} />
                          {index < quizQuestion.notes.length - 1 && <span className="text-default-400">·</span>}
                        </span>
                      ))}
                    </p>
                  </>
                )}
                {quizQuestion.type === 'tone' && (
                  <>
                    <p className="text-xs font-medium text-default-500">
                      <ChordSymbol value={quizQuestion.chord} />
                    </p>
                    <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-foreground">
                      {quizQuestion.tones.map((note, index) => (
                        <span key={`${note}-${index}`} className="inline-flex items-center gap-2">
                          {note === '?' ? '?' : <ChordSymbol value={note} />}
                          {index < quizQuestion.tones.length - 1 && <span className="text-default-400">·</span>}
                        </span>
                      ))}
                    </p>
                  </>
                )}
                {quizQuestion.type === 'scale' && (
                  <>
                    <p className="text-xs font-medium uppercase text-default-500">Scale note</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{quizQuestion.prompt}</p>
                  </>
                )}
                {quizQuestion.type === 'degree' && (
                  <>
                    <p className="text-xs font-medium uppercase text-default-500">Which statement is true?</p>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      <ChordSymbol value={quizQuestion.chord} />
                    </p>
                    <p className="mt-1 text-xs text-default-500">{quizQuestion.qualityText}</p>
                  </>
                )}
                {quizQuestion.type === 'secondary' && (
                  <>
                    <p className="text-xs font-medium uppercase text-default-500">In {quizQuestion.key} major</p>
                    <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-base font-semibold text-foreground">
                      {quizQuestion.progression.map((chord, index) => (
                        <span key={`${chord}-${index}`} className="inline-flex items-center gap-2">
                          <ChordSymbol value={chord} />
                          {index < quizQuestion.progression.length - 1 && <span className="text-default-400">-</span>}
                        </span>
                      ))}
                    </p>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quizQuestion.options.map((option) => (
                  <Button
                    key={option}
                    variant="flat"
                    radius="sm"
                    isDisabled={quizResult === 'correct' || wrongSelections.includes(option)}
                    aria-label={quizQuestion.type === 'degree' || quizQuestion.type === 'secondary' ? option : getFormattedChordText(option)}
                    onPress={() => answerQuizQuestion(option)}
                    className="h-auto min-h-10 whitespace-normal py-2 font-semibold leading-snug"
                  >
                    {quizQuestion.type === 'degree' || quizQuestion.type === 'secondary' ? option : <ChordSymbol value={option} />}
                  </Button>
                ))}
              </div>
              <p className="min-h-5 text-center text-sm font-medium text-default-500">
                {quizResult === 'correct'
                  ? 'Correct'
                  : quizResult === 'incorrect'
                    ? 'Try another answer'
                    : quizQuestion.type === 'label'
                      ? 'Choose the chord label'
                      : quizQuestion.type === 'tone'
                        ? 'Fill the missing chord tone'
                        : quizQuestion.type === 'scale'
                          ? 'Choose the scale degree note'
                          : quizQuestion.type === 'secondary'
                            ? 'Choose the applied-dominant label'
                            : 'Choose the correct roman numeral statement'}
              </p>
            </div>
          )
        )}

        {gameMode === 'ear' && (
          earScore.attempted >= 20 ? (
            <CompletionScreen score={earScore} onReplay={handleEarReplay} title="Ear Training" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {earQuestion.type === 'degree'
                    ? 'Hear the scale degree'
                    : earQuestion.type === 'progression'
                      ? 'Hear the progression'
                      : 'Hear the chord quality'}
                </p>
                <ScorePill score={earScore} />
              </div>
              <div className="rounded-md bg-default-100 px-4 py-3 text-center dark:bg-white/10">
                <p className="text-sm font-semibold text-foreground">{earQuestion.prompt}</p>

                {earQuestion.type === 'quality' && earQuestion.chord && (
                  <p className="mt-2 text-xs text-default-500">
                    Root: <ChordSymbol value={earQuestion.chord.replace(/(maj7|m7b5|m7|dim|sus4|7|m)$/, '')} />
                  </p>
                )}
                <Button
                  size="sm"
                  color="primary"
                  radius="sm"
                  onPress={() => {
                    void playEarQuestion(earQuestion);
                  }}
                  className="mt-3 px-4 font-semibold"
                >
                  Play
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {earQuestion.options.map((option) => (
                  <Button
                    key={option}
                    variant="flat"
                    radius="sm"
                    isDisabled={earResult === 'correct' || wrongSelections.includes(option)}
                    onPress={() => answerEarQuestion(option)}
                    className="h-auto min-h-10 whitespace-normal py-2 font-semibold leading-snug"
                  >
                    {option}
                  </Button>
                ))}
              </div>
              <p className="min-h-5 text-center text-sm font-medium text-default-500">
                {earResult === 'correct' ? 'Correct' : earResult === 'incorrect' ? 'Listen again' : 'Play the sound, then choose an answer'}
              </p>
            </div>
          )
        )}

        {gameMode === 'guitar' && (
          guitarScore.attempted >= 20 ? (
            <CompletionScreen score={guitarScore} onReplay={handleGuitarReplay} title="Guitar Game" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Read the diagram</p>
                <ScorePill score={guitarScore} />
              </div>
              <div className="flex justify-center rounded-md bg-default-100 px-4 py-3 dark:bg-white/10">
                <GuitarChordDiagram
                  chordData={guitarQuestion.chordData}
                  displayName=""
                  showChordName={false}
                  size="medium"
                  lite
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {guitarQuestion.options.map((option) => (
                  <Button
                    key={option}
                    variant="flat"
                    radius="sm"
                    isDisabled={guitarResult === 'correct' || wrongSelections.includes(option)}
                    aria-label={getFormattedChordText(option)}
                    onPress={() => answerGuitarQuestion(option)}
                    className="font-semibold"
                  >
                    <ChordSymbol value={option} />
                  </Button>
                ))}
              </div>
              <p className="min-h-5 text-center text-sm font-medium text-default-500">
                {guitarResult === 'correct' ? 'Correct' : guitarResult === 'incorrect' ? 'Try another chord' : 'Choose the chord name'}
              </p>
            </div>
          )
        )}
      </div>

      <ToastProvider
        placement="bottom-right"
        toastOffset={16}
        maxVisibleToasts={3}
        toastProps={{
          color: 'default',
          variant: 'flat',
          classNames: defaultToastClassNames,
        }}
      />
    </div>
  );
}
