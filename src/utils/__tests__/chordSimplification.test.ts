/**
 * Comprehensive tests for chord simplification functionality
 */

import { 
  simplifyChord, 
  simplifyChordArray, 
  simplifyChordCorrections, 
  simplifySequenceCorrections,
  simplifyChordPositions,
  testChordSimplification 
} from '../chordSimplification';

describe('Chord Simplification', () => {
  describe('simplifyChord', () => {
    test('should simplify major chords correctly', () => {
      expect(simplifyChord('C')).toBe('C');
      expect(simplifyChord('C:maj')).toBe('C');
      expect(simplifyChord('Cmaj7')).toBe('C');
      expect(simplifyChord('C7')).toBe('C');
      expect(simplifyChord('Cadd9')).toBe('C');
      expect(simplifyChord('C13')).toBe('C');
      expect(simplifyChord('F#')).toBe('F♯');
      expect(simplifyChord('Bb:maj')).toBe('B♭');
    });

    test('should simplify minor chords correctly', () => {
      expect(simplifyChord('Cm')).toBe('Cm');
      expect(simplifyChord('C:min')).toBe('Cm');
      expect(simplifyChord('Dm7')).toBe('Dm');
      expect(simplifyChord('F#m')).toBe('F♯m');
      expect(simplifyChord('Bbmin')).toBe('B♭m');
      expect(simplifyChord('Am9')).toBe('Am');
    });

    test('should simplify augmented chords correctly', () => {
      expect(simplifyChord('Caug')).toBe('Caug');
      expect(simplifyChord('C+')).toBe('Caug');
      expect(simplifyChord('F#aug')).toBe('F♯aug');
      expect(simplifyChord('Bbaug7')).toBe('B♭aug');
    });

    test('should simplify diminished chords correctly', () => {
      expect(simplifyChord('Cdim')).toBe('Cdim');
      expect(simplifyChord('C°')).toBe('Cdim');
      expect(simplifyChord('Cdim7')).toBe('Cdim');
      expect(simplifyChord('Chdim7')).toBe('Cdim');
      expect(simplifyChord('F#dim')).toBe('F♯dim');
    });

    test('should simplify suspended chords correctly', () => {
      expect(simplifyChord('Csus4')).toBe('Csus');
      expect(simplifyChord('Csus2')).toBe('Csus');
      expect(simplifyChord('Csus')).toBe('Csus');
      expect(simplifyChord('F#sus4')).toBe('F♯sus');
    });

    test('should remove inversions correctly', () => {
      expect(simplifyChord('C/E')).toBe('C');
      expect(simplifyChord('Dm7/F')).toBe('Dm');
      expect(simplifyChord('F#aug/A#')).toBe('F♯aug');
      expect(simplifyChord('Csus4/G')).toBe('Csus');
    });

    test('should handle special cases', () => {
      expect(simplifyChord('N.C.')).toBe('N.C.');
      expect(simplifyChord('N/C')).toBe('N/C');
      expect(simplifyChord('N')).toBe('N');
      expect(simplifyChord('')).toBe('');
    });

    test('should handle edge cases that reveal operator precedence bug', () => {
      // Test case that would fail with the current operator precedence bug
      // These chords contain 'm' but should NOT be classified as minor
      expect(simplifyChord('Cmaj7')).toBe('C'); // Contains 'm' in 'maj' but should be major
      expect(simplifyChord('Gmaj9')).toBe('G'); // Contains 'm' in 'maj' but should be major
      expect(simplifyChord('Fmaj')).toBe('F'); // Contains 'm' in 'maj' but should be major

      // Test diminished chords to ensure they don't get misclassified
      expect(simplifyChord('F#dim')).toBe('F♯dim');
      expect(simplifyChord('Bbdim7')).toBe('B♭dim');

      // Test that actual minor chords work correctly
      expect(simplifyChord('Fm')).toBe('Fm');
      expect(simplifyChord('F#min')).toBe('F♯m');
      expect(simplifyChord('Bbmin7')).toBe('B♭m');
    });

    test('should handle the specific ChordMini bug case', () => {
      // Test the exact case from the bug report
      expect(simplifyChord('F')).toBe('F'); // Should stay F, not become F#m
      expect(simplifyChord('F#dim')).toBe('F♯dim'); // Should not become F#m#m

      // Test that F# major works correctly
      expect(simplifyChord('F#')).toBe('F♯');
      expect(simplifyChord('F#maj')).toBe('F♯');

      // Test that F# minor works correctly
      expect(simplifyChord('F#m')).toBe('F♯m');
      expect(simplifyChord('F#min')).toBe('F♯m');
    });

    test('should handle colon notation', () => {
      expect(simplifyChord('C:maj7')).toBe('C');
      expect(simplifyChord('D:min7')).toBe('Dm');
      expect(simplifyChord('F#:aug')).toBe('F♯aug');
      expect(simplifyChord('G:dim7')).toBe('Gdim');
      expect(simplifyChord('A:sus4')).toBe('Asus');
    });
  });

  describe('simplifyChordArray', () => {
    test('should simplify array of chords', () => {
      const input = ['C', 'Dm7', 'F#aug', 'Gsus4', 'Am/C'];
      const expected = ['C', 'Dm', 'F♯aug', 'Gsus', 'Am'];
      expect(simplifyChordArray(input)).toEqual(expected);
    });

    test('should handle empty array', () => {
      expect(simplifyChordArray([])).toEqual([]);
    });
  });

  describe('simplifyChordCorrections', () => {
    test('should simplify chord corrections object', () => {
      const input = {
        'Cmaj7': 'C7',
        'Dm7/F': 'Dm',
        'F#aug/A#': 'F#dim'
      };
      const expected = {
        'C': 'C',
        'Cmaj7': 'C', // Also keep original form mapping
        'Dm': 'Dm',
        'Dm7/F': 'Dm', // Also keep original form mapping
        'F♯aug': 'F♯dim',
        'F#aug/A#': 'F♯dim' // Also keep original form mapping
      };
      expect(simplifyChordCorrections(input)).toEqual(expected);
    });

    test('should handle null input', () => {
      expect(simplifyChordCorrections(null)).toBeNull();
    });

    test('should handle the ChordMini conflict case', () => {
      // Test the specific case where F should not be corrected to F#
      const input = {
        'F': 'F#' // This would be an incorrect correction for Bb major
      };
      const result = simplifyChordCorrections(input);
      expect(result).toEqual({
        'F': 'F♯' // The correction is applied, but properly simplified
      });
    });
  });

  describe('simplifySequenceCorrections', () => {
    test('should simplify sequence corrections', () => {
      const input = {
        originalSequence: ['Cmaj7', 'Dm7', 'F#aug'],
        correctedSequence: ['C7', 'Dm', 'F#dim'],
        keyAnalysis: {
          sections: [{
            startIndex: 0,
            endIndex: 2,
            key: 'C Major',
            chords: ['Cmaj7', 'Dm7', 'F#aug']
          }],
          modulations: [{
            fromKey: 'C Major',
            toKey: 'G Major',
            atIndex: 3,
            atTime: 10.5
          }]
        }
      };

      const expected = {
        originalSequence: ['C', 'Dm', 'F♯aug'],
        correctedSequence: ['C', 'Dm', 'F♯dim'],
        keyAnalysis: {
          sections: [{
            startIndex: 0,
            endIndex: 2,
            key: 'C Major',
            chords: ['C', 'Dm', 'F♯aug']
          }],
          modulations: [{
            fromKey: 'C Major',
            toKey: 'G Major',
            atIndex: 3,
            atTime: 10.5
          }]
        }
      };

      expect(simplifySequenceCorrections(input)).toEqual(expected);
    });

    test('should handle null input', () => {
      expect(simplifySequenceCorrections(null)).toBeNull();
    });
  });

  describe('simplifyChordPositions', () => {
    test('should simplify chord positions for lyrics', () => {
      const input = [
        { position: 0, chord: 'Cmaj7', time: 0.0 },
        { position: 10, chord: 'Dm7/F', time: 2.5 },
        { position: 20, chord: 'F#aug', time: 5.0 }
      ];

      const expected = [
        { position: 0, chord: 'C', time: 0.0 },
        { position: 10, chord: 'Dm', time: 2.5 },
        { position: 20, chord: 'F♯aug', time: 5.0 }
      ];

      expect(simplifyChordPositions(input)).toEqual(expected);
    });

    test('should handle empty array', () => {
      expect(simplifyChordPositions([])).toEqual([]);
    });
  });

  describe('testChordSimplification', () => {
    test('should run without errors', () => {
      // Capture console output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => testChordSimplification()).not.toThrow();

      // Restore console
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    test('should handle malformed chord names gracefully', () => {
      expect(simplifyChord('X')).toBe('X');
      expect(simplifyChord('123')).toBe('123');
      expect(simplifyChord('C#b')).toBe('C♯'); // Invalid but should not crash - returns simplified root
    });

    test('should handle very long chord names', () => {
      const longChord = 'Cmaj7add9sus4/E';
      expect(simplifyChord(longChord)).toBe('Csus'); // Function detects sus4 in the chord
    });

    test('should handle mixed case input', () => {
      expect(simplifyChord('cMAJ7')).toBe('cMAJ7'); // Function doesn't handle lowercase roots - returns as-is
      expect(simplifyChord('DmIN7')).toBe('Dm'); // This one works because D is uppercase
    });
  });
});
