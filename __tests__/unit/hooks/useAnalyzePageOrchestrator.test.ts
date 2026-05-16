import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useAnalyzePageOrchestrator } from '@/hooks/analyze/useAnalyzePageOrchestrator';
import { extractAudioFromYouTube } from '@/services/audio/audioProcessingExtracted';
import { getTranscription, updateTranscriptionEnrichment } from '@/services/firebase/firestoreService';
import { getCachedAudioFile } from '@/services/firebase/firebaseStorageService';
import { detectKey } from '@/services/audio/keyDetectionService';

jest.mock('@/services/audio/audioProcessingExtracted', () => ({
  extractAudioFromYouTube: jest.fn(),
  handleAudioAnalysis: jest.fn(),
}));

jest.mock('@/services/firebase/firestoreService', () => ({
  getTranscription: jest.fn(),
  updateTranscriptionEnrichment: jest.fn(),
}));

jest.mock('@/services/audio/keyDetectionService', () => ({
  detectKey: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  ensureFirebaseInitialized: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/firebaseConnectionManager', () => ({
  withFirebaseConnectionCheck: jest.fn((operation: () => unknown) => operation()),
}));

jest.mock('@/services/firebase/firebaseStorageService', () => ({
  getCachedAudioFile: jest.fn(),
}));

const mockExtractAudioFromYouTube = extractAudioFromYouTube as jest.MockedFunction<typeof extractAudioFromYouTube>;
const mockGetTranscription = getTranscription as jest.MockedFunction<typeof getTranscription>;
const mockGetCachedAudioFile = getCachedAudioFile as jest.MockedFunction<typeof getCachedAudioFile>;
const mockUpdateTranscriptionEnrichment = updateTranscriptionEnrichment as jest.MockedFunction<typeof updateTranscriptionEnrichment>;
const mockDetectKey = detectKey as jest.MockedFunction<typeof detectKey>;
const mockFetch = global.fetch as jest.Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
};

const createProps = (overrides: Record<string, unknown> = {}) => ({
  videoId: 'video-123',
  titleFromSearch: null,
  durationFromSearch: null,
  channelFromSearch: null,
  thumbnailFromSearch: null,
  firebaseReady: false,
  modelsInitialized: true,
  beatDetector: 'madmom' as const,
  chordDetector: 'btc-sl' as const,
  beatDetectorRef: { current: 'madmom' as const },
  chordDetectorRef: { current: 'btc-sl' as const },
  audioRef: { current: null },
  audioProcessingState: {
    isExtracting: false,
    isDownloading: false,
    isExtracted: false,
    isAnalyzing: false,
    isAnalyzed: false,
    error: null,
    suggestion: null,
    audioUrl: null,
  },
  analysisResults: {
    chords: [{ chord: 'C', time: 0 }, { chord: 'C', time: 1 }, { chord: 'G', time: 2 }],
  } as any,
  lyrics: null,
  showRomanNumerals: true,
  setShowExtractionNotification: jest.fn(),
  setAudioProcessingState: jest.fn(),
  setAnalysisResults: jest.fn(),
  setDuration: jest.fn(),
  setVideoTitle: jest.fn(),
  setLyrics: jest.fn(),
  setShowLyrics: jest.fn(),
  setHasCachedLyrics: jest.fn(),
  stage: 'idle' as const,
  setStage: jest.fn(),
  setProgress: jest.fn(),
  setStatusMessage: jest.fn(),
  startProcessing: jest.fn(),
  completeProcessing: jest.fn(),
  failProcessing: jest.fn(),
  updateRomanNumeralData: jest.fn(),
  analyzeAudioFromService: jest.fn(),
  skipInitialCacheBootstrap: true,
  ...overrides,
});

