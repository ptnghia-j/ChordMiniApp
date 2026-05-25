'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  addToast,
  closeToast,
  ToastProvider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
} from '@heroui/react';
import GuitarChordDiagram from '@/components/chord-playback/GuitarChordDiagram';
import AppTooltip from '@/components/common/AppTooltip';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';
import { defaultToastClassNames, mergeToastClassNames } from '@/utils/toastStyles';
import { HiOutlineTrash } from 'react-icons/hi2';

export interface MiniGamesContainerProps {
  layoutMode?: 'embed' | 'standalone';
}

type Mark = 'X' | 'O' | null;
type GameMode = 'quiz' | 'ear' | 'guitar' | 'xo';
type QuizResult = 'correct' | 'incorrect' | null;
type ScaleType = 'major' | 'natural minor';
type EarQuestionType = 'degree' | 'progression' | 'quality';
type MiniGameNoticeId = 'intro' | 'modes';
type DegreeExtensionType = 'triad' | 'seventh';

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
  instrument?: 'piano' | 'guitar' | 'violin' | 'flute' | 'composite';
}

interface ChordPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
}

interface GuitarChordQuestion {
  type?: 'identify' | 'notes';
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

export interface GameQuestionReviewEntry {
  questionNumber: number;
  prompt: string;
  correctAnswer: string;
  selectedAnswers: string[];
  wasCorrect: boolean;
  playbackQuestion?: EarTrainingQuestion;
}

export interface GameHistoryEntry {
  id: string;
  gameMode: GameMode;
  score?: { correct: number; attempted: number };
  xoResult?: 'win' | 'loss' | 'draw';
  questions?: GameQuestionReviewEntry[];
  timestamp: string;
}

const WIN_LINES = (() => {
  const lines: number[][] = [];
  // Rows
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 4; c++) {
      lines.push([
        r * 8 + c,
        r * 8 + c + 1,
        r * 8 + c + 2,
        r * 8 + c + 3,
        r * 8 + c + 4,
      ]);
    }
  }
  // Columns
  for (let c = 0; c < 8; c++) {
    for (let r = 0; r < 4; r++) {
      lines.push([
        r * 8 + c,
        (r + 1) * 8 + c,
        (r + 2) * 8 + c,
        (r + 3) * 8 + c,
        (r + 4) * 8 + c,
      ]);
    }
  }
  // Diagonals TL-BR
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      lines.push([
        r * 8 + c,
        (r + 1) * 8 + c + 1,
        (r + 2) * 8 + c + 2,
        (r + 3) * 8 + c + 3,
        (r + 4) * 8 + c + 4,
      ]);
    }
  }
  // Diagonals TR-BL
  for (let r = 0; r < 4; r++) {
    for (let c = 4; c < 8; c++) {
      lines.push([
        r * 8 + c,
        (r + 1) * 8 + c - 1,
        (r + 2) * 8 + c - 2,
        (r + 3) * 8 + c - 3,
        (r + 4) * 8 + c - 4,
      ]);
    }
  }
  return lines;
})();

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
const DEGREE_EXTENSION_TYPES: DegreeExtensionType[] = ['triad', 'triad', 'triad', 'seventh', 'seventh', 'seventh', 'seventh', 'triad', 'seventh', 'seventh'];
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
  { numerals: 'IV - V - I - vi', degrees: [4, 5, 1, 6] },
  { numerals: 'ii - V - I - vi', degrees: [2, 5, 1, 6] },
  { numerals: 'vi - IV - I - V', degrees: [6, 4, 1, 5] },
  { numerals: 'VI - VII - i - v', degrees: [6, 7, 1, 5], scaleType: 'natural minor' as ScaleType },
  { numerals: 'iv - v - i - VI', degrees: [4, 5, 1, 6], scaleType: 'natural minor' as ScaleType },
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

function getNote(root: string, semitoneOffset: number, _preference?: 'flat' | 'sharp'): string {
  const cleanRoot = root.replace(/♯/g, '#').replace(/♭/g, 'b');
  const rootLetter = cleanRoot.charAt(0);
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const rootLetterIdx = LETTERS.indexOf(rootLetter);
  if (rootLetterIdx === -1) {
    const rootIndex = NOTE_INDEX[cleanRoot] ?? 0;
    const pref = _preference || getAccidentalPreference(root);
    const scale = pref === 'flat' ? CHROMATIC_FLAT : CHROMATIC_SHARP;
    return scale[(rootIndex + semitoneOffset + 1200) % 12];
  }

  let letterSteps = 0;
  const absOffset = Math.abs(semitoneOffset) % 12;
  const octaveOffset = Math.floor(Math.abs(semitoneOffset) / 12) * 7;

  if (absOffset === 0) letterSteps = 0;
  else if (absOffset === 1 || absOffset === 2) letterSteps = 1;
  else if (absOffset === 3 || absOffset === 4) letterSteps = 2;
  else if (absOffset === 5) letterSteps = 3;
  else if (absOffset === 6) {
    letterSteps = 4;
  }
  else if (absOffset === 7 || absOffset === 8) letterSteps = 4;
  else if (absOffset === 9) letterSteps = 5;
  else if (absOffset === 10 || absOffset === 11) letterSteps = 6;

  if (semitoneOffset < 0) {
    letterSteps = -letterSteps - octaveOffset;
  } else {
    letterSteps = letterSteps + octaveOffset;
  }

  const targetLetterIdx = (rootLetterIdx + letterSteps + 7000) % 7;
  const targetLetter = LETTERS[targetLetterIdx];

  const rootIndex = NOTE_INDEX[cleanRoot] ?? 0;
  const targetSemitone = (rootIndex + semitoneOffset + 1200) % 12;

  const LETTER_SEMITONES: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
  };
  const targetLetterBaseSemitone = LETTER_SEMITONES[targetLetter];

  let diff = (targetSemitone - targetLetterBaseSemitone + 24) % 12;
  if (diff > 6) diff -= 12;

  let accidental = '';
  if (diff === 1) accidental = '#';
  else if (diff === 2) accidental = '##';
  else if (diff === -1) accidental = 'b';
  else if (diff === -2) accidental = 'bb';

  const formattedNote = `${targetLetter}${accidental}`;
  return formattedNote.replace(/#/g, '♯').replace(/b/g, '♭');
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

function buildAnswerOptions(answer: string, distractors: string[], seed?: number): string[] {
  const selected = [
    answer,
    ...uniqueValues(distractors.filter((option) => option && option !== answer)),
  ].slice(0, 4);

  return seed === undefined ? shuffleArray(selected) : rotateOptions(selected, seed);
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
  const offsets = [-1, 1, 2 + (seed % 4), -2 - (seed % 3), 3, -3, 4, -4];
  const distractors = offsets
    .map((offset) => scale[(answerIndex + offset + 1200) % 12])
    .filter((option) => option !== answer);

  return buildAnswerOptions(answer, distractors, seed + 1);
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
    options: buildAnswerOptions(answer, allOptions),
  };
}

function createRandomToneQuestion(): ChordToneQuizQuestion {
  const root = TONE_ROOTS[Math.floor(Math.random() * TONE_ROOTS.length)];
  const qualityKey = TONE_QUALITY_KEYS[Math.floor(Math.random() * TONE_QUALITY_KEYS.length)];
  const quality = CHORD_QUALITIES[qualityKey];
  const chord = getChordLabel(root, quality);
  const notes = getChordNotes(root, quality);
  const missingIndex = 1 + Math.floor(Math.random() * (notes.length - 1));
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

  if (extensionKey === 'seventh' || extensionKey === 'maj7' || extensionKey === 'm7' || extensionKey === '7') {
    if (quality === 'dim') return `${base.toLowerCase()}ø7`;
    if (quality === 'm') return `${roman}7`;
    return degree === 5 ? `${roman}7` : `${roman}M7`;
  }

  return roman;
}

function getDiatonicSeventhSuffix(degree: number, quality: 'M' | 'm' | 'dim'): string {
  if (quality === 'dim') return 'm7b5';
  if (quality === 'm') return 'm7';
  return degree === 5 ? '7' : ':maj7';
}

