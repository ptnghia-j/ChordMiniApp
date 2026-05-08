import {
  getMaxTimeRangeDuration,
  getVisibleTimeRangeItems,
  isTimeRangeVisible,
} from '@/components/piano-visualizer/FallingNotesCanvas';

describe('FallingNotesCanvas visible-window helpers', () => {
  const notes = [
    { startTime: 0, endTime: 1, midi: 60 },
    { startTime: 2, endTime: 3, midi: 62 },
    { startTime: 4, endTime: 8, midi: 64 },
    { startTime: 9, endTime: 10, midi: 65 },
  ];

  it('detects intersecting time ranges inclusively', () => {
    expect(isTimeRangeVisible({ startTime: 0, endTime: 1 }, 1, 2)).toBe(true);
    expect(isTimeRangeVisible({ startTime: 3, endTime: 4 }, 1, 3)).toBe(true);
    expect(isTimeRangeVisible({ startTime: 4, endTime: 5 }, 1, 3)).toBe(false);
  });

  it('uses max duration to preserve long notes that begin before the window', () => {
    const maxDuration = getMaxTimeRangeDuration(notes);

    expect(maxDuration).toBe(4);
    expect(getVisibleTimeRangeItems(notes, 6, 7, maxDuration)).toEqual([
      { startTime: 4, endTime: 8, midi: 64 },
    ]);
  });

  it('returns only notes intersecting the requested window', () => {
    const maxDuration = getMaxTimeRangeDuration(notes);

    expect(getVisibleTimeRangeItems(notes, 2.5, 9, maxDuration)).toEqual([
      { startTime: 2, endTime: 3, midi: 62 },
      { startTime: 4, endTime: 8, midi: 64 },
      { startTime: 9, endTime: 10, midi: 65 },
    ]);
  });
});

