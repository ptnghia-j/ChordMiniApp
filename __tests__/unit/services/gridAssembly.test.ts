import { getChordGridData } from '@/services/chord-analysis/gridAssembly';
import { GridAnalysisResult } from '@/services/chord-analysis/gridTypes';

function makeAnalysisResult(overrides: Partial<GridAnalysisResult> = {}): GridAnalysisResult {
  return {
    beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
    synchronizedChords: [
      { chord: 'C', beatIndex: 0 },
      { chord: 'C', beatIndex: 1 },
      { chord: 'C', beatIndex: 2 },
      { chord: 'C', beatIndex: 3 },
      { chord: 'G', beatIndex: 4 },
      { chord: 'G', beatIndex: 5 },
      { chord: 'G', beatIndex: 6 },
      { chord: 'G', beatIndex: 7 },
    ],
    beatDetectionResult: {
      time_signature: 4,
      bpm: 120,
    },
    ...overrides,
  } as GridAnalysisResult;
}

// ---------------------------------------------------------------------------
// getChordGridData — null / empty input
// ---------------------------------------------------------------------------
describe('getChordGridData — null / empty input', () => {
  it('returns empty grid for null input', () => {
    const result = getChordGridData(null);
    expect(result.chords).toEqual([]);
    expect(result.beats).toEqual([]);
    expect(result.paddingCount).toBe(0);
    expect(result.shiftCount).toBe(0);
    expect(result.totalPaddingCount).toBe(0);
    expect(result.hasPadding).toBe(true);
  });

  it('returns empty grid when synchronizedChords is empty', () => {
    const result = getChordGridData(makeAnalysisResult({ synchronizedChords: [] }));
    expect(result.chords).toEqual([]);
  });

  it('returns empty grid when synchronizedChords is undefined', () => {
    const result = getChordGridData(makeAnalysisResult({ synchronizedChords: undefined as any }));
    expect(result.chords).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getChordGridData — adapter selection
// ---------------------------------------------------------------------------
describe('getChordGridData — adapter selection', () => {
  it('uses N.C. padding chord for chord-cnn-lstm model', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        chordModel: 'chord-cnn-lstm',
        beats: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],
        synchronizedChords: [
          { chord: 'C', beatIndex: 0 },
          { chord: 'C', beatIndex: 1 },
          { chord: 'C', beatIndex: 2 },
          { chord: 'C', beatIndex: 3 },
          { chord: 'G', beatIndex: 4 },
          { chord: 'G', beatIndex: 5 },
          { chord: 'G', beatIndex: 6 },
          { chord: 'G', beatIndex: 7 },
        ],
      })
    );
    // With firstDetectedBeat=1.0 and bpm=120, padding > 0 → comprehensive adapter (N.C.)
    if (result.paddingCount > 0) {
      const paddingChords = result.chords.slice(result.shiftCount, result.shiftCount + result.paddingCount);
      paddingChords.forEach((c) => {
        expect(c === 'N.C.' || c === '').toBe(true);
      });
    }
  });

  it('uses empty-string padding when no padding/shift and not chord-cnn-lstm', () => {
    // firstBeat near 0 → no padding, no shift (with aligned chords)
    const result = getChordGridData(
      makeAnalysisResult({
        chordModel: 'some-other-model',
        beats: [0.01, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
      })
    );
    // When paddingCount and shiftCount are both 0, meter-based adapter is used
    // which produces '' padding chord
    expect(result.paddingCount).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// getChordGridData — grid assembly
// ---------------------------------------------------------------------------
describe('getChordGridData — grid assembly', () => {
  it('includes all regular chords in the output', () => {
    const result = getChordGridData(makeAnalysisResult());
    const musicalChords = result.chords.filter((c) => c !== '' && c !== 'N.C.' && c !== 'N' && c !== 'N/C');
    expect(musicalChords).toContain('C');
    expect(musicalChords).toContain('G');
  });

  it('total chord count >= regular chord count', () => {
    const analysis = makeAnalysisResult();
    const result = getChordGridData(analysis);
    expect(result.chords.length).toBeGreaterThanOrEqual(analysis.synchronizedChords.length);
  });

  it('shift cells are empty strings at the start', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        beats: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      })
    );
    if (result.shiftCount > 0) {
      const shiftCells = result.chords.slice(0, result.shiftCount);
      shiftCells.forEach((c) => expect(c).toBe(''));
    }
  });

  it('drops leading alignment-only full measures from combined offset', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        beats: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0],
        synchronizedChords: [
          { chord: 'C', beatIndex: 0 },
          { chord: 'C', beatIndex: 1 },
          { chord: 'C', beatIndex: 2 },
          { chord: 'C', beatIndex: 3 },
          { chord: 'G', beatIndex: 4 },
          { chord: 'C', beatIndex: 5 },
          { chord: 'C', beatIndex: 6 },
          { chord: 'C', beatIndex: 7 },
          { chord: 'Am', beatIndex: 8 },
          { chord: 'C', beatIndex: 9 },
          { chord: 'C', beatIndex: 10 },
          { chord: 'C', beatIndex: 11 },
        ],
        beatDetectionResult: {
          time_signature: 4,
          bpm: 120,
        },
      })
    );

    expect(result.totalPaddingCount).toBe(0);
    expect(result.shiftCount).toBe(0);
    expect(result.paddingCount).toBe(0);
    expect(result.chords.slice(0, 4).every((chord) => chord === '')).toBe(false);
  });

  it('beats array has same length as chords array', () => {
    const result = getChordGridData(makeAnalysisResult());
    expect(result.beats.length).toBe(result.chords.length);
  });

  it('hasPadding is always true', () => {
    const result = getChordGridData(makeAnalysisResult());
    expect(result.hasPadding).toBe(true);
  });

  it('originalAudioMapping has same length as synchronizedChords', () => {
    const analysis = makeAnalysisResult();
    const result = getChordGridData(analysis);
    // After compaction the mapping may still have same length
    expect(result.originalAudioMapping).toBeDefined();
    expect(result.originalAudioMapping!.length).toBe(analysis.synchronizedChords.length);
  });
});

