import {
  buildChordOccurrenceCorrectionMap,
  buildChordOccurrenceMap,
  buildChordSequenceIndexMap,
  getDisplayChord,
  normalizeChord,
  type SequenceCorrections,
} from '@/utils/chordProcessing';

describe('chordProcessing correction mapping', () => {
  it('normalizes equivalent chord spellings for comparison', () => {
    expect(normalizeChord('Bb:min')).toBe('Bb:min');
    expect(normalizeChord('Bbm')).toBe('Bb:min');
    expect(normalizeChord('Db:maj')).toBe('Db');
    expect(normalizeChord('Db')).toBe('Db');
    expect(normalizeChord('N.C.')).toBe('N');
  });

  it('treats rests as separators for repeated chord occurrences', () => {
    expect(buildChordOccurrenceMap(['B', 'B', 'N', 'B', 'B'])).toEqual([1, 1, 0, 2, 2]);
  });

  it('keeps authoritative sequence indices aligned when no-chord groups are present', () => {
    expect(buildChordSequenceIndexMap(['C', 'C', 'N.C.', 'Bb', 'Bb', 'Eb'])).toEqual([0, 0, -1, 2, 2, 3]);
  });

  it('aligns visible groups to the authoritative sequence when cached sequence contains an extra hidden group', () => {
    expect(
      buildChordSequenceIndexMap(
        ['C#', 'Eb:maj/3', 'Ab'],
        ['N', 'C#', 'Eb', 'Eb:maj/3', 'Ab']
      )
    ).toEqual([1, 3, 4]);
  });

  it('uses the aligned sequence index when an extra cached group is missing from the visible grid', () => {
    const sequenceCorrections: SequenceCorrections = {
      originalSequence: ['N', 'C#', 'Eb', 'Eb:maj/3', 'Ab'],
      correctedSequence: ['N', 'Db', 'Eb', 'Eb:maj/3', 'Ab'],
    };

    const shiftedChords = ['C#', 'Eb:maj/3', 'Ab'];
    const occurrenceMap = buildChordOccurrenceMap(shiftedChords);
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections);
    const sequenceIndexMap = buildChordSequenceIndexMap(shiftedChords, sequenceCorrections.originalSequence);

    expect(getDisplayChord('Eb:maj/3', 1, false, sequenceCorrections, occurrenceMap, correctionMap, sequenceIndexMap)).toEqual({
      chord: 'Eb:maj/3',
      wasCorrected: false,
    });

    expect(getDisplayChord('Eb:maj/3', 1, true, sequenceCorrections, occurrenceMap, correctionMap, sequenceIndexMap)).toEqual({
      chord: 'Eb:maj/3',
      wasCorrected: false,
    });
  });

  it('matches corrections even when original sequence uses different notation', () => {
    const sequenceCorrections: SequenceCorrections = {
      originalSequence: ['Bb:min', 'Bb:min', 'Db:maj', 'Db:maj'],
      correctedSequence: ['A#m', 'A#m', 'C#', 'C#'],
    };

    const occurrenceMap = buildChordOccurrenceMap(['Bbm', 'Bbm', 'Db', 'Db']);
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections);

    expect(getDisplayChord('Bbm', 0, true, sequenceCorrections, occurrenceMap, correctionMap)).toEqual({
      chord: 'A#m',
      wasCorrected: true,
    });

    expect(getDisplayChord('Db', 2, true, sequenceCorrections, occurrenceMap, correctionMap)).toEqual({
      chord: 'C#',
      wasCorrected: true,
    });
  });

  it('matches later occurrences after a no-chord separator', () => {
    const sequenceCorrections: SequenceCorrections = {
      originalSequence: ['B', 'B', 'N', 'B', 'B'],
      correctedSequence: ['B', 'B', 'N', 'Cb', 'Cb'],
    };

    const shiftedChords = ['B', 'B', 'N.C.', 'B', 'B'];
    const occurrenceMap = buildChordOccurrenceMap(shiftedChords);
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections);

    expect(getDisplayChord('B', 3, true, sequenceCorrections, occurrenceMap, correctionMap)).toEqual({
      chord: 'Cb',
      wasCorrected: true,
    });
  });

  it('matches enharmonic equivalents between grid chords and corrected sequence', () => {
    const sequenceCorrections: SequenceCorrections = {
      originalSequence: ['Db', 'Eb', 'Ab'],
      correctedSequence: ['Db', 'Eb', 'Ab'],
    };

    const occurrenceMap = buildChordOccurrenceMap(['C#', 'D#', 'G#']);
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections);

    expect(getDisplayChord('C#', 0, true, sequenceCorrections, occurrenceMap, correctionMap)).toEqual({
      chord: 'Db',
      wasCorrected: true,
    });

    expect(getDisplayChord('D#', 1, true, sequenceCorrections, occurrenceMap, correctionMap)).toEqual({
      chord: 'Eb',
      wasCorrected: true,
    });

    expect(getDisplayChord('G#', 2, true, sequenceCorrections, occurrenceMap, correctionMap)).toEqual({
      chord: 'Ab',
      wasCorrected: true,
    });
  });

  it('uses sequence order as the source of truth for original vs corrected toggles', () => {
    const sequenceCorrections: SequenceCorrections = {
      originalSequence: ['C#', 'F#', 'G#'],
      correctedSequence: ['Db', 'Gb', 'Ab'],
    };

    const cachedGridChords = ['Db', 'Gb', 'Ab'];
    const occurrenceMap = buildChordOccurrenceMap(cachedGridChords);
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections);
    const sequenceIndexMap = buildChordSequenceIndexMap(cachedGridChords, sequenceCorrections.originalSequence);

    expect(getDisplayChord('Db', 0, false, sequenceCorrections, occurrenceMap, correctionMap, sequenceIndexMap)).toEqual({
      chord: 'Db',
      wasCorrected: false,
    });

    expect(getDisplayChord('Db', 0, true, sequenceCorrections, occurrenceMap, correctionMap, sequenceIndexMap)).toEqual({
      chord: 'Db',
      wasCorrected: true,
    });
  });

  it('does not drift corrected chord alignment after leading no-chord markers', () => {
    const sequenceCorrections: SequenceCorrections = {
      originalSequence: ['N', 'Eb:min7', 'Bb:maj/3', 'Eb:maj'],
      correctedSequence: ['N', 'Eb:min7', 'Bb:maj/3', 'Eb:maj'],
    };

    const shiftedChords = ['Eb:min7', 'Bb:maj/3', 'Eb:maj'];
    const occurrenceMap = buildChordOccurrenceMap(shiftedChords);
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections);
    const sequenceIndexMap = buildChordSequenceIndexMap(shiftedChords, sequenceCorrections.originalSequence);

    expect(getDisplayChord('Bb:maj/3', 1, false, sequenceCorrections, occurrenceMap, correctionMap, sequenceIndexMap)).toEqual({
      chord: 'Bb:maj/3',
      wasCorrected: false,
    });
  });
});