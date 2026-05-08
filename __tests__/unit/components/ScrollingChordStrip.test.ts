import type { ChordEvent } from '@/utils/chordToMidi';
import {
  getTimelineVisibleRange,
  getUniformTimelineBeatWidth,
  isTimelineBoxVisible,
} from '@/components/piano-visualizer/ScrollingChordStrip';

const createChordEvent = (
  startTime: number,
  endTime: number,
  beatIndex: number,
): ChordEvent => ({
  chordName: 'C',
  notes: [],
  startTime,
  endTime,
  beatIndex,
});

describe('getUniformTimelineBeatWidth', () => {
  it('preserves natural 4/4 beat widths when they are already readable', () => {
    const chordEvents = [
      createChordEvent(0, 0.5, 0),
      createChordEvent(0.5, 1, 1),
      createChordEvent(1, 1.5, 2),
    ];

    expect(getUniformTimelineBeatWidth(chordEvents, 100, 4)).toBe(50);
  });

  it('applies a wider floor for 3/4 timelines', () => {
    const chordEvents = [
      createChordEvent(0, 0.25, 0),
      createChordEvent(0.25, 0.5, 1),
      createChordEvent(0.5, 0.75, 2),
    ];

    expect(getUniformTimelineBeatWidth(chordEvents, 100, 3)).toBe(48);
  });

  it('treats 6/8 as a compound meter and widens cells more aggressively', () => {
    const chordEvents = [
      createChordEvent(0, 0.25, 0),
      createChordEvent(0.25, 0.5, 1),
      createChordEvent(0.5, 0.75, 2),
      createChordEvent(0.75, 1, 3),
    ];

    expect(getUniformTimelineBeatWidth(chordEvents, 100, 6)).toBe(72);
  });
});

describe('timeline strip virtualization helpers', () => {
  it('builds an overscanned visible range without changing timeline coordinates', () => {
    expect(getTimelineVisibleRange(1_000, 320, 64)).toEqual({
      startX: 296,
      endX: 1_896,
    });
  });

  it('keeps boxes that intersect the visible range and drops boxes outside it', () => {
    const range = { startX: 100, endX: 300 };

    expect(isTimelineBoxVisible({ x: 80, width: 25 }, range)).toBe(true);
    expect(isTimelineBoxVisible({ x: 290, width: 25 }, range)).toBe(true);
    expect(isTimelineBoxVisible({ x: 20, width: 40 }, range)).toBe(false);
    expect(isTimelineBoxVisible({ x: 320, width: 40 }, range)).toBe(false);
  });
});
