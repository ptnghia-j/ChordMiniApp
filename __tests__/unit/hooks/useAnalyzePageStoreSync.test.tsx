import React from 'react';
import { renderHook } from '@testing-library/react';
import { useAnalyzePageStoreSync } from '@/app/analyze/[videoId]/_hooks/useAnalyzePageStoreSync';
import { useAnalysisStore } from '@/stores/analysisStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUIStore } from '@/stores/uiStore';

const baseParams = {
  analysisResults: null,
  audioProcessingState: {
    isAnalyzing: false,
    error: null,
    audioUrl: null,
  },
  cacheAvailable: false,
  cacheCheckCompleted: false,
  cacheCheckInProgress: false,
  keySignature: null,
  isDetectingKey: false,
  chordCorrections: null,
  showCorrectedChords: false,
  beatDetector: 'auto',
  chordDetector: 'chord-cnn-lstm',
  modelsInitialized: true,
  lyrics: null,
  showLyrics: false,
  hasCachedLyrics: false,
  isTranscribingLyrics: false,
  lyricsError: null,
  videoTitle: 'Song',
  showSegmentation: false,
  isChatbotOpen: false,
  isLyricsPanelOpen: false,
  isPlaying: false,
  currentTime: 0,
  duration: 120,
  playbackRate: 1,
  youtubePlayer: null,
  audioRef: React.createRef<HTMLAudioElement>(),
  isVideoMinimized: false,
  isFollowModeEnabled: true,
} as const;

describe('useAnalyzePageStoreSync', () => {
  beforeEach(() => {
    useAnalysisStore.setState(useAnalysisStore.getInitialState(), true);
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('does not rerun analysis or UI setters when only currentTime changes', () => {
    const analysisSetSpy = jest.spyOn(useAnalysisStore.getState(), 'setAnalysisResults');
    const uiTitleSpy = jest.spyOn(useUIStore.getState(), 'setVideoTitle');
    const playbackTimeSpy = jest.spyOn(usePlaybackStore.getState(), 'setCurrentTime');

    const { rerender } = renderHook(
      ({ currentTime }) => useAnalyzePageStoreSync({
        ...baseParams,
        currentTime,
      } as never),
      { initialProps: { currentTime: 0 } },
    );

    analysisSetSpy.mockClear();
    uiTitleSpy.mockClear();
    playbackTimeSpy.mockClear();

    rerender({ currentTime: 1.25 });

    expect(analysisSetSpy).not.toHaveBeenCalled();
    expect(uiTitleSpy).not.toHaveBeenCalled();
    expect(playbackTimeSpy).toHaveBeenCalledTimes(1);
    expect(playbackTimeSpy).toHaveBeenCalledWith(1.25);

    analysisSetSpy.mockRestore();
    uiTitleSpy.mockRestore();
    playbackTimeSpy.mockRestore();
  });
});

