import { buildBeatToChordSequenceMap } from '@/utils/chordFormatting';

describe('buildBeatToChordSequenceMap', () => {
  it('aligns Roman numeral mapping across enharmonic equivalents', () => {
    const map = buildBeatToChordSequenceMap(
      3,
      ['C#', 'D#', 'G#'],
      { analysis: ['IV', 'V', 'I'] },
      {
        correctedSequence: ['Db', 'Eb', 'Ab'],
      },
    );

    expect(map[0]).toBe(0);
    expect(map[1]).toBe(1);
    expect(map[2]).toBe(2);
  });
});