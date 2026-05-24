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

    expect(screen.getByText('Name the chord')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'X/O' }));
    expect(screen.getByText('Your turn')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cell 1' }));
    expect(screen.getByRole('button', { name: 'Cell 1' })).toHaveTextContent('X');
    expect(screen.getAllByText('O')).toHaveLength(1);
  });

  it('tracks running correct answers for the chord label quiz', () => {
    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
      />,
    );

    expect(screen.getByText('Name the chord')).toBeInTheDocument();
    expect(screen.getByText('Notes').parentElement).toHaveTextContent('C·E·G');

    fireEvent.click(screen.getByRole('button', { name: 'Cm' }));
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('Try another label')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });

  it('tracks tone quiz score and renders accidentals with musical symbols', () => {
    jest.useFakeTimers();

    render(
      <AnalyzeEmptyState
        isExtracting
        queueStatus="queued"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tones' }));
    expect(screen.getByText('Find the missing tone')).toBeInTheDocument();
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('Dm');
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('D·?·A');
    fireEvent.click(screen.getByRole('button', { name: 'E' }));
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('Try another pitch')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'F' }));
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('E7');
    expect(screen.getByText('Find the missing tone').parentElement?.nextElementSibling).toHaveTextContent('G♯');
    expect(screen.getByRole('button', { name: 'C♯' })).toBeInTheDocument();
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
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('Try another chord')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
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
    expect(screen.queryByText('Your turn')).not.toBeInTheDocument();
  });
});
