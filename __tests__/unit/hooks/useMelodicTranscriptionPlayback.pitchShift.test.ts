import { renderHook, waitFor } from '@testing-library/react';
import { useMelodicTranscriptionPlayback } from '@/hooks/chord-playback/useMelodicTranscriptionPlayback';
import type { SheetSageResult } from '@/types/sheetSage';

const mockPrepareInstrumentForPlayback = jest.fn();
const mockPlayScheduledInstrument = jest.fn();
const mockStopInstruments = jest.fn();
const mockUpdateOptions = jest.fn();

const mockBuildPreparedSheetSageMelodyNotes = jest.fn();
const mockBuildScheduledSheetSageMelodyNotes = jest.fn();

const mockUseIsPitchShiftEnabled = jest.fn();
const mockUseIsPitchShiftReady = jest.fn();
const mockUsePitchShiftSemitones = jest.fn();

jest.mock('@/services/chord-playback/soundfontChordPlaybackService', () => ({
  getSoundfontChordPlaybackService: () => ({
    prepareInstrumentForPlayback: mockPrepareInstrumentForPlayback,
    playScheduledInstrument: mockPlayScheduledInstrument,
    stopInstruments: mockStopInstruments,
    updateOptions: mockUpdateOptions,
  }),
}));

jest.mock('@/services/chord-playback/audioMixerService', () => ({
  getAudioMixerService: () => ({
    getEffectiveVolumes: () => ({ melody: 70 }),
    addListener: () => () => undefined,
  }),
}));

const mockDynamicsAnalyzer = {
  getSignalAnalysis: () => null,
  getSignalDynamics: () => null,
  getVelocityMultiplier: () => 1,
};

jest.mock('@/hooks/audio/useSharedAudioDynamics', () => ({
  useSharedAudioDynamics: () => mockDynamicsAnalyzer,
}));

jest.mock('@/stores/uiStore', () => ({
  useIsPitchShiftEnabled: () => mockUseIsPitchShiftEnabled(),
  useIsPitchShiftReady: () => mockUseIsPitchShiftReady(),
  usePitchShiftSemitones: () => mockUsePitchShiftSemitones(),
}));

jest.mock('@/utils/sheetSagePlayback', () => ({
  buildPreparedSheetSageMelodyNotes: (...args: unknown[]) => mockBuildPreparedSheetSageMelodyNotes(...args),
  buildScheduledSheetSageMelodyNotes: (...args: unknown[]) => mockBuildScheduledSheetSageMelodyNotes(...args),
}));

describe('useMelodicTranscriptionPlayback pitch-shift integration', () => {
  const sheetSageResult: SheetSageResult = {
    source: 'sheetsage',
    noteEvents: [{ onset: 0, offset: 0.5, pitch: 72, velocity: 80 }],
    noteEventCount: 1,
    beatTimes: [0, 0.5],
    beatsPerMeasure: 4,
    tempoBpm: 120,
    usedJukebox: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseIsPitchShiftEnabled.mockReturnValue(false);
    mockUseIsPitchShiftReady.mockReturnValue(false);
    mockUsePitchShiftSemitones.mockReturnValue(0);

    mockPrepareInstrumentForPlayback.mockResolvedValue(true);
    mockPlayScheduledInstrument.mockResolvedValue(undefined);

    mockBuildPreparedSheetSageMelodyNotes.mockReturnValue([
      {
        noteName: 'C5',
        midi: 72,
        onset: 0,
        offset: 0.5,
        velocityMultiplier: 0.8,
        isBass: false,
      },
    ]);

    mockBuildScheduledSheetSageMelodyNotes.mockReturnValue([
      {
        noteName: 'C5',
        midi: 72,
        startOffset: 0,
        duration: 0.5,
        velocityMultiplier: 0.8,
        isBass: false,
      },
    ]);
  });

  it('passes current semitones when pitch-shift audio is active', async () => {
    mockUseIsPitchShiftEnabled.mockReturnValue(true);
    mockUseIsPitchShiftReady.mockReturnValue(true);
    mockUsePitchShiftSemitones.mockReturnValue(3);

    renderHook(() =>
      useMelodicTranscriptionPlayback({
        sheetSageResult,
        currentTime: 0,
        isPlaying: true,
        isEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockBuildPreparedSheetSageMelodyNotes).toHaveBeenCalled();
    });

    const semitoneArgs = mockBuildPreparedSheetSageMelodyNotes.mock.calls.map((call: unknown[]) => call[2]);
    expect(semitoneArgs).toContain(3);
  });

  it('keeps melody semitones neutral when pitch shift is not ready', async () => {
    mockUseIsPitchShiftEnabled.mockReturnValue(true);
    mockUseIsPitchShiftReady.mockReturnValue(false);
    mockUsePitchShiftSemitones.mockReturnValue(3);

    renderHook(() =>
      useMelodicTranscriptionPlayback({
        sheetSageResult,
        currentTime: 0,
        isPlaying: true,
        isEnabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockBuildPreparedSheetSageMelodyNotes).toHaveBeenCalled();
    });

    const semitoneArgs = mockBuildPreparedSheetSageMelodyNotes.mock.calls.map((call: unknown[]) => call[2]);
    expect(semitoneArgs).toContain(0);
  });

  it('stops the current melody schedule before rescheduling when pitch-shifted notes change mid-playback', async () => {
    mockUseIsPitchShiftEnabled.mockReturnValue(true);
    mockUseIsPitchShiftReady.mockReturnValue(true);
    mockUsePitchShiftSemitones.mockReturnValue(0);

    const { rerender } = renderHook(
      ({
        currentTime,
      }: {
        currentTime: number;
      }) => useMelodicTranscriptionPlayback({
        sheetSageResult,
        currentTime,
        isPlaying: true,
        isEnabled: true,
      }),
      {
        initialProps: {
          currentTime: 0,
        },
      },
    );

    await waitFor(() => {
      expect(mockPlayScheduledInstrument).toHaveBeenCalled();
    });
    const initialPlayCallCount = mockPlayScheduledInstrument.mock.calls.length;

    mockUsePitchShiftSemitones.mockReturnValue(2);
    mockBuildPreparedSheetSageMelodyNotes.mockReturnValue([
      {
        noteName: 'D5',
        midi: 74,
        onset: 0,
        offset: 0.5,
        velocityMultiplier: 0.8,
        isBass: false,
      },
    ]);
    mockBuildScheduledSheetSageMelodyNotes.mockReturnValue([
      {
        noteName: 'D5',
        midi: 74,
        startOffset: 0,
        duration: 0.5,
        velocityMultiplier: 0.8,
        isBass: false,
      },
    ]);

    rerender({ currentTime: 0.1 });

    await waitFor(() => {
      expect(mockStopInstruments).toHaveBeenCalledWith(['melodyViolin']);
      expect(mockPlayScheduledInstrument.mock.calls.length).toBeGreaterThan(initialPlayCallCount);
    });

    const stopCallOrder = mockStopInstruments.mock.invocationCallOrder.at(-1) ?? 0;
    const playCallOrder = mockPlayScheduledInstrument.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stopCallOrder).toBeLessThan(playCallOrder);
  });
});
