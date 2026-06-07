import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MiniGamesContainer, {
  generateEarQuestions,
  generateGuitarQuestions,
  generateQuizQuestions,
} from '@/components/games/MiniGamesContainer';

jest.mock('@tombatossals/react-chords/lib/Chord', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-guitar-chord-diagram" />,
}));

describe('MiniGamesContainer', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('keeps the correct answer in every generated option set', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    });

    try {
      for (let seed = 1; seed <= 25; seed++) {
        let state = seed;
        jest.spyOn(Math, 'random').mockImplementation(() => {
          state = (state * 16807) % 2147483647;
          return (state - 1) / 2147483646;
        });

        const quizQuestions = generateQuizQuestions();
        const earQuestions = generateEarQuestions();
        const guitarQuestions = generateGuitarQuestions();

        quizQuestions.forEach((question) => {
          if (question.type === 'mnemonic') {
            expect(question.partA.options).toContain(question.partA.answer);
            expect(question.partA.options.length).toBeLessThanOrEqual(4);
            expect(question.partB.options).toContain(question.partB.answer);
            expect(question.partB.options.length).toBeLessThanOrEqual(4);
          } else {
            const answer = question.type === 'tone' ? question.missing : question.answer;
            expect(question.options).toContain(answer);
            expect(question.options.length).toBeLessThanOrEqual(4);
          }
        });

        earQuestions.forEach((question) => {
          expect(question.options).toContain(question.answer);
          expect(question.options.length).toBeLessThanOrEqual(4);
        });

        guitarQuestions.forEach((question) => {
          expect(question.options).toContain(question.answer);
          expect(question.options.length).toBeLessThanOrEqual(4);
        });

        jest.restoreAllMocks();
      }
    } finally {
      jest.restoreAllMocks();
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true,
      });
    }
  });

  it('loads history from sessionStorage on mount', () => {
    const mockHistory = [
      {
        id: '12345',
        gameMode: 'quiz',
        score: { correct: 18, attempted: 20 },
        timestamp: new Date().toISOString(),
      },
    ];
    sessionStorage.setItem('chordmini_games_history', JSON.stringify(mockHistory));

    render(<MiniGamesContainer layoutMode="standalone" />);

    expect(screen.getAllByText('Theory Quiz').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('18/20 (90%)')).toBeInTheDocument();
  });

  it('shows saved question review details from session history', () => {
    const mockHistory = [
      {
        id: 'review-123',
        gameMode: 'ear',
        score: { correct: 1, attempted: 1 },
        questions: [
          {
            questionNumber: 1,
            prompt: 'Listen to the chord quality Root: C',
            correctAnswer: 'major',
            selectedAnswers: ['minor', 'major'],
            wasCorrect: false,
            playbackQuestion: {
              type: 'quality',
              prompt: 'Listen to the chord quality',
              chord: 'C',
              answer: 'major',
              options: ['major', 'minor'],
              instrument: 'piano',
            },
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ];
    sessionStorage.setItem('chordmini_games_history', JSON.stringify(mockHistory));

    render(<MiniGamesContainer layoutMode="standalone" />);

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(screen.getByText('Ear Training Review')).toBeInTheDocument();
    expect(screen.getByText('Listen to the chord quality Root: C')).toBeInTheDocument();
    expect(screen.getByText('minor')).toBeInTheDocument();
    expect(screen.getAllByText('major').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Wrong').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Correct').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('allows clearing the session history', () => {
    const mockHistory = [
      {
        id: '12345',
        gameMode: 'xo',
        xoResult: 'win',
        timestamp: new Date().toISOString(),
      },
    ];
    sessionStorage.setItem('chordmini_games_history', JSON.stringify(mockHistory));

    render(<MiniGamesContainer layoutMode="standalone" />);

    const clearButton = screen.getByRole('button', { name: /Clear session history/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    expect(sessionStorage.getItem('chordmini_games_history')).toBeNull();
    expect(screen.queryByText('X/O Game')).not.toBeInTheDocument();
  });

  it('records X/O win condition in history and storage', () => {
    render(<MiniGamesContainer layoutMode="standalone" />);

    // Switch to X/O game mode
    fireEvent.click(screen.getByRole('button', { name: 'X/O' }));
    expect(screen.getByText('Your turn')).toBeInTheDocument();

    // Perform moves that lead to X (Player) win on the 8x8 grid
    // 1. Play Cell 2 (index 1). O plays preferred Cell 28 (index 27).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 2' }));
    
    // 2. Play Cell 3 (index 2). O plays preferred Cell 29 (index 28).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 3' }));

    // 3. Play Cell 4 (index 3). O plays preferred Cell 36 (index 35).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 4' }));

    // 4. Play Cell 9 (index 8). O plays preferred Cell 37 (index 36).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 9' }));

    // 5. Play Cell 17 (index 16). O plays preferred Cell 20 (index 19).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 17' }));

    // 6. Play Cell 25 (index 24). O plays preferred Cell 21 (index 20).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 25' }));

    // 7. Play Cell 1 (index 0). O is forced to block at Cell 5 (index 4).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 1' }));

    // 8. Play Cell 33 (index 32). This completes 5-in-a-row vertically (0, 8, 16, 24, 32).
    fireEvent.click(screen.getByRole('button', { name: 'Cell 33' }));

    expect(screen.getByText('You win')).toBeInTheDocument();

    // Verify it saved 'win' to session storage because X won
    const saved = sessionStorage.getItem('chordmini_games_history');
    expect(saved).not.toBeNull();
    expect(saved).toContain('"xoResult":"win"');
  });

  it('correctly calculates the 6th degree (submediant) of B natural minor as G and not F double sharp, using proper unicode accidentals', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    });

    // We spy on Math.random to force it to return:
    // 1. tonic index: B is at index 8 of SCALE_ROOTS (length 10). So we return 0.85.
    // 2. scaleType: < 0.3 is 'natural minor'. So we return 0.15.
    // 3. degree: index of 6 in SCALE_DEGREES is 1 (length 10). So we return 0.15.
    // 4. seed in getNeighborNoteOptions: e.g. 0.5
    let callCount = 0;
    const mockRandom = jest.spyOn(Math, 'random').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return 0.85; // SCALE_ROOTS[8] === 'B'
      if (callCount === 2) return 0.15; // natural minor (< 0.3)
      if (callCount === 3) return 0.15; // SCALE_DEGREES[1] === 6
      return 0.5;
    });

    try {
      const questions = generateQuizQuestions();
      const scaleQuestion = questions.find((q) => q.type === 'scale' && q.tonic === 'B' && q.scaleType === 'natural minor');
      expect(scaleQuestion).toBeDefined();
      expect(scaleQuestion?.answer).toBe('G');
      expect(scaleQuestion?.options).toContain('G');
      expect(scaleQuestion?.options).not.toContain('F𝄪');
      expect(scaleQuestion?.options).not.toContain('F##');
      expect(scaleQuestion?.options).not.toContain('F♯♯');
    } finally {
      mockRandom.mockRestore();
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true,
      });
    }
  });

  it('includes a hint and detailed shifting explanation in mode formula questions, and generates a mode note question for each quiz', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    });

    try {
      const questions = generateQuizQuestions();
      
      const formulaQuestion = questions.find((q) => q.type === 'mode_formula');
      expect(formulaQuestion).toBeDefined();
      expect(formulaQuestion?.prompt).toContain('Hint: The Ionian mode formula is W - W - H - W - W - W - H');
      expect(formulaQuestion?.prompt).toContain('Think about rotating the sequence to the left and wrapping around');
      expect(formulaQuestion?.explanation).toBeDefined();
      
      if (formulaQuestion?.prompt.includes('mixolydian')) {
        expect(formulaQuestion.explanation).toContain('Mixolydian: W - W - H - W - W - H - W');
        expect(formulaQuestion.explanation).toContain('Dorian: W - H - W - W - W - H - W');
        expect(formulaQuestion.explanation).toContain('Phrygian: H - W - W - W - H - W - W');
        expect(formulaQuestion.explanation).toContain('Lydian: W - W - W - H - W - W - H');
      }

      const modeNoteQuestion = questions.find((q) => q.type === 'mode_note');
      expect(modeNoteQuestion).toBeDefined();
      expect(modeNoteQuestion?.prompt).toMatch(/What is the \d(st|nd|rd|th) note in [A-G][b#♯♭]*\s[a-zA-Z\s\(\)]+ mode\?/);
      expect(modeNoteQuestion?.explanation).toBeDefined();
      expect(modeNoteQuestion?.explanation).toContain('The notes in');
      expect(modeNoteQuestion?.options).toContain(modeNoteQuestion?.answer);
      expect(modeNoteQuestion?.options.length).toBeLessThanOrEqual(4);

      expect(questions.length).toBe(20);
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true,
      });
    }
  });
});