function getDegreeChordSuffix(quality: 'M' | 'm' | 'dim', extensionKey: string, degree?: number): string {
  if (extensionKey === 'seventh' || extensionKey === 'maj7' || extensionKey === 'm7' || extensionKey === '7') {
    return getDiatonicSeventhSuffix(degree ?? 1, quality);
  }

  if (quality === 'm') return 'm';
  if (quality === 'dim') return 'dim';
  return '';
}

function createRandomDegreeQuestion(): ScaleDegreeQuizQuestion {
  const key = DEGREE_KEYS[Math.floor(Math.random() * DEGREE_KEYS.length)];
  const degree = DEGREE_NUMBERS[Math.floor(Math.random() * DEGREE_NUMBERS.length)];
  const extensionKey: DegreeExtensionType = Math.random() < 0.45 ? 'seventh' : 'triad';
  const quality = MAJOR_KEY_QUALITIES[degree - 1];
  const chordRoot = getNote(key, MAJOR_SCALE_STEPS[degree - 1], getAccidentalPreference(key));
  const chord = `${chordRoot}${getDegreeChordSuffix(quality, extensionKey, degree)}`;
  const roman = getRomanForDegree(degree, quality, extensionKey);
  
  const isAllWrong = Math.random() < 0.25;
  const answer = isAllWrong ? 'All are wrong' : `${roman} chord of ${key} major`;
  
  const wrongCaseRoman = quality === 'm'
    ? roman.toUpperCase()
    : roman.toLowerCase();
  const wrongDegree = ((degree + 1) % 7) + 1;
  const wrongKey = DEGREE_KEYS[Math.floor(Math.random() * DEGREE_KEYS.length)];

  let allOptions: string[];
  if (isAllWrong) {
    const wrongDegree2 = ((degree + 3) % 7) + 1;
    allOptions = uniqueValues([
      'All are wrong',
      `${wrongCaseRoman} chord of ${key} major`,
      `${getRomanForDegree(wrongDegree, MAJOR_KEY_QUALITIES[wrongDegree - 1], extensionKey)} chord of ${wrongKey} major`,
      `${getRomanForDegree(wrongDegree2, MAJOR_KEY_QUALITIES[wrongDegree2 - 1], extensionKey)} chord of ${key} major`,
    ]);
  } else {
    allOptions = uniqueValues([
      answer,
      `${wrongCaseRoman} chord of ${key} major`,
      `${getRomanForDegree(wrongDegree, MAJOR_KEY_QUALITIES[wrongDegree - 1], extensionKey)} chord of ${wrongKey} major`,
      'All are wrong',
    ]);
  }

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
  const targetChord = `${targetRoot}${getDegreeChordSuffix(targetQuality, 'triad', targetDegree)}`;
  const secondaryRoot = getNote(targetRoot, 7, getAccidentalPreference(targetRoot));
  const secondaryChord = `${secondaryRoot}7`;
  const tonicChord = key;
  const dominantChord = `${keyNotes[4]}7`;
  const wrongTargetDegree = SECONDARY_TARGET_DEGREES[Math.floor(Math.random() * SECONDARY_TARGET_DEGREES.length)];
  const wrongTargetQuality = MAJOR_KEY_QUALITIES[wrongTargetDegree - 1];
  const wrongTargetRoman = getRomanForDegree(wrongTargetDegree, wrongTargetQuality, 'triad');

  const hasTonicization = Math.random() >= 0.2;
  let progression: string[];
  let answer: string;
  let allOptions: string[];

  if (hasTonicization) {
    progression = [tonicChord, secondaryChord, targetChord, dominantChord, tonicChord];
    answer = `V7/${targetRoman} tonicizing ${targetRoman}`;
    allOptions = uniqueValues([
      answer,
      `V7/${wrongTargetRoman} tonicizing ${wrongTargetRoman}`,
      `${getRomanForDegree(targetDegree, targetQuality, '7')} borrowed from ${key} minor`,
      'No tonicization is present',
    ]);
  } else {
    const subdominantChord = `${keyNotes[3]}${getDegreeChordSuffix(MAJOR_KEY_QUALITIES[3], 'triad', 4)}`;
    progression = [tonicChord, subdominantChord, targetChord, dominantChord, tonicChord];
    answer = 'No tonicization is present';
    allOptions = uniqueValues([
      answer,
      `V7/${targetRoman} tonicizing ${targetRoman}`,
      `V7/${wrongTargetRoman} tonicizing ${wrongTargetRoman}`,
      `${getRomanForDegree(targetDegree, targetQuality, '7')} borrowed from ${key} minor`,
    ]);
  }

  return {
    type: 'secondary',
    key,
    progression,
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
  
  let missingIndex = sequenceIndex === 0 ? 1 : (sequenceIndex + 2) % notes.length;
  if (missingIndex === 0) {
    missingIndex = 1 + (sequenceIndex % (notes.length - 1));
  }
  missingIndex = Math.min(notes.length - 1, missingIndex);
  
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
  const extensionKey = DEGREE_EXTENSION_TYPES[sequenceIndex % DEGREE_EXTENSION_TYPES.length];
  const quality = MAJOR_KEY_QUALITIES[degree - 1];
  const chordRoot = getNote(key, MAJOR_SCALE_STEPS[degree - 1], getAccidentalPreference(key));
  const chord = `${chordRoot}${getDegreeChordSuffix(quality, extensionKey, degree)}`;
  const roman = getRomanForDegree(degree, quality, extensionKey);
  
  const isAllWrong = sequenceIndex >= 4 && sequenceIndex % 4 === 0;
  const answer = isAllWrong ? 'All are wrong' : `${roman} chord of ${key} major`;
  
  const wrongCaseRoman = quality === 'm'
    ? roman.toUpperCase()
    : roman.toLowerCase();
  const wrongDegree = ((degree + 1) % 7) + 1;
  const wrongKey = DEGREE_KEYS[(sequenceIndex + 2) % DEGREE_KEYS.length];

  let optionsList: string[];
  if (isAllWrong) {
    const wrongDegree2 = ((degree + 3) % 7) + 1;
    optionsList = [
      'All are wrong',
      `${wrongCaseRoman} chord of ${key} major`,
      `${getRomanForDegree(wrongDegree, MAJOR_KEY_QUALITIES[wrongDegree - 1], extensionKey)} chord of ${wrongKey} major`,
      `${getRomanForDegree(wrongDegree2, MAJOR_KEY_QUALITIES[wrongDegree2 - 1], extensionKey)} chord of ${key} major`,
    ];
  } else {
    optionsList = [
      answer,
      `${wrongCaseRoman} chord of ${key} major`,
      `${getRomanForDegree(wrongDegree, MAJOR_KEY_QUALITIES[wrongDegree - 1], extensionKey)} chord of ${wrongKey} major`,
      'All are wrong',
    ];
  }

  return {
    type: 'degree',
    chord,
    qualityText: `${getFormattedChordText(chord)} in ${key} major`,
    answer,
    options: rotateOptions(optionsList, sequenceIndex),
  };
}

function createSecondaryQuestion(sequenceIndex: number): SecondaryDominantQuizQuestion {
  const key = SECONDARY_KEYS[sequenceIndex % SECONDARY_KEYS.length];
  const targetDegree = SECONDARY_TARGET_DEGREES[sequenceIndex % SECONDARY_TARGET_DEGREES.length];
  const keyNotes = getScaleNotes(key, 'major');
  const targetRoot = keyNotes[targetDegree - 1];
  const targetQuality = MAJOR_KEY_QUALITIES[targetDegree - 1];
  const targetRoman = getRomanForDegree(targetDegree, targetQuality, 'triad');
  const targetChord = `${targetRoot}${getDegreeChordSuffix(targetQuality, 'triad', targetDegree)}`;
  const secondaryRoot = getNote(targetRoot, 7, getAccidentalPreference(targetRoot));
  const secondaryChord = `${secondaryRoot}7`;
  const tonicChord = key;
  const dominantChord = `${keyNotes[4]}7`;
  const wrongTargetDegree = SECONDARY_TARGET_DEGREES[(sequenceIndex + 2) % SECONDARY_TARGET_DEGREES.length];
  const wrongTargetQuality = MAJOR_KEY_QUALITIES[wrongTargetDegree - 1];
  const wrongTargetRoman = getRomanForDegree(wrongTargetDegree, wrongTargetQuality, 'triad');

  const hasTonicization = sequenceIndex % 5 !== 0;
  let progression: string[];
  let answer: string;
  let optionsList: string[];

  if (hasTonicization) {
    progression = [tonicChord, secondaryChord, targetChord, dominantChord, tonicChord];
    answer = `V7/${targetRoman} tonicizing ${targetRoman}`;
    optionsList = [
      answer,
      `V7/${wrongTargetRoman} tonicizing ${wrongTargetRoman}`,
      `${getRomanForDegree(targetDegree, targetQuality, '7')} borrowed from ${key} minor`,
      'No tonicization is present',
    ];
  } else {
    const subdominantChord = `${keyNotes[3]}${getDegreeChordSuffix(MAJOR_KEY_QUALITIES[3], 'triad', 4)}`;
    progression = [tonicChord, subdominantChord, targetChord, dominantChord, tonicChord];
    answer = 'No tonicization is present';
    optionsList = [
      answer,
      `V7/${targetRoman} tonicizing ${targetRoman}`,
      `V7/${wrongTargetRoman} tonicizing ${wrongTargetRoman}`,
      `${getRomanForDegree(targetDegree, targetQuality, '7')} borrowed from ${key} minor`,
    ];
  }

  return {
    type: 'secondary',
    key,
    progression,
    answer,
    options: rotateOptions(optionsList, sequenceIndex),
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
    return generateStableQuizQuestions();
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

function generateStableQuizQuestions(): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (let i = 0; i < 20; i++) {
    questions.push(createQuizQuestion(i));
  }
  return questions;
}

function getDiatonicTriadLabel(tonic: string, scaleType: ScaleType, degree: number): string {
  const scaleNotes = getScaleNotes(tonic, scaleType);
  const qualities = scaleType === 'natural minor' ? NATURAL_MINOR_KEY_QUALITIES : MAJOR_KEY_QUALITIES;
  return `${scaleNotes[degree - 1]}${getDegreeChordSuffix(qualities[degree - 1], 'triad', degree)}`;
}

function getGuitarChordNotes(frets: number[]): string[] {
  const openStringPitches = [40, 45, 50, 55, 59, 64];
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const result: string[] = [];

  frets.forEach((fret, stringIdx) => {
    if (fret >= 0) {
      const midi = openStringPitches[stringIdx] + fret;
      const pitchName = notes[midi % 12].replace(/#/g, '♯').replace(/b/g, '♭');
      const octave = Math.floor(midi / 12) - 1;
      result.push(`${pitchName}${octave}`);
    }
  });

  return result;
}

function createEarQuestion(index: number): EarTrainingQuestion {
  const mode = index % 3;
  const sequenceIndex = Math.floor(index / 3);
  const instruments: Array<'piano' | 'guitar' | 'violin' | 'flute'> = ['piano', 'guitar', 'violin', 'flute'];
  let instrument: 'piano' | 'guitar' | 'violin' | 'flute' | 'composite' = instruments[index % instruments.length];

  if ((mode === 1 || mode === 2) && index % 4 === 3) {
    instrument = 'composite';
  }

  const promptInstrumentName = instrument === 'composite' ? 'multiple instruments' : instrument;

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
      prompt: `Reference: ${getScaleDisplayName(tonic, scaleType)} tonic, then one mystery pitch (played on ${promptInstrumentName})`,
      tonic,
      scaleType,
      degree,
      targetNote,
      answer,
      instrument,
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
      prompt: `Tonic reference chord (${getScaleDisplayName(tonic, scaleType)}) will be played first, then the sequence. Identify the progression (played on ${promptInstrumentName}):`,
      tonic,
      scaleType,
      progression,
      answer: pattern.numerals,
      instrument,
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
    prompt: `Listen to the chord quality (played on ${promptInstrumentName})`,
    chord,
    qualityKey,
    answer: quality.qualityText,
    instrument,
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
    return generateStableEarQuestions();
  }

  const questions: EarTrainingQuestion[] = [];
  const types: Array<'degree' | 'progression' | 'quality'> = ['degree', 'progression', 'quality'];
  const baseInstruments: Array<'piano' | 'guitar' | 'violin' | 'flute'> = ['piano', 'guitar', 'violin', 'flute'];

  for (let i = 0; i < 20; i++) {
    const type = types[i % types.length];
    let instrument: 'piano' | 'guitar' | 'violin' | 'flute' | 'composite' = baseInstruments[Math.floor(Math.random() * baseInstruments.length)];
    if ((type === 'progression' || type === 'quality') && Math.random() < 0.25) {
      instrument = 'composite';
    }

    const promptInstrumentName = instrument === 'composite' ? 'multiple instruments' : instrument;

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
        prompt: `Reference: ${getScaleDisplayName(tonic, scaleType)} tonic, then one mystery pitch (played on ${promptInstrumentName})`,
        tonic,
        scaleType,
        degree,
        targetNote,
        answer,
        instrument,
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
        prompt: `Tonic reference chord (${getScaleDisplayName(tonic, scaleType)}) will be played first, then the sequence. Identify the progression (played on ${promptInstrumentName}):`,
        tonic,
        scaleType,
        progression,
        answer: pattern.numerals,
        instrument,
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
        prompt: `Listen to the chord quality (played on ${promptInstrumentName})`,
        chord,
        qualityKey,
        answer: quality.qualityText,
        instrument,
        options: buildAnswerOptions(quality.qualityText, [
          'major',
          'minor',
          'dominant seventh',
          'major seventh',
          'diminished',
        ]),
      });
    }
  }

  return shuffleArray(questions);
}

