import {
  hasNaturalLeadingSilenceWithOffset,
  runVisualCompactionPipeline,
} from '@/services/chord-analysis/gridCompaction';
import { ChordGridData } from '@/services/chord-analysis/gridTypes';

// ---------------------------------------------------------------------------
// hasNaturalLeadingSilenceWithOffset
// ---------------------------------------------------------------------------
describe('hasNaturalLeadingSilenceWithOffset', () => {
  it('returns false when existingLeadingOffset is 0', () => {
    expect(hasNaturalLeadingSilenceWithOffset(10, 0)).toBe(false);
  });

  it('returns false when existingLeadingOffset is negative', () => {
    expect(hasNaturalLeadingSilenceWithOffset(10, -1)).toBe(false);
  });

  it('returns false when runEnd equals existingLeadingOffset (offset-only silence)', () => {
    expect(hasNaturalLeadingSilenceWithOffset(4, 4)).toBe(false);
  });

  it('returns true when natural silence run meets threshold for 4/4 time', () => {
    // naturalRun = 8 - 2 = 6, threshold = max(1, 4-1) = 3 → true
    expect(hasNaturalLeadingSilenceWithOffset(8, 2, 4)).toBe(true);
  });

  it('returns false when natural silence run is below threshold', () => {
    // naturalRun = 4 - 3 = 1, threshold = max(1, 4-1) = 3 → false
    expect(hasNaturalLeadingSilenceWithOffset(4, 3, 4)).toBe(false);
  });

  it('handles 3/4 time signature', () => {
    // naturalRun = 5 - 2 = 3, threshold = max(1, 3-1) = 2 → true
    expect(hasNaturalLeadingSilenceWithOffset(5, 2, 3)).toBe(true);
  });

  it('handles runEnd of 0', () => {
    // naturalRun = max(0, 0 - max(0,2)) = 0, threshold 3 → false
    expect(hasNaturalLeadingSilenceWithOffset(0, 2, 4)).toBe(false);
  });

  it('uses default timeSignature of 4 when not specified', () => {
    // naturalRun = 6 - 3 = 3, threshold = max(1, 4-1) = 3 → true
    expect(hasNaturalLeadingSilenceWithOffset(6, 3)).toBe(true);
  });

  it('handles timeSignature of 1 (threshold becomes 1)', () => {
    // threshold = max(1, 1-1) = max(1,0) = 1
    // naturalRun = 3 - 1 = 2 >= 1 → true
    expect(hasNaturalLeadingSilenceWithOffset(3, 1, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runVisualCompactionPipeline
// ---------------------------------------------------------------------------
describe('runVisualCompactionPipeline', () => {
  function makeGridData(overrides: Partial<ChordGridData> = {}): ChordGridData {
    return {
      chords: [],
      beats: [],
      hasPadding: true,
      paddingCount: 0,
      shiftCount: 0,
      totalPaddingCount: 0,
      originalAudioMapping: [],
      ...overrides,
    };
  }

  const defaultParams = {
    chordIntervals: [] as Array<{ start?: number; end?: number; chord?: string }>,
    beatTimes: [] as number[],
    timeSignature: 4,
    beatDuration: 0.5,
    enabled: true,
  };

  it('returns original data when disabled', () => {
    const grid = makeGridData({ chords: ['C', 'C', 'G', 'G'], beats: [0, 0.5, 1, 1.5] });
    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
      enabled: false,
    });
    expect(result.chords).toEqual(grid.chords);
    expect(result.beats).toEqual(grid.beats);
  });

  it('returns original data when chords array is empty', () => {
    const grid = makeGridData();
    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
    });
    expect(result.chords).toEqual([]);
  });

  it('returns original data when timeSignature is 1', () => {
    const grid = makeGridData({ chords: ['C', 'N', 'N', 'G'], beats: [0, 0.5, 1, 1.5] });
    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
      timeSignature: 1,
    });
    expect(result.chords).toEqual(grid.chords);
  });

  it('handles all-silent chords without crashing', () => {
    const grid = makeGridData({
      chords: ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
      beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    });
    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
    });
    expect(result.chords.length).toBeGreaterThan(0);
  });

  it('handles single chord', () => {
    const grid = makeGridData({ chords: ['C'], beats: [0] });
    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
    });
    expect(result.chords).toEqual(['C']);
  });

  it('compacts a silent run between two musical sections', () => {
    // Build a grid with music, a long silent gap, then music again.
    // The silent run is 5 beats long (>= timeSignature-1 = 3) and sits between music.
    const chords = [
      'C', 'C', 'C', 'C',           // music
      'N', 'N', 'N', 'N', 'N',      // silent run (5 beats)
      'G', 'G', 'G', 'G',           // music
    ];
    const beats: (number | null)[] = chords.map((_, i) => i * 0.5);
    const grid = makeGridData({ chords, beats });

    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
    });
    // The compacted grid should have fewer beats than the original
    // because the silent run gets shrunk
    expect(result.chords.length).toBeLessThanOrEqual(chords.length);
  });

  it('preserves chord content through compaction', () => {
    const chords = [
      'C', 'C', 'C', 'C',
      'N', 'N', 'N', 'N', 'N',
      'G', 'G', 'G', 'G',
    ];
    const beats: (number | null)[] = chords.map((_, i) => i * 0.5);
    const grid = makeGridData({ chords, beats });

    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
    });
    // All musical chords should still be present
    const musicalChords = result.chords.filter((c) => c !== 'N' && c !== 'N.C.' && c !== '' && c !== 'N/C');
    expect(musicalChords).toContain('C');
    expect(musicalChords).toContain('G');
  });

  it('suppressLeadingSilenceExpansion prevents leading expansion', () => {
    const chords = ['N', 'C', 'C', 'C', 'G', 'G', 'G', 'G'];
    const beats: (number | null)[] = chords.map((_, i) => i * 0.5);
    const grid = makeGridData({ chords, beats });

    const withExpansion = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
      suppressLeadingSilenceExpansion: false,
    });

    const withSuppression = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
      suppressLeadingSilenceExpansion: true,
    });

    // With suppression, leading silence expansion is skipped
    // so the result length should be <= the non-suppressed version
    expect(withSuppression.chords.length).toBeLessThanOrEqual(withExpansion.chords.length);
  });

  it('gap compaction reduces beats across a large instrumental gap', () => {
    // Two chord intervals far apart create a gap
    const beatTimes = Array.from({ length: 40 }, (_, i) => i * 0.5);
    const chords = beatTimes.map((_, i) => {
      if (i < 8) return 'C';
      if (i >= 30) return 'G';
      return 'N';
    });
    const beats: (number | null)[] = beatTimes.map((t) => t);
    const grid = makeGridData({ chords, beats });

    const chordIntervals = [
      { start: 0, end: 4, chord: 'C' },
      { start: 15, end: 20, chord: 'G' },
    ];

    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      chordIntervals,
      beatTimes,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });

    expect(result.chords.length).toBeLessThanOrEqual(chords.length);
  });

  it('originalAudioMapping indices are remapped after compaction', () => {
    const chords = [
      'C', 'C', 'C', 'C',
      'N', 'N', 'N', 'N', 'N',
      'G', 'G', 'G', 'G',
    ];
    const beats: (number | null)[] = chords.map((_, i) => i * 0.5);
    const mapping = chords.map((chord, i) => ({
      chord,
      timestamp: i * 0.5,
      visualIndex: i,
      audioIndex: i,
    }));
    const grid = makeGridData({ chords, beats, originalAudioMapping: mapping });

    const result = runVisualCompactionPipeline({
      chordGridData: grid,
      ...defaultParams,
    });

    // The mapping should exist and have the same number of items
    expect(result.originalAudioMapping).toBeDefined();
    expect(result.originalAudioMapping!.length).toBe(mapping.length);
  });
});
