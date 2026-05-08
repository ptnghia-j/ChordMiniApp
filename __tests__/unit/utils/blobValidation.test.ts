import {
  getOffloadStorageProvider,
  parseFirebaseStorageObjectFromUrl,
  validateOffloadUrl,
} from '../../../src/utils/offloadValidation';

describe('offloadValidation URL handling', () => {
  describe('validateOffloadUrl', () => {
    it('accepts a Firebase Storage download URL', () => {
      const url = 'https://firebasestorage.googleapis.com/v0/b/chordmini-d29f9.appspot.com/o/temp%2Ftest.mp3?alt=media&token=abc';

      expect(validateOffloadUrl(url)).toBe(url);
    });

    it('accepts a storage.googleapis.com object URL', () => {
      const url = 'https://storage.googleapis.com/chordmini-d29f9.appspot.com/temp/test.mp3';

      expect(validateOffloadUrl(url)).toBe(url);
    });

    it('rejects non-https URLs', () => {
      expect(() => validateOffloadUrl('http://storage.googleapis.com/chordmini-d29f9.appspot.com/temp/test.mp3'))
        .toThrow('Invalid storage URL format');
    });

    it('rejects unsupported hosts', () => {
      expect(() => validateOffloadUrl('https://example.com/audio.mp3'))
        .toThrow('Invalid storage URL format');
    });

    it('rejects missing values', () => {
      expect(() => validateOffloadUrl('')).toThrow('No storage URL provided');
      expect(() => validateOffloadUrl(null)).toThrow('No storage URL provided');
    });
  });

  describe('getOffloadStorageProvider', () => {
    it('detects Firebase provider', () => {
      expect(getOffloadStorageProvider('https://firebasestorage.googleapis.com/v0/b/chordmini-d29f9.appspot.com/o/temp%2Ftest.mp3?alt=media'))
        .toBe('firebase');
    });

    it('returns null for unsupported provider', () => {
      expect(getOffloadStorageProvider('https://example.com/file.mp3')).toBeNull();
    });
  });

  describe('parseFirebaseStorageObjectFromUrl', () => {
    it('parses firebasestorage.googleapis.com URLs', () => {
      const parsed = parseFirebaseStorageObjectFromUrl(
        'https://firebasestorage.googleapis.com/v0/b/chordmini-d29f9.appspot.com/o/temp%2F123-test.mp3?alt=media&token=abc',
      );

      expect(parsed).toEqual({
        bucket: 'chordmini-d29f9.appspot.com',
        objectPath: 'temp/123-test.mp3',
      });
    });

    it('parses storage.googleapis.com URLs', () => {
      const parsed = parseFirebaseStorageObjectFromUrl(
        'https://storage.googleapis.com/chordmini-d29f9.appspot.com/temp/123-test.mp3',
      );

      expect(parsed).toEqual({
        bucket: 'chordmini-d29f9.appspot.com',
        objectPath: 'temp/123-test.mp3',
      });
    });

    it('returns null for invalid Firebase URL shape', () => {
      const parsed = parseFirebaseStorageObjectFromUrl(
        'https://firebasestorage.googleapis.com/v0/b/chordmini-d29f9.appspot.com/o/',
      );

      expect(parsed).toBeNull();
    });

    it('returns null for non-Firebase hosts', () => {
      const parsed = parseFirebaseStorageObjectFromUrl('https://example.com/file.mp3');

      expect(parsed).toBeNull();
    });
  });
});
