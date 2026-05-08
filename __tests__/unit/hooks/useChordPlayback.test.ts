import { renderHook, act, waitFor } from '@testing-library/react';
import { useChordPlayback } from '@/hooks/chord-playback/useChordPlayback';

const mockPlayChord = jest.fn();
const mockPlayChordInstrument = jest.fn();
const mockStopAll = jest.fn();
const mockSoftStopAll = jest.fn();
const mockSoftStopInstruments = jest.fn();
const mockUpdateOptions = jest.fn();
const mockIsReady = jest.fn(() => true);
const mockPrepareForPlayback = jest.fn(() => Promise.resolve(true));
const mockStopInstruments = jest.fn();
const mockGetVelocityMultiplier = jest.fn(() => 1);
const mockSetParams = jest.fn();
const mockGetSignalDynamics = jest.fn(() => null);
const mockSetSignalAnalysis = jest.fn();
const mockAddMixerListener = jest.fn(() => () => undefined);
const mockGetEffectiveVolumes = jest.fn(() => ({ saxophone: 0, chordPlayback: 70 }));
const mockGetSettings = jest.fn(() => ({ saxophoneVolume: 0 }));

jest.mock('@/services/chord-playback/soundfontChordPlaybackService', () => ({
  getSoundfontChordPlaybackService: () => ({
    playChord: mockPlayChord,
    playChordInstrument: mockPlayChordInstrument,
    stopAll: mockStopAll,
    softStopAll: mockSoftStopAll,
    softStopInstruments: mockSoftStopInstruments,
    stopInstruments: mockStopInstruments,
    updateOptions: mockUpdateOptions,
    isReady: mockIsReady,
    prepareForPlayback: mockPrepareForPlayback,
  }),
}));

jest.mock('@/services/chord-playback/audioMixerService', () => ({
  getAudioMixerService: () => ({
    addListener: mockAddMixerListener,
    getEffectiveVolumes: mockGetEffectiveVolumes,
    getSettings: mockGetSettings,
  }),
}));

jest.mock('@/services/audio/dynamicsAnalyzer', () => ({
  DynamicsAnalyzer: jest.fn().mockImplementation(() => ({
    getVelocityMultiplier: mockGetVelocityMultiplier,
    getSignalDynamics: mockGetSignalDynamics,
    getSignalAnalysis: jest.fn(() => null),
    setParams: mockSetParams,
    setSignalAnalysis: mockSetSignalAnalysis,
  })),
}));

jest.mock('@/services/audio/audioDynamicsAnalysisService', () => ({
  getAudioDynamicsAnalysisService: () => ({
    getCachedResult: jest.fn(() => null),
    analyzeAudioUrl: jest.fn(() => Promise.resolve(null)),
  }),
}));

