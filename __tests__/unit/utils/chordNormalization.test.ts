import { normalizeChordForDedup } from '@/utils/chordNormalization';

describe('chordNormalization', () => {
  describe('normalizeChordForDedup', () => {
    it('strips major quality in Harte notation', () => {
      expect(normalizeChordForDedup('B:maj')).toBe('B');
      expect(normalizeChordForDedup('B:major')).toBe('B');
    });

    it('strips major quality in non-colon notation', () => {
      expect(normalizeChordForDedup('Bmaj')).toBe('B');
      expect(normalizeChordForDedup('Bmajor')).toBe('B');
    });

    it('preserves slash-chord bass notes while normalizing the main chord', () => {
      expect(normalizeChordForDedup('B:maj/3')).toBe('B/3');
      expect(normalizeChordForDedup('Fmajor/A')).toBe('F/A');
    });

    it('preserves non-major qualities and invalid/lowercase inputs', () => {
      expect(normalizeChordForDedup('Bm')).toBe('Bm');
      expect(normalizeChordForDedup('cmaj')).toBe('cmaj');
    });

    it('strips trailing colons and passes through empty values', () => {
      expect(normalizeChordForDedup('B:')).toBe('B');
      expect(normalizeChordForDedup('')).toBe('');
      expect(normalizeChordForDedup(undefined as unknown as string)).toBeUndefined();
      expect(normalizeChordForDedup(null as unknown as string)).toBeNull();
    });
  });
});
