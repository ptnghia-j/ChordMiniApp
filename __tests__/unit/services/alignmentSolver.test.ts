import {
  compareAlignmentStrategies,
  runSegmentAlignmentSolver,
} from '@/services/chord-analysis/alignmentSolver';
import type { ChordGridData } from '@/services/chord-analysis/gridTypes';

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

function countStartModulos(chords: string[], timeSignature: number, rangeStart = 0, rangeEnd = chords.length): number[] {
  const silent = new Set(['', 'N', 'N/C', 'N.C.', 'NC']);
  const counts = Array(timeSignature).fill(0);

  chords.forEach((chord, index) => {
    if (index < rangeStart || index >= rangeEnd || silent.has(chord)) {
      return;
    }

    const previousChord = index > 0 ? chords[index - 1] : '';
    if (index === 0 || silent.has(previousChord) || previousChord !== chord) {
      counts[index % timeSignature] += 1;
    }
  });

  return counts;
}

function makeMappedGrid(chords: string[], beats: (number | null)[], overrides: Partial<ChordGridData> = {}): ChordGridData {
  return makeGridData({
    chords,
    beats,
    originalAudioMapping: chords.map((chord, index) => ({
      chord,
      timestamp: typeof beats[index] === 'number' ? beats[index] as number : 0,
      visualIndex: index,
      audioIndex: index,
    })),
    ...overrides,
  });
}

function expectSolverAtLeastCurrent(params: Parameters<typeof compareAlignmentStrategies>[0]) {
  const comparison = compareAlignmentStrategies(params);

  expect(comparison.solver.gridData.originalAudioMapping).toHaveLength(
    comparison.current.gridData.originalAudioMapping?.length
  );
  expect(comparison.solver.metrics.downbeatStarts).toBeGreaterThanOrEqual(
    comparison.current.metrics.downbeatStarts
  );

  return comparison;
}

