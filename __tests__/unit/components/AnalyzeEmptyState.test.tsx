import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const isDevelopmentEnvironment = jest.fn();

jest.mock('@/utils/modelFiltering', () => ({
  isDevelopmentEnvironment: () => isDevelopmentEnvironment(),
}));

jest.mock('@tombatossals/react-chords/lib/Chord', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-guitar-chord-diagram" />,
}));

import AnalyzeEmptyState from '@/app/analyze/[videoId]/_components/AnalyzeEmptyState';

describe('AnalyzeEmptyState', () => {
  beforeEach(() => {
    isDevelopmentEnvironment.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the production extraction wait panel and keeps X/O as the last game', () => {
    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
        queuePosition={2}
        estimatedWaitSeconds={45}
      />,
    );

    expect(screen.getByText('Find the scale note')).toBeInTheDocument();
    expect(screen.getByText('Degree 3 (mediant) in C major')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'X/O' }));
    expect(screen.getByText('Your turn')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cell 1' }));
    expect(screen.getByRole('button', { name: 'Cell 1' })).toHaveTextContent('X');
    expect(screen.getAllByText('O')).toHaveLength(1);
  });

  it('tracks running correct answers across mixed chord-label, tone, and scale-degree questions', () => {
    jest.useFakeTimers();

    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
      />,
    );

    expect(screen.getByText('Find the scale note')).toBeInTheDocument();
    expect(screen.getByText('Degree 3 (mediant) in C major')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'F' }));
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'F' })).toBeDisabled();
    expect(screen.getByText('Try another answer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'E' }));
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText('Name the chord')).toBeInTheDocument();
    expect(screen.getByText('Notes').parentElement).toHaveTextContent('C·E·G');

    fireEvent.click(screen.getByRole('button', { name: 'Cm' }));
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cm' })).toBeDisabled();
    expect(screen.getByText('Try another answer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText('Find the missing tone')).toBeInTheDocument();
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('Dm');
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('D·?·A');
    fireEvent.click(screen.getByRole('button', { name: 'E' }));
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'E' })).toBeDisabled();
    expect(screen.getByText('Try another answer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'F' }));
    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText('Find the scale degree')).toBeInTheDocument();
    expect(screen.getByText('D in A major')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'vi chord of A major' }));
    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'vi chord of A major' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'IV chord of A major' }));
    expect(screen.getByText('0/4')).toBeInTheDocument();
  });

  it('uses beat-grid chord formatting for inversions and major seventh quiz labels', () => {
    jest.useFakeTimers();

    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
      />,
    );

    const correctAnswers = [
      'E',
      'C',
      'F',
      'IV chord of A major',
      'E',
      'G7',
      'D',
      'vi chord of C major',
      'E',
      'FΔ7',
      'B♭',
      'vi chord of A major',
      'G♯',
    ];

    for (const answer of correctAnswers) {
      fireEvent.click(screen.getByRole('button', { name: answer }));
      act(() => {
        jest.advanceTimersByTime(500);
      });
    }

    expect(screen.getByText('Notes').parentElement).toHaveTextContent('F♯·D·A');
    expect(screen.getByRole('button', { name: 'D/F♯' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'D/F♯' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('DΔ7');
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('C♯');
    expect(screen.getByRole('button', { name: 'F♯' })).toBeInTheDocument();
  });

  it('adds generated tonicization and ear-training questions', () => {
    jest.useFakeTimers();

    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ear' }));
    expect(screen.getByText('Hear the scale degree')).toBeInTheDocument();
    expect(screen.getByText('Reference: C major tonic, then one mystery pitch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: '4 (subdominant)' }));
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4 (subdominant)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '3 (mediant)' }));
    expect(screen.getByText('0/1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
    const answersToTonicization = [
      'E',
      'C',
      'F',
      'IV chord of A major',
      'E',
      'G7',
      'D',
      'vi chord of C major',
      'E',
      'FΔ7',
      'B♭',
      'vi chord of A major',
      'G♯',
      'D/F♯',
      'F♯',
      'IVM7 chord of A major',
    ];

    for (const answer of answersToTonicization) {
      fireEvent.click(screen.getByRole('button', { name: answer }));
      act(() => {
        jest.advanceTimersByTime(500);
      });
    }

    expect(screen.getByText('Find the tonicization')).toBeInTheDocument();
    expect(screen.getByText('In A major')).toBeInTheDocument();
    expect(screen.getByText('In A major').parentElement).toHaveTextContent('A-G♯7-C♯m-E7-A');
    expect(screen.getByRole('button', { name: 'V7/iii tonicizing iii' })).toBeInTheDocument();
  });

  it('lets the user play the guitar chord diagram quiz', () => {
    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guitar' }));
    expect(screen.getByText('Read the diagram')).toBeInTheDocument();
    expect(screen.getByTestId('mock-guitar-chord-diagram')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'G' }));
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'G' })).toBeDisabled();
    expect(screen.getByText('Try another chord')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });

  it('keeps the mini game visible after extraction and while backend inference runs', () => {
    const { rerender } = render(
      <AnalyzeEmptyState
        isExtracted
        queueStatus={null}
      />,
    );

    expect(screen.getByText('Find the scale note')).toBeInTheDocument();

    rerender(
      <AnalyzeEmptyState
        isExtracted
        isAnalyzing
        queueStatus={null}
      />,
    );

    expect(screen.getByText('Find the scale note')).toBeInTheDocument();
  });

  it('shows the mini game while cached results are ready but unopened', () => {
    render(
      <AnalyzeEmptyState
        isExtracted
        fromCache
        hasCachedAnalysis
        queueStatus={null}
      />,
    );

    expect(screen.getByText('Find the scale note')).toBeInTheDocument();
  });

  it('keeps the normal empty state in development', () => {
    isDevelopmentEnvironment.mockReturnValue(true);

    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
        queuePosition={1}
        estimatedWaitSeconds={30}
      />,
    );

    expect(screen.getByText('No analysis loaded yet')).toBeInTheDocument();
    expect(screen.queryByText('Name the chord')).not.toBeInTheDocument();
  });
});
