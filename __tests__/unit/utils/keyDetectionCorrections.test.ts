import {
  isValidEnharmonicChordCorrection,
  sanitizeLegacyCorrections,
  sanitizeSequenceCorrections,
} from '@/utils/keyDetectionCorrections';

describe('keyDetectionCorrections', () => {
  describe('isValidEnharmonicChordCorrection', () => {
    it('accepts same-pitch respellings for roots and slash basses', () => {
      expect(isValidEnharmonicChordCorrection('Fm', 'E#m')).toBe(true);
      expect(isValidEnharmonicChordCorrection('D/F#', 'D/Gb')).toBe(true);
      expect(isValidEnharmonicChordCorrection('A/B', 'A/Cb')).toBe(true);
      expect(isValidEnharmonicChordCorrection('F#:maj/3', 'Gb:maj/3')).toBe(true);
    });

    it('rejects harmonic rewrites that change bass or chord quality', () => {
      expect(isValidEnharmonicChordCorrection('A/B', 'A/C#')).toBe(false);
      expect(isValidEnharmonicChordCorrection('C', 'Cm')).toBe(false);
      expect(isValidEnharmonicChordCorrection('F#7', 'F7')).toBe(false);
      expect(isValidEnharmonicChordCorrection('F#:maj/3', 'Gb:maj/Bb')).toBe(false);
    });
  });

  describe('sanitizeLegacyCorrections', () => {
    it('keeps only enharmonic-safe corrections for requested chords', () => {
      expect(sanitizeLegacyCorrections(['Fm', 'A/B'], {
        Fm: 'E#m',
        'A/B': 'A/C#',
        Bb: 'A#',
      })).toEqual({ Fm: 'E#m' });
    });
  });

  describe('sanitizeSequenceCorrections', () => {
    it('forces originalSequence to match the request and drops invalid rewrites', () => {
      const sanitized = sanitizeSequenceCorrections(['Fm', 'A/B', 'D/F#'], {
        originalSequence: ['wrong', 'sequence'],
        correctedSequence: ['E#m', 'A/C#', 'D/Gb'],
        keyAnalysis: {
          sections: [{ startIndex: 0, endIndex: 2, key: 'G# major', chords: ['bad'] }],
          modulations: [{ atIndex: 1, fromKey: 'E major', toKey: 'B major' }],
        },
      });

      expect(sanitized.originalSequence).toEqual(['Fm', 'A/B', 'D/F#']);
      expect(sanitized.correctedSequence).toEqual(['E#m', 'A/B', 'D/Gb']);
      expect(sanitized.keyAnalysis?.sections[0]?.chords).toEqual(['E#m', 'A/B', 'D/Gb']);
      expect(sanitized.keyAnalysis?.modulations?.[0]?.atIndex).toBe(1);
    });

    it('keeps slash-degree respellings and drops slash-note rewrites for slash-degree inputs', () => {
      const sanitized = sanitizeSequenceCorrections(['F#:maj/3', 'C#:7/b7'], {
        correctedSequence: ['Gb:maj/3', 'Db:7/B'],
      });

      expect(sanitized.correctedSequence).toEqual(['Gb:maj/3', 'C#:7/b7']);
    });
  });
});
