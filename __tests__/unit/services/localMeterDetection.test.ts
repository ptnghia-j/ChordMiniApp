import { detectLocalMeterSegments } from '@/services/chord-analysis/localMeterDetection';

function appendHeldChord(target: string[], chord: string, beats: number) {
  target.push(...Array(beats).fill(chord));
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
});
