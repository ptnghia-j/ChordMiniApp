import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PianoVisualizerTab from '@/components/piano-visualizer/PianoVisualizerTab';
import { exportPianoVisualizerScoreToMusicXml } from '@/utils/musicXmlExport';

const mockPlayChord = jest.fn();
const mockStopAll = jest.fn();
const mockStopInstruments = jest.fn();
const mockUpdateOptions = jest.fn();
const mockSetParams = jest.fn();
const mockGetVelocityMultiplier = jest.fn(() => 0.9);

let mockChordEvents: any[] = [
  { chordName: 'C', notes: [60, 64, 67], startTime: 10, endTime: 12, beatIndex: 0 },
  { chordName: 'F', notes: [65, 69, 72], startTime: 12, endTime: 16, beatIndex: 4 },
];

jest.mock('@/components/piano-visualizer/ScrollingChordStrip', () => ({ ScrollingChordStrip: () => null }));
jest.mock('@/components/piano-visualizer/PianoKeyboard', () => ({ PianoKeyboard: () => null }));
jest.mock('@/components/piano-visualizer/FallingNotesCanvas', () => ({ FallingNotesCanvas: () => null }));
jest.mock('@/components/piano-visualizer/SheetMusicDisplay', () => ({
  __esModule: true,
  default: ({ musicXml }: { musicXml: string }) => <div data-testid="sheet-music-display">{musicXml}</div>,
}));

jest.mock('@/utils/chordToMidi', () => ({
  buildChordTimeline: jest.fn(() => mockChordEvents),
}));

jest.mock('@/utils/midiExport', () => ({
  exportChordEventsToMidi: jest.fn(),
  downloadMidiFile: jest.fn(),
}));

jest.mock('@/utils/musicXmlExport', () => ({
  exportLeadSheetToMusicXml: jest.fn(() => '<score-partwise version="3.1"></score-partwise>'),
  exportPianoVisualizerScoreToMusicXml: jest.fn(() => '<score-partwise version="3.1"><part id="PPiano"/></score-partwise>'),
  buildLeadSheetMeasureChords: jest.fn(() => [{ measureIndex: 0, labels: ['C'] }]),
}));

jest.mock('@/utils/instrumentNoteGeneration', () => ({
  beatDurationFromBpm: jest.fn((bpm: number) => 60 / Math.max(1, bpm)),
  generateNotesForInstrument: jest.fn(() => []),
  mergeConsecutiveChordEvents: jest.fn((events) => events),
}));

jest.mock('@/services/chord-playback/soundfontChordPlaybackService', () => ({
  getSoundfontChordPlaybackService: jest.fn(() => ({
    playChord: mockPlayChord,
    stopAll: mockStopAll,
    stopInstruments: mockStopInstruments,
    updateOptions: mockUpdateOptions,
  })),
}));

jest.mock('@/services/audio/dynamicsAnalyzer', () => ({
  DynamicsAnalyzer: jest.fn().mockImplementation(() => ({
    setParams: mockSetParams,
    getVelocityMultiplier: mockGetVelocityMultiplier,
    getSignalAnalysis: jest.fn(() => null),
    setSignalAnalysis: jest.fn(),
    getSignalDynamics: jest.fn(() => ({ rms: 0, peak: 0, perceptualLoudness: 0, recommendedVelocity: 70 })),
  })),
}));

jest.mock('@/stores/analysisStore', () => ({
  useAnalysisResults: () => null,
  useShowCorrectedChords: () => false,
  useChordCorrections: () => null,
  useKeySignature: () => null,
}));

jest.mock('@/stores/uiStore', () => ({
  useIsPitchShiftEnabled: () => false,
  usePitchShiftSemitones: () => 0,
  useSimplifyChords: () => false,
  useTargetKey: () => null,
  useRomanNumerals: () => ({ analysis: null, enabled: false }),
  useGuitarCapoFret: () => null,
  useGuitarSelectedPositions: () => ({}),
}));

jest.mock('@/utils/chordTransposition', () => ({
  transposeChord: (chord: string) => chord,
  transposeKeySignature: (keySignature: string | null | undefined) => keySignature ?? null,
}));
jest.mock('@/utils/chordUtils', () => ({
  computeAccidentalPreference: () => 'sharp',
  getAccidentalPreferenceFromKey: () => null,
  getDisplayAccidentalPreference: () => 'sharp',
}));
jest.mock('@/utils/chordProcessing', () => ({ createShiftedChords: (chords: string[]) => chords }));
jest.mock('@/utils/chordFormatting', () => ({
  buildBeatToChordSequenceMap: () => ({}),
  formatRomanNumeral: () => '',
}));

jest.mock('@/services/chord-playback/audioMixerService', () => ({
  getAudioMixerService: () => ({
    getSettings: () => ({ pianoVolume: 70, guitarVolume: 0, violinVolume: 0, fluteVolume: 0, bassVolume: 0 }),
    addListener: () => () => {},
  }),
}));

