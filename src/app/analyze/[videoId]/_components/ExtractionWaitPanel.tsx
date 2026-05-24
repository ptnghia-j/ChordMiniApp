'use client';

import { useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import GuitarChordDiagram from '@/components/chord-playback/GuitarChordDiagram';
import { formatChordWithMusicalSymbols } from '@/utils/chordFormatting';

interface ExtractionWaitPanelProps {
  queueStatus?: 'queued' | 'active' | 'released' | 'cancelled' | 'expired' | null;
  queuePosition?: number | null;
  estimatedWaitSeconds?: number | null;
  statusMessage?: string;
}

type Mark = 'X' | 'O' | null;
type GameMode = 'label' | 'tones' | 'guitar' | 'xo';
type QuizResult = 'correct' | 'incorrect' | null;

interface QuizScore {
  correct: number;
  attempted: number;
}

interface ChordLabelQuestion {
  notes: string[];
  answer: string;
  options: string[];
}

interface ChordToneQuestion {
  chord: string;
  missing: string;
  tones: string[];
  options: string[];
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

const LABEL_QUESTIONS: ChordLabelQuestion[] = [
  { notes: ['C', 'E', 'G'], answer: 'C', options: ['C', 'Cm', 'Csus4', 'Cdim'] },
  { notes: ['A', 'C', 'E'], answer: 'Am', options: ['A', 'Am', 'Asus2', 'A7'] },
  { notes: ['G', 'B', 'D', 'F'], answer: 'G7', options: ['G', 'Gm7', 'G7', 'Gmaj7'] },
  { notes: ['F', 'A', 'C', 'E'], answer: 'Fmaj7', options: ['F7', 'Fmaj7', 'Fm7', 'Fdim'] },
];

const TONE_QUESTIONS: ChordToneQuestion[] = [
  { chord: 'Dm', missing: 'F', tones: ['D', '?', 'A'], options: ['E', 'F', 'F#', 'G'] },
  { chord: 'E7', missing: 'D', tones: ['E', 'G#', 'B', '?'], options: ['C#', 'D', 'D#', 'F'] },
  { chord: 'Bbmaj7', missing: 'A', tones: ['Bb', 'D', 'F', '?'], options: ['Ab', 'A', 'B', 'C'] },
  { chord: 'Gsus4', missing: 'C', tones: ['G', '?', 'D'], options: ['B', 'C', 'C#', 'F'] },
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
];

function ChordSymbol({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(value) }}
    />
  );
}

