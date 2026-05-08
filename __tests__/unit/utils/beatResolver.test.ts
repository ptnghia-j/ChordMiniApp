/**
 * Unit tests for the pure beat-resolution cascade in `src/utils/beatResolver.ts`.
 *
 * These tests lock the behavior that used to live inline inside
 * `useScrollAndAnimation.ts`. They are intentionally narrow — each case
 * targets one branch of the cascade so a behavior regression surfaces
 * as a single failing assertion rather than a diffuse animation glitch.
 */

import type { AnalysisResult } from '@/types/audioAnalysis';
import type { ChordGridData } from '@/hooks/scroll/useScrollAndAnimation';
import {
  INITIAL_HYSTERESIS_STATE,
  OFF_DWELL_SECONDS,
  PHASE_SWITCH_BUFFER,
  findDownbeatIndexAtTime,
  resolveBeatAtTime,
  type HysteresisState,
} from '@/utils/beatResolver';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const makeAnalysisResults = (
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult => ({
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

// ----------------------------------------------------------------------------
// findDownbeatIndexAtTime
// ----------------------------------------------------------------------------

describe('findDownbeatIndexAtTime', () => {
  it('returns -1 when the downbeats array is undefined', () => {
    expect(findDownbeatIndexAtTime(1.0, undefined)).toBe(-1);
  });

  it('returns -1 when the downbeats array is empty', () => {
    expect(findDownbeatIndexAtTime(1.0, [])).toBe(-1);
  });

  it('returns -1 when the time is before the first downbeat', () => {
    expect(findDownbeatIndexAtTime(0.1, [0.5, 1.5, 2.5])).toBe(-1);
  });

  it('returns the index of an exact downbeat match', () => {
    expect(findDownbeatIndexAtTime(1.5, [0.5, 1.5, 2.5])).toBe(1);
  });

  it('returns the last downbeat whose timestamp has passed', () => {
    expect(findDownbeatIndexAtTime(2.0, [0.5, 1.5, 2.5])).toBe(1);
  });

  it('returns the final downbeat when time is beyond all entries', () => {
    expect(findDownbeatIndexAtTime(10.0, [0.5, 1.5, 2.5])).toBe(2);
  });
});

// ----------------------------------------------------------------------------
// resolveBeatAtTime — guard clauses
// ----------------------------------------------------------------------------

describe('resolveBeatAtTime: empty grid guard', () => {
  it('skips emission when the chord grid is empty', () => {
    const result = resolveBeatAtTime({
      time: 1.0,
      chordGridData: {
        chords: [],
        beats: [],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
      },
      analysisResults: makeAnalysisResults(),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.shouldSkipEmit).toBe(true);
    expect(result.beatIndex).toBe(-1);
    expect(result.downbeatIndex).toBe(-1);
  });
});

// ----------------------------------------------------------------------------
// resolveBeatAtTime — PHASE 1 (pre-model context)
// ----------------------------------------------------------------------------

describe('resolveBeatAtTime: PHASE 1 padding cells', () => {
  it('emits the best-matching padding cell for a time before the model range', () => {
    // animationRangeStart = 2.0 (first detected beat)
    // time=0.6 < 2.0 - PHASE_SWITCH_BUFFER ⇒ PHASE 1
    // paddingCount=2, shiftCount=0, padding timestamps at 0.0 and 0.5
    // Expect: bestPaddingIndex = 1 → finalBeatIndex = 0 + 1 = 1
    const result = resolveBeatAtTime({
      time: 0.6,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.0, 0.5, 2.0, 2.5],
        hasPadding: true,
        paddingCount: 2,
        shiftCount: 0,
        totalPaddingCount: 2,
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 2.0, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.shouldSkipEmit).toBe(false);
    expect(result.beatIndex).toBe(1);
    expect(result.nextHysteresisState.lastEmittedBeat).toBe(1);
    expect(result.nextHysteresisState.lastEmitTime).toBe(0.6);
  });

  it('falls back to a BPM-based virtual beat when no padding cells exist', () => {
    // animationRangeStart = 2.0, bpm=120 → beatDuration=0.5
    // time=0.3 < 2.0-0.03 ⇒ PHASE 1
    // paddingCount=0 so virtualBeatIndex = floor(0.3/0.5)+shiftCount = 0+2 = 2
    // chords[2] = 'C' (non-empty) ⇒ emit index 2
    const result = resolveBeatAtTime({
      time: 0.3,
      chordGridData: {
        chords: ['', '', 'C', 'F', 'G'],
        beats: [null, null, 2.0, 2.5, 3.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 2,
        totalPaddingCount: 0,
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 2.0, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.shouldSkipEmit).toBe(false);
    expect(result.beatIndex).toBe(2);
  });

  it('does not emit inside the PHASE_SWITCH_BUFFER window', () => {
    // animationRangeStart = 1.0. time within [1.0 - PHASE_SWITCH_BUFFER, 1.0 + PHASE_SWITCH_BUFFER]
    // should fall in the "switching window" — no emission.
    const result = resolveBeatAtTime({
      time: 1.0,
      chordGridData: {
        chords: ['C', 'F'],
        beats: [1.0, 1.5],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 1.0, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.shouldSkipEmit).toBe(true);
    expect(result.beatIndex).toBe(-1);
    expect(Math.abs(1.0 - 1.0)).toBeLessThanOrEqual(PHASE_SWITCH_BUFFER);
  });
});

// ----------------------------------------------------------------------------
// resolveBeatAtTime — PHASE 2 (model-driven)
// ----------------------------------------------------------------------------

describe('resolveBeatAtTime: PHASE 2 via originalAudioMapping', () => {
  it('uses the binary-search visualIndex from originalAudioMapping', () => {
    // animationRangeStart = 0.5, time=1.2 > 0.5+0.03 ⇒ PHASE 2
    // mapping: [{t=0.5,vi=0},{t=1.0,vi=1},{t=1.5,vi=2}]
    // with time=1.2 → latest ≤ time+TIMING_TOLERANCE (0.02) is {t=1.0,vi=1}
    const result = resolveBeatAtTime({
      time: 1.2,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.5, 1.0, 1.5, 2.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 0.5, chord: 'C', visualIndex: 0 },
          { timestamp: 1.0, chord: 'F', visualIndex: 1 },
          { timestamp: 1.5, chord: 'G', visualIndex: 2 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.shouldSkipEmit).toBe(false);
    expect(result.beatIndex).toBe(1);
  });

  it('filters empty-cell matches back to -1 once past the pre-beat phase', () => {
    // chords[1] = '' empty ⇒ finalBeatIndex forced to -1 in PHASE 2
    // but lastEmittedBeat on hysteresis dwells (OFF_DWELL) during the same frame.
    const result = resolveBeatAtTime({
      time: 1.2,
      chordGridData: {
        chords: ['C', '', 'G'],
        beats: [0.5, 1.0, 1.5],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 1.0, chord: '', visualIndex: 1 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(), // no prior emit
      globalSpeedAdjustment: null,
    });

    // No dwell carry-over because lastEmittedBeat was -1.
    expect(result.beatIndex).toBe(-1);
  });

  it('enforces non-decreasing beatIndex when not rewinding', () => {
    // Simulate: previous emit was beat 5, new mapping would jump back to 2.
    // Expected: stable output stays at 5.
    const result = resolveBeatAtTime({
      time: 1.2, // forward progress → prevTime < time
      chordGridData: {
        chords: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        beats: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 1.0, chord: 'C', visualIndex: 2 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 5,
        lastEmitTime: 1.1,
        prevTime: 1.1, // strictly less than time 1.2 ⇒ not rewinding
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(5);
  });

  it('allows beatIndex to drop when the user rewinds', () => {
    const result = resolveBeatAtTime({
      time: 0.6, // rewinding: time < prevTime
      chordGridData: {
        chords: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        beats: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 0.6, chord: 'B', visualIndex: 1 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 5,
        lastEmitTime: 1.1,
        prevTime: 1.1,
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(1); // rewind allowed
  });

  it('dwells on the last emitted beat for OFF_DWELL_SECONDS when the cascade would otherwise emit -1', () => {
    // No originalAudioMapping → currentBeat stays -1 → finalBeatIndex = -1.
    // Dwell check: time - lastEmitTime < OFF_DWELL_SECONDS (0.08) ⇒ keep beat 3.
    const lastEmitTime = 1.0;
    const dwellTime = lastEmitTime + OFF_DWELL_SECONDS / 2; // 1.04

    const result = resolveBeatAtTime({
      time: dwellTime,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.5, 1.0, 1.5, 2.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        // NOTE: no originalAudioMapping ⇒ cascade falls through with currentBeat=-1
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 3,
        lastEmitTime,
        prevTime: lastEmitTime,
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(3); // dwell keeps last highlight
  });

  it('releases the dwell once OFF_DWELL_SECONDS has elapsed', () => {
    const lastEmitTime = 1.0;
    const afterDwell = lastEmitTime + OFF_DWELL_SECONDS + 0.01; // 1.09

    const result = resolveBeatAtTime({
      time: afterDwell,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.5, 1.0, 1.5, 2.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis({
        lastEmittedBeat: 3,
        lastEmitTime,
        prevTime: lastEmitTime,
      }),
      globalSpeedAdjustment: null,
    });

    expect(result.beatIndex).toBe(-1);
  });
});

// ----------------------------------------------------------------------------
// resolveBeatAtTime — downbeat & speed-adjustment bookkeeping
// ----------------------------------------------------------------------------

describe('resolveBeatAtTime: downbeat & speed adjustment bookkeeping', () => {
  it('reports the latest downbeat index whose timestamp has passed', () => {
    const result = resolveBeatAtTime({
      time: 1.6,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.5, 1.0, 1.5, 2.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 1.5, chord: 'G', visualIndex: 2 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
        downbeats: [0.5, 1.5, 2.5],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(result.downbeatIndex).toBe(1);
  });

  it('computes globalSpeedAdjustment exactly once from the first segment pair', () => {
    // bpm=120, originalBeatDuration = 0.5
    // chord segments @ chordModelTimestamps 0.5, 1.5 (after subtracting firstDetectedBeat=0.5)
    // actualDuration = (1.5-0.5)-(0.5-0.5) = 1.0
    // expected = 0.5
    // speedAdj = 1.0 / 0.5 = 2.0
    const firstCall = resolveBeatAtTime({
      time: 1.0,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.5, 1.0, 1.5, 2.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 1.0, chord: 'C', visualIndex: 0 },
          { timestamp: 2.0, chord: 'F', visualIndex: 1 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: null,
    });

    expect(firstCall.nextGlobalSpeedAdjustment).toBeCloseTo(2.0, 3);

    // On a subsequent call, passing the previously-computed value should be
    // preserved untouched.
    const secondCall = resolveBeatAtTime({
      time: 1.1,
      chordGridData: {
        chords: ['C', 'F', 'G', 'Am'],
        beats: [0.5, 1.0, 1.5, 2.0],
        hasPadding: false,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
        originalAudioMapping: [
          { timestamp: 1.0, chord: 'C', visualIndex: 0 },
          { timestamp: 2.0, chord: 'F', visualIndex: 1 },
        ],
      },
      analysisResults: makeAnalysisResults({
        beats: [{ time: 0.5, strength: 1 }],
      }),
      hysteresisState: makeHysteresis(),
      globalSpeedAdjustment: firstCall.nextGlobalSpeedAdjustment,
    });

    expect(secondCall.nextGlobalSpeedAdjustment).toBe(firstCall.nextGlobalSpeedAdjustment);
  });
});
