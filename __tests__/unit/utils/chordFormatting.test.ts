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

  it('correctly maps Roman numerals when leading N.C. is skipped in shiftedChords', () => {
    const map = buildBeatToChordSequenceMap(
      8,
      ['Cm', 'Cm', 'Cm', 'Cm', 'Ab', 'Ab', 'Eb', 'Eb'],
      { analysis: ['N.C.', 'i', 'VI', 'III'] },
      {
        correctedSequence: ['N.C.', 'Cm', 'Ab', 'Eb'],
      },
    );

    expect(map[0]).toBe(1); // Cm -> i
    expect(map[1]).toBe(1);
    expect(map[2]).toBe(1);
    expect(map[3]).toBe(1);
    expect(map[4]).toBe(2); // Ab -> VI
    expect(map[5]).toBe(2);
    expect(map[6]).toBe(3); // Eb -> III
    expect(map[7]).toBe(3);
  });

  it('correctly maps Roman numerals when leading N.C. is skipped and sequenceCorrections is null', () => {
    const map = buildBeatToChordSequenceMap(
      8,
      ['Cm', 'Cm', 'Cm', 'Cm', 'Ab', 'Ab', 'Eb', 'Eb'],
      { analysis: ['N.C.', 'i', 'VI', 'III'] },
      null
    );

    expect(map[0]).toBe(1); // Cm -> i
    expect(map[1]).toBe(1);
    expect(map[2]).toBe(1);
    expect(map[3]).toBe(1);
    expect(map[4]).toBe(2); // Ab -> VI
    expect(map[5]).toBe(2);
    expect(map[6]).toBe(3); // Eb -> III
    expect(map[7]).toBe(3);
  });
});