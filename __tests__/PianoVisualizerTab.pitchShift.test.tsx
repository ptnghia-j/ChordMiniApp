import React from 'react';
import { render, screen } from '@testing-library/react';

import PianoVisualizerTab from '@/components/piano-visualizer/PianoVisualizerTab';

const mockBuildChordTimeline = jest.fn((chords: string[], beats: number[]) => (
  chords.map((chordName, index) => ({
    chordName,
    startTime: beats[index] ?? index,
    endTime: (beats[index] ?? index) + 1,
    beatIndex: index,
    beatCount: 1,
    notes: [],
  }))
));

jest.mock('@/components/piano-visualizer/ScrollingChordStrip', () => ({
  ScrollingChordStrip: ({
    chordEvents,
    uncorrectedChords,
  }: {
    chordEvents: Array<{ chordName: string }>;
    uncorrectedChords?: string[];
  }) => {
    return (
      <div
        data-testid="mock-scrolling-strip"
        data-display-chords={chordEvents.map((event) => event.chordName).join('|')}
        data-uncorrected-chords={(uncorrectedChords ?? []).join('|')}
      />
    );
  },
}));

jest.mock('@/components/piano-visualizer/PianoKeyboard', () => ({ PianoKeyboard: () => null }));
jest.mock('@/components/piano-visualizer/FallingNotesCanvas', () => ({ FallingNotesCanvas: () => null }));
jest.mock('@/components/piano-visualizer/SheetMusicDisplay', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/utils/chordToMidi', () => ({
  buildChordTimeline: (...args: unknown[]) => mockBuildChordTimeline(...args),
}));

jest.mock('@/utils/midiExport', () => ({
  exportChordEventsToMidi: jest.fn(),
  downloadMidiFile: jest.fn(),
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

jest.mock('@/utils/musicXmlExport', () => ({
  exportScorePartsToMusicXml: jest.fn(() => '<score-partwise version="3.1"></score-partwise>'),
  createScorePartDataFromSheetSage: jest.fn((id: string, name: string, noteEvents: unknown[]) => ({
    id,
    name,
    notes: noteEvents,
    instrumentName: 'melody',
  })),
}));

jest.mock('@/hooks/audio/useSharedAudioDynamics', () => ({
  useSharedAudioDynamics: () => ({
    getSignalAnalysis: () => null,
    getSignalDynamics: () => ({ rms: 0, peak: 0, perceptualLoudness: 0, recommendedVelocity: 70 }),
  }),
}));

jest.mock('@/services/chord-playback/soundfontChordPlaybackService', () => ({
  getSoundfontChordPlaybackService: jest.fn(() => ({
    playChord: jest.fn(),
    stopAll: jest.fn(),
    updateOptions: jest.fn(),
  })),
}));

jest.mock('@/stores/analysisStore', () => ({
  useAnalysisResults: () => null,
  useShowCorrectedChords: () => false,
  useChordCorrections: () => null,
  useKeySignature: () => null,
}));

jest.mock('@/stores/uiStore', () => ({
  useTargetKey: () => 'C#',
  useRomanNumerals: () => ({ showRomanNumerals: false, romanNumeralData: null }),
  useGuitarCapoFret: () => null,
  useGuitarSelectedPositions: () => ({}),
}));

jest.mock('@/utils/chordUtils', () => ({
  getDisplayAccidentalPreference: () => 'sharp',
}));

jest.mock('@/utils/chordProcessing', () => ({
  createShiftedChords: (chords: string[]) => chords,
}));

jest.mock('@/utils/chordFormatting', () => ({
  buildBeatToChordSequenceMap: () => ({}),
  formatRomanNumeral: () => '',
}));

jest.mock('@/services/chord-playback/audioMixerService', () => ({
  getAudioMixerService: () => ({
    getSettings: () => ({ pianoVolume: 70, guitarVolume: 0, violinVolume: 0, fluteVolume: 0, bassVolume: 0, saxophoneVolume: 0, chordPlaybackVolume: 0 }),
    addListener: () => () => {},
  }),
}));

jest.mock('@/hooks/chord-analysis/useResolvedChordDisplayData', () => ({
  useResolvedChordDisplayData: jest.fn(() => ({
    resolvedChordGridData: {
      chords: ['C#', 'F#'],
      beats: [0, 1],
      hasPadding: false,
      paddingCount: 0,
      shiftCount: 0,
    },
    displayedChords: ['C#maj7', 'F#7'],
    isPitchShiftActive: true,
    effectiveShowCorrectedChords: false,
    effectiveChordCorrections: null,
    effectiveSequenceCorrections: null,
  })),
}));

describe('PianoVisualizerTab pitch-shifted timeline', () => {
  beforeEach(() => {
    mockBuildChordTimeline.mockClear();
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  it('renders pitch-shifted displayed chords while preserving the raw chord stream for correction awareness', () => {
    render(
      <PianoVisualizerTab
        chordGridData={{ chords: ['C', 'F'], beats: [0, 1], hasPadding: false, paddingCount: 0, shiftCount: 0 }}
        analysisResults={{ beatDetectionResult: { bpm: 120, time_signature: 4 } } as any}
      />,
    );

    expect(screen.getByTestId('mock-scrolling-strip')).toHaveAttribute('data-display-chords', 'C#maj7|F#7');
    expect(screen.getByTestId('mock-scrolling-strip')).toHaveAttribute('data-uncorrected-chords', 'C#|F#');
  });
});
