import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LyricsSearchDialog from '@/components/analysis/LyricsSearchDialog';
import type { LyricsServiceResponse } from '@/services/lyrics/lyricsService';
import type { LRCLibCandidate } from '@/services/lyrics/lrclibService';

jest.mock('@heroui/react', () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    isDisabled?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>
      {children}
    </button>
  ),
}));

describe('LyricsSearchDialog', () => {
  const plainCandidate: LRCLibCandidate = {
    id: 42,
    trackName: 'Plain Song',
    artistName: 'Plain Artist',
    duration: 180,
    instrumental: false,
    lyric_mode: 'plain',
    has_synchronized: false,
    has_word_synced: false,
    plain_lyrics: 'First line\nSecond line',
    score: 200,
    confidence: 'high',
    durationDelta: 1,
    matchReason: 'plain lyrics',
  };

  const result: LyricsServiceResponse = {
    success: true,
    has_synchronized: false,
    has_word_synced: false,
    lyric_mode: 'plain',
    plain_lyrics: plainCandidate.plain_lyrics,
    metadata: {
      title: plainCandidate.trackName,
      artist: plainCandidate.artistName,
      duration: plainCandidate.duration,
      source: 'lrclib',
    },
    source: 'lrclib.net',
    confidence: 'high',
    candidates: [plainCandidate],
    search: {
      query: 'Plain Artist - Plain Song',
      cleanedQuery: 'Plain Artist - Plain Song',
      parsedArtist: 'Plain Artist',
      parsedTitle: 'Plain Song',
      duration: 181,
    },
  };

  it('shows search context and requires an explicit plain lyrics apply action', () => {
    const onApplyCandidate = jest.fn();

    render(
      <LyricsSearchDialog
        isOpen
        query="Plain Artist - Plain Song"
        isLoading={false}
        error={null}
        result={result}
        onQueryChange={jest.fn()}
        onClose={jest.fn()}
        onSearch={jest.fn()}
        onApplyCandidate={onApplyCandidate}
      />,
    );

    expect(screen.getByText('Plain')).toBeInTheDocument();
    expect(screen.getByText(/separate scroll area beside the grid/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Plain' }));
    expect(onApplyCandidate).toHaveBeenCalledWith(plainCandidate);
  });

  it('runs a manual search when the query is submitted', () => {
    const onSearch = jest.fn();

    render(
      <LyricsSearchDialog
        isOpen
        query="Editable query"
        isLoading={false}
        error={null}
        result={null}
        onQueryChange={jest.fn()}
        onClose={jest.fn()}
        onSearch={onSearch}
        onApplyCandidate={jest.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Artist - Song'), { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
