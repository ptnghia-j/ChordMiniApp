import React from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import type { AudioProcessingState } from '@/services/audio/audioProcessingService';
import { useAnalyzePageOrchestrator } from '@/hooks/analyze/useAnalyzePageOrchestrator';
import { ChordGridContainer } from '@/components/chord-analysis/ChordGridContainer';
import { getTranscription } from '@/services/firebase/firestoreService';

jest.mock('@/services/firebase/firestoreService', () => ({
  getTranscription: jest.fn(),
  updateTranscriptionEnrichment: jest.fn(),
}));

jest.mock('@/components/chord-analysis/ChordGrid', () => ({
  __esModule: true,
  default: jest.fn((props) => (
    <div
      data-testid="mock-chord-grid"
      data-show-corrected={String(props.showCorrectedChords)}
      data-corrected-sequence={(props.sequenceCorrections?.correctedSequence ?? []).join('|')}
      data-grid-chords={(props.chords ?? []).join('|')}
    />
  )),
}));

const mockGetTranscription = getTranscription as jest.MockedFunction<typeof getTranscription>;
const fetchMock = jest.fn();

const buildDetectKeyResponse = (overrides?: Partial<ReturnType<typeof buildDetectKeyResponseBase>>) => ({
  ...buildDetectKeyResponseBase(),
  ...overrides,
});