describe('segment alignment solver comparison', () => {
  it('matches the current pipeline on silent-gap compaction while preserving mapping cardinality', () => {
    const chords = [
      ...Array(4).fill('C'),
      ...Array(6).fill('N/C'),
      ...Array(4).fill('G'),
      ...Array(4).fill('Am'),
    ];
    const beats = chords.map((_, index) => index * 0.5);
    const grid = makeMappedGrid(chords, beats);
    const params = {
      chordGridData: grid,
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    };

    const comparison = expectSolverAtLeastCurrent(params);

    expect(comparison.solver.gridData.chords.length).toBeLessThan(chords.length);
  });

  it('does not expand stable leading silence when no local boundary needs realignment', () => {
    const chords = ['N/C', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
    const beats = [1, 2, 3, 4, 5, 6, 7, 8];
    const comparison = expectSolverAtLeastCurrent({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 1,
      enabled: true,
    });

    expect(comparison.solver.gridData.chords).toEqual(comparison.current.gridData.chords);
  });

  it('keeps short intro silence eligible when a later local boundary exists', () => {
    const chords = [
      'N/C', 'N/C',
      'Gb:maj7', 'Gb:maj7', 'Db:maj/F', 'Db:maj/F', 'Ebm', 'Ebm',
      'N/C', 'N/C', 'N/C',
      'Db:maj', 'Db:maj', 'Db:maj', 'Db:maj',
    ];
    const beats = [
      0.83, 1.69,
      2.54, 3.39, 4.24, 5.1, 5.96, 6.81,
      7.67, 8.53, 9.38,
      10.24, 11.1, 11.95, 12.81,
    ];
    const comparison = expectSolverAtLeastCurrent({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 60 / 70,
      enabled: true,
    });
    const firstMusicalIndex = comparison.solver.gridData.chords.findIndex((chord) => chord === 'Gb:maj7');

    expect(firstMusicalIndex).toBeGreaterThanOrEqual(0);
    expect(comparison.solver.metrics.downbeatStarts).toBeGreaterThanOrEqual(2);
  });

  it('keeps confirmed steady tempo-change sections downbeat aligned', () => {
    const chords = [
      'A:maj', 'A:maj', 'B:maj', 'B:maj', 'C:min',
      'Eb:maj', 'Eb:maj', 'Eb:maj', 'Eb:maj', 'Eb:maj', 'Eb:maj',
      'F:min', 'F:min', 'Bb:maj', 'Bb:maj', 'C:min7', 'C:min7', 'Ab:maj', 'Ab:maj',
    ];
    const beats = [
      0, 1, 2, 3, 4,
      5, 6, 7, 8, 9, 10,
      10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14,
    ];
    const comparison = expectSolverAtLeastCurrent({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 1,
      enabled: true,
    });
    const postTempoStart = comparison.solver.gridData.chords.indexOf('F:min');

    expect(postTempoStart).toBeGreaterThanOrEqual(0);
    expect(postTempoStart % 4).toBe(0);
  });

  it('uses one objective to correct a beat-4-heavy phrase after silence', () => {
    const appendChordRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const outro: string[] = [];
    [
      ['A:min7', 3],
      ['G:min7', 2],
      ['C:7', 2],
      ['F:maj', 4],
      ['D:min7', 5],
      ['G:7', 3],
      ['A:sus4(b7)', 1],
      ['D:maj/5', 8],
      ['A:maj', 3],
      ['B:min7', 4],
      ['B:min/b7', 4],
      ['E:min7', 8],
      ['A:sus4(b7)', 4],
      ['B:min7', 2],
      ['A:7', 2],
      ['D:maj', 4],
      ['F#:min7', 4],
      ['B:min7', 4],
      ['A:min7', 2],
      ['D:7', 2],
      ['G:maj', 2],
    ].forEach(([chord, beats]) => appendChordRun(outro, chord as string, beats as number));

    const chords = [
      ...Array(16).fill('D:maj'),
      ...Array(15).fill('N/C'),
      ...outro,
    ];
    const beats = chords.map((_, index) => index * 0.5);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeGridData({
        chords,
        beats,
        originalAudioMapping: chords.map((chord, index) => ({
          chord,
          timestamp: beats[index],
          visualIndex: index,
          audioIndex: index,
        })),
      }),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });
    const outroStart = result.gridData.chords.findIndex((chord) => chord === outro[0]);
    const counts = countStartModulos(result.gridData.chords, 4, outroStart);

    expect(counts[0]).toBeGreaterThan(counts[3]);
    expect(counts[0]).toBeGreaterThanOrEqual(14);
  });

  it('expands a short rest when the following sounding phrase is one beat early', () => {
    const appendChordRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = [];

    appendChordRun(chords, 'C:maj', 16);
    appendChordRun(chords, 'N/C', 3);
    [
      'D:min', 'G:7', 'C:maj', 'F:maj',
      'B:min7b5', 'E:7', 'A:min', 'D:7',
    ].forEach((chord) => appendChordRun(chords, chord, 4));

    const beats = chords.map((_, index) => index * 0.5);
    const originalPostRestCounts = countStartModulos(chords, 4, 19);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });
    const silenceDecision = result.decisions.find((decision) => (
      decision.source === 'silence' && decision.startIndex === 16
    ));
    const firstPostRestIndex = result.gridData.chords.indexOf('D:min');
    const solvedPostRestCounts = countStartModulos(result.gridData.chords, 4, firstPostRestIndex);

    expect(originalPostRestCounts[3]).toBeGreaterThanOrEqual(8);
    expect(originalPostRestCounts[0]).toBe(0);
    expect(silenceDecision?.adjustment).toBe(1);
    expect(firstPostRestIndex).toBe(20);
    expect(solvedPostRestCounts[0]).toBeGreaterThanOrEqual(8);
    expect(result.gridData.originalAudioMapping).toHaveLength(chords.length);
  });

  it('solves a ramped tempo-change section without a beat-2 special case', () => {
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
    const chords = ['', '', 'N.C.', ...rawChords];
    const beats = [null, null, 0, ...beatTimes];
    const params = {
      chordGridData: makeGridData({
        chords,
        beats,
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: visualOffset,
        originalAudioMapping: rawChords.map((chord, index) => ({
          chord,
          timestamp: beatTimes[index],
          visualIndex: visualOffset + index,
          audioIndex: index,
        })),
      }),
      chordIntervals: [],
      beatTimes,
      timeSignature: 4,
      beatDuration: 60 / 122.44897959184156,
      enabled: true,
    };

    const comparison = expectSolverAtLeastCurrent(params);
    const solved = comparison.solver;
    const postRampCounts = countStartModulos(solved.gridData.chords, 4, 76, 140);

    expect(solved.gridData.chords.length).toBe(chords.length - 1);
    expect(postRampCounts[0]).toBeGreaterThan(postRampCounts[1]);
    expect(postRampCounts[0]).toBeGreaterThan(postRampCounts[2]);
  });

  it('does not turn a one-beat timing blip into a tempo compaction', () => {
    const chords = [
      'C:maj', 'C:maj', 'D:min', 'D:min',
      'Eb:maj', 'Eb:maj', 'Eb:maj', 'Eb:maj', 'Eb:maj', 'Eb:maj',
      'F:min', 'F:min', 'Bb:maj', 'Bb:maj', 'C:min7', 'C:min7', 'Ab:maj', 'Ab:maj',
    ];
    const beats = [
      0, 1, 2, 3, 4,
      5, 6, 7, 8, 9, 10,
      10.7, 11.7, 12.7, 13.7, 14.7, 15.7, 16.7,
    ];
    const comparison = expectSolverAtLeastCurrent({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 1,
      enabled: true,
    });

    expect(comparison.solver.decisions.every((decision) => decision.adjustment === 0)).toBe(true);
  });

  it('creates a phrase-phase window when a dense local cluster drifts off the downbeat without silence or tempo change', () => {
    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = [];

    [
      'G:maj', 'D:maj', 'E:min', 'C:maj',
      'G:maj/B', 'A:min', 'D:maj', 'G:maj',
    ].forEach((chord) => appendRun(chords, chord, 4));
    appendRun(chords, 'D:sus4', 5);
    [
      'E:min', 'C:maj', 'G:maj', 'D:maj',
      'A:min', 'E:min/G', 'C:maj', 'G:maj/B',
      'D:maj', 'E:min',
    ].forEach((chord) => appendRun(chords, chord, 4));

    const beats = chords.map((_, index) => index * 0.5);
    const originalPostCounts = countStartModulos(chords, 4, 37);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });
    const phraseDecision = result.decisions.find((decision) => (
      decision.source === 'phrase_phase' && decision.adjustment !== 0
    ));
    const solvedPostCounts = countStartModulos(result.gridData.chords, 4, 36);

    expect(originalPostCounts[0]).toBe(0);
    expect(originalPostCounts[1]).toBeGreaterThanOrEqual(8);
    expect(phraseDecision?.adjustment).toBe(-1);
    expect(result.gridData.chords).toHaveLength(chords.length - 1);
    expect(solvedPostCounts[0]).toBeGreaterThanOrEqual(8);
    expect(result.gridData.originalAudioMapping).toHaveLength(chords.length);
  });

  it('uses shrink-only phrase-phase edits when correction would otherwise require inserted filler cells', () => {
    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = [];

    [
      'C:maj', 'G:maj', 'A:min', 'F:maj',
      'D:min', 'G:maj/B', 'E:min',
    ].forEach((chord) => appendRun(chords, chord, 4));
    appendRun(chords, 'D:sus4', 7);
    [
      'E:min', 'C:maj', 'G:maj', 'D:maj',
      'A:min', 'E:min/G', 'F:maj', 'G:maj/B',
    ].forEach((chord) => appendRun(chords, chord, 4));

    const beats = chords.map((_, index) => index * 0.5);
    const originalPostCounts = countStartModulos(chords, 4, 35);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });
    const phraseDecision = result.decisions.find((decision) => (
      decision.source === 'phrase_phase' && decision.adjustment !== 0
    ));
    const solvedPostCounts = countStartModulos(result.gridData.chords, 4, 32);

    expect(originalPostCounts[0]).toBe(0);
    expect(originalPostCounts[3]).toBeGreaterThanOrEqual(8);
    expect(phraseDecision?.adjustment).toBe(-3);
    expect(phraseDecision?.adjustments).toBeUndefined();
    expect(result.gridData.chords).toHaveLength(chords.length - 3);
    expect(result.gridData.beats.every((beat) => typeof beat === 'number')).toBe(true);
    expect(solvedPostCounts[0]).toBeGreaterThanOrEqual(8);
    expect(result.gridData.originalAudioMapping).toHaveLength(chords.length);
  });

  it('uses tempo-anchored phrase phase when a faster section clusters on beat 4 after the transition', () => {
    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = [];

    appendRun(chords, 'E:maj', 1);
    [
      'A:maj', 'B:maj', 'C#:min', 'D:maj',
      'E:maj', 'G:maj', 'A:min', 'B:min',
      'C:maj', 'D:min', 'E:min', 'G:min',
    ].forEach((chord) => appendRun(chords, chord, 2));
    appendRun(chords, 'F#:maj', 10);
    appendRun(chords, 'F:7', 2);
    appendRun(chords, 'Bb:7', 1);
    appendRun(chords, 'C#:7', 5);
    [
      'F#:maj', 'B:maj', 'B:min', 'F#:maj',
      'C:hdim7', 'B:maj', 'B:min', 'Bb:min7',
    ].forEach((chord) => appendRun(chords, chord, 8));

    const beatDurations = [
      ...Array(35).fill(0.75),
      0.65,
      0.55,
      ...Array(chords.length - 38).fill(0.37),
    ];
    const beats = chords.map((_, index) => (
      index === 0
        ? 0
        : beatDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0)
    ));
    const originalPostCounts = countStartModulos(chords, 4, 43);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.75,
      enabled: true,
    });
    const postTempoDecision = result.decisions.find((decision) => (
      decision.source === 'post_tempo_phase' && decision.adjustment !== 0
    ));
    const cumulativePostTempoAdjustment = result.decisions
      .filter((decision) => postTempoDecision && decision.endIndex <= postTempoDecision.endIndex)
      .reduce((total, decision) => total + decision.adjustment, 0);
    const solvedPostCounts = countStartModulos(result.gridData.chords, 4, 40);

    expect(originalPostCounts[3]).toBeGreaterThanOrEqual(8);
    expect(originalPostCounts[0]).toBe(0);
    expect(postTempoDecision?.adjustment).toBeLessThan(0);
    expect(cumulativePostTempoAdjustment % 4).toBe(-3);
    expect(solvedPostCounts[0]).toBeGreaterThanOrEqual(8);
    expect(solvedPostCounts[0]).toBeGreaterThan(solvedPostCounts[1]);
    expect(result.gridData.beats.every((beat) => typeof beat === 'number')).toBe(true);
  });

  it('accepts post-tempo half-measure phrases where beat 3 remains a common chord-start position', () => {
    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = [];

    [
      'A:maj', 'D:maj', 'E:maj', 'F#:min',
      'B:min', 'E:7', 'A:maj', 'D:maj',
    ].forEach((chord) => appendRun(chords, chord, 4));
    appendRun(chords, 'A:maj/E', 6);
    appendRun(chords, 'D:maj', 1);
    [
      'E:7', 'C#:min7', 'F#:min7', 'B:min7',
      'E:7', 'F#:min7', 'E:min7', 'A:7',
      'Eb:hdim7', 'D:hdim7', 'C#:min7', 'F#:min7',
      'G:maj', 'D:maj/F#', 'E:maj', 'A:maj/E',
      'C#:min7',
    ].forEach((chord) => appendRun(chords, chord, 2));

    const beatDurations = [
      ...Array(38).fill(0.5),
      ...Array(chords.length - 38).fill(0.9),
    ];
    const beats = chords.map((_, index) => (
      index === 0
        ? 0
        : beatDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0)
    ));
    const originalPostCounts = countStartModulos(chords, 4, 39);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });
    const postTempoDecision = result.decisions.find((decision) => (
      decision.source === 'post_tempo_phase' && decision.adjustment !== 0
    ));
    const cumulativePostTempoAdjustment = result.decisions
      .filter((decision) => postTempoDecision && decision.endIndex <= postTempoDecision.endIndex)
      .reduce((total, decision) => total + decision.adjustment, 0);
    const firstPostTempoIndex = result.gridData.chords.findIndex((chord, index) => (
      index >= 30 &&
      chord === 'E:7' &&
      result.gridData.chords[index - 1] === 'D:maj'
    ));
    const solvedPostCounts = countStartModulos(result.gridData.chords, 4, firstPostTempoIndex);

    expect(originalPostCounts[0]).toBe(0);
    expect(originalPostCounts[1] + originalPostCounts[3]).toBeGreaterThanOrEqual(14);
    expect(postTempoDecision?.adjustment).toBeLessThan(0);
    expect(cumulativePostTempoAdjustment % 4).toBe(-3);
    expect(firstPostTempoIndex % 4).toBe(0);
    expect(solvedPostCounts[0]).toBeGreaterThan(solvedPostCounts[2]);
    expect(solvedPostCounts[0]).toBeGreaterThan(solvedPostCounts[1]);
    expect(result.gridData.originalAudioMapping).toHaveLength(chords.length);
  });

  it('can repair an opening phase drift and restore a later raw-aligned phrase', () => {
    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = ['N/C'];

    [
      'A:maj/F#', 'E:maj/F#', 'B:min7', 'A:maj',
      'B:min7/A', 'C#:7', 'G:maj/E',
    ].forEach((chord) => appendRun(chords, chord, 4));
    appendRun(chords, 'E:sus4', 7);
    [
      'D:maj', 'B:min7', 'F#:min7', 'E:7',
      'A:maj/C#', 'G:maj', 'E:maj/G#', 'F#:min',
    ].forEach((chord) => appendRun(chords, chord, 4));

    const beats = chords.map((_, index) => index * 0.5);
    const originalOpeningCounts = countStartModulos(chords, 4, 1, 36);
    const originalLaterCounts = countStartModulos(chords, 4, 36);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
    });
    const leadingDecision = result.decisions.find((decision) => decision.source === 'leading_silence');
    const anchorDecision = result.decisions.find((decision) => decision.source === 'phase_anchor');
    const firstOpeningIndex = result.gridData.chords.indexOf('A:maj/F#');
    const laterStartIndex = result.gridData.chords.indexOf('D:maj');
    const solvedOpeningCounts = countStartModulos(result.gridData.chords, 4, firstOpeningIndex, laterStartIndex);
    const solvedLaterCounts = countStartModulos(result.gridData.chords, 4, laterStartIndex);

    expect(originalOpeningCounts[1]).toBeGreaterThanOrEqual(8);
    expect(originalOpeningCounts[0]).toBe(0);
    expect(originalLaterCounts[0]).toBeGreaterThanOrEqual(8);
    expect(leadingDecision?.adjustment).toBe(3);
    expect(anchorDecision?.adjustment).toBe(-3);
    expect(solvedOpeningCounts[0]).toBeGreaterThanOrEqual(8);
    expect(solvedLaterCounts[0]).toBeGreaterThanOrEqual(8);
    expect(result.gridData.originalAudioMapping).toHaveLength(chords.length);
  });

  it('uses long leading silence shrink plus contextual phrase shrink for a delayed opening phrase', () => {
    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = ['', '', 'N.C.', ...Array(51).fill('N/C')];

    [
      ['A:maj', 7],
      ['C#:maj', 4],
      ['F#:min', 4],
      ['B:sus4', 2],
      ['B:min', 2],
      ['A:maj/3', 5],
      ['A:maj/5', 3],
      ['E:sus4', 4],
      ['A:maj', 16],
      ['E:maj', 3],
      ['A:maj/E', 5],
      ['A:7', 8],
    ].forEach(([chord, beats]) => appendRun(chords, chord as string, beats as number));

    const beats = chords.map((_, index) => index * 0.5);
    const result = runSegmentAlignmentSolver({
      chordGridData: makeMappedGrid(chords, beats, {
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: 3,
      }),
      chordIntervals: [],
      beatTimes: beats,
      timeSignature: 4,
      beatDuration: 0.5,
      enabled: true,
      suppressLeadingSilenceExpansion: true,
    });
    const leadingDecision = result.decisions.find((decision) => decision.source === 'leading_silence');
    const phraseDecision = result.decisions.find((decision) => decision.source === 'phrase_phase');
    const firstStarts = result.gridData.chords
      .map((chord, index) => ({ chord, index }))
      .filter(({ chord, index }) => (
        chord &&
        chord !== 'N.C.' &&
        chord !== 'N/C' &&
        (index === 0 || result.gridData.chords[index - 1] !== chord)
      ))
      .slice(0, 6)
      .map(({ index }) => index);
    const firstPhraseCounts = countStartModulos(result.gridData.chords, 4, 52, 112);

    expect(leadingDecision?.adjustment).toBe(-2);
    expect(phraseDecision?.adjustment).toBe(-3);
    expect(firstStarts).toEqual([52, 56, 60, 64, 66, 68]);
    expect(firstPhraseCounts[0]).toBeGreaterThan(firstPhraseCounts[1]);
    expect(result.gridData.originalAudioMapping).toHaveLength(chords.length);
  });
});
