import {
  buildAnalyzePageUrl,
  readAnalyzeRouteParams,
  sanitizeBeatModel,
  sanitizeChordModel,
} from '@/utils/analyzeRouteUtils';
import { getSafeBeatModel, getSafeChordModel } from '@/utils/modelFiltering';

describe('analyzeRouteUtils', () => {
  describe('sanitizeBeatModel and sanitizeChordModel', () => {
    it('accept valid models and reject unsupported ones', () => {
      expect(sanitizeBeatModel('madmom')).toBe(getSafeBeatModel('madmom'));
      expect(sanitizeBeatModel('auto')).toBeNull();
      expect(sanitizeChordModel('btc-pl')).toBe(getSafeChordModel('btc-pl'));
      expect(sanitizeChordModel('unknown-model')).toBeNull();
    });
  });

  describe('readAnalyzeRouteParams', () => {
    it('reads, decodes, and sanitizes known query params', () => {
      const params = new URLSearchParams({
        title: 'My%20Song',
        duration: '123',
        channel: 'Artist%20Name',
        thumbnail: 'https%3A%2F%2Fimg.example%2Fthumb.jpg',
        beatModel: 'beat-transformer',
        chordModel: 'btc-sl',
        autoStart: '1',
      });

      expect(readAnalyzeRouteParams(params)).toEqual({
        title: 'My Song',
        duration: '123',
        channel: 'Artist Name',
        thumbnail: 'https://img.example/thumb.jpg',
        beatModel: getSafeBeatModel('beat-transformer'),
        chordModel: getSafeChordModel('btc-sl'),
        autoStart: true,
      });
    });

    it('tolerates missing params and invalid URL encoding', () => {
      const params = {
        get: (key: string) => {
          if (key === 'title') return '%E0%A4%A';
          if (key === 'autoStart') return '0';
          if (key === 'beatModel') return 'invalid';
          return null;
        },
      };

      expect(readAnalyzeRouteParams(params)).toEqual({
        title: '%E0%A4%A',
        duration: null,
        channel: null,
        thumbnail: null,
        beatModel: null,
        chordModel: null,
        autoStart: false,
      });
    });
  });

  describe('buildAnalyzePageUrl', () => {
    it('builds URLs with only the provided params', () => {
      expect(
        buildAnalyzePageUrl('abc123', {
          title: 'My Song',
          chordModel: 'btc-pl',
          autoStart: true,
        })
      ).toBe('/analyze/abc123?title=My+Song&chordModel=btc-pl&autoStart=1');
    });

    it('returns a bare path when no params are supplied', () => {
      expect(buildAnalyzePageUrl('abc123')).toBe('/analyze/abc123');
    });
  });
});
