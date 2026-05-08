import {
  buildSearchableKeys,
  canonicalizeKeySignature,
  canonicalizeKeyRoot,
} from '@/utils/keySignatureUtils';

describe('keySignatureUtils', () => {
  describe('canonicalizeKeyRoot', () => {
    it('prefers simpler enharmonic roots for pitch-shifted keys', () => {
      expect(canonicalizeKeyRoot('G#', 'major')).toBe('Ab');
      expect(canonicalizeKeyRoot('A#', 'major')).toBe('Bb');
      expect(canonicalizeKeyRoot('C#', 'major')).toBe('Db');
      expect(canonicalizeKeyRoot('D#', 'minor')).toBe('Eb');
      expect(canonicalizeKeyRoot('B#', 'major')).toBe('C');
      expect(canonicalizeKeyRoot('Cb', 'major')).toBe('B');
      expect(canonicalizeKeyRoot('Fb', 'major')).toBe('E');
    });

    it('preserves F# and Gb major as equally valid tied spellings', () => {
      expect(canonicalizeKeyRoot('F#', 'major')).toBe('F#');
      expect(canonicalizeKeyRoot('Gb', 'major')).toBe('Gb');
    });
  });

  describe('canonicalizeKeySignature', () => {
    it('normalizes theoretical or over-sharp key signatures to supported enharmonic spellings', () => {
      expect(canonicalizeKeySignature('G# major')).toBe('Ab major');
      expect(canonicalizeKeySignature('A# minor')).toBe('Bb minor');
      expect(canonicalizeKeySignature('B# major')).toBe('C major');
      expect(canonicalizeKeySignature('Cb major')).toBe('B major');
      expect(canonicalizeKeySignature('Fb major')).toBe('E major');
      expect(canonicalizeKeySignature('D#m')).toBe('Ebm');
    });
  });

  describe('buildSearchableKeys', () => {
    it('builds enharmonic major and minor variants', () => {
      expect(buildSearchableKeys('C# major')).toEqual(['c# major', 'db major']);
      expect(buildSearchableKeys('Bb minor')).toEqual(['bb minor', 'a# minor']);
    });

    it('normalizes unicode accidentals and spacing', () => {
      expect(buildSearchableKeys('  G♭   major  ')).toEqual(['gb major', 'f# major']);
      expect(buildSearchableKeys('A♯ minor')).toEqual(['a# minor', 'bb minor']);
    });

    it('returns only the root when no quality is present', () => {
      expect(buildSearchableKeys('Db')).toEqual(['db', 'c#']);
    });

    it('includes rare enharmonic spellings for lookup fallback', () => {
      expect(buildSearchableKeys('B# major')).toEqual(['b# major', 'c major']);
      expect(buildSearchableKeys('Cb')).toEqual(['cb', 'b']);
      expect(buildSearchableKeys('Fb major')).toEqual(['fb major', 'e major']);
    });

    it('returns an empty array for empty input and the normalized raw string for unrecognized formats', () => {
      expect(buildSearchableKeys('')).toEqual([]);
      expect(buildSearchableKeys(null)).toEqual([]);
      expect(buildSearchableKeys('C lydian')).toEqual(['c lydian']);
    });
  });
});
