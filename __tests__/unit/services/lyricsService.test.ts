/**
 * Unit Tests: lyricsService
 * 
 * Tests for the lyrics service including:
 * - LRClib API integration
 * - Genius API fallback
 * - Service availability checking
 * - Lyrics parsing and synchronization
 * - Error handling
 * - Health checks
 */

import {
  searchLyricsWithFallback,
  checkLyricsServicesHealth,
  LyricsSearchParams
} from '@/services/lyrics/lyricsService';
import * as lrclibService from '@/services/lyrics/lrclibService';
import { apiService } from '@/services/api/apiService';

// Mock dependencies
jest.mock('@/services/lyrics/lrclibService');
jest.mock('@/config/firebase', () => ({
  getAppCheckTokenForApi: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/services/api/apiService', () => ({
  apiService: {
    getGeniusLyrics: jest.fn(),
  },
}));

describe('lyricsService', () => {
  let fetchSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use jest.spyOn for better cleanup
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('searchLyricsWithFallback', () => {
    describe('LRClib Primary Strategy', () => {
      it('should return LRClib results when available and synchronized', async () => {
        // Mock service availability check
        fetchSpy.mockResolvedValueOnce({ ok: true });

        // Mock LRClib response
        const mockLRCLibResponse = {
          success: true,
          has_synchronized: true,
          synchronized_lyrics: [
            { time: 0, text: 'First line' },
            { time: 5, text: 'Second line' }
          ],
          plain_lyrics: 'First line\nSecond line',
          metadata: {
            title: 'Test Song',
            artist: 'Test Artist',
            album: 'Test Album',
            duration: 180
          }
        };

        (lrclibService.searchLRCLibLyrics as jest.Mock).mockResolvedValue(mockLRCLibResponse);

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song',
          prefer_synchronized: true
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(true);
        expect(result.has_synchronized).toBe(true);
        expect(result.synchronized_lyrics).toHaveLength(2);
        expect(result.metadata.source).toBe('lrclib');
        expect(result.source).toBe('lrclib.net');
      });

      it('should skip LRClib when prefer_synchronized is false', async () => {
        // Mock Genius response
        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            lyrics: 'Plain lyrics from Genius',
            song_info: {
              title: 'Test Song',
              artist: 'Test Artist'
            }
          }
        });

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song',
          prefer_synchronized: false
        };

        const result = await searchLyricsWithFallback(params);

        expect(lrclibService.searchLRCLibLyrics).not.toHaveBeenCalled();
        expect(result.metadata.source).toBe('genius');
      });

      it('should handle LRClib service unavailability', async () => {
        // Mock LRClib throwing an error (service is down)
        (lrclibService.searchLRCLibLyrics as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        // Mock Genius fallback
        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            lyrics: 'Fallback lyrics',
            song_info: {
              title: 'Test Song',
              artist: 'Test Artist'
            }
          }
        });

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song',
          prefer_synchronized: true
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(true);
        expect(result.metadata.source).toBe('genius');
        expect(result.fallback_used).toBe(true);
      });

      it('should fallback to Genius when LRClib returns no results', async () => {
        // Mock service availability check
        fetchSpy.mockResolvedValueOnce({ ok: true });

        // Mock LRClib no results
        (lrclibService.searchLRCLibLyrics as jest.Mock).mockResolvedValue({
          success: false,
          has_synchronized: false,
          metadata: {
            title: '',
            artist: ''
          }
        });

        // Mock Genius fallback
        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            lyrics: 'Genius lyrics',
            song_info: {
              title: 'Test Song',
              artist: 'Test Artist'
            }
          }
        });

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song',
          prefer_synchronized: true
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(true);
        expect(result.metadata.source).toBe('genius');
      });
    });

    describe('Genius Fallback Strategy', () => {
      it('should return Genius results when LRClib fails', async () => {
        // Mock LRClib failure
        fetchSpy.mockResolvedValueOnce({ ok: false });

        // Mock Genius success
        const mockGeniusResponse = {
          success: true,
          data: {
            lyrics: 'Verse 1\nChorus\nVerse 2',
            song_info: {
              title: 'Test Song',
              artist: 'Test Artist',
              url: 'https://genius.com/test',
              id: 12345,
              thumbnail: 'https://example.com/thumb.jpg'
            },
            source: 'genius_api'
          }
        };

        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue(mockGeniusResponse);

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song',
          prefer_synchronized: true
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(true);
        expect(result.has_synchronized).toBe(false);
        expect(result.plain_lyrics).toBe('Verse 1\nChorus\nVerse 2');
        expect(result.metadata.source).toBe('genius');
        expect(result.metadata.genius_url).toBe('https://genius.com/test');
        expect(result.metadata.genius_id).toBe(12345);
        expect(result.fallback_used).toBe(true);
      });

      it('should handle Genius API errors', async () => {
        // Mock LRClib failure
        fetchSpy.mockResolvedValueOnce({ ok: false });

        // Mock Genius failure
        (apiService.getGeniusLyrics as jest.Mock).mockRejectedValue(
          new Error('Genius API error')
        );

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song'
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(false);
        expect(result.error).toContain('unavailable');
        expect(result.metadata.source).toBe('fallback');
      });

      it('should handle Genius returning no lyrics', async () => {
        // Mock LRClib failure
        fetchSpy.mockResolvedValueOnce({ ok: false });

        // Mock Genius no results
        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: false,
          data: null
        });

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song'
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('Search Query Parsing', () => {
      it('should use search_query when artist/title not provided', async () => {
        // Mock parseVideoTitle
        (lrclibService.parseVideoTitle as jest.Mock).mockReturnValue({
          artist: 'Parsed Artist',
          title: 'Parsed Title'
        });

        // Mock Genius response
        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            lyrics: 'Test lyrics',
            song_info: {
              title: 'Parsed Title',
              artist: 'Parsed Artist'
            }
          }
        });

        const params: LyricsSearchParams = {
          search_query: 'Parsed Artist - Parsed Title',
          prefer_synchronized: false
        };

        const result = await searchLyricsWithFallback(params);

        expect(lrclibService.parseVideoTitle).toHaveBeenCalledWith('Parsed Artist - Parsed Title');
        expect(result.success).toBe(true);
      });

      it('should prioritize artist/title over search_query', async () => {
        // Mock Genius response
        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            lyrics: 'Test lyrics',
            song_info: {
              title: 'Direct Title',
              artist: 'Direct Artist'
            }
          }
        });

        const params: LyricsSearchParams = {
          artist: 'Direct Artist',
          title: 'Direct Title',
          search_query: 'Should be ignored',
          prefer_synchronized: false
        };

        const result = await searchLyricsWithFallback(params);

        expect(lrclibService.parseVideoTitle).not.toHaveBeenCalled();
        expect(result.metadata.artist).toBe('Direct Artist');
        expect(result.metadata.title).toBe('Direct Title');
      });
    });

    describe('Error Handling', () => {
      it('should return error when all services fail', async () => {
        // Mock all services failing
        fetchSpy.mockRejectedValue(new Error('Network error'));
        (apiService.getGeniusLyrics as jest.Mock).mockRejectedValue(new Error('API error'));

        const params: LyricsSearchParams = {
          artist: 'Test Artist',
          title: 'Test Song'
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.metadata.source).toBe('fallback');
        expect(result.fallback_used).toBe(true);
      });

      it('should handle empty search parameters', async () => {
        (lrclibService.parseVideoTitle as jest.Mock).mockReturnValue({
          artist: '',
          title: ''
        });

        (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
          success: false,
          data: null
        });

        const params: LyricsSearchParams = {
          search_query: ''
        };

        const result = await searchLyricsWithFallback(params);

        expect(result.success).toBe(false);
      });
    });
  });

  describe('checkLyricsServicesHealth', () => {
    it('should return health status for all services', async () => {
      // Mock LRClib available
      fetchSpy
        .mockResolvedValueOnce({ ok: true }) // LRClib
        .mockResolvedValueOnce({ ok: true }); // Genius

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(true);
      expect(health.genius).toBe(true);
      expect(health.overall).toBe(true);
    });

    it('should handle LRClib unavailable', async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error('LRClib down')) // LRClib
        .mockResolvedValueOnce({ ok: true }); // Genius

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(false);
      expect(health.genius).toBe(true);
      expect(health.overall).toBe(true);
    });

    it('should handle Genius unavailable', async () => {
      fetchSpy
        .mockResolvedValueOnce({ ok: true }) // LRClib
        .mockRejectedValueOnce(new Error('Genius down')); // Genius

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(true);
      expect(health.genius).toBe(false);
      expect(health.overall).toBe(true);
    });

    it('should handle all services unavailable', async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error('LRClib down'))
        .mockRejectedValueOnce(new Error('Genius down'));

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(false);
      expect(health.genius).toBe(false);
      expect(health.overall).toBe(false);
    });
  });
});