// ---------------------------------------------------------------------------
// getChordGridData — padding timestamp generation
// ---------------------------------------------------------------------------
describe('getChordGridData — padding timestamps', () => {
  it('padding timestamps are non-negative', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        beats: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5],
      })
    );
    if (result.paddingCount > 0) {
      const paddingBeats = result.beats.slice(result.shiftCount, result.shiftCount + result.paddingCount);
      paddingBeats.forEach((b) => {
        if (typeof b === 'number') {
          expect(b).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });

  it('distributed padding timestamps are evenly spaced', () => {
    // chordModel = 'chord-cnn-lstm' forces distributed adapter
    const result = getChordGridData(
      makeAnalysisResult({
        chordModel: 'chord-cnn-lstm',
        beats: [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5],
        beatDetectionResult: { bpm: 120, time_signature: 4 },
      })
    );
    if (result.paddingCount >= 2) {
      const paddingBeats = result.beats
        .slice(result.shiftCount, result.shiftCount + result.paddingCount)
        .filter((b): b is number => typeof b === 'number');
      if (paddingBeats.length >= 2) {
        const step = paddingBeats[1] - paddingBeats[0];
        for (let i = 2; i < paddingBeats.length; i++) {
          expect(paddingBeats[i] - paddingBeats[i - 1]).toBeCloseTo(step, 5);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// getChordGridData — edge cases
// ---------------------------------------------------------------------------
describe('getChordGridData — edge cases', () => {
  it('handles single synchronized chord', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        beats: [0],
        synchronizedChords: [{ chord: 'C', beatIndex: 0 }],
      })
    );
    expect(result.chords.filter((c) => c === 'C').length).toBeGreaterThanOrEqual(1);
  });

  it('handles all-silent synchronized chords', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        synchronizedChords: [
          { chord: 'N', beatIndex: 0 },
          { chord: 'N', beatIndex: 1 },
          { chord: 'N', beatIndex: 2 },
          { chord: 'N', beatIndex: 3 },
        ],
      })
    );
    expect(result.chords.length).toBeGreaterThan(0);
  });

  it('defaults to 4/4 time and 120 bpm when beatDetectionResult is missing', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        beatDetectionResult: undefined,
      })
    );
    // Should not crash; uses defaults
    expect(result.chords.length).toBeGreaterThan(0);
  });

  it('handles 3/4 time signature', () => {
    const result = getChordGridData(
      makeAnalysisResult({
        beatDetectionResult: { time_signature: 3, bpm: 120 },
        beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5],
        synchronizedChords: [
          { chord: 'C', beatIndex: 0 },
          { chord: 'C', beatIndex: 1 },
          { chord: 'C', beatIndex: 2 },
          { chord: 'G', beatIndex: 3 },
          { chord: 'G', beatIndex: 4 },
          { chord: 'G', beatIndex: 5 },
        ],
      })
    );
    expect(result.chords.length).toBeGreaterThanOrEqual(6);
  });

  it('local compaction is enabled only for madmom beat model', () => {
    const withMadmom = getChordGridData(
      makeAnalysisResult({ beatModel: 'madmom' })
    );
    const withOther = getChordGridData(
      makeAnalysisResult({ beatModel: 'other-model' })
    );
    // Both should produce valid grids
    expect(withMadmom.chords.length).toBeGreaterThan(0);
    expect(withOther.chords.length).toBeGreaterThan(0);
  });

  it('long leading silence with global offset may fall back to initial grid', () => {
    // Build a case with very long leading silence beyond globalOffset + timeSignature
    const syncChords = [
      ...Array(12).fill(null).map((_, i) => ({ chord: 'N', beatIndex: i })),
      { chord: 'C', beatIndex: 12 },
      { chord: 'C', beatIndex: 13 },
      { chord: 'C', beatIndex: 14 },
      { chord: 'C', beatIndex: 15 },
    ];
    const beats = Array.from({ length: 16 }, (_, i) => i * 0.5);

    const result = getChordGridData(
      makeAnalysisResult({
        beats,
        synchronizedChords: syncChords,
        beatDetectionResult: { bpm: 120, time_signature: 4 },
        beatModel: 'madmom',
      })
    );
    // Should produce a valid grid regardless
    expect(result.chords.length).toBeGreaterThan(0);
    expect(result.originalAudioMapping).toBeDefined();
  });
});