describe('useChordPlayback', () => {
  const expectChordPlaybackCall = (
    mockFn: jest.Mock,
    expectedChord: string,
    expectedPlaybackTime: number,
  ) => {
    expect(mockFn).toHaveBeenCalled();
    const [chord, duration, bpm, velocity, timingContext] = mockFn.mock.calls.at(-1) as [
      string,
      number,
      number,
      number,
      { playbackTime?: number; startTime?: number; totalDuration?: number } | undefined,
    ];

    expect(chord).toBe(expectedChord);
    expect(duration).toBeGreaterThan(0);
    expect(bpm).toBe(120);
    expect(velocity).toBe(1);
    expect(timingContext).toEqual(expect.objectContaining({ playbackTime: expectedPlaybackTime }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsReady.mockReturnValue(true);
    mockPrepareForPlayback.mockResolvedValue(true);
    mockStopInstruments.mockReset();
    mockSoftStopInstruments.mockReset();
    mockGetVelocityMultiplier.mockReturnValue(1);
    mockGetSignalDynamics.mockReturnValue(null);
    mockGetEffectiveVolumes.mockReturnValue({ saxophone: 0, chordPlayback: 70 });
    mockGetSettings.mockReturnValue({ saxophoneVolume: 0 });
    mockAddMixerListener.mockReturnValue(() => undefined);
  });

  it('plays a chord using the scheduled chord start even if the UI enters the chord late', async () => {
    const props = {
      currentBeatIndex: 5,
      chords: ['C', 'C', 'C', 'C', 'F', 'F', 'F', 'F'],
      beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      isPlaying: true,
      currentTime: 2.5,
      bpm: 120,
    };

    const { result } = renderHook(() => useChordPlayback(props));

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expectChordPlaybackCall(mockPlayChord, 'F', 2.5);
    });
  });

  it('prefers the beat-index chord at a boundary when currentTime is slightly stale', async () => {
    const props = {
      currentBeatIndex: 4,
      chords: ['C', 'C', 'C', 'C', 'F', 'F', 'F', 'F'],
      beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      isPlaying: true,
      currentTime: 1.96,
      bpm: 120,
    };

    const { result } = renderHook(() => useChordPlayback(props));

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expectChordPlaybackCall(mockPlayChord, 'F', 1.96);
    });
  });

  it('treats silent beat gaps as no active chord instead of stretching the previous chord forward', async () => {
    const { result, rerender } = renderHook((props: Parameters<typeof useChordPlayback>[0]) => useChordPlayback(props), {
      initialProps: {
        currentBeatIndex: 0,
        chords: ['C', 'N.C.', 'F'],
        beats: [0, 0.5, 1],
        isPlaying: true,
        currentTime: 0.25,
        bpm: 120,
      },
    });

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expectChordPlaybackCall(mockPlayChord, 'C', 0.25);
    });

    rerender({
      currentBeatIndex: 1,
      chords: ['C', 'N.C.', 'F'],
      beats: [0, 0.5, 1],
      isPlaying: true,
      currentTime: 0.75,
      bpm: 120,
    });

    rerender({
      currentBeatIndex: 1,
      chords: ['C', 'N.C.', 'F'],
      beats: [0, 0.5, 1],
      isPlaying: true,
      currentTime: 0.9,
      bpm: 120,
    });

    await waitFor(() => {
      expect(mockSoftStopInstruments).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps chord playback active when an instrumental section begins without triggering a retired saxophone phrase', async () => {
    const segmentationData = {
      segments: [
        { type: 'verse', startTime: 0, endTime: 0.5, label: 'Verse' },
        { type: 'instrumental', startTime: 0.5, endTime: 2, label: 'Instrumental' },
      ],
      analysis: { structure: 'Verse → Instrumental' },
      metadata: { totalDuration: 2, analysisTimestamp: Date.now(), model: 'songformer' },
    };

    const { result, rerender } = renderHook((props: Parameters<typeof useChordPlayback>[0]) => useChordPlayback(props), {
      initialProps: {
        currentBeatIndex: 0,
        chords: ['C', 'C', 'C', 'C'],
        beats: [0, 0.5, 1, 1.5],
        isPlaying: true,
        currentTime: 0.25,
        bpm: 120,
        segmentationData,
      },
    });

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expectChordPlaybackCall(mockPlayChord, 'C', 0.25);
    });

    rerender({
      currentBeatIndex: 1,
      chords: ['C', 'C', 'C', 'C'],
      beats: [0, 0.5, 1, 1.5],
      isPlaying: true,
      currentTime: 0.75,
      bpm: 120,
      segmentationData,
    });

    await waitFor(() => {
      expect(mockPlayChord).toHaveBeenCalledTimes(1);
    });
    expect(mockPlayChordInstrument).not.toHaveBeenCalled();
  });

  it('passes segmentation data into the live dynamics analyzer params', async () => {
    const segmentationData = {
      segments: [{ type: 'chorus', startTime: 0, endTime: 2, label: 'Chorus' }],
      analysis: { structure: 'Chorus' },
      metadata: { totalDuration: 2, analysisTimestamp: Date.now(), model: 'songformer' },
    };

    renderHook(() => useChordPlayback({
      chords: ['C'],
      beats: [0, 0.5, 1, 1.5],
      isEnabled: false,
      isPlaying: false,
      currentTime: 0,
      bpm: 120,
      timeSignature: 4,
      segmentationData,
    }));

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ segmentationData }));
    });
  });

  it('does not push saxophone mixer updates during normal chord playback now that sax phrases are retired', async () => {
    mockGetEffectiveVolumes.mockReturnValue({ saxophone: 28, chordPlayback: 70 });
    mockGetSettings.mockReturnValue({ saxophoneVolume: 40 });

    const { result } = renderHook(() => useChordPlayback({
      currentBeatIndex: 0,
      chords: ['C', 'C', 'F', 'F'],
      beats: [0, 0.5, 1, 1.5],
      isPlaying: true,
      currentTime: 0.25,
      bpm: 120,
      segmentationData: {
        segments: [{ type: 'verse', startTime: 0, endTime: 2, label: 'Verse' }],
        analysis: { structure: 'Verse' },
        metadata: { totalDuration: 2, analysisTimestamp: Date.now(), model: 'songformer' },
      },
    }));

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expect(mockUpdateOptions).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });
    expect(
      mockUpdateOptions.mock.calls.some(([options]) => 'saxophoneVolume' in (options as Record<string, unknown>))
    ).toBe(false);
  });

  it('re-prepares audio and replays the current chord when the tab becomes visible again', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    const { result } = renderHook(() => useChordPlayback({
      currentBeatIndex: 0,
      chords: ['C', 'C', 'F', 'F'],
      beats: [0, 0.5, 1, 1.5],
      isPlaying: true,
      currentTime: 0.25,
      bpm: 120,
    }));

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expect(mockPlayChord).toHaveBeenCalledTimes(1);
    });

    mockPlayChord.mockClear();
    mockPrepareForPlayback.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(mockPrepareForPlayback).toHaveBeenCalled();
      expectChordPlaybackCall(mockPlayChord, 'C', 0.25);
    });
  });

  it('re-prepares audio and replays the current chord when the window regains focus', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    const { result } = renderHook(() => useChordPlayback({
      currentBeatIndex: 0,
      chords: ['C', 'C', 'F', 'F'],
      beats: [0, 0.5, 1, 1.5],
      isPlaying: true,
      currentTime: 0.25,
      bpm: 120,
    }));

    act(() => {
      result.current.togglePlayback();
    });

    await waitFor(() => {
      expect(mockPlayChord).toHaveBeenCalledTimes(1);
    });

    mockPlayChord.mockClear();
    mockPrepareForPlayback.mockClear();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(mockPrepareForPlayback).toHaveBeenCalled();
      expectChordPlaybackCall(mockPlayChord, 'C', 0.25);
    });
  });
});