const buildDetectKeyResponseBase = () => ({
  primaryKey: 'Ab major',
  modulation: null,
  corrections: { 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab' },
  sequenceCorrections: {
    originalSequence: ['C#', 'D#', 'G#'],
    correctedSequence: ['Db', 'Eb', 'Ab'],
  },
  romanNumerals: {
    analysis: ['iii', 'IV', 'I'],
    keyContext: 'Ab major',
  },
});

const analysisResults: AnalysisResult = {
  chords: [{ chord: 'C#', time: 0, start: 0, end: 1, confidence: 1 }, { chord: 'D#', time: 1, start: 1, end: 2, confidence: 1 }, { chord: 'G#', time: 2, start: 2, end: 3, confidence: 1 }],
  beats: [{ time: 0, strength: 1 }, { time: 1, strength: 1 }, { time: 2, strength: 1 }],
  synchronizedChords: [{ chord: 'C#', beatIndex: 0 }, { chord: 'D#', beatIndex: 1 }, { chord: 'G#', beatIndex: 2 }],
  beatModel: 'madmom',
  chordModel: 'chord-cnn-lstm',
  audioDuration: 3,
  beatDetectionResult: { time_signature: 4, beat_time_range_start: 0 },
};

const audioProcessingState: AudioProcessingState = {
  isDownloading: false,
  isExtracting: false,
  isExtracted: true,
  isAnalyzing: false,
  isAnalyzed: true,
  audioUrl: 'https://example.test/audio.mp3',
  fromCache: true,
  fromFirestoreCache: true,
  error: null,
  suggestion: null,
};

describe('cached correction pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

      if (url.includes('/api/detect-key')) {
        return {
          ok: true,
          json: async () => buildDetectKeyResponse(),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ success: false }),
      } as Response;
    });

    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetTranscription.mockResolvedValue({
      videoId: 'video-1',
      beatModel: 'madmom',
      chordModel: 'chord-cnn-lstm',
      beats: [],
      chords: [],
      synchronizedChords: [],
      keySignature: 'Ab major',
      sequenceCorrections: {
        originalSequence: ['Db', 'Eb', 'Ab'],
        correctedSequence: ['Db', 'Eb', 'Ab'],
      },
      createdAt: {} as never,
    });
  });

  it('hydrates cached Gemini corrections and auto-enables corrected mode in the orchestrator', async () => {
    const { result } = renderHook(() => useAnalyzePageOrchestrator({
      videoId: 'video-1',
      titleFromSearch: null,
      durationFromSearch: null,
      channelFromSearch: null,
      thumbnailFromSearch: null,
      firebaseReady: false,
      modelsInitialized: false,
      beatDetector: 'madmom',
      chordDetector: 'chord-cnn-lstm',
      beatDetectorRef: { current: 'madmom' },
      chordDetectorRef: { current: 'chord-cnn-lstm' },
      audioRef: { current: null },
      audioProcessingState,
      analysisResults,
      lyrics: null,
      showRomanNumerals: false,
      setShowExtractionNotification: jest.fn(),
      setAudioProcessingState: jest.fn(),
      setAnalysisResults: jest.fn(),
      setDuration: jest.fn(),
      setVideoTitle: jest.fn(),
      setLyrics: jest.fn(),
      setShowLyrics: jest.fn(),
      setHasCachedLyrics: jest.fn(),
      stage: 'idle',
      setStage: jest.fn(),
      setProgress: jest.fn(),
      setStatusMessage: jest.fn(),
      startProcessing: jest.fn(),
      completeProcessing: jest.fn(),
      failProcessing: jest.fn(),
      updateRomanNumeralData: jest.fn(),
      analyzeAudioFromService: jest.fn(),
      skipInitialCacheBootstrap: true,
    }));

    await waitFor(() => expect(result.current.sequenceCorrections?.correctedSequence).toEqual(['Db', 'Eb', 'Ab']));
    await waitFor(() => expect(result.current.showCorrectedChords).toBe(true));
    expect(mockGetTranscription).toHaveBeenCalledWith('video-1', 'madmom', 'chord-cnn-lstm');
  });

  it('hydrates normalized legacy cache output and avoids unnecessary re-detection', async () => {
    mockGetTranscription.mockResolvedValueOnce({
      videoId: 'video-1',
      beatModel: 'madmom',
      chordModel: 'chord-cnn-lstm',
      beats: [],
      chords: [],
      synchronizedChords: [
        { chord: 'C#', beatIndex: 0 },
        { chord: 'D#', beatIndex: 1 },
        { chord: 'G#', beatIndex: 2 },
      ],
      keySignature: 'Ab major',
      chordCorrections: { 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab' },
      sequenceCorrections: {
        originalSequence: ['C#', 'D#', 'G#'],
        correctedSequence: ['Db', 'Eb', 'Ab'],
      },
      originalChords: ['C#', 'D#', 'G#'],
      correctedChords: ['Db', 'Eb', 'Ab'],
      createdAt: {} as never,
    });

    const { result } = renderHook(() => useAnalyzePageOrchestrator({
      videoId: 'video-1',
      titleFromSearch: null,
      durationFromSearch: null,
      channelFromSearch: null,
      thumbnailFromSearch: null,
      firebaseReady: false,
      modelsInitialized: false,
      beatDetector: 'madmom',
      chordDetector: 'chord-cnn-lstm',
      beatDetectorRef: { current: 'madmom' },
      chordDetectorRef: { current: 'chord-cnn-lstm' },
      audioRef: { current: null },
      audioProcessingState,
      analysisResults,
      lyrics: null,
      showRomanNumerals: false,
      setShowExtractionNotification: jest.fn(),
      setAudioProcessingState: jest.fn(),
      setAnalysisResults: jest.fn(),
      setDuration: jest.fn(),
      setVideoTitle: jest.fn(),
      setLyrics: jest.fn(),
      setShowLyrics: jest.fn(),
      setHasCachedLyrics: jest.fn(),
      stage: 'idle',
      setStage: jest.fn(),
      setProgress: jest.fn(),
      setStatusMessage: jest.fn(),
      startProcessing: jest.fn(),
      completeProcessing: jest.fn(),
      failProcessing: jest.fn(),
      updateRomanNumeralData: jest.fn(),
      analyzeAudioFromService: jest.fn(),
      skipInitialCacheBootstrap: true,
    }));

    await waitFor(() => expect(result.current.sequenceCorrections?.correctedSequence).toEqual(['Db', 'Eb', 'Ab']));
    await waitFor(() => expect(result.current.showCorrectedChords).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/detect-key'))).toBe(false);
  });

  it('forwards hydrated corrected sequence into the grid without overwriting the original beat grid chords', async () => {
    render(
      <ChordGridContainer
        analysisResults={analysisResults}
        chordGridData={{
          chords: ['C#', 'D#', 'G#'],
          beats: [0, 1, 2],
          hasPadding: false,
          paddingCount: 0,
          shiftCount: 0,
        }}
        isChatbotOpen={false}
        isLyricsPanelOpen={false}
        showCorrectedChords={true}
        sequenceCorrections={{
          originalSequence: ['Db', 'Eb', 'Ab'],
          correctedSequence: ['Db', 'Eb', 'Ab'],
        }}
      />
    );

    await waitFor(() => expect(screen.getByTestId('mock-chord-grid')).toHaveAttribute('data-show-corrected', 'true'));
    expect(screen.getByTestId('mock-chord-grid')).toHaveAttribute('data-corrected-sequence', 'Db|Eb|Ab');
    expect(screen.getByTestId('mock-chord-grid')).toHaveAttribute('data-grid-chords', 'C#|D#|G#');
  });

  it('keeps Firebase-corrected labels authoritative when Roman numerals are toggled on', async () => {
    const updateRomanNumeralData = jest.fn();

    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

      if (url.includes('/api/detect-key')) {
        return {
          ok: true,
          json: async () => buildDetectKeyResponse({
            corrections: { Db: 'C#', Eb: 'D#', Ab: 'G#' },
            sequenceCorrections: {
              originalSequence: ['Db', 'Eb', 'Ab'],
              correctedSequence: ['C#', 'D#', 'G#'],
            },
          }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ success: false }),
      } as Response;
    });

    const baseProps = {
      videoId: 'video-1',
      titleFromSearch: null,
      durationFromSearch: null,
      channelFromSearch: null,
      thumbnailFromSearch: null,
      firebaseReady: false,
      modelsInitialized: false,
      beatDetector: 'madmom' as const,
      chordDetector: 'chord-cnn-lstm' as const,
      beatDetectorRef: { current: 'madmom' as const },
      chordDetectorRef: { current: 'chord-cnn-lstm' as const },
      audioRef: { current: null },
      audioProcessingState,
      analysisResults,
      lyrics: null,
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
      updateRomanNumeralData,
      analyzeAudioFromService: jest.fn(),
      skipInitialCacheBootstrap: true,
    };

    const { result, rerender } = renderHook((props: typeof baseProps & { showRomanNumerals: boolean }) => {
      return useAnalyzePageOrchestrator(props);
    }, {
      initialProps: {
        ...baseProps,
        showRomanNumerals: false,
      },
    });

    await waitFor(() => expect(result.current.sequenceCorrections?.correctedSequence).toEqual(['Db', 'Eb', 'Ab']));

    rerender({
      ...baseProps,
      showRomanNumerals: true,
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/api/detect-key'))
      ).toBe(true);
    });

    await waitFor(() => expect(result.current.sequenceCorrections?.romanNumerals?.analysis).toEqual(['iii', 'IV', 'I']));
    expect(result.current.sequenceCorrections?.correctedSequence).toEqual(['C#', 'D#', 'G#']);
    await waitFor(() => expect(updateRomanNumeralData).toHaveBeenCalledWith({
      analysis: ['iii', 'IV', 'I'],
      keyContext: 'Ab major',
    }));
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/transcribe-lyrics'))
    ).toBe(true);
  });
});