function getMusicalText(value: string): string {
  return value
    .replace(/([A-G])#/g, '$1♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/#(?=\d)/g, '♯')
    .replace(/b(?=\d)/g, '♭');
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

export default function ExtractionWaitPanel({
  queueStatus: _queueStatus,
  queuePosition: _queuePosition,
  estimatedWaitSeconds: _estimatedWaitSeconds,
  statusMessage: _statusMessage,
}: ExtractionWaitPanelProps) {
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(null));
  const [gameMode, setGameMode] = useState<GameMode>('label');
  const [labelQuestionIndex, setLabelQuestionIndex] = useState(0);
  const [toneQuestionIndex, setToneQuestionIndex] = useState(0);
  const [guitarQuestionIndex, setGuitarQuestionIndex] = useState(0);
  const [labelResult, setLabelResult] = useState<QuizResult>(null);
  const [toneResult, setToneResult] = useState<QuizResult>(null);
  const [guitarResult, setGuitarResult] = useState<QuizResult>(null);
  const [labelScore, setLabelScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [toneScore, setToneScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const [guitarScore, setGuitarScore] = useState<QuizScore>({ correct: 0, attempted: 0 });
  const winner = useMemo(() => getWinner(board), [board]);
  const isDraw = !winner && board.every(Boolean);
  const isPlayerTurn = !winner && !isDraw && board.filter(Boolean).length % 2 === 0;
  const status = winner
    ? (winner === 'X' ? 'You win' : 'O wins')
    : isDraw
      ? 'Draw'
      : (isPlayerTurn ? 'Your turn' : 'O thinking');
  const labelQuestion = LABEL_QUESTIONS[labelQuestionIndex % LABEL_QUESTIONS.length];
  const toneQuestion = TONE_QUESTIONS[toneQuestionIndex % TONE_QUESTIONS.length];
  const guitarQuestion = GUITAR_QUESTIONS[guitarQuestionIndex % GUITAR_QUESTIONS.length];

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

  const answerLabelQuestion = (option: string) => {
    if (labelResult === 'correct') return;
    const isCorrect = option === labelQuestion.answer;
    setLabelScore((current) => ({
      correct: current.correct + (isCorrect ? 1 : 0),
      attempted: current.attempted + 1,
    }));
    setLabelResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      window.setTimeout(() => {
        setLabelQuestionIndex((current) => current + 1);
        setLabelResult(null);
      }, 450);
    }
  };

  const answerToneQuestion = (option: string) => {
    if (toneResult === 'correct') return;
    const isCorrect = option === toneQuestion.missing;
    setToneScore((current) => ({
      correct: current.correct + (isCorrect ? 1 : 0),
      attempted: current.attempted + 1,
    }));
    setToneResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      window.setTimeout(() => {
        setToneQuestionIndex((current) => current + 1);
        setToneResult(null);
      }, 450);
    }
  };

  const answerGuitarQuestion = (option: string) => {
    if (guitarResult === 'correct') return;
    const isCorrect = option === guitarQuestion.answer;
    setGuitarScore((current) => ({
      correct: current.correct + (isCorrect ? 1 : 0),
      attempted: current.attempted + 1,
    }));
    setGuitarResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      window.setTimeout(() => {
        setGuitarQuestionIndex((current) => current + 1);
        setGuitarResult(null);
      }, 450);
    }
  };

  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-default-300/70 bg-default-50/60 p-6 dark:border-gray-800 dark:bg-gray-900/20">
      <div className="w-full max-w-[360px] rounded-lg border border-default-200 bg-content1/85 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/45">
        <div className="mb-4 grid grid-cols-4 gap-2">
          {[
            ['label', 'Chord'],
            ['tones', 'Tones'],
            ['guitar', 'Guitar'],
            ['xo', 'X/O'],
          ].map(([mode, label]) => (
            <Button
              key={mode}
              size="sm"
              variant={gameMode === mode ? 'solid' : 'flat'}
              color={gameMode === mode ? 'primary' : 'default'}
              radius="sm"
              onPress={() => setGameMode(mode as GameMode)}
              className="h-8 px-2 text-xs"
            >
              {label}
            </Button>
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
            <div className="mx-auto grid aspect-square max-w-[260px] grid-cols-3 gap-2">
              {board.map((mark, index) => (
                <Button
                  key={index}
                  type="button"
                  variant="flat"
                  radius="sm"
                  isDisabled={!isPlayerTurn || Boolean(mark) || Boolean(winner) || isDraw}
                  onPress={() => handleCellClick(index)}
                  className="h-auto min-h-0 min-w-0 aspect-square text-2xl font-bold data-[disabled=true]:opacity-100"
                  aria-label={`Cell ${index + 1}`}
                >
                  {mark}
                </Button>
              ))}
            </div>
          </>
        )}

        {gameMode === 'label' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Name the chord</p>
              <ScorePill score={labelScore} />
            </div>
            <div className="rounded-md bg-default-100 px-4 py-3 text-center dark:bg-white/10">
              <p className="text-xs font-medium uppercase text-default-500">Notes</p>
              <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-foreground">
                {labelQuestion.notes.map((note, index) => (
                  <span key={`${note}-${index}`} className="inline-flex items-center gap-2">
                    <ChordSymbol value={note} />
                    {index < labelQuestion.notes.length - 1 && <span className="text-default-400">·</span>}
                  </span>
                ))}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {labelQuestion.options.map((option) => (
                <Button
                  key={option}
                  variant="flat"
                  radius="sm"
                  isDisabled={labelResult === 'correct'}
                  aria-label={getMusicalText(option)}
                  onPress={() => answerLabelQuestion(option)}
                  className="font-semibold"
                >
                  <ChordSymbol value={option} />
                </Button>
              ))}
            </div>
            <p className="min-h-5 text-center text-sm font-medium text-default-500">
              {labelResult === 'correct' ? 'Correct' : labelResult === 'incorrect' ? 'Try another label' : 'Choose the chord label'}
            </p>
          </div>
        )}

        {gameMode === 'tones' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Find the missing tone</p>
              <ScorePill score={toneScore} />
            </div>
            <div className="rounded-md bg-default-100 px-4 py-3 text-center dark:bg-white/10">
              <p className="text-xs font-medium uppercase text-default-500">
                <ChordSymbol value={toneQuestion.chord} />
              </p>
              <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-foreground">
                {toneQuestion.tones.map((tone, index) => (
                  <span key={`${tone}-${index}`} className="inline-flex items-center gap-2">
                    {tone === '?' ? tone : <ChordSymbol value={tone} />}
                    {index < toneQuestion.tones.length - 1 && <span className="text-default-400">·</span>}
                  </span>
                ))}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {toneQuestion.options.map((option) => (
                <Button
                  key={option}
                  variant="flat"
                  radius="sm"
                  isDisabled={toneResult === 'correct'}
                  aria-label={getMusicalText(option)}
                  onPress={() => answerToneQuestion(option)}
                  className="font-semibold"
                >
                  <ChordSymbol value={option} />
                </Button>
              ))}
            </div>
            <p className="min-h-5 text-center text-sm font-medium text-default-500">
              {toneResult === 'correct' ? 'Correct' : toneResult === 'incorrect' ? 'Try another pitch' : 'Fill the missing chord tone'}
            </p>
          </div>
        )}

        {gameMode === 'guitar' && (
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
                  isDisabled={guitarResult === 'correct'}
                  aria-label={getMusicalText(option)}
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
        )}
      </div>
    </div>
  );
}