jest.mock('@/hooks/chord-analysis/useResolvedChordDisplayData', () => ({
  useResolvedChordDisplayData: ({ chordGridData }: { chordGridData: unknown }) => ({
    resolvedChordGridData: chordGridData,
    displayedChords: (chordGridData as { chords?: string[] } | null)?.chords ?? [],
    isPitchShiftActive: false,
    effectiveShowCorrectedChords: false,
    effectiveChordCorrections: null,
    effectiveSequenceCorrections: null,
  }),
}));

const mockExportPianoVisualizerScoreToMusicXml = exportPianoVisualizerScoreToMusicXml as jest.Mock;

describe('PianoVisualizerTab piano-only playback', () => {
  const expectLatestPlayback = (expectedChord: string, expectedPlaybackTime: number) => {
    expect(mockPlayChord).toHaveBeenCalled();
    const [chord, duration, bpm, velocity, timingContext, timeSignature, guitarVoicing, targetKey] =
      mockPlayChord.mock.calls.at(-1) as [
        string,
        number,
        number,
        number,
        {
          startTime?: number;
          playbackTime?: number;
          totalDuration?: number;
          beatCount?: number;
        } | undefined,
        number,
        { capoFret?: number | null; selectedPositions?: Record<string, number> },
        string | null,
      ];

    expect(chord).toBe(expectedChord);
    expect(duration).toBeGreaterThan(0);
    expect(bpm).toBe(120);
    expect(velocity).toBe(0.9);
    expect(timingContext).toEqual(expect.objectContaining({
      playbackTime: expectedPlaybackTime,
      totalDuration: expect.any(Number),
    }));
    expect(timeSignature).toBe(4);
    expect(guitarVoicing).toEqual({ capoFret: null, selectedPositions: {} });
    expect(targetKey).toBeNull();
  };

  const openSheetMusicMode = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Sheet Music' }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStopInstruments.mockReset();
    mockChordEvents = [
      { chordName: 'C', notes: [60, 64, 67], startTime: 10, endTime: 12, beatIndex: 0 },
      { chordName: 'F', notes: [65, 69, 72], startTime: 12, endTime: 16, beatIndex: 4 },
    ];
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  it('passes late-entry timing context into piano-only playback so pattern hits stay aligned', async () => {
    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10.75}
        isPlaying
        isChordPlaybackEnabled={false}
      />,
    );

    await waitFor(() => {
      expectLatestPlayback('C', 10.75);
    });
  });

  it('passes total song duration for final long chords so end-of-song piano shaping can apply', async () => {
    mockChordEvents = [
      { chordName: 'C', notes: [60, 64, 67], startTime: 27, endTime: 32, beatIndex: 54 },
    ];

    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={29}
        isPlaying
        isChordPlaybackEnabled={false}
      />,
    );

    await waitFor(() => {
      expectLatestPlayback('C', 29);
    });
  });

  it('passes segmentation data into piano-only dynamics shaping when available', async () => {
    const segmentationData = {
      segments: [{ label: 'Chorus', startTime: 8, endTime: 16 }],
      metadata: { totalDuration: 16 },
    } as any;

    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        segmentationData={segmentationData}
        currentTime={10.75}
        isPlaying
        isChordPlaybackEnabled={false}
      />,
    );

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({
        segmentationData,
        totalDuration: 16,
      }));
    });
  });

  it('prefers the beat-index chord near a boundary when currentTime lags slightly behind', async () => {
    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={11.96}
        currentBeatIndex={4}
        isPlaying
        isChordPlaybackEnabled={false}
      />,
    );

    await waitFor(() => {
      expectLatestPlayback('F', 11.96);
    });
  });

  it('switches between piano roll and sheet music modes from the visualizer header toggle', async () => {
    const user = userEvent.setup();

    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 0, offset: 0.5, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 0.5],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    expect(screen.queryByTestId('sheet-music-display')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Sheet Music' }));

    expect(screen.getByTestId('sheet-music-display')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Piano Roll' }));

    expect(screen.queryByTestId('sheet-music-display')).not.toBeInTheDocument();
  });

  it('enables the sheet music tab from piano notation alone when playable chord data exists', async () => {
    const user = userEvent.setup();

    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Sheet Music' })).not.toHaveAttribute('data-disabled', 'true');

    await user.click(screen.getByRole('tab', { name: 'Sheet Music' }));

    expect(screen.getByTestId('sheet-music-display')).toBeInTheDocument();
  });

  it('omits transcription melody from piano sheet music until melody playback is enabled', async () => {
    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 0, offset: 0.5, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 0.5],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.melodyNoteEvents).toBeUndefined();
    expect(latestCall.melodyBeatTimes).toBeUndefined();
  });

  it('keeps the sheet music tab disabled only when neither piano notation nor melody transcription is available', () => {
    mockChordEvents = [
      { chordName: 'N', notes: [], startTime: 10, endTime: 12, beatIndex: 0 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C'], beats: [0], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Sheet Music' })).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByText('Sheet Music')).toHaveAttribute('title', 'Sheet music requires playable piano chords or enabled melody playback.');
  });

  it('normalizes sheet-music timing by removing visual shift beats and defers pickup selection when melody disagrees with stale padding', async () => {
    mockChordEvents = [
      { chordName: 'G', notes: [67], startTime: 10, endTime: 12, beatIndex: 13, beatCount: 2 },
      { chordName: 'D/F#', notes: [66], startTime: 12, endTime: 14, beatIndex: 17, beatCount: 4 },
    ];

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['', '', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'G', 'G', 'D/F#', 'D/F#', 'D/F#', 'D/F#'],
          beats: [null, null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 2,
          totalPaddingCount: 3,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        showMelodicOverlay
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 4, offset: 4.5, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 1, 2, 3, 4, 5, 6, 7],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(10);
    expect(latestCall.chordEvents[1].beatIndex).toBe(12);
    expect(latestCall.melodyBeatTimes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(latestCall.pickupBeatCount).toBe(2);
  });

  it('keeps explicit grid pickup when no melody is present even if padding metadata is stale', async () => {
    mockChordEvents = [
      { chordName: 'G', notes: [67], startTime: 10, endTime: 12, beatIndex: 13, beatCount: 2 },
      { chordName: 'D/F#', notes: [66], startTime: 12, endTime: 14, beatIndex: 17, beatCount: 4 },
    ];

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['', '', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'G', 'G', 'D/F#', 'D/F#', 'D/F#', 'D/F#'],
          beats: [null, null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 2,
          totalPaddingCount: 3,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(10);
    expect(latestCall.chordEvents[1].beatIndex).toBe(12);
    expect(latestCall.pickupBeatCount).toBe(2);
  });

  it('preserves source beat anchors when duplicate beat timestamps appear around a chord change', async () => {
    mockChordEvents = [
      { chordName: 'Bb', notes: [70], startTime: 14, endTime: 16, beatIndex: 9, beatCount: 2 },
      { chordName: 'F', notes: [65], startTime: 16, endTime: 18, beatIndex: 11, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['G', 'G', 'G', 'G', 'Cm', 'Cm', 'Cm', 'Cm', 'Bb', 'Bb', 'F', 'F'],
          beats: [0, 2, 4, 6, 8, 10, 12, 13, 14, 14, 16, 18],
          hasPadding: false,
          paddingCount: 0,
          shiftCount: 0,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={14}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(9);
    expect(latestCall.chordEvents[1].beatIndex).toBe(10);
  });

  it('derives sheet-music pickup from padding metadata when shiftCount metadata is stale', async () => {
    mockChordEvents = [
      { chordName: 'F#', notes: [66], startTime: 10, endTime: 11, beatIndex: 3, beatCount: 1 },
      { chordName: 'B', notes: [71], startTime: 11, endTime: 12, beatIndex: 4, beatCount: 1 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'F#', 'B', 'C#', 'F#'],
          beats: [10, 11, 12, 13, 14],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 3,
          totalPaddingCount: 4,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={10}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(0);
    expect(latestCall.chordEvents[1].beatIndex).toBe(1);
    expect(latestCall.melodyBeatTimes).toBeUndefined();
    expect(latestCall.pickupBeatCount).toBe(1);
  });

  it('preserves a two-beat pickup when reliable beat anchors disagree with stale one-beat padding metadata', async () => {
    mockChordEvents = [
      { chordName: 'G', notes: [67], startTime: 2, endTime: 4, beatIndex: 2, beatCount: 2 },
      { chordName: 'D/F#', notes: [66], startTime: 4, endTime: 6, beatIndex: 4, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'N.C.', 'G', 'G', 'D/F#', 'D/F#', 'Em', 'Em'],
          beats: [0, 1, 2, 3, 4, 5, 6, 7],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 0,
          totalPaddingCount: 1,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={2}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(2);
    expect(latestCall.pickupBeatCount).toBe(2);
  });

  it('keeps reliable grid pickup when melody exists and stale padding disagrees by one beat', async () => {
    mockChordEvents = [
      { chordName: 'G', notes: [67], startTime: 2, endTime: 4, beatIndex: 2, beatCount: 2 },
      { chordName: 'D/F#', notes: [66], startTime: 4, endTime: 6, beatIndex: 4, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'N.C.', 'G', 'G', 'D/F#', 'D/F#', 'Em', 'Em'],
          beats: [0, 1, 2, 3, 4, 5, 6, 7],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 0,
          totalPaddingCount: 1,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={2}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        showMelodicOverlay
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 0.25, offset: 0.75, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 1, 2, 3, 4, 5, 6, 7],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(2);
    expect(latestCall.pickupBeatCount).toBe(2);
  });

  it('does not force a one-beat pickup when chords already align to a full-measure boundary', async () => {
    mockChordEvents = [
      { chordName: 'Bb', notes: [70], startTime: 4, endTime: 6, beatIndex: 4, beatCount: 2 },
      { chordName: 'F', notes: [65], startTime: 6, endTime: 8, beatIndex: 6, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'N.C.', 'N.C.', 'N.C.', 'Bb', 'Bb', 'F', 'F'],
          beats: [0, 1, 2, 3, 4, 5, 6, 7],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 0,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={4}
        isPlaying={false}
        isChordPlaybackEnabled={false}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(4);
    expect(latestCall.pickupBeatCount).toBe(0);
  });

  it('keeps long lead-ins as full measures instead of forcing a one-beat pickup', async () => {
    mockChordEvents = [
      { chordName: 'Ab', notes: [68], startTime: 9, endTime: 11, beatIndex: 9, beatCount: 2 },
      { chordName: 'Eb/G', notes: [67], startTime: 11, endTime: 13, beatIndex: 11, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'Ab', 'Ab', 'Eb/G', 'Eb/G'],
          beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 0,
          totalPaddingCount: 1,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={9}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        showMelodicOverlay
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 9.25, offset: 9.75, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 1, 2, 3, 4, 5, 6, 7],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(9);
    expect(latestCall.pickupBeatCount).toBe(0);
  });

  it('does not fold long visible lead-ins into a modulo pickup when padding metadata is zero', async () => {
    mockChordEvents = [
      { chordName: 'Ab', notes: [68], startTime: 9, endTime: 11, beatIndex: 9, beatCount: 2 },
      { chordName: 'Eb/G', notes: [67], startTime: 11, endTime: 13, beatIndex: 11, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'Ab', 'Ab', 'Eb/G', 'Eb/G'],
          beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          hasPadding: true,
          paddingCount: 0,
          shiftCount: 0,
          totalPaddingCount: 0,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={9}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        showMelodicOverlay
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 9.25, offset: 9.75, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 1, 2, 3, 4, 5, 6, 7],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(9);
    expect(latestCall.pickupBeatCount).toBe(0);
  });

  it('does not force a pickup when shift slots hide a long lead-in remainder', async () => {
    mockChordEvents = [
      { chordName: 'Ab:maj', notes: [68], startTime: 12, endTime: 14, beatIndex: 12, beatCount: 2 },
      { chordName: 'Eb/G', notes: [67], startTime: 14, endTime: 16, beatIndex: 14, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['', '', '', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'Ab:maj', 'Ab:maj', 'Eb/G', 'Eb/G'],
          beats: [null, null, null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 14, 16, 18],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 3,
          totalPaddingCount: 4,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={12}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        showMelodicOverlay
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 12.2, offset: 12.7, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 1, 2, 3, 4, 5, 6, 7],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(9);
    expect(latestCall.pickupBeatCount).toBe(1);
  });

  it('keeps multi-measure leading rests on the grid instead of collapsing them into a modulo pickup', async () => {
    mockChordEvents = [
      { chordName: 'F#', notes: [66], startTime: 13, endTime: 15, beatIndex: 13, beatCount: 2 },
      { chordName: 'D#m', notes: [63], startTime: 15, endTime: 17, beatIndex: 15, beatCount: 2 },
    ] as any;

    render(
      <PianoVisualizerTab
        chordGridData={{
          chords: ['N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'F#', 'F#', 'D#m', 'D#m'],
          beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
          hasPadding: true,
          paddingCount: 1,
          shiftCount: 0,
          totalPaddingCount: 1,
        }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
        currentTime={13}
        isPlaying={false}
        isChordPlaybackEnabled={false}
        showMelodicOverlay
        sheetSageResult={{
          source: 'sheetsage',
          noteEvents: [{ onset: 13.25, offset: 13.75, pitch: 72, velocity: 90 }],
          noteEventCount: 1,
          beatTimes: [0, 1, 2, 3, 4, 5, 6, 7],
          beatsPerMeasure: 4,
          tempoBpm: 120,
          processingTime: 12,
          usedJukebox: false,
        }}
      />,
    );

    await openSheetMusicMode();

    await waitFor(() => {
      expect(mockExportPianoVisualizerScoreToMusicXml).toHaveBeenCalled();
    });

    const latestCall = mockExportPianoVisualizerScoreToMusicXml.mock.calls.at(-1)?.[0];
    expect(latestCall.chordEvents[0].beatIndex).toBe(13);
    expect(latestCall.pickupBeatCount).toBe(0);
  });
});
