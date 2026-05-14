import {
  calculatePaddingAndShift,
  calculateOptimalShift,
} from '@/services/chord-analysis/gridShifting';
import { getChordGridData, trimLeadingEmptyMeasures } from '@/services/chord-analysis/gridAssembly';
import { runVisualCompactionPipeline } from '@/services/chord-analysis/gridCompaction';
import type { ChordGridData, GridAnalysisResult } from '@/services/chord-analysis/gridTypes';

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

function makeAnalysisResult(overrides: Partial<GridAnalysisResult> = {}): GridAnalysisResult {
  return {
    beats: [0, 0.5, 1.0, 1.5, 2.0],
    synchronizedChords: [
      { chord: 'C', beatIndex: 0 },
      { chord: 'C', beatIndex: 1 },
      { chord: 'G', beatIndex: 2 },
      { chord: 'G', beatIndex: 3 },
      { chord: 'Am', beatIndex: 4 },
    ],
    beatDetectionResult: {
      bpm: 120,
      time_signature: 5,
    },
    ...overrides,
  } as GridAnalysisResult;
}

function musicalSequence(chords: string[]): string[] {
  return chords.filter((chord) => chord && chord !== 'N' && chord !== 'N.C.' && chord !== 'N/C');
}

describe('grid alignment edge behavior', () => {
  it('keeps combined padding and shift inside one non-4/4 measure', () => {
    const result = calculatePaddingAndShift(
      1.3,
      100,
      5,
      ['N/C', 'N/C', 'C', 'C', 'C', 'G', 'G', 'G', 'Am', 'Am']
    );

    expect(result.paddingCount).toBeGreaterThanOrEqual(0);
    expect(result.shiftCount).toBeGreaterThanOrEqual(0);
    expect(result.totalPaddingCount).toBe(result.paddingCount + result.shiftCount);
    expect(result.totalPaddingCount).toBeLessThan(5);
  });

  it('keeps the first musical chord downbeat-aligned after a long leading silence', () => {
    const leadingSilence = 6;
    const chords = [
      ...Array(leadingSilence).fill('N/C'),
      ...Array(5).fill('C'),
      ...Array(5).fill('G'),
    ];

    const result = calculatePaddingAndShift(0.02, 120, 5, chords);

    expect((result.paddingCount + result.shiftCount + leadingSilence) % 5).toBe(0);
    expect(calculateOptimalShift(chords, 5, result.paddingCount)).toBe(result.shiftCount);
  });

  it('keeps an early phrase downbeat-aligned when a later section favors another global shift', () => {
    const leadingSilence = 11;
    const earlyPhrase = [
      'E:min', 'E:min', 'C:maj', 'C:maj',
      'G:maj', 'G:maj', 'D:maj', 'G:maj',
      'E:min', 'E:min', 'C:maj', 'C:maj',
      'D:maj', 'D:maj', 'A:min', 'E:min',
      'E:min', 'E:min', 'C:maj', 'C:maj',
      'G:maj', 'G:maj', 'D:maj', 'G:maj',
      'E:min', 'E:min', 'C:maj', 'C:maj',
      'D:maj', 'D:maj', 'C:maj', 'C:maj',
    ];
    const laterShiftOnePressure = Array.from({ length: 40 }, (_, index) => (
      Array(4).fill(index % 2 === 0 ? 'A:min' : 'B:min')
    )).flat();
    const chords = [
      ...Array(leadingSilence).fill('N/C'),
      ...earlyPhrase,
      ...Array(59).fill('N/C'),
      ...laterShiftOnePressure,
    ];

    const result = calculatePaddingAndShift(0.33, 130.4347826087, 4, chords);

    expect(result.paddingCount).toBe(1);
    expect(result.shiftCount).toBe(0);
    expect((result.totalPaddingCount + leadingSilence) % 4).toBe(0);
  });

  it('extracts timestamps from object-form beats when assembling the grid', () => {
    const analysis = makeAnalysisResult({
      beats: [
        { time: 0.25 },
        { time: 0.75 },
        { time: 1.25 },
        { time: 1.75 },
        { time: 2.25 },
      ],
    });

    const result = getChordGridData(analysis);

    expect(result.originalAudioMapping).toHaveLength(analysis.synchronizedChords.length);
    expect(result.originalAudioMapping?.map((entry) => entry.timestamp)).toEqual([
      0.25,
      0.75,
      1.25,
      1.75,
      2.25,
    ]);
  });

  it('falls back safely when synchronized chords point beyond detected beats', () => {
    const result = getChordGridData(makeAnalysisResult({
      beats: [{ time: 0.5 }, { time: 1.0 }],
      synchronizedChords: [
        { chord: 'C', beatIndex: 0 },
        { chord: 'G', beatIndex: 99 },
      ],
      beatDetectionResult: { bpm: 120, time_signature: 4 },
    }));

    expect(result.chords).toContain('C');
    expect(result.chords).toContain('G');
    expect(result.beats).toHaveLength(result.chords.length);
    expect(result.originalAudioMapping?.[1]).toEqual(expect.objectContaining({
      chord: 'G',
      timestamp: 0,
      audioIndex: 1,
    }));
  });
});