describe('useAnalyzePageOrchestrator key detection cache flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTranscriptionEnrichment.mockResolvedValue(true);
    mockGetCachedAudioFile.mockResolvedValue(null);
    mockExtractAudioFromYouTube.mockResolvedValue(undefined);
    mockFetch.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses cached transcription enrichment before calling detectKey', async () => {
    const romanNumerals = { analysis: ['I', 'V'], keyContext: 'C major' };
    mockGetTranscription.mockResolvedValue({
      videoId: 'video-123',
      beatModel: 'madmom',
      chordModel: 'btc-sl',
      beats: [],
      chords: [],
      synchronizedChords: [],
      keySignature: 'C major',
      chordCorrections: { Gb: 'F#' },
      romanNumerals,
    } as any);

    const props = createProps({ showRomanNumerals: false });
    const { result } = renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.keySignature).toBe('C major'));

    expect(result.current.chordCorrections).toEqual({ Gb: 'F#' });
    expect(props.updateRomanNumeralData).toHaveBeenCalledWith(romanNumerals);
    expect(mockDetectKey).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptionEnrichment).not.toHaveBeenCalled();
  });

  it('reruns detectKey and refreshes all persisted enrichment when Roman numerals are requested', async () => {
    const detectedRomanNumerals = { analysis: ['I', 'V'], keyContext: 'G major' };
    mockGetTranscription.mockResolvedValue({
      videoId: 'video-123',
      beatModel: 'madmom',
      chordModel: 'btc-sl',
      beats: [],
      chords: [],
      synchronizedChords: [],
      keySignature: 'C major',
      chordCorrections: { Gb: 'F#' },
      // romanNumerals missing to trigger detection
    } as any);
    mockDetectKey.mockResolvedValue({
      primaryKey: 'G major',
      modulation: 'D major',
      corrections: { Ab: 'G#' },
      romanNumerals: detectedRomanNumerals,
    });

    const props = createProps();
    const { result } = renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(mockDetectKey).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(result.current.keySignature).toBe('G major'));
    expect(result.current.chordCorrections).toEqual({ Ab: 'G#' });
    expect(props.updateRomanNumeralData).toHaveBeenCalledWith(detectedRomanNumerals);
    expect(mockUpdateTranscriptionEnrichment).toHaveBeenCalledWith(
      'video-123',
      'madmom',
      'btc-sl',
      expect.objectContaining({
        keySignature: 'G major',
        keyModulation: 'D major',
        chordCorrections: { Ab: 'G#' },
        romanNumerals: detectedRomanNumerals,
      })
    );
  });

  it('uses a heuristic key immediately when no cached key exists, then overrides it with detectKey results', async () => {
    mockGetTranscription.mockResolvedValue(null);

    let resolveDetection: ((value: any) => void) | null = null;
    mockDetectKey.mockImplementation(() => new Promise((resolve) => {
      resolveDetection = resolve;
    }));

    const props = createProps({
      showRomanNumerals: false,
      analysisResults: {
        chords: [
          { chord: 'Bb:maj', time: 0 },
          { chord: 'F:maj', time: 1 },
          { chord: 'Bb:maj', time: 2 },
        ],
      } as any,
    });
    const { result } = renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.keySignature).toBe('Bb major'));
    expect(mockDetectKey).toHaveBeenCalledTimes(1);

    resolveDetection?.({
      primaryKey: 'F major',
      modulation: null,
      corrections: {},
      romanNumerals: null,
    });

    await waitFor(() => expect(result.current.keySignature).toBe('F major'));
  });

  it('keeps the heuristic key when detectKey fails and no cached key exists', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetTranscription.mockResolvedValue(null);
    mockDetectKey.mockRejectedValue(new Error('gemini unavailable'));

    const props = createProps({
      showRomanNumerals: false,
      analysisResults: {
        chords: [
          { chord: 'A:min', time: 0 },
          { chord: 'E:maj', time: 1 },
          { chord: 'D:min', time: 2 },
        ],
      } as any,
    });
    const { result } = renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(mockDetectKey).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.keySignature).toBe('A minor'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to detect key:', expect.any(Error));
  });

  it('autoloads cached lyrics from the cache-check endpoint after extraction completes', async () => {
    mockGetTranscription.mockResolvedValue(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        lyrics: {
          lines: [{ text: 'Hello world', startTime: 0, endTime: 1 }],
        },
      }),
    });

    const props = createProps({
      analysisResults: null,
      showRomanNumerals: false,
      audioProcessingState: {
        isExtracting: false,
        isDownloading: false,
        isExtracted: true,
        isAnalyzing: false,
        isAnalyzed: false,
        error: null,
        suggestion: null,
        audioUrl: 'https://cdn.example/audio.mp3',
      },
    });

    renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(props.setLyrics).toHaveBeenCalledWith({
      lines: [{ text: 'Hello world', startTime: 0, endTime: 1 }],
    }));
    expect(props.setShowLyrics).toHaveBeenCalledWith(true);
    expect(props.setHasCachedLyrics).toHaveBeenCalledWith(false);
    expect(props.setLyrics).not.toHaveBeenCalledWith(null);
  });

  it('marks cached lyrics unavailable when the cache-check request fails', async () => {
    mockGetTranscription.mockResolvedValue(null);
    mockFetch.mockRejectedValue(new Error('network unavailable'));

    const props = createProps({
      analysisResults: null,
      showRomanNumerals: false,
      audioProcessingState: {
        isExtracting: false,
        isDownloading: false,
        isExtracted: true,
        isAnalyzing: false,
        isAnalyzed: false,
        error: null,
        suggestion: null,
        audioUrl: 'https://cdn.example/audio.mp3',
      },
    });

    renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(props.setHasCachedLyrics).toHaveBeenCalledWith(false));

    expect(props.setLyrics).not.toHaveBeenCalled();
    expect(props.setShowLyrics).not.toHaveBeenCalled();
  });

  it('does not retry extraction when the initial extraction request fails', async () => {
    mockGetTranscription.mockResolvedValue(null);
    mockGetCachedAudioFile.mockResolvedValue(null);
    mockExtractAudioFromYouTube.mockRejectedValue(new Error('provider unavailable'));

    const props = createProps({
      firebaseReady: true,
      analysisResults: null,
      showRomanNumerals: false,
      skipInitialCacheBootstrap: false,
    });

    renderHook(() => useAnalyzePageOrchestrator(props as any), { wrapper: createWrapper() });

    await waitFor(() => expect(mockExtractAudioFromYouTube).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockExtractAudioFromYouTube).toHaveBeenCalledTimes(1);
  });
});
