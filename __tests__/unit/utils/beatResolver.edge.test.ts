import type { AnalysisResult } from '@/types/audioAnalysis';
import type { ChordGridData } from '@/hooks/scroll/useScrollAndAnimation';
import {
  INITIAL_HYSTERESIS_STATE,
  OFF_DWELL_SECONDS,
  resolveBeatAtTime,
  type HysteresisState,
} from '@/utils/beatResolver';

const makeAnalysisResults = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
  chords: [],
  beats: [{ time: 0.5, strength: 1 }],
  synchronizedChords: [],
  beatDetectionResult: { bpm: 120 },
  ...overrides,
}) as AnalysisResult;

const makeHysteresis = (overrides: Partial<HysteresisState> = {}): HysteresisState => ({
  ...INITIAL_HYSTERESIS_STATE,
  ...overrides,
});

const makeGrid = (overrides: Partial<ChordGridData> = {}): ChordGridData => ({
  chords: ['C', 'F', 'G', 'Am'],
  beats: [0.5, 1.0, 1.5, 2.0],
  hasPadding: false,
  paddingCount: 0,
  shiftCount: 0,
  totalPaddingCount: 0,
  ...overrides,
});

describe('beatResolver edge behavior', () => {
  it('keeps mapping-based playback monotonic while time moves forward', () => {
    const result = resolveBeatAtTime({
      time: 1.2,
      chordGridData: makeGrid({
        chords: ['A', 'B', 'C', 'D', 'E', 'F'],
        beats: [0.5, 0.7, 0.9, 1.1, 1.3, 1.5],
        originalAudioMapping: [
          { timestamp: 1.0, chord: 'C', visualIndex: 2 },
        ],
      }),
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 4,
        lastEmitTime: 1.1,
        prevTime: 1.1,
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(4);
  });

  it('allows mapping-based playback to move backward when rewinding', () => {
    const result = resolveBeatAtTime({
      time: 0.7,
      chordGridData: makeGrid({
        chords: ['A', 'B', 'C', 'D', 'E', 'F'],
        beats: [0.5, 0.7, 0.9, 1.1, 1.3, 1.5],
        originalAudioMapping: [
          { timestamp: 0.7, chord: 'B', visualIndex: 1 },
        ],
      }),
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 4,
        lastEmitTime: 1.1,
        prevTime: 1.1,
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(1);
  });

  it('does not emit an empty regular cell after model playback has started', () => {
    const result = resolveBeatAtTime({
      time: 1.2,
      chordGridData: makeGrid({
        chords: ['C', '', 'G'],
        beats: [0.5, 1.0, 1.5],
        originalAudioMapping: [
          { timestamp: 1.0, chord: '', visualIndex: 1 },
        ],
      }),
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(-1);
    expect(result.shouldSkipEmit).toBe(false);
  });

  it('dwells briefly and then clears when original audio mapping is missing', () => {
    const dwell = resolveBeatAtTime({
      time: 1.03,
      chordGridData: makeGrid(),
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 2,
        lastEmitTime: 1.0,
        prevTime: 1.0,
      }),
      globalSpeedAdjustment: null,
    });

    const released = resolveBeatAtTime({
      time: 1.0 + OFF_DWELL_SECONDS + 0.02,
      chordGridData: makeGrid(),
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 2,
        lastEmitTime: 1.0,
        prevTime: 1.0,
      }),
      globalSpeedAdjustment: null,
    });

    expect(dwell.beatIndex).toBe(2);
    expect(released.beatIndex).toBe(-1);
  });

  it('falls back to grid beat search when mapping exists but no entry has started yet', () => {
    const result = resolveBeatAtTime({
      time: 0.8,
      chordGridData: makeGrid({
        beats: [0.5, 1.0, 1.5, 2.0],
        originalAudioMapping: [
          { timestamp: 1.4, chord: 'G', visualIndex: 2 },
        ],
      }),
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis({
        lastStableBeat: 0,
        beatStabilityCounter: 2,
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBeGreaterThanOrEqual(0);
    expect(result.nextHysteresisState.beatStabilityCounter).toBeGreaterThan(0);
  });
});
