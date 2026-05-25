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
          const answer = question.type === 'tone' ? question.missing : question.answer;
          expect(question.options).toContain(answer);
          expect(question.options.length).toBeLessThanOrEqual(4);
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
});
