import {
  getLyricColorChangePosition,
  getSegmentWordRanges,
  interpolateRgbColor,
  parseHexColor,
} from '@/components/lyrics/LyricLine';

describe('LyricLine helper functions', () => {
  it('uses active character timing when available', () => {
    expect(getLyricColorChangePosition({
      currentTime: 1.25,
      lineStartTime: 0,
      lineEndTime: 4,
      textLength: 8,
      characterTimings: [
        { startTime: 0, endTime: 1 },
        { startTime: 1, endTime: 2 },
        { startTime: 2, endTime: 3 },
      ],
    })).toEqual({
      colorChangePosition: 1,
      lineProgress: 0.3125,
    });
  });

  it('falls back to line progress when no active character timing matches', () => {
    expect(getLyricColorChangePosition({
      currentTime: 2,
      lineStartTime: 0,
      lineEndTime: 4,
      textLength: 8,
      characterTimings: [],
    })).toEqual({
      colorChangePosition: 4,
      lineProgress: 0.5,
    });
  });

  it('pre-parses and interpolates lyric colors', () => {
    expect(parseHexColor('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    expect(interpolateRgbColor(
      parseHexColor('#000000'),
      parseHexColor('#ffffff'),
      0.5,
      '#ffffff',
    )).toBe('rgb(128, 128, 128)');
  });

  it('builds word ranges for single and spaced segments', () => {
    expect(getSegmentWordRanges('hello')).toEqual([
      { start: 0, end: 4, text: 'hello' },
    ]);
    expect(getSegmentWordRanges('hi there')).toEqual([
      { start: 0, end: 1, text: 'hi' },
      { start: 3, end: 7, text: 'there' },
    ]);
  });
});

