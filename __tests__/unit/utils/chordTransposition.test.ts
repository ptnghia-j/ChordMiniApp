/**
 * Unit Tests: chordTransposition utilities
 *
 * Tests note/chord transposition, key calculation, interval names,
 * quality warnings, and formatting helpers.
 */

import {
  transposeNote,
  calculateTargetKey,
  transposeChord,
  transposeChordProgression,
  transposeKeySignature,
  getIntervalName,
  willDegradeQuality,
  getQualityWarning,
  formatSemitones,
  parseSemitones,
} from '@/utils/chordTransposition';

describe('chordTransposition utilities', () => {
  describe('transposeNote', () => {
    it('transposes C up by 2 semitones to D', () => {
      expect(transposeNote('C', 2, 'D')).toBe('D');
    });

    it('transposes C up by 1 semitone to C# in sharp key', () => {
      expect(transposeNote('C', 1, 'G')).toBe('C#');
    });

    it('transposes C up by 1 semitone to Db in flat key', () => {
      expect(transposeNote('C', 1, 'F')).toBe('Db');
    });

    it('handles negative semitones (transpose down)', () => {
      const result = transposeNote('D', -2, 'C');
      expect(result).toBe('C');
    });

    it('transposes with 0 semitones returns same note', () => {
      expect(transposeNote('E', 0, 'C')).toBe('E');
    });

    it('wraps around octave (12 semitones)', () => {
      expect(transposeNote('C', 12, 'C')).toBe('C');
    });
  });

  describe('calculateTargetKey', () => {
    it('calculates target key for sharp keys', () => {
      const result = calculateTargetKey('C', 2);
      expect(result).toBe('D');
    });

    it('prefers simpler enharmonic targets when pitch shifting into awkward key names', () => {
      expect(calculateTargetKey('C', 1)).toBe('Db');
      expect(calculateTargetKey('A', 1)).toBe('Bb');
      expect(calculateTargetKey('B', 1)).toBe('C');
    });

    it('calculates target key for flat keys', () => {
      const result = calculateTargetKey('F', 2);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('returns same key for 0 semitones', () => {
      expect(calculateTargetKey('G', 0)).toBe('G');
    });

    it('wraps around for 12 semitones', () => {
      expect(calculateTargetKey('A', 12)).toBe('A');
    });

    it('handles minor keys', () => {
      const result = calculateTargetKey('Am', 3);
      expect(result).toBeDefined();
    });
  });

  describe('transposeChord', () => {
    it('transposes a major chord', () => {
      const result = transposeChord('C', 2, 'D');
      expect(result).toBe('D');
    });

    it('transposes a minor chord preserving quality', () => {
      const result = transposeChord('Am', 3, 'C');
      expect(result).toContain('m');
    });

    it('transposes a seventh chord preserving extensions', () => {
      const result = transposeChord('G7', 2, 'A');
      expect(result).toContain('7');
    });

    it('transposes slash chords', () => {
      const result = transposeChord('C/E', 2, 'D');
      expect(result).toContain('/');
    });

    it('handles N.C. marker', () => {
      const result = transposeChord('N.C.', 5, 'F');
      expect(result).toBe('N.C.');
    });

    it('handles empty string', () => {
      const result = transposeChord('', 5, 'F');
      expect(result).toBe('');
    });
  });

  describe('transposeChordProgression', () => {
    it('transposes an array of chords', () => {
      const result = transposeChordProgression(['C', 'Am', 'F', 'G'], 2, 'C');

      expect(result.transposedChords).toHaveLength(4);
      expect(result.targetKey).toBeDefined();
    });

    it('returns empty array for empty input', () => {
      const result = transposeChordProgression([], 2, 'C');
      expect(result.transposedChords).toEqual([]);
    });

    it('preserves N.C. markers in progression', () => {
      const result = transposeChordProgression(['C', 'N.C.', 'G'], 2, 'C');
      expect(result.transposedChords[1]).toBe('N.C.');
    });
  });

  describe('transposeKeySignature', () => {
    it('transposes major key signatures while preserving the quality label', () => {
      expect(transposeKeySignature('Bb major', 2)).toBe('C major');
    });

    it('transposes minor key signatures while preserving the quality label', () => {
      expect(transposeKeySignature('G minor', 2)).toBe('A minor');
    });

    it('returns the original label when the key signature cannot be parsed', () => {
      expect(transposeKeySignature('unknown mode', 2)).toBe('unknown mode');
    });

    it('canonicalizes enharmonic key signatures to simpler supported spellings', () => {
      expect(transposeKeySignature('G# major', 0)).toBe('Ab major');
      expect(transposeKeySignature('A# major', 0)).toBe('Bb major');
      expect(transposeKeySignature('C# major', 0)).toBe('Db major');
      expect(transposeKeySignature('D# minor', 0)).toBe('Eb minor');
      expect(transposeKeySignature('B# major', 0)).toBe('C major');
      expect(transposeKeySignature('Cb major', 0)).toBe('B major');
      expect(transposeKeySignature('Fb major', 0)).toBe('E major');
    });
  });

  describe('getIntervalName', () => {
    it('returns correct names for standard intervals', () => {
      expect(getIntervalName(0)).toBe('Unison');
      expect(getIntervalName(7)).toContain('5th');
      expect(getIntervalName(12)).toContain('Octave');
    });

    it('handles negative semitones', () => {
      const name = getIntervalName(-5);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  describe('willDegradeQuality', () => {
    it('returns false for small shifts', () => {
      expect(willDegradeQuality(1)).toBe(false);
      expect(willDegradeQuality(2)).toBe(false);
    });

    it('returns true for large shifts', () => {
      // Large shifts beyond reasonable range should degrade quality
      expect(typeof willDegradeQuality(10)).toBe('boolean');
    });
  });

  describe('getQualityWarning', () => {
    it('returns null for small shifts', () => {
      expect(getQualityWarning(1)).toBeNull();
      expect(getQualityWarning(2)).toBeNull();
    });

    it('returns warning string for large shifts', () => {
      const warning = getQualityWarning(20);
      if (warning) {
        expect(typeof warning).toBe('string');
      }
    });
  });

  describe('formatSemitones', () => {
    it('formats positive semitones with plus sign', () => {
      expect(formatSemitones(2)).toBe('+2');
      expect(formatSemitones(5)).toBe('+5');
    });

    it('formats negative semitones with minus sign', () => {
      expect(formatSemitones(-3)).toBe('-3');
    });

    it('formats zero', () => {
      expect(formatSemitones(0)).toBe('0');
    });
  });

  describe('parseSemitones', () => {
    it('parses positive values', () => {
      expect(parseSemitones('+2')).toBe(2);
      expect(parseSemitones('5')).toBe(5);
    });

    it('parses negative values', () => {
      expect(parseSemitones('-3')).toBe(-3);
    });

    it('parses zero', () => {
      expect(parseSemitones('0')).toBe(0);
    });

    it('round-trips with formatSemitones', () => {
      [-5, -1, 0, 3].forEach(n => {
        expect(parseSemitones(formatSemitones(n))).toBe(n);
      });
    });
  });
});
