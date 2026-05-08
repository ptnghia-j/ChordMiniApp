/**
 * Unit Tests: lyricsTimingUtils
 *
 * Tests character-level timing calculation for lyrics, including
 * enhanceLyricsWithCharacterTiming, getActiveCharacterIndex, and
 * getCharacterProgress.
 */

import {
  enhanceLyricsWithCharacterTiming,
  getActiveCharacterIndex,
  getCharacterProgress,
  EnhancedLyricLine,
} from '@/utils/lyricsTimingUtils';

describe('lyricsTimingUtils', () => {
  describe('enhanceLyricsWithCharacterTiming', () => {
    it('adds character timings to lyrics lines', () => {
      const lyrics = {
        lines: [
          { text: 'Hello world', startTime: 0, endTime: 2, chords: [] },
          { text: 'Test line', startTime: 2, endTime: 4, chords: [] },
        ],
      };

      const result = enhanceLyricsWithCharacterTiming(lyrics);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].characterTimings).toBeDefined();
      expect(result.lines[0].characterTimings!.length).toBe('Hello world'.length);
    });

    it('each character has start and end times within line bounds', () => {
      const lyrics = {
        lines: [
          { text: 'Hello', startTime: 1.0, endTime: 3.0, chords: [] },
        ],
      };

      const result = enhanceLyricsWithCharacterTiming(lyrics);
      const timings = result.lines[0].characterTimings!;

      timings.forEach((timing, i) => {
        expect(timing.startTime).toBeGreaterThanOrEqual(1.0 - 0.01);
        expect(timing.endTime).toBeLessThanOrEqual(3.0 + 0.01);
        expect(timing.char).toBe('Hello'[i]);
      });
    });

    it('handles empty lyrics', () => {
      const result = enhanceLyricsWithCharacterTiming({ lines: [] });
      expect(result.lines).toHaveLength(0);
    });

    it('handles null/undefined lyrics', () => {
      const result = enhanceLyricsWithCharacterTiming(null as any);
      expect(result).toBeDefined();
    });

    it('handles lines without text', () => {
      const lyrics = {
        lines: [
          { text: '', startTime: 0, endTime: 2, chords: [] },
        ],
      };

      const result = enhanceLyricsWithCharacterTiming(lyrics);
      expect(result.lines).toHaveLength(1);
    });

    it('handles lines with zero duration', () => {
      const lyrics = {
        lines: [
          { text: 'Hello', startTime: 1.0, endTime: 1.0, chords: [] },
        ],
      };

      const result = enhanceLyricsWithCharacterTiming(lyrics);
      // Should not crash, line should be returned as-is
      expect(result.lines).toHaveLength(1);
    });
  });

  describe('getActiveCharacterIndex', () => {
    const enhancedLine: EnhancedLyricLine = {
      text: 'Hi',
      startTime: 0,
      endTime: 2,
      chords: [],
      characterTimings: [
        { char: 'H', startTime: 0, endTime: 1 },
        { char: 'i', startTime: 1, endTime: 2 },
      ],
    };

    it('returns correct index for time within first character', () => {
      expect(getActiveCharacterIndex(enhancedLine, 0.5)).toBe(0);
    });

    it('returns correct index for time within second character', () => {
      expect(getActiveCharacterIndex(enhancedLine, 1.5)).toBe(1);
    });

    it('returns -1 for time before line starts', () => {
      expect(getActiveCharacterIndex(enhancedLine, -1)).toBe(-1);
    });

    it('returns -1 when no character timings', () => {
      const line: EnhancedLyricLine = { text: 'Hi', startTime: 0, endTime: 2, chords: [] };
      expect(getActiveCharacterIndex(line, 0.5)).toBe(-1);
    });

    it('returns -1 for empty character timings', () => {
      const line: EnhancedLyricLine = {
        text: 'Hi', startTime: 0, endTime: 2, chords: [],
        characterTimings: [],
      };
      expect(getActiveCharacterIndex(line, 0.5)).toBe(-1);
    });
  });

  describe('getCharacterProgress', () => {
    const enhancedLine: EnhancedLyricLine = {
      text: 'AB',
      startTime: 0,
      endTime: 4,
      chords: [],
      characterTimings: [
        { char: 'A', startTime: 0, endTime: 2 },
        { char: 'B', startTime: 2, endTime: 4 },
      ],
    };

    it('returns 0 at character start', () => {
      expect(getCharacterProgress(enhancedLine, 0, 0)).toBe(0);
    });

    it('returns 0.5 at character midpoint', () => {
      expect(getCharacterProgress(enhancedLine, 1, 0)).toBe(0.5);
    });

    it('returns 1 at character end', () => {
      expect(getCharacterProgress(enhancedLine, 2, 0)).toBe(1);
    });

    it('clamps to [0, 1] range', () => {
      expect(getCharacterProgress(enhancedLine, -1, 0)).toBe(0);
      expect(getCharacterProgress(enhancedLine, 5, 0)).toBe(1);
    });

    it('returns 0 for invalid character index', () => {
      expect(getCharacterProgress(enhancedLine, 1, -1)).toBe(0);
      expect(getCharacterProgress(enhancedLine, 1, 5)).toBe(0);
    });

    it('returns 0 when no character timings', () => {
      const line: EnhancedLyricLine = { text: 'AB', startTime: 0, endTime: 4, chords: [] };
      expect(getCharacterProgress(line, 1, 0)).toBe(0);
    });
  });
});
