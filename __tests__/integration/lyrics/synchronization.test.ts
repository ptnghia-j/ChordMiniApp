/**
 * Integration Tests: Lyrics Synchronization
 *
 * Tests the complete lyrics synchronization workflow including:
 * - Lyrics fetching and display (LRClib → Genius fallback)
 * - Character-level lyrics timing utilities
 * - Service health checks and fallback behavior
 * - Edge cases in timing calculations
 */

import { searchLyricsWithFallback, checkLyricsServicesHealth } from '@/services/lyrics/lyricsService';
import * as lrclibService from '@/services/lyrics/lrclibService';
import { apiService } from '@/services/api/apiService';
import {
  enhanceLyricsWithCharacterTiming,
  getActiveCharacterIndex,
  getCharacterProgress,
} from '@/utils/lyricsTimingUtils';

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

// Mock global fetch
global.fetch = jest.fn();

describe('Lyrics Synchronization Integration Tests', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('Lyrics Fetching Workflow', () => {
    it('should fetch lyrics from LRClib successfully', async () => {
      // Mock service availability
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

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

      const result = await searchLyricsWithFallback({
        artist: 'Test Artist',
        title: 'Test Song',
        prefer_synchronized: true
      });

      expect(result.success).toBe(true);
      expect(result.has_synchronized).toBe(true);
      expect(result.synchronized_lyrics).toHaveLength(2);
      expect(result.metadata.source).toBe('lrclib');
    });

    it('should fallback to Genius when LRClib fails', async () => {
      // Mock LRClib returning no results (success: false)
      (lrclibService.searchLRCLibLyrics as jest.Mock).mockResolvedValue({
        success: false,
        error: 'No lyrics found',
      });

      // Mock Genius success
      (apiService.getGeniusLyrics as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          lyrics: 'Verse 1\nChorus\nVerse 2',
          song_info: {
            title: 'Test Song',
            artist: 'Test Artist'
          }
        }
      });

      const result = await searchLyricsWithFallback({
        artist: 'Test Artist',
        title: 'Test Song',
        prefer_synchronized: true
      });

      expect(result.success).toBe(true);
      expect(result.has_synchronized).toBe(false);
      expect(result.metadata.source).toBe('genius');
      expect(result.fallback_used).toBe(true);
    });

    it('should handle complete service failure gracefully', async () => {
      // Mock LRClib throwing an error
      (lrclibService.searchLRCLibLyrics as jest.Mock).mockRejectedValue(new Error('Service down'));

      // Mock Genius also failing
      (apiService.getGeniusLyrics as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await searchLyricsWithFallback({
        artist: 'Test Artist',
        title: 'Test Song',
        prefer_synchronized: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.metadata.source).toBe('fallback');
    });
  });

  describe('Character-Level Lyrics Timing Integration', () => {
    it('should enhance lyrics and find active characters', () => {
      const lyrics = {
        lines: [
          { text: 'Hello world', startTime: 0, endTime: 2, chords: [] },
          { text: 'Second line', startTime: 2, endTime: 4, chords: [] },
        ],
      };

      const enhanced = enhanceLyricsWithCharacterTiming(lyrics);

      // First line should have character timings
      expect(enhanced.lines[0].characterTimings).toBeDefined();
      expect(enhanced.lines[0].characterTimings!.length).toBe('Hello world'.length);

      // Find active character at time 0.5 (should be within first line)
      const activeIndex = getActiveCharacterIndex(enhanced.lines[0], 0.5);
      expect(activeIndex).toBeGreaterThanOrEqual(0);

      // Get progress for that character
      const progress = getCharacterProgress(enhanced.lines[0], 0.5, activeIndex);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    it('should handle empty lyrics gracefully', () => {
      const enhanced = enhanceLyricsWithCharacterTiming({ lines: [] });
      expect(enhanced.lines).toHaveLength(0);
    });
  });

  describe('YouTube Player Time Synchronization', () => {
    it('should synchronize lyrics with YouTube time updates', () => {
      const mockLyrics = [
        { time: 0, text: 'First line' },
        { time: 5, text: 'Second line' },
        { time: 10, text: 'Third line' }
      ];

      const currentTimes = [0, 2.5, 5, 7.5, 10, 12.5];
      const expectedLines = [0, 0, 1, 1, 2, 2];

      currentTimes.forEach((time, index) => {
        const currentLineIndex = mockLyrics.findIndex((line, i) => {
          const nextLine = mockLyrics[i + 1];
          return time >= line.time && (!nextLine || time < nextLine.time);
        });

        expect(currentLineIndex).toBe(expectedLines[index]);
      });
    });

    it('should handle time updates before first lyric line', () => {
      const mockLyrics = [
        { time: 5, text: 'First line' },
        { time: 10, text: 'Second line' }
      ];

      const currentTime = 2.5;
      const currentLineIndex = mockLyrics.findIndex((line, i) => {
        const nextLine = mockLyrics[i + 1];
        return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
      });

      expect(currentLineIndex).toBe(-1);
    });

    it('should handle time updates after last lyric line', () => {
      const mockLyrics = [
        { time: 0, text: 'First line' },
        { time: 5, text: 'Second line' }
      ];

      const currentTime = 15;
      const currentLineIndex = mockLyrics.findIndex((line, i) => {
        const nextLine = mockLyrics[i + 1];
        return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
      });

      expect(currentLineIndex).toBe(1);
    });
  });

  describe('Service Health Checks', () => {
    it('should check service health correctly', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true });

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(true);
      expect(health.genius).toBe(true);
      expect(health.overall).toBe(true);
    });

    it('should report partial service availability', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('LRClib down'))
        .mockResolvedValueOnce({ ok: true });

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(false);
      expect(health.genius).toBe(true);
      expect(health.overall).toBe(true);
    });

    it('should report complete service outage', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('LRClib down'))
        .mockRejectedValueOnce(new Error('Genius down'));

      const health = await checkLyricsServicesHealth();

      expect(health.lrclib).toBe(false);
      expect(health.genius).toBe(false);
      expect(health.overall).toBe(false);
    });
  });
});