describe('grid compaction edge behavior', () => {
  it('preserves musical chord order and mapping cardinality while compacting a silent gap', () => {
    const chords = [
      ...Array(4).fill('C'),
      ...Array(6).fill('N'),
      ...Array(4).fill('G'),
      ...Array(4).fill('Am'),
    ];
    const beats = chords.map((_, index) => index * 0.5);
    const mapping = chords.map((chord, index) => ({
      chord,
      timestamp: beats[index],
      visualIndex: index,
      audioIndex: index,
    }));

    const result = runVisualCompactionPipeline({
      chordGridData: makeGridData({ chords, beats, originalAudioMapping: mapping }),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });

    expect(result.chords.length).toBeLessThan(chords.length);
    expect(result.originalAudioMapping).toHaveLength(mapping.length);
    expect([...new Set(musicalSequence(result.chords))]).toEqual(['C', 'G', 'Am']);
  });

  it('compacts a steady tempo-change boundary without dropping mapped audio entries', () => {
    const slowBeats = Array.from({ length: 9 }, (_, index) => index);
    const fastBeats = Array.from({ length: 9 }, (_, index) => 8 + (index + 1) * 0.5);
    const beats = [...slowBeats, ...fastBeats];
    const chords = [
      ...Array(6).fill('C'),
      ...Array(6).fill('G'),
      ...Array(beats.length - 12).fill('Am'),
    ];
    const mapping = chords.map((chord, index) => ({
      chord,
      timestamp: beats[index],
      visualIndex: index,
      audioIndex: index,
    }));

    const result = runVisualCompactionPipeline({
      chordGridData: makeGridData({ chords, beats, originalAudioMapping: mapping }),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 1,
      enabled: true,
    });

    expect(result.chords.length).toBeLessThanOrEqual(chords.length);
    expect(result.originalAudioMapping).toHaveLength(mapping.length);
    expect(musicalSequence(result.chords)).toEqual(expect.arrayContaining(['C', 'G', 'Am']));
  });

  it('does not spend global offset on a small steady timing drift', () => {
    const chords = [
      '',
      '',
      'N.C.',
      ...Array(16).fill('C'),
      ...Array(16).fill('G'),
      ...Array(16).fill('Am'),
    ];
    const globalOffset = 3;
    const slowIntroTimes = Array.from({ length: 16 }, (_, index) => index * 0.9);
    const slightlySlowerTimes = Array.from({ length: 32 }, (_, index) => (
      slowIntroTimes[slowIntroTimes.length - 1] + ((index + 1) * 1.0)
    ));
    const beatTimes = [...slowIntroTimes, ...slightlySlowerTimes];
    const beats = [
      null,
      null,
      0,
      ...beatTimes,
    ];
    const mapping = chords.slice(globalOffset).map((chord, index) => ({
      chord,
      timestamp: beatTimes[index],
      visualIndex: globalOffset + index,
      audioIndex: index,
    }));

    const result = runVisualCompactionPipeline({
      chordGridData: makeGridData({
        chords,
        beats,
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: globalOffset,
        originalAudioMapping: mapping,
      }),
      chordIntervals: [],
      beatTimes,
      timeSignature: 4,
      beatDuration: 0.9,
      enabled: true,
    });
    const remappedByAudioIndex = new Map(
      result.originalAudioMapping?.map((item) => [item.audioIndex, item.visualIndex]) ?? []
    );

    expect(remappedByAudioIndex.get(16)).toBe(globalOffset + 16);
  });

  it('leaves unsteady tempo regions structurally valid', () => {
    const beats = [0, 1, 2.1, 2.9, 4.4, 5.0, 6.3, 7.1, 9.0, 9.4, 10.6, 11.7];
    const chords = [
      ...Array(4).fill('C'),
      ...Array(4).fill('G'),
      ...Array(4).fill('F'),
    ];

    const result = runVisualCompactionPipeline({
      chordGridData: makeGridData({ chords, beats }),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 1,
      enabled: true,
    });

    expect(result.chords).toHaveLength(chords.length);
    expect(result.beats).toHaveLength(result.chords.length);
  });

  it('keeps leading-silence suppression from expanding the grid', () => {
    const chords = [
      'N',
      ...Array(4).fill('C'),
      ...Array(5).fill('N'),
      ...Array(4).fill('G'),
    ];
    const beats = chords.map((_, index) => index * 0.5);
    const grid = makeGridData({ chords, beats });

    const unsuppressed = runVisualCompactionPipeline({
      chordGridData: grid,
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
      suppressLeadingSilenceExpansion: false,
    });
    const suppressed = runVisualCompactionPipeline({
      chordGridData: grid,
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
      suppressLeadingSilenceExpansion: true,
    });

    expect(suppressed.chords.length).toBeLessThanOrEqual(unsuppressed.chords.length);
    expect(suppressed.beats).toHaveLength(suppressed.chords.length);
  });

  it('strips full leading empty measures while preserving the remaining musical offset', () => {
    const grid = makeGridData({
      chords: [
        '', '', '', '',
        '', 'N.C.', 'N/C', 'N/C',
        'Ab:min', 'Ab:min', 'Ab:min', 'Ab:min',
      ],
      beats: [
        null, null, null, null,
        null, 0, 0.16, 0.52,
        0.88, 1.24, 1.6, 1.96,
      ],
      paddingCount: 1,
      shiftCount: 2,
      totalPaddingCount: 3,
      originalAudioMapping: [
        { chord: 'N/C', timestamp: 0.16, visualIndex: 6, audioIndex: 0 },
        { chord: 'N/C', timestamp: 0.52, visualIndex: 7, audioIndex: 1 },
        { chord: 'Ab:min', timestamp: 0.88, visualIndex: 8, audioIndex: 2 },
        { chord: 'Ab:min', timestamp: 1.24, visualIndex: 9, audioIndex: 3 },
      ],
    });

    const result = trimLeadingEmptyMeasures(grid, 4);
    const firstMusicalIndex = result.chords.findIndex((chord) => chord === 'Ab:min');
    const abMapping = result.originalAudioMapping?.find((item) => item.chord === 'Ab:min');

    expect(result.chords.slice(0, 4)).toEqual(['', 'N.C.', 'N/C', 'N/C']);
    expect(result.chords.slice(0, 4).every((chord) => chord === '')).toBe(false);
    expect(firstMusicalIndex).toBe(4);
    expect(abMapping?.visualIndex).toBe(4);
    expect(result.paddingCount).toBe(1);
    expect(result.shiftCount).toBe(1);
    expect(result.totalPaddingCount).toBe(2);
  });
});