function generateStableEarQuestions(): EarTrainingQuestion[] {
  const questions: EarTrainingQuestion[] = [];
  for (let i = 0; i < 20; i++) {
    questions.push(createEarQuestion(i));
  }
  return questions;
}

export function generateGuitarQuestions(): GuitarChordQuestion[] {
  if (process.env.NODE_ENV === 'test') {
    return generateStableGuitarQuestions();
  }

  const shuffledBase = shuffleArray(GUITAR_QUESTIONS);
  const extraNeeded = 20 - shuffledBase.length;
  const extras: GuitarChordQuestion[] = [];
  for (let i = 0; i < extraNeeded; i++) {
    extras.push(GUITAR_QUESTIONS[Math.floor(Math.random() * GUITAR_QUESTIONS.length)]);
  }

  const list = [...shuffledBase, ...extras];
  
  return shuffleArray(list).map((q, idx) => {
    const isNotesQuestion = idx % 2 === 1;
    if (isNotesQuestion) {
      const correctNotesStr = getGuitarChordNotes(q.chordData.positions[0].frets).join(' · ');
      const otherChordNames = q.options.filter((opt) => opt !== q.answer);
      const optionsNotes = otherChordNames.map((chordName) => {
        const matchingChord = GUITAR_QUESTIONS.find((item) => item.answer === chordName);
        return matchingChord ? getGuitarChordNotes(matchingChord.chordData.positions[0].frets).join(' · ') : '';
      }).filter(Boolean);

      return {
        ...q,
        type: 'notes',
        answer: correctNotesStr,
        options: buildAnswerOptions(correctNotesStr, optionsNotes),
      };
    }

    return {
      ...q,
      type: 'identify',
      options: shuffleArray(uniqueValues([...q.options, q.answer])),
    };
  });
}

function generateStableGuitarQuestions(): GuitarChordQuestion[] {
  const questions: GuitarChordQuestion[] = [];
  for (let i = 0; i < 20; i++) {
    const q = GUITAR_QUESTIONS[i % GUITAR_QUESTIONS.length];
    const isNotesQuestion = i % 2 === 1;
    if (isNotesQuestion) {
      const correctNotesStr = getGuitarChordNotes(q.chordData.positions[0].frets).join(' · ');
      const otherChordNames = q.options.filter((opt) => opt !== q.answer);
      const optionsNotes = otherChordNames.map((chordName) => {
        const matchingChord = GUITAR_QUESTIONS.find((item) => item.answer === chordName);
        return matchingChord ? getGuitarChordNotes(matchingChord.chordData.positions[0].frets).join(' · ') : '';
      }).filter(Boolean);
      questions.push({
        ...q,
        type: 'notes',
        answer: correctNotesStr,
        options: rotateOptions([correctNotesStr, ...optionsNotes], i),
      });
    } else {
      questions.push({
        ...q,
        type: 'identify',
        options: rotateOptions([q.answer, ...q.options.filter((o) => o !== q.answer)], i),
      });
    }
  }
  return questions;
}

