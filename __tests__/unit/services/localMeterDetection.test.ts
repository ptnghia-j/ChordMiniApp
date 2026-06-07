import { detectLocalMeterSegments } from '@/services/chord-analysis/localMeterDetection';

function appendHeldChord(target: string[], chord: string, beats: number) {
  target.push(...Array(beats).fill(chord));
}

function appendChordRuns(target: string[], runs: Array<[string, number]>) {
  runs.forEach(([chord, beats]) => appendHeldChord(target, chord, beats));
}

describe('local meter detection', () => {
  it('detects a local 3/4 opening that changes into 4/4', () => {
    const chords: string[] = [];

    ['A', 'Bm', 'C#', 'F#m', 'D', 'E', 'A', 'D'].forEach((chord) => {
      appendHeldChord(chords, chord, 3);
    });
    ['D', 'E', 'F#m', 'A', 'Bm', 'E', 'A', 'F#m'].forEach((chord) => {
      appendHeldChord(chords, chord, 4);
    });

    const segments = detectLocalMeterSegments(chords, 3);

    expect(segments.map((segment) => segment.beatsPerMeasure)).toEqual([3, 4]);
    expect(segments[0]).toEqual(expect.objectContaining({ startIndex: 0, endIndex: 24 }));
    expect(segments[1]).toEqual(expect.objectContaining({ startIndex: 24, endIndex: chords.length }));
  });

  it('keeps a steady 4/4 grid on the legacy single-meter rendering path', () => {
    const chords: string[] = [];

    ['C', 'G', 'Am', 'F', 'Dm', 'G', 'C', 'C'].forEach((chord) => {
      appendHeldChord(chords, chord, 4);
    });

    expect(detectLocalMeterSegments(chords, 4)).toEqual([]);
  });

  it('does not override trusted 4/4 with a whole-song 3/4 reinterpretation', () => {
    const chords: string[] = [];

    ['Db', 'Gb', 'Absus4', 'Db', 'Ab', 'Bbm7', 'Ebm7', 'Ab7'].forEach((chord) => {
      appendHeldChord(chords, chord, 3);
    });

    expect(detectLocalMeterSegments(chords, 4)).toEqual([]);
  });

  it('detects a whole-song 5-beat meter when the global meter is stale 4/4', () => {
    const chords: string[] = [];

    ['C', 'Em', 'F', 'G', 'Am', 'F', 'Dm', 'G'].forEach((chord) => {
      appendHeldChord(chords, chord, 5);
    });

    const segments = detectLocalMeterSegments(chords, 4);

    expect(segments).toEqual([
      expect.objectContaining({
        startIndex: 0,
        endIndex: chords.length,
        beatsPerMeasure: 5,
      }),
    ]);
  });

  it('detects a whole-song 7-beat meter when the global meter is stale 4/4', () => {
    const chords: string[] = [];

    ['Dm', 'Bb', 'F', 'C', 'Gm', 'A', 'Dm', 'C'].forEach((chord) => {
      appendHeldChord(chords, chord, 7);
    });

    const segments = detectLocalMeterSegments(chords, 4);

    expect(segments).toEqual([
      expect.objectContaining({
        startIndex: 0,
        endIndex: chords.length,
        beatsPerMeasure: 7,
      }),
    ]);
  });

  it('keeps a global 4/4 grid when dense chord fragmentation mimics local 3/4', () => {
    const chords: string[] = [];

    appendChordRuns(chords, [
      ['A', 2], ['D', 1], ['E', 3], ['A/3', 1], ['D', 2], ['A/5', 1],
      ['E', 1], ['A/3', 2], ['D', 1], ['A/5', 1], ['E', 1], ['E/b7', 1],
      ['A/3', 1], ['D', 1], ['F#m', 2], ['Bm7', 2], ['D', 1], ['E', 1],
      ['A', 1], ['D', 1], ['E', 3], ['A', 2], ['D/5', 8], ['A', 4],
      ['D/5', 1], ['A', 6], ['E', 1], ['A', 2], ['D', 2], ['E', 6],
      ['A', 2], ['D', 1], ['E', 2], ['F#m', 3], ['D', 2], ['C#', 1],
      ['F#m', 2], ['D', 2], ['Esus4', 2], ['E', 9], ['A', 6], ['D/5', 5],
    ]);

    expect(detectLocalMeterSegments(chords, 4)).toEqual([
      expect.objectContaining({
        startIndex: 0,
        endIndex: 64,
        beatsPerMeasure: 4,
      }),
      expect.objectContaining({
        startIndex: 64,
        endIndex: chords.length,
        beatsPerMeasure: 3,
      }),
    ]);
  });

  it('keeps mostly 4/4 material stable when short non-global islands have weak local evidence', () => {
    const chords: string[] = [];

    appendChordRuns(chords, [
      ['A', 4], ['Bm', 4], ['A/3', 4], ['A/4', 4], ['D/3', 4], ['A', 3],
      ['D', 3], ['A/4', 2], ['D/6', 2], ['A', 10], ['Bm', 5], ['A/3', 3],
      ['D', 6], ['F#m', 2], ['E', 4], ['D', 8], ['A', 4], ['Bm', 4],
      ['A/3', 4], ['D', 4], ['D/3', 4], ['E', 4], ['D', 8], ['A', 4],
      ['Bm', 4], ['A/3', 4], ['D', 9], ['D/3', 3], ['E', 4], ['D', 8],
      ['A', 4], ['Bm', 4], ['A/3', 4], ['D', 5], ['A', 2], ['Esus4', 6],
      ['D/2', 4], ['Esus4', 3], ['A', 4], ['F#m', 8], ['D', 2],
      ['E/b7', 5], ['A', 10], ['F#m', 14], ['E', 2], ['D', 8],
    ]);

    expect(detectLocalMeterSegments(chords, 4)).toEqual([]);
  });
});
