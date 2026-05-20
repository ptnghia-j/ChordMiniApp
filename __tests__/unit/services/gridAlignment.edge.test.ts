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

function musicalChordStarts(chords: string[]): Array<{ chord: string; index: number }> {
  return chords
    .map((chord, index) => ({ chord, index }))
    .filter(({ chord, index }) => (
      chord &&
      chord !== 'N' &&
      chord !== 'N.C.' &&
      chord !== 'N/C' &&
      (index === 0 || chords[index - 1] !== chord)
    ));
}

function countStartModulos(
  chords: string[],
  timeSignature: number,
  rangeEnd: number,
  rangeStart = 0
): number[] {
  const counts = Array(timeSignature).fill(0);
  musicalChordStarts(chords)
    .filter((start) => start.index >= rangeStart && start.index < rangeEnd)
    .forEach((start) => {
      counts[start.index % timeSignature] += 1;
    });
  return counts;
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

  it('keeps a short 3/4 lead-in eligible for expansion before a later tempo change', () => {
    const timeSignature = 3;
    const leadingSilence = Array(4).fill('N/C');
    const earlyPhrase = ['C', 'G', 'F', 'C', 'G', 'F', 'C', 'G']
      .flatMap((chord) => Array(6).fill(chord));
    const bridge = Array(10).fill('G');
    const laterTempoPhrase = Array.from({ length: 40 }, (_, index) => (
      Array(3).fill(index % 2 === 0 ? 'C' : 'F')
    )).flat();
    const chords = [
      ...leadingSilence,
      ...earlyPhrase,
      ...bridge,
      ...laterTempoPhrase,
    ];
    const beats = chords.map((_, index) => {
      const duration = index < 60 ? 0.6 : 0.36;
      const previousTime = index === 0 ? 0.48 : null;
      return {
        time: previousTime ?? (0.48 + (Math.min(index, 60) * 0.6) + (Math.max(0, index - 60) * 0.36)),
      };
    });

    const result = getChordGridData(makeAnalysisResult({
      beats,
      synchronizedChords: chords.map((chord, beatIndex) => ({ chord, beatIndex })),
      beatDetectionResult: {
        bpm: 166.66666666666666,
        time_signature: timeSignature,
      },
      beatModel: 'madmom',
      chordModel: 'chord-cnn-lstm',
    }));
    const starts = musicalChordStarts(result.chords);
    const earlyStarts = starts.filter((start) => start.index < 60);
    const laterStarts = starts.filter((start) => start.index >= 60);
    const earlyDownbeatStarts = earlyStarts.filter((start) => start.index % timeSignature === 0);
    const laterDownbeatStarts = laterStarts.filter((start) => start.index % timeSignature === 0);

    expect(starts[0]).toEqual({ chord: 'C', index: 6 });
    expect(earlyDownbeatStarts.length).toBeGreaterThan(earlyStarts.length / 2);
    expect(laterDownbeatStarts.length).toBeGreaterThan(30);
  });

  it('keeps a solver-improved long-intro opening instead of falling back to the raw grid', () => {
    const timeSignature = 4;
    const beatDuration = 60 / 109.09090909091248;
    const rawChords = Array(190).fill('N/C');
    const runs: Array<[number, string]> = [
      [51, 'A:maj'],
      [58, 'C#:maj'],
      [62, 'F#:min'],
      [66, 'B:sus4'],
      [68, 'B:min'],
      [70, 'A:maj/3'],
      [75, 'A:maj/5'],
      [78, 'E:sus4'],
      [82, 'A:maj'],
      [98, 'A:maj/6'],
      [101, 'E:maj/2'],
      [106, 'B:min7'],
      [114, 'E:7'],
      [117, 'E:maj'],
      [121, 'A:maj/5'],
      [122, 'A:maj7'],
      [131, 'F#:min'],
      [138, 'B:min7'],
      [142, 'B:min9'],
      [146, 'E:7'],
      [150, 'E:maj'],
      [158, 'A:maj'],
      [167, 'C#:aug(b7)'],
      [170, 'F#:min7'],
      [174, 'B:min7'],
      [178, 'B:min7/b7'],
      [182, 'G:maj'],
      [186, 'E:sus4'],
      [188, 'A:maj/5'],
    ];

    runs.forEach(([start, chord], runIndex) => {
      const nextStart = runs[runIndex + 1]?.[0] ?? rawChords.length;
      for (let index = start; index < nextStart; index += 1) {
        rawChords[index] = chord;
      }
    });

    const result = getChordGridData(makeAnalysisResult({
      beats: rawChords.map((_, index) => ({
        time: 0.37 + (index * beatDuration),
        beatNum: (index % timeSignature) + 1,
      })),
      synchronizedChords: rawChords.map((chord, beatIndex) => ({ chord, beatIndex })),
      beatDetectionResult: {
        bpm: 109.09090909091248,
        time_signature: timeSignature,
      },
      beatModel: 'madmom',
      chordModel: 'chord-cnn-lstm',
    }));
    const starts = musicalChordStarts(result.chords).slice(0, 10);
    const openingCounts = countStartModulos(result.chords, timeSignature, 84, 52);

    expect(starts.slice(0, 4).map((start) => start.index)).toEqual([52, 56, 60, 64]);
    expect(openingCounts[0]).toBeGreaterThan(openingCounts[1]);
    expect(openingCounts[0]).toBeGreaterThan(openingCounts[2]);
    expect(result.originalAudioMapping).toHaveLength(rawChords.length);
  });

  it('keeps protected intro alignment while repairing a post-rest ending phrase', () => {
    const timeSignature = 4;
    const bpm = 127.65957446808541;
    const beatDuration = 60 / bpm;
    const rawChords = Array(527).fill('N/C');
    const runs: Array<[number, string]> = [
      [6, 'C:maj'],
      [32, 'C:min'],
      [35, 'Ab:maj'],
      [41, 'Ab:maj7'],
      [47, 'C:min'],
      [58, 'F:7'],
      [61, 'F:maj'],
      [70, 'C:min'],
      [78, 'Ab:maj7'],
      [88, 'F:maj'],
      [92, 'F:7'],
      [98, 'D:min7'],
      [116, 'C:maj'],
      [128, 'C:min'],
      [151, 'G:min'],
      [167, 'C:min/5'],
      [169, 'C:min'],
      [184, 'F:maj'],
      [188, 'C:min'],
      [192, 'Eb:maj'],
      [200, 'C:min'],
      [204, 'G:min'],
      [220, 'N/C'],
      [256, 'C:min'],
      [268, 'F:min'],
      [276, 'Bb:maj'],
      [279, 'C:min'],
      [285, 'F:maj'],
      [292, 'C:min'],
      [294, 'G:min'],
      [302, 'Bb:maj'],
      [306, 'G:min'],
      [310, 'C:min'],
      [328, 'F:maj'],
      [332, 'Bb:maj'],
      [336, 'C:min/b7'],
      [339, 'C:min'],
      [344, 'F:maj'],
      [352, 'C:min'],
      [354, 'G:min'],
      [362, 'Bb:maj'],
      [366, 'G:min'],
      [370, 'C:min'],
      [388, 'F:maj'],
      [392, 'Bb:maj'],
      [396, 'Eb:maj'],
      [400, 'C:min'],
      [404, 'F:maj'],
      [408, 'Bb:maj'],
      [412, 'Eb:maj'],
      [414, 'G:min'],
      [422, 'Bb:maj'],
      [426, 'G:min'],
      [430, 'C:min'],
      [466, 'N/C'],
      [469, 'C:min'],
      [479, 'C:maj'],
      [481, 'F:min'],
      [489, 'Bb:maj'],
      [492, 'C:maj'],
      [497, 'F:min'],
      [505, 'C:min'],
      [507, 'G:min'],
      [523, 'C:min'],
      [525, 'C:maj'],
    ];

    runs.forEach(([start, chord], runIndex) => {
      const nextStart = runs[runIndex + 1]?.[0] ?? rawChords.length;
      for (let index = start; index < nextStart; index += 1) {
        rawChords[index] = chord;
      }
    });

    const result = getChordGridData(makeAnalysisResult({
      beats: rawChords.map((_, index) => ({
        time: 0.75 + (index * beatDuration),
        beatNum: (index % timeSignature) + 1,
      })),
      synchronizedChords: rawChords.map((chord, beatIndex) => ({ chord, beatIndex })),
      beatDetectionResult: {
        bpm,
        time_signature: timeSignature,
      },
      beatModel: 'madmom',
      chordModel: 'chord-cnn-lstm',
    }));
    const starts = musicalChordStarts(result.chords);
    const endingStarts = starts.filter((start) => start.index >= 460);

    expect(starts[0]).toEqual({ chord: 'C:maj', index: 8 });
    expect(endingStarts.slice(0, 4)).toEqual([
      { chord: 'C:min', index: 468 },
      { chord: 'C:maj', index: 476 },
      { chord: 'F:min', index: 478 },
      { chord: 'Bb:maj', index: 486 },
    ]);
    expect(endingStarts[0].index % timeSignature).toBe(0);
    expect(endingStarts[1].index % timeSignature).toBe(0);
    expect(result.originalAudioMapping).toHaveLength(rawChords.length);
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

  it('compacts a short ramped tempo change before the faster section drifts to beat 2', () => {
    const rawChords = [
      ...Array(9).fill('N/C'),
      ...Array(20).fill('Db').map((_, index) => (Math.floor(index / 2) % 2 === 0 ? 'Db' : 'Gb/Db')),
      ...Array(16).fill('Fm7').map((_, index) => (Math.floor(index / 2) % 2 === 0 ? 'Fm7' : 'Bbm7')),
      ...Array(25).fill('Ebm7').map((_, index) => (Math.floor(index / 2) % 2 === 0 ? 'Ebm7' : 'Ab7')),
      ...Array(4).fill('Db/F'),
      ...Array(4).fill('Gb'),
      ...Array(4).fill('Absus4'),
      ...Array(4).fill('Db'),
      ...Array(4).fill('Gb'),
      ...Array(4).fill('Ab/C'),
      ...Array(4).fill('Db'),
      ...Array(4).fill('Db/F'),
      ...Array(4).fill('Gb'),
      ...Array(4).fill('Ebm7'),
      ...Array(4).fill('Absus4'),
      ...Array(4).fill('Db'),
    ];
    const beatDurations = [
      ...Array(71).fill(0.97),
      0.94,
      0.8,
      0.63,
      0.5,
      0.47,
      ...Array(rawChords.length - 77).fill(0.49),
    ];
    const beatTimes = rawChords.map((_, index) => (
      index === 0
        ? 0.5
        : 0.5 + beatDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0)
    ));
    const visualOffset = 3;
    const chords = [
      '',
      '',
      'N.C.',
      ...rawChords,
    ];
    const beats = [
      null,
      null,
      0,
      ...beatTimes,
    ];
    const mapping = rawChords.map((chord, index) => ({
      chord,
      timestamp: beatTimes[index],
      visualIndex: visualOffset + index,
      audioIndex: index,
    }));

    const result = runVisualCompactionPipeline({
      chordGridData: makeGridData({
        chords,
        beats,
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: visualOffset,
        originalAudioMapping: mapping,
      }),
      chordIntervals: [],
      beatTimes,
      timeSignature: 4,
      beatDuration: 60 / 122.44897959184156,
      enabled: true,
    });
    const postRampCounts = countStartModulos(result.chords, 4, 140, 76);
    const remappedByAudioIndex = new Map(
      result.originalAudioMapping?.map((item) => [item.audioIndex, item.visualIndex]) ?? []
    );

    expect(result.chords.length).toBe(chords.length - 1);
    expect(postRampCounts[0]).toBeGreaterThan(postRampCounts[1]);
    expect(postRampCounts[0]).toBeGreaterThan(postRampCounts[2]);
    expect(postRampCounts[0]).toBeGreaterThan(postRampCounts[3]);
    expect(remappedByAudioIndex.get(78)).toBe(80);
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

  it('corrects leading expansion when early starts would otherwise cluster on beat 2', () => {
    const earlyPhrase = [
      'C', 'C', 'C', 'C',
      'Bm', 'Bm', 'Bm', 'Bm',
      'Abmaj7',
      'Dbmaj7', 'Dbmaj7',
      'Gbmaj7',
      'Dbmaj7',
      'Csus4', 'Csus4',
      'C7', 'C7',
      ...Array(4).fill('F'),
      ...Array(4).fill('C'),
      ...Array(4).fill('Cm'),
      ...Array(4).fill('Bb/D'),
      ...Array(4).fill('Bbm/Db'),
      ...Array(4).fill('F/C'),
      ...Array(4).fill('G/B'),
      ...Array(4).fill('C7'),
      ...Array(4).fill('F'),
      ...Array(4).fill('C/E'),
      ...Array(4).fill('Eb'),
      ...Array(4).fill('Bb/D'),
      ...Array(4).fill('Bbm/Db'),
    ];
    const chords = [
      'N/C',
      ...earlyPhrase,
      ...Array(4).fill('N/C'),
      ...Array(16).fill('F'),
    ];
    const beats = chords.map((_, index) => index * 0.48);
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
      beatDuration: 0.48,
      enabled: true,
    });
    const earlyCounts = countStartModulos(result.chords, 4, 128);

    expect(earlyCounts[0]).toBeGreaterThan(earlyCounts[1]);
    expect(earlyCounts[0]).toBeGreaterThan(earlyCounts[2]);
    expect(earlyCounts[0]).toBeGreaterThan(earlyCounts[3]);
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
