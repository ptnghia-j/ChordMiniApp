import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PianoVisualizerTab from '@/components/piano-visualizer/PianoVisualizerTab';

const mockPlayChord = jest.fn();
const mockStopAll = jest.fn();
const mockStopInstruments = jest.fn();
const mockUpdateOptions = jest.fn();
const mockSetParams = jest.fn();
const mockGetVelocityMultiplier = jest.fn(() => 0.9);

let mockChordEvents = [
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
  exportScorePartsToMusicXml: jest.fn(() => '<score-partwise version="3.1"></score-partwise>'),
  createScorePartDataFromSheetSage: jest.fn((id: string, name: string, noteEvents: unknown[]) => ({
    id,
    name,
    notes: noteEvents,
    instrumentName: 'melody',
  })),
}));

jest.mock('@/utils/instrumentNoteGeneration', () => ({
  mergeConsecutiveChordEvents: jest.fn((events) => events),
  beatDurationFromBpm: jest.fn(() => 0.5),
  generateNotesForInstrument: jest.fn((_instrument, params) => (
    [{
      noteName: 'C4',
      midi: 60,
      startOffset: 0,
      duration: (params as { duration: number }).duration,
      velocityMultiplier: 1,
      isBass: false,
    }]
  )),
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
  useTargetKey: () => null,
  useRomanNumerals: () => ({ analysis: null, enabled: false }),
  useGuitarCapoFret: () => null,
  useGuitarSelectedPositions: () => ({}),
}));

jest.mock('@/utils/chordTransposition', () => ({ transposeChord: (chord: string) => chord }));
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
      />,
    );

    expect(screen.queryByTestId('sheet-music-display')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Sheet Music' }));

    expect(screen.getByTestId('sheet-music-display')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Piano Roll' }));

    expect(screen.queryByTestId('sheet-music-display')).not.toBeInTheDocument();
  });
});
