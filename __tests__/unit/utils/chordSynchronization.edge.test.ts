import { synchronizeChords } from '@/utils/chordSynchronization';

describe('chordSynchronization edge behavior', () => {
  it('keeps output aligned one-for-one with irregular beat inputs', () => {
    const beats = [
      { time: 0, strength: 0.8 },
      { time: 0.7, strength: 0.8 },
      { time: 1.9, strength: 0.8 },
      { time: 2.4, strength: 0.8 },
      { time: 4.0, strength: 0.8 },
    ] as any;

    const result = synchronizeChords(
      [
        { start: 0.1, end: 0.5, chord: 'C' },
        { start: 2.2, end: 2.8, chord: 'F' },
        { start: 3.7, end: 4.2, chord: 'G' },
      ] as any,
      beats
    );

    expect(result).toHaveLength(beats.length);
    expect(result.map((entry) => entry.beatIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(result.map((entry) => entry.chord)).toEqual(['C', 'C', 'C', 'F', 'G']);
  });

  it('lets the later onset win when multiple chord detections map to the same beat', () => {
    const result = synchronizeChords(
      [
        { start: 0.05, end: 0.4, chord: 'C' },
        { start: 0.20, end: 0.7, chord: 'Dm' },
      ] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'Dm', beatIndex: 0 },
      { chord: 'Dm', beatIndex: 1 },
      { chord: 'Dm', beatIndex: 2 },
    ]);
  });

  it('forward-fills no-chord context until a later musical onset is reached', () => {
    const result = synchronizeChords(
      [
        { start: 0.1, end: 0.6, chord: 'N' },
        { start: 2.1, end: 3.0, chord: 'Am' },
      ] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }, { time: 3 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'N/C', beatIndex: 1 },
      { chord: 'Am', beatIndex: 2 },
      { chord: 'Am', beatIndex: 3 },
    ]);
  });

  it('never emits duplicate or decreasing beat indices for dense chord detections', () => {
    const beats = Array.from({ length: 8 }, (_, index) => ({ time: index * 0.5, strength: 0.8 }));
    const chords = [
      { start: 0.05, end: 0.25, chord: 'C' },
      { start: 0.20, end: 0.45, chord: 'G' },
      { start: 0.80, end: 1.10, chord: 'Am' },
      { start: 1.74, end: 2.05, chord: 'F' },
      { start: 3.20, end: 3.50, chord: 'C' },
    ];

    const result = synchronizeChords(chords as any, beats as any);

    expect(result.map((entry) => entry.beatIndex)).toEqual(beats.map((_, index) => index));
    result.forEach((entry, index) => {
      expect(entry.beatIndex).toBe(index);
      expect(typeof entry.chord).toBe('string');
    });
  });
});