function getNoteMidi(note: string, octave = 4): number {
  const normalized = note.replace(/♯/g, '#').replace(/♭/g, 'b');
  return (octave + 1) * 12 + (NOTE_INDEX[normalized] ?? 0);
}

function midiToFrequency(midi: number): number {
  return 440 * (2 ** ((midi - 69) / 12));
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
  
  const releaseTime = Math.min(0.2, duration * 0.35);
  gain.gain.setValueAtTime(peakGain, startTime + duration - releaseTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function getInstrumentChordNoteDelay(
  instrument: 'piano' | 'guitar' | 'violin' | 'flute',
  noteIndex: number,
): number {
  if (instrument === 'violin' || instrument === 'flute') {
    return noteIndex * 0.14;
  }

  return noteIndex * 0.015;
}

function getScheduledNoteDuration(duration: number, delay: number): number {
  return Math.max(0.2, duration - delay);
}

function playChord(
  context: AudioContext,
  root: string,
  intervals: number[],
  startTime: number,
  duration: number,
  instrumentSeed: number,
  noteSpacing = 0.015,
) {
  const rootMidi = getNoteMidi(root, 4);
  const waveforms: OscillatorType[] = ['triangle', 'sine', 'sawtooth'];
  intervals.forEach((interval, index) => {
    const delay = index * noteSpacing;
    playTone(
      context,
      rootMidi + interval + (index >= 3 ? 12 : 0),
      startTime + delay,
      getScheduledNoteDuration(duration, delay),
      waveforms[(instrumentSeed + index) % waveforms.length],
      index === 0 ? 0.055 : 0.038,
    );
  });
}

function midiToNoteName(midi: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${notes[midi % 12]}${octave}`;
}

interface SmplrSoundfontInstance {
  start(config: { note: string; time: number; duration: number; velocity: number }): void;
  load?: () => Promise<void>;
  loaded?: () => Promise<void>;
}

interface SmplrModuleType {
  Soundfont: new (context: AudioContext, options: { instrument: string }) => SmplrSoundfontInstance;
}

let smplrModule: SmplrModuleType | null = null;
const loadedInstruments = new Map<string, SmplrSoundfontInstance>();
const loadingInstruments = new Map<string, Promise<SmplrSoundfontInstance | null>>();
let miniGameAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (miniGameAudioContext && miniGameAudioContext.state !== 'closed') {
    return miniGameAudioContext;
  }

  loadedInstruments.clear();
  loadingInstruments.clear();

  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  miniGameAudioContext = AudioContextCtor ? new AudioContextCtor() : null;
  return miniGameAudioContext;
}

async function getInstrumentSoundfont(context: AudioContext, name: 'piano' | 'guitar' | 'violin' | 'flute') {
  if (process.env.NODE_ENV === 'test') return null;
  const SOUNDFONT_NAMES = {
    piano: 'acoustic_grand_piano',
    guitar: 'acoustic_guitar_steel',
    violin: 'violin',
    flute: 'flute',
  };
  const fontName = SOUNDFONT_NAMES[name];
  const inst = loadedInstruments.get(fontName);
  if (inst) return inst;

  let loadingPromise = loadingInstruments.get(fontName);
  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        if (!smplrModule) {
          smplrModule = (await import('smplr')) as unknown as SmplrModuleType;
        }
        if (smplrModule) {
          const newInst = new smplrModule.Soundfont(context, { instrument: fontName });
          if (typeof newInst.load === 'function') {
            await newInst.load();
          } else if (typeof newInst.loaded === 'function') {
            await newInst.loaded();
          }
          loadedInstruments.set(fontName, newInst);
          return newInst;
        }
        return null;
      } catch (err) {
        console.error('Failed to load soundfont instrument:', err);
        return null;
      } finally {
        loadingInstruments.delete(fontName);
      }
    })();
    loadingInstruments.set(fontName, loadingPromise);
  }

  return loadingPromise;
}

async function playInstrumentTone(
  context: AudioContext,
  midi: number,
  startTime: number,
  duration: number,
  instrument: 'piano' | 'guitar' | 'violin' | 'flute' = 'piano',
  volume = 0.05,
) {
  const soundfont = await getInstrumentSoundfont(context, instrument);
  if (soundfont) {
    try {
      soundfont.start({
        note: midiToNoteName(midi),
        time: startTime,
        duration: duration,
        velocity: Math.min(127, Math.max(30, Math.round(volume * 1000))),
      });
      return;
    } catch (e) {
      console.warn('Soundfont start failed, falling back to oscillator:', e);
    }
  }
  const waveMap: Record<string, OscillatorType> = {
    piano: 'sine',
    guitar: 'triangle',
    violin: 'sawtooth',
    flute: 'sine',
  };
  playTone(context, midi, startTime, duration, waveMap[instrument] || 'sine', volume);
}

async function playInstrumentChord(
  context: AudioContext,
  root: string,
  intervals: number[],
  startTime: number,
  duration: number,
  instrument: 'piano' | 'guitar' | 'violin' | 'flute' | 'composite' = 'piano',
  instrumentSeed: number = 0,
) {
  const rootMidi = getNoteMidi(root, 4);

  if (instrument === 'composite') {
    const compositeInstruments: Array<'piano' | 'guitar' | 'violin' | 'flute'> = ['piano', 'guitar', 'violin', 'flute'];
    for (let index = 0; index < intervals.length; index++) {
      const interval = intervals[index];
      const noteInst = compositeInstruments[(instrumentSeed + index) % compositeInstruments.length];
      const soundfont = await getInstrumentSoundfont(context, noteInst);
      if (soundfont) {
        try {
          const delay = getInstrumentChordNoteDelay(noteInst, index);
          soundfont.start({
            note: midiToNoteName(rootMidi + interval + (index >= 3 ? 12 : 0)),
            time: startTime + delay,
            duration: getScheduledNoteDuration(duration, delay),
            velocity: index === 0 ? 80 : 60,
          });
          continue;
        } catch (e) {
          console.warn(`Composite soundfont note start failed for ${noteInst}:`, e);
        }
      }
      const waveMap: Record<string, OscillatorType> = {
        piano: 'sine',
        guitar: 'triangle',
        violin: 'sawtooth',
        flute: 'sine',
      };
      const delay = getInstrumentChordNoteDelay(noteInst, index);
      playTone(
        context,
        rootMidi + interval + (index >= 3 ? 12 : 0),
        startTime + delay,
        getScheduledNoteDuration(duration, delay),
        waveMap[noteInst] || 'sine',
        index === 0 ? 0.055 : 0.038,
      );
    }
    return;
  }

  const soundfont = await getInstrumentSoundfont(context, instrument as 'piano' | 'guitar' | 'violin' | 'flute');
  if (soundfont) {
    try {
      intervals.forEach((interval, index) => {
        const delay = getInstrumentChordNoteDelay(instrument as 'piano' | 'guitar' | 'violin' | 'flute', index);
        soundfont.start({
          note: midiToNoteName(rootMidi + interval + (index >= 3 ? 12 : 0)),
          time: startTime + delay,
          duration: getScheduledNoteDuration(duration, delay),
          velocity: index === 0 ? 80 : 60,
        });
      });
      return;
    } catch (e) {
      console.warn('Soundfont chord start failed, falling back to oscillator:', e);
    }
  }
  const noteSpacing = instrument === 'violin' || instrument === 'flute' ? 0.14 : 0.015;
  playChord(context, root, intervals, startTime, duration, instrumentSeed, noteSpacing);
}

function getChordRootAndQuality(chord: string): { root: string; quality: ChordQualitySpec } {
  const rootMatch = chord.match(/^[A-G](?:#|b|♯|♭)?/);
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
  const instrument = question.instrument || 'piano';

  if (process.env.NODE_ENV !== 'test') {
    try {
      if (instrument === 'composite') {
        await Promise.all([
          getInstrumentSoundfont(context, 'piano'),
          getInstrumentSoundfont(context, 'guitar'),
          getInstrumentSoundfont(context, 'violin'),
          getInstrumentSoundfont(context, 'flute'),
        ]);
      } else {
        await getInstrumentSoundfont(context, instrument);
      }
    } catch (e) {
      console.warn('Failed to pre-load soundfont:', e);
    }
  }

  const start = context.currentTime + 0.04;

  if (question.type === 'degree' && question.tonic && question.targetNote) {
    const tonicMidi = getNoteMidi(question.tonic, 4);
    const targetMidi = tonicMidi + getScaleSteps(question.scaleType || 'major')[(question.degree || 1) - 1];
    void playInstrumentTone(context, tonicMidi, start, 0.8, instrument === 'composite' ? 'piano' : instrument, 0.08);
    void playInstrumentTone(context, targetMidi, start + 1.0, 1.2, instrument === 'composite' ? 'piano' : instrument, 0.075);
    return;
  }

  if (question.type === 'progression' && question.progression) {
    const refQuality = question.scaleType === 'natural minor' ? CHORD_QUALITIES.minor : CHORD_QUALITIES.major;
    void playInstrumentChord(context, question.tonic || 'C', refQuality.intervals, start, 1.0, instrument, 0);

    const progressionStart = start + 2.0;
    question.progression.forEach((chord, index) => {
      const { root, quality } = getChordRootAndQuality(chord);
      void playInstrumentChord(context, root, quality.intervals, progressionStart + index * 0.85, 0.75, instrument, index);
    });
    return;
  }

  if (question.type === 'quality' && question.chord) {
    const { root, quality } = getChordRootAndQuality(question.chord);
    void playInstrumentTone(context, getNoteMidi(root, 4), start, 0.5, instrument === 'composite' ? 'piano' : instrument, 0.07);
    void playInstrumentChord(context, root, quality.intervals, start + 0.7, 1.5, instrument, question.answer.length);
  }
}

function ScorePill({ score }: { score: QuizScore }) {
  return (
    <span className="rounded-full bg-default-100 px-3 py-1.5 text-sm font-semibold text-default-600 dark:bg-white/10 dark:text-slate-200 font-outfit">
      {score.correct}/{score.attempted}
    </span>
  );
}

function getWinner(board: Mark[]): Mark {
  for (const line of WIN_LINES) {
    const [a, b, c, d, e] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c] && board[a] === board[d] && board[a] === board[e]) {
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

  const preferred = [
    27, 28, 35, 36, // absolute center 2x2
    19, 20, 21, 26, 29, 34, 37, 42, 43, 44, 45, 18 // inner 4x4 perimeter
  ];
  for (const index of preferred) {
    if (available.includes(index)) return index;
  }

  return available[Math.floor(Math.random() * available.length)] ?? null;
}

function getQuizAnswer(question: QuizQuestion): string {
  return question.type === 'tone' ? question.missing : question.answer;
}

function getQuizReviewPrompt(question: QuizQuestion): string {
  if (question.type === 'label') {
    return `Name the chord: ${question.notes.join(' · ')}`;
  }

  if (question.type === 'tone') {
    return `Find the missing tone in ${getFormattedChordText(question.chord)}: ${question.tones.join(' · ')}`;
  }

  if (question.type === 'scale') {
    return question.prompt;
  }

  if (question.type === 'secondary') {
    return `In ${question.key} major: ${question.progression.map(getFormattedChordText).join(' - ')}`;
  }

  return question.qualityText;
}

function getEarReviewPrompt(question: EarTrainingQuestion): string {
  if (question.type === 'progression' && question.progression) {
    return `${question.prompt} ${question.progression.map(getFormattedChordText).join(' - ')}`;
  }

  if (question.type === 'quality' && question.chord) {
    return `${question.prompt} Root: ${getFormattedChordText(question.chord.replace(/(maj7|m7b5|m7|dim|sus4|7|m)$/, ''))}`;
  }

  return question.prompt;
}

function getGuitarReviewPrompt(question: GuitarChordQuestion): string {
  return question.type === 'notes'
    ? 'Identify notes in the displayed guitar chord diagram'
    : 'Read the displayed guitar chord diagram';
}

function buildQuestionReviewEntry(
  questionNumber: number,
  prompt: string,
  correctAnswer: string,
  wrongAnswers: string[],
  finalAnswer: string,
  wasCorrect: boolean,
  playbackQuestion?: EarTrainingQuestion,
): GameQuestionReviewEntry {
  return {
    questionNumber,
    prompt,
    correctAnswer,
    selectedAnswers: [...wrongAnswers, finalAnswer],
    wasCorrect,
    playbackQuestion,
  };
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
    <div className="flex flex-col items-center justify-center py-7 text-center space-y-6">
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-foreground font-outfit">{title} Completed!</h3>
        <p className="text-base font-medium text-default-500 dark:text-slate-300">You&apos;ve finished all 20 questions.</p>
      </div>
      
      <div className="relative flex items-center justify-center">
        <div className="flex flex-col items-center justify-center rounded-full bg-default-100 dark:bg-white/[0.08] w-32 h-32 border-4 border-primary">
          <span className="text-4xl font-bold text-foreground">{score.correct}</span>
          <span className="text-sm text-default-500 dark:text-slate-300">out of 20</span>
        </div>
      </div>

      <div className="text-base font-semibold text-primary-600 dark:text-blue-300 font-outfit">
        Accuracy: {percentage}%
      </div>

      <Button
        color="primary"
        radius="sm"
        onPress={onReplay}
        className="h-11 px-7 text-base font-semibold font-outfit"
      >
        Play Again
      </Button>
    </div>
  );
}

// Sub-component for showing session history
function HistoryPanelContent({
  history,
  onClear,
  title = 'Session History',
}: {
  history: GameHistoryEntry[];
  onClear: () => void;
  title?: string;
}) {
  const [selectedReviewEntry, setSelectedReviewEntry] = useState<GameHistoryEntry | null>(null);
  const selectedReviewQuestions = selectedReviewEntry?.questions ?? [];

  const getHistoryLabel = (entry: GameHistoryEntry) => {
    if (entry.gameMode === 'xo') return 'X/O Game';
    if (entry.gameMode === 'ear') return 'Ear Training';
    if (entry.gameMode === 'guitar') return 'Guitar Game';
    return 'Theory Quiz';
  };

  const getHistoryResult = (entry: GameHistoryEntry) => {
    if (entry.gameMode === 'xo') return entry.xoResult ?? '—';
    if (!entry.score) return '—';
    const accuracy = Math.round((entry.score.correct / entry.score.attempted) * 100);
    return `${entry.score.correct}/${entry.score.attempted} (${accuracy}%)`;
  };

  const getResultClassName = (entry: GameHistoryEntry) => {
    if (entry.gameMode !== 'xo') {
      return 'font-semibold font-outfit text-primary-600 dark:text-blue-300';
    }

    if (entry.xoResult === 'win') {
      return 'inline-flex rounded px-2 py-1 text-xs font-bold uppercase bg-success-100 text-success-700 dark:bg-success-900/35 dark:text-emerald-300';
    }

    if (entry.xoResult === 'loss') {
      return 'inline-flex rounded px-2 py-1 text-xs font-bold uppercase bg-danger-100 text-danger-700 dark:bg-danger-900/35 dark:text-rose-300';
    }

    return 'inline-flex rounded px-2 py-1 text-xs font-bold uppercase bg-default-100 text-default-600 dark:bg-white/10 dark:text-slate-300';
  };

  return (
    <>
      <Table
        aria-label="Session history"
        isHeaderSticky
        topContent={
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6 shrink-0 text-primary">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span className="truncate text-lg font-bold text-foreground font-outfit">
                {title}
              </span>
            </div>
            {history.length > 0 && (
              <AppTooltip content="Clear session history" placement="top" delay={0}>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="light"
                    color="default"
                    radius="full"
                    isIconOnly
                    onPress={() => {
                      setSelectedReviewEntry(null);
                      onClear();
                    }}
                    className="h-11 w-11 min-w-11 text-black hover:bg-default-100 dark:text-white dark:hover:bg-white/10"
                    aria-label="Clear session history"
                    title="Clear session history"
                  >
                    <HiOutlineTrash className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </span>
              </AppTooltip>
            )}
          </div>
        }
        classNames={{
          base: 'w-full',
          wrapper: 'max-h-[360px] min-h-[270px] rounded-lg border border-default-200 bg-content1/85 p-0 shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40',
          table: 'min-w-full',
          th: 'bg-default-100 px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-default-500 dark:bg-white/[0.08] dark:text-slate-300',
          td: 'px-5 py-4 text-sm dark:text-slate-100',
          emptyWrapper: 'h-40 px-6 text-center text-sm leading-relaxed text-default-400 dark:text-slate-300',
        }}
      >
        <TableHeader>
          <TableColumn>Game</TableColumn>
          <TableColumn>Score</TableColumn>
          <TableColumn>Time</TableColumn>
          <TableColumn>Review</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No games completed in this session yet. Complete a quiz or finish an X/O board to see your scores here!">
          {history.map((entry) => {
            const dateStr = new Date(entry.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const hasReview = Boolean(entry.questions?.length);

            return (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="font-semibold text-foreground font-outfit">
                    {getHistoryLabel(entry)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={getResultClassName(entry)}>
                    {getHistoryResult(entry)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="whitespace-nowrap text-xs text-default-400 dark:text-slate-300">
                    {dateStr}
                  </span>
                </TableCell>
                <TableCell>
                  {hasReview ? (
                    <Button
                      size="sm"
                      variant="flat"
                      radius="sm"
                      onPress={() => setSelectedReviewEntry(entry)}
                      className="h-9 min-w-0 px-3 text-xs font-bold font-outfit"
                    >
                      Review
                    </Button>
                  ) : (
                    <span className="text-xs text-default-400 dark:text-slate-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Modal
        isOpen={Boolean(selectedReviewEntry)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedReviewEntry(null);
        }}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          base: 'border border-default-200 dark:border-white/10 bg-content1 dark:bg-slate-950',
        }}
      >
        <ModalContent suppressHydrationWarning>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 font-outfit">
                <span className="text-xl font-bold">{selectedReviewEntry ? `${getHistoryLabel(selectedReviewEntry)} Review` : 'Question Review'}</span>
                {selectedReviewEntry?.score && (
                  <span className="text-sm font-semibold text-default-500 dark:text-slate-300">
                    {selectedReviewEntry.score.correct}/{selectedReviewEntry.score.attempted} first-try correct
                  </span>
                )}
              </ModalHeader>
              <ModalBody className="pb-4">
                <Table
                  aria-label="Question review"
                  removeWrapper
                  classNames={{
                    table: 'min-w-full',
                    th: 'bg-transparent px-0 pb-2 pt-0 text-xs font-bold uppercase tracking-wider text-default-400 dark:text-slate-400',
                    td: 'border-t border-default-200 px-0 py-3.5 align-top text-sm dark:border-white/10',
                  }}
                >
                  <TableHeader>
                    <TableColumn className="w-16">#</TableColumn>
                    <TableColumn>Question</TableColumn>
                    <TableColumn>Correct</TableColumn>
                    <TableColumn>Your Answers</TableColumn>
                    <TableColumn>Audio</TableColumn>
                    <TableColumn className="text-right">Result</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="No question review data was saved for this session.">
                    {selectedReviewQuestions.map((question) => (
                      <TableRow key={`${selectedReviewEntry?.id}-${question.questionNumber}`}>
                        <TableCell>
                          <span className="font-bold text-default-500 dark:text-slate-300">
                            {question.questionNumber}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-[260px] whitespace-normal text-sm font-semibold leading-relaxed text-foreground">
                            {question.prompt}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block whitespace-normal font-semibold leading-snug text-foreground">
                            {question.correctAnswer}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            {question.selectedAnswers.map((answer, answerIndex) => {
                              const isAnswerCorrect = answer === question.correctAnswer;

                              return (
                                <div key={`${question.questionNumber}-${answer}-${answerIndex}`} className="flex items-start gap-2">
                                  <Chip
                                    size="sm"
                                    color={isAnswerCorrect ? 'success' : 'danger'}
                                    variant="flat"
                                    className="h-5 shrink-0 text-[9px] font-bold uppercase"
                                  >
                                    {isAnswerCorrect ? 'Correct' : 'Wrong'}
                                  </Chip>
                                  <span className="whitespace-normal font-semibold leading-snug text-foreground">
                                    {answer}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {question.playbackQuestion ? (
                            <Button
                              size="sm"
                              color="primary"
                              variant="flat"
                              radius="sm"
                              onPress={() => {
                                if (question.playbackQuestion) {
                                  void playEarQuestion(question.playbackQuestion);
                                }
                              }}
                              className="h-9 min-w-0 px-4 text-xs font-bold font-outfit"
                            >
                              Play
                            </Button>
                          ) : (
                            <span className="text-xs text-default-400 dark:text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Chip
                              size="sm"
                              color={question.wasCorrect ? 'success' : 'danger'}
                              variant="flat"
                              className="h-7 text-xs font-bold uppercase"
                            >
                              {question.wasCorrect ? 'Correct' : 'Wrong'}
                            </Chip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose} className="font-semibold font-outfit">
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

export default function MiniGamesContainer({ layoutMode = 'embed' }: MiniGamesContainerProps) {
  const [board, setBoard] = useState<Mark[]>(Array(64).fill(null));
  const [userGoesFirst, setUserGoesFirst] = useState<boolean>(true);
  const [gameMode, setGameMode] = useState<GameMode>('quiz');
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0);
  const [earQuestionIndex, setEarQuestionIndex] = useState(0);
  const [guitarQuestionIndex, setGuitarQuestionIndex] = useState(0);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() => generateStableQuizQuestions());
  const [earQuestions, setEarQuestions] = useState<EarTrainingQuestion[]>(() => generateStableEarQuestions());
  const [guitarQuestions, setGuitarQuestions] = useState<GuitarChordQuestion[]>(() => generateStableGuitarQuestions());

  const [quizResult, setQuizResult] = useState<QuizResult>(null);
  const [earResult, setEarResult] = useState<QuizResult>(null);
  const [guitarResult, setGuitarResult] = useState<QuizResult>(null);
  
  const [quizScore, setQuizScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [earScore, setEarScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [guitarScore, setGuitarScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [quizReview, setQuizReview] = useState<GameQuestionReviewEntry[]>([]);
  const [earReview, setEarReview] = useState<GameQuestionReviewEntry[]>([]);
  const [guitarReview, setGuitarReview] = useState<GameQuestionReviewEntry[]>([]);
  
  const [currentQuestionHasMistake, setCurrentQuestionHasMistake] = useState(false);
  const [wrongSelections, setWrongSelections] = useState<string[]>([]);
  const [xoRecorded, setXoRecorded] = useState(false);

  // Scoring History Session state
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const { isOpen: isHistoryOpen, onOpen: onHistoryOpen, onOpenChange: onHistoryOpenChange } = useDisclosure();

  // Load history from session storage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('chordmini_games_history');
      if (stored) {
        try {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHistory(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse games history from sessionStorage:', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserGoesFirst(Math.random() < 0.5);
    setQuizQuestions(generateQuizQuestions());
    setEarQuestions(generateEarQuestions());
    setGuitarQuestions(generateGuitarQuestions());
  }, []);

  const addHistoryEntry = (entry: Omit<GameHistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: GameHistoryEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };
    setHistory((prev) => {
      const updated = [newEntry, ...prev];
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('chordmini_games_history', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('chordmini_games_history');
    }
  };

  const winner = useMemo(() => getWinner(board), [board]);
  const isDraw = !winner && board.every(Boolean);
  const isPlayerTurn = !winner && !isDraw && (board.filter(Boolean).length % 2 === (userGoesFirst ? 0 : 1));
  
  const status = winner
    ? (winner === 'X' ? 'You win' : 'O wins')
    : isDraw
      ? 'Draw'
      : (isPlayerTurn ? 'Your turn' : 'O thinking');

  const quizQuestion = quizQuestions[quizQuestionIndex] || quizQuestions[0];
  const earQuestion = earQuestions[earQuestionIndex] || earQuestions[0];
  const guitarQuestion = guitarQuestions[guitarQuestionIndex] || guitarQuestions[0];

  // Set up minigame toasts for embedded panel
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || layoutMode !== 'embed') return;

    const toastKeys: string[] = [];

    MINI_GAME_NOTICES.forEach((notice) => {
      const key = addToast({
        title: notice.title,
        description: notice.description,
        color: 'default',
        timeout: 0,
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
  }, [layoutMode]);

  // Watch for XO completion to save history
  useEffect(() => {
    if ((winner || isDraw) && !xoRecorded) {
      let result: 'win' | 'loss' | 'draw' = 'draw';
      if (winner === 'X') result = 'win';
      else if (winner === 'O') result = 'loss';
      
      // eslint-disable-next-line react-hooks/set-state-in-effect
      addHistoryEntry({
        gameMode: 'xo',
        xoResult: result,
      });
      setXoRecorded(true);
    }
  }, [winner, isDraw, xoRecorded]);

  // AI Move triggers
  useEffect(() => {
    if (!isPlayerTurn && !winner && !isDraw && gameMode === 'xo') {
      const delay = process.env.NODE_ENV === 'test' ? 0 : 500;
      const timer = setTimeout(() => {
        setBoard((current) => {
          const automaticMove = getAutomaticMove(current);
          if (automaticMove !== null) {
            const next = [...current];
            next[automaticMove] = 'O';
            return next;
          }
          return current;
        });
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isPlayerTurn, winner, isDraw, gameMode]);

  const handleCellClick = (index: number) => {
    if (!isPlayerTurn || board[index] || winner || isDraw) return;
    setBoard((current) => {
      const next = [...current];
      next[index] = 'X';

      if (getWinner(next) || next.every(Boolean)) {
        return next;
      }

      if (process.env.NODE_ENV === 'test') {
        const automaticMove = getAutomaticMove(next);
        if (automaticMove !== null) {
          next[automaticMove] = 'O';
        }
      }
      return next;
    });
  };

  const reset = () => {
    setBoard(Array(64).fill(null));
    setUserGoesFirst(process.env.NODE_ENV === 'test' ? true : Math.random() < 0.5);
    setXoRecorded(false);
  };

  const answerQuizQuestion = (option: string) => {
    if (quizResult === 'correct') return;
    const isCorrect = option === getQuizAnswer(quizQuestion);
    if (isCorrect) {
      const gotItRight = !currentQuestionHasMistake && wrongSelections.length === 0;
      const nextCorrect = quizScore.correct + (gotItRight ? 1 : 0);
      const nextAttempted = quizScore.attempted + 1;
      const nextReview = [
        ...quizReview,
        buildQuestionReviewEntry(
          nextAttempted,
          getQuizReviewPrompt(quizQuestion),
          getQuizAnswer(quizQuestion),
          wrongSelections,
          option,
          gotItRight,
        ),
      ];

      setQuizScore({
        correct: nextCorrect,
        attempted: nextAttempted,
      });
      setQuizReview(nextReview);
      setQuizResult('correct');

      if (nextAttempted === 20) {
        addHistoryEntry({
          gameMode: 'quiz',
          score: { correct: nextCorrect, attempted: 20 },
          questions: nextReview,
        });
      }

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
      const nextCorrect = earScore.correct + (gotItRight ? 1 : 0);
      const nextAttempted = earScore.attempted + 1;
      const nextReview = [
        ...earReview,
        buildQuestionReviewEntry(
          nextAttempted,
          getEarReviewPrompt(earQuestion),
          earQuestion.answer,
          wrongSelections,
          option,
          gotItRight,
          earQuestion,
        ),
      ];

      setEarScore({
        correct: nextCorrect,
        attempted: nextAttempted,
      });
      setEarReview(nextReview);
      setEarResult('correct');

      if (nextAttempted === 20) {
        addHistoryEntry({
          gameMode: 'ear',
          score: { correct: nextCorrect, attempted: 20 },
          questions: nextReview,
        });
      }

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
      const nextCorrect = guitarScore.correct + (gotItRight ? 1 : 0);
      const nextAttempted = guitarScore.attempted + 1;
      const nextReview = [
        ...guitarReview,
        buildQuestionReviewEntry(
          nextAttempted,
          getGuitarReviewPrompt(guitarQuestion),
          guitarQuestion.answer,
          wrongSelections,
          option,
          gotItRight,
        ),
      ];

      setGuitarScore({
        correct: nextCorrect,
        attempted: nextAttempted,
      });
      setGuitarReview(nextReview);
      setGuitarResult('correct');

      if (nextAttempted === 20) {
        addHistoryEntry({
          gameMode: 'guitar',
          score: { correct: nextCorrect, attempted: 20 },
          questions: nextReview,
        });
      }

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
    setQuizReview([]);
    setQuizQuestionIndex(0);
    setQuizResult(null);
    setCurrentQuestionHasMistake(false);
    setWrongSelections([]);
  };

  const handleEarReplay = () => {
    setEarQuestions(generateEarQuestions());
    setEarScore({ correct: 0, attempted: 0 });
    setEarReview([]);
    setEarQuestionIndex(0);
    setEarResult(null);
    setCurrentQuestionHasMistake(false);
    setWrongSelections([]);
  };

  const handleGuitarReplay = () => {
    setGuitarQuestions(generateGuitarQuestions());
    setGuitarScore({ correct: 0, attempted: 0 });
    setGuitarReview([]);
    setGuitarQuestionIndex(0);
    setGuitarResult(null);
    setCurrentQuestionHasMistake(false);
    setWrongSelections([]);
  };

  const isStandalone = layoutMode === 'standalone';
  const cardPaddingClass = isStandalone ? 'p-6 md:p-7' : 'p-4';
  const sectionTitleClass = isStandalone ? 'text-base md:text-lg' : 'text-sm';
  const helperTextClass = isStandalone ? 'text-sm md:text-base' : 'text-xs';
  const answerButtonClass = isStandalone
    ? 'h-auto min-h-12 whitespace-normal py-3 text-base font-semibold leading-snug font-outfit'
    : 'h-auto min-h-10 whitespace-normal py-2 text-sm font-semibold leading-snug font-outfit';
  const feedbackTextClass = isStandalone
    ? 'min-h-6 text-center text-sm font-semibold text-default-400 dark:text-slate-300'
    : 'min-h-5 text-center text-xs font-semibold text-default-400 dark:text-slate-300';

  const gameCardContent = (
    <div className={`w-full ${isStandalone ? '' : 'max-w-[420px]'} rounded-lg border border-default-200 bg-content1/85 ${cardPaddingClass} shadow-sm dark:border-white/10 dark:bg-slate-950/45`}>
      <div className="mb-5 text-center relative">
        <h3 className={`${isStandalone ? 'text-xl' : 'text-base'} font-bold text-foreground font-outfit`}>Mini Games</h3>
        {!isStandalone && (
          <p className="text-sm text-default-500 leading-relaxed mt-1 dark:text-slate-300">
            Practice your theory skills and ear training while the audio analysis is processing. Or just play a quick game of tic-tac-toe to pass the time!
          </p>
        )}
        
        {/* Floating Clock/History icon button in Embed mode */}
        {!isStandalone && (
          <Button
            size="sm"
            variant="light"
            radius="full"
            isIconOnly
            onPress={onHistoryOpen}
            className="absolute top-0 right-0 text-default-500 hover:text-primary dark:text-slate-300 dark:hover:text-blue-300"
            aria-label="View history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </Button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-4 gap-2">
        {MINI_GAME_TABS.map(([mode, label, helpText]) => (
          <AppTooltip key={mode} content={helpText} placement="top">
            <Button
              size={isStandalone ? 'md' : 'sm'}
              variant={gameMode === mode ? 'solid' : 'flat'}
              color={gameMode === mode ? 'primary' : 'default'}
              radius="sm"
              onPress={() => {
                setGameMode(mode);
                setCurrentQuestionHasMistake(false);
                setWrongSelections([]);
              }}
              className={`${isStandalone ? 'h-11 text-sm' : 'h-9 text-sm'} px-2 font-semibold font-outfit`}
            >
              {label}
            </Button>
          </AppTooltip>
        ))}
      </div>

      <div className={`${isStandalone ? 'min-h-[430px]' : 'min-h-[390px]'} flex flex-col justify-center`}>
        {gameMode === 'xo' && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className={`${sectionTitleClass} font-semibold text-foreground font-outfit`}>{status}</p>
              <Button
                size="sm"
                variant="flat"
                radius="sm"
                onPress={reset}
                className={`${isStandalone ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-xs'} font-semibold font-outfit`}
              >
                Reset
              </Button>
            </div>
            <div className="mx-auto grid aspect-square w-full max-w-[280px] grid-cols-8 gap-1 rounded-lg border-2 border-default-400 bg-default-200/80 p-1 shadow-inner dark:border-white/30 dark:bg-white/10">
              {board.map((mark, index) => (
                <Button
                  key={index}
                  type="button"
                  variant="flat"
                  radius="sm"
                  isDisabled={!isPlayerTurn || Boolean(mark) || Boolean(winner) || isDraw}
                  onPress={() => handleCellClick(index)}
                  className={`${isStandalone ? 'text-base' : 'text-sm'} h-auto min-h-0 min-w-0 aspect-square border border-default-400 bg-content1 font-bold shadow-sm data-[hover=true]:border-primary data-[hover=true]:bg-primary/10 data-[disabled=true]:opacity-100 dark:border-white/25 dark:bg-slate-950/80 dark:data-[hover=true]:border-primary`}
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
                <p className={`${sectionTitleClass} font-semibold text-foreground font-outfit`}>
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
              <div className={`${isStandalone ? 'px-5 py-4' : 'px-4 py-3'} rounded-md bg-default-100 text-center dark:bg-white/10 border border-default-200/40 dark:border-white/5`}>
                {quizQuestion.type === 'label' && (
                  <>
                    <p className={`${helperTextClass} font-semibold uppercase text-default-500 tracking-wide font-outfit dark:text-slate-300`}>Notes</p>
                    <p className={`${isStandalone ? 'text-2xl' : 'text-lg'} mt-2 flex items-center justify-center gap-2 font-bold text-foreground`}>
                      {quizQuestion.notes.map((note, index) => (
                        <span key={`${note}-${index}`} className="inline-flex items-center gap-2">
                          <ChordSymbol value={note} />
                          {index < quizQuestion.notes.length - 1 && <span className="text-default-400 font-normal dark:text-slate-400">·</span>}
                        </span>
                      ))}
                    </p>
                  </>
                )}
                {quizQuestion.type === 'tone' && (
                  <>
                    <p className={`${helperTextClass} font-semibold text-default-500 font-outfit uppercase tracking-wide dark:text-slate-300`}>
                      <ChordSymbol value={quizQuestion.chord} />
                    </p>
                    <p className={`${isStandalone ? 'text-2xl' : 'text-lg'} mt-2 flex items-center justify-center gap-2 font-bold text-foreground`}>
                      {quizQuestion.tones.map((note, index) => (
                        <span key={`${note}-${index}`} className="inline-flex items-center gap-2">
                          {note === '?' ? '?' : <ChordSymbol value={note} />}
                          {index < quizQuestion.tones.length - 1 && <span className="text-default-400 font-normal dark:text-slate-400">·</span>}
                        </span>
                      ))}
                    </p>
                  </>
                )}
                {quizQuestion.type === 'scale' && (
                  <>
                    <p className={`${helperTextClass} font-semibold uppercase text-default-500 tracking-wide font-outfit dark:text-slate-300`}>Scale note</p>
                    <p className={`${isStandalone ? 'text-lg' : 'text-base'} mt-2 font-bold text-foreground`}>{quizQuestion.prompt}</p>
                  </>
                )}
                {quizQuestion.type === 'degree' && (
                  <>
                    <p className={`${helperTextClass} font-semibold uppercase text-default-500 tracking-wide font-outfit dark:text-slate-300`}>Which statement is true?</p>
                    <p className={`${isStandalone ? 'text-xl' : 'text-base'} mt-2 font-bold text-foreground`}>
                      <ChordSymbol value={quizQuestion.chord} />
                    </p>
                    <p className={`${helperTextClass} mt-1.5 text-default-500 font-medium dark:text-slate-300`}>{quizQuestion.qualityText}</p>
                  </>
                )}
                {quizQuestion.type === 'secondary' && (
                  <>
                    <p className={`${helperTextClass} font-semibold uppercase text-default-500 tracking-wide font-outfit dark:text-slate-300`}>In {quizQuestion.key} major</p>
                    <p className={`${isStandalone ? 'text-lg' : 'text-base'} mt-2 flex flex-wrap items-center justify-center gap-2 font-bold text-foreground`}>
                      {quizQuestion.progression.map((chord, index) => (
                        <span key={`${chord}-${index}`} className="inline-flex items-center gap-2">
                          <ChordSymbol value={chord} />
                          {index < quizQuestion.progression.length - 1 && <span className="text-default-400 font-normal dark:text-slate-400">-</span>}
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
                    className={answerButtonClass}
                  >
                    {quizQuestion.type === 'degree' || quizQuestion.type === 'secondary' ? option : <ChordSymbol value={option} />}
                  </Button>
                ))}
              </div>
              <p className={feedbackTextClass}>
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
                <p className={`${sectionTitleClass} font-semibold text-foreground font-outfit`}>
                  {earQuestion.type === 'degree'
                    ? 'Hear the scale degree'
                    : earQuestion.type === 'progression'
                      ? 'Hear the progression'
                      : 'Hear the chord quality'}
                </p>
                <ScorePill score={earScore} />
              </div>
              <div className={`${isStandalone ? 'px-5 py-4' : 'px-4 py-3'} rounded-md bg-default-100 text-center dark:bg-white/10 border border-default-200/40 dark:border-white/5`}>
                <p className={`${isStandalone ? 'text-base' : 'text-sm'} font-semibold text-foreground leading-relaxed`}>{earQuestion.prompt}</p>

                {earQuestion.type === 'quality' && earQuestion.chord && (
                  <p className={`${helperTextClass} mt-2 text-default-500 font-medium dark:text-slate-300`}>
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
                  className={`${isStandalone ? 'h-10 px-6 text-sm' : 'px-5'} mt-3 font-semibold font-outfit`}
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
                    className={answerButtonClass}
                  >
                    {option}
                  </Button>
                ))}
              </div>
              <p className={feedbackTextClass}>
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
                <p className={`${sectionTitleClass} font-semibold text-foreground font-outfit`}>
                  {guitarQuestion.type === 'notes' ? 'Identify notes in the chord' : 'Read the diagram'}
                </p>
                <ScorePill score={guitarScore} />
              </div>
              <div className={`${isStandalone ? 'px-5 py-4' : 'px-4 py-3'} flex justify-center rounded-md bg-default-100 dark:bg-white/10 border border-default-200/40 dark:border-white/5`}>
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
                    aria-label={guitarQuestion.type === 'notes' ? option : getFormattedChordText(option)}
                    onPress={() => answerGuitarQuestion(option)}
                    className={answerButtonClass}
                  >
                    {guitarQuestion.type === 'notes' ? option : <ChordSymbol value={option} />}
                  </Button>
                ))}
              </div>
              <p className={feedbackTextClass}>
                {guitarResult === 'correct'
                  ? 'Correct'
                  : guitarResult === 'incorrect'
                    ? (guitarQuestion.type === 'notes' ? 'Try again' : 'Try another chord')
                    : (guitarQuestion.type === 'notes' ? 'Choose the correct notes list' : 'Choose the chord name')}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );

  if (isStandalone) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-2">
        <div className="grid grid-cols-1 justify-center gap-8 lg:grid-cols-[minmax(0,560px)_minmax(380px,420px)] lg:items-start">
          {/* Game area stacks on mobile and keeps a comfortable reading width on desktop */}
          <div className="flex justify-center">
            <div className="w-full max-w-[520px]">
              {gameCardContent}
            </div>
          </div>

          {/* History table stacks on mobile and gets enough desktop width for readable cells */}
          <HistoryPanelContent history={history} onClear={clearHistory} />
        </div>
      </div>
    );
  }

  // Embed layout with Modal for history
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-default-300/70 bg-default-50/60 p-6 dark:border-gray-800 dark:bg-gray-900/20">
      {gameCardContent}

      {/* History Modal */}
      <Modal isOpen={isHistoryOpen} onOpenChange={onHistoryOpenChange} size="lg" backdrop="blur" classNames={{
        base: 'border border-default-200 dark:border-white/10 bg-content1 dark:bg-slate-950',
      }}>
        <ModalContent suppressHydrationWarning>
          {(onClose) => (
            <>
              <ModalHeader className="font-outfit text-lg font-bold flex gap-2 items-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Session Gameplay History
              </ModalHeader>
              <ModalBody className="pb-6">
                <HistoryPanelContent history={history} onClear={clearHistory} />
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose} className="font-semibold font-outfit">
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

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
