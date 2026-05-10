jest.mock('@/config/firebase', () => ({
  getAppCheckTokenForApi: jest.fn().mockResolvedValue(null),
}));

import {
  estimateSegmentationDurationSeconds,
  getSegmentationPollingStrategy,
} from '@/services/api/segmentationAsyncService';

describe('SegmentationAsyncService polling strategy', () => {
  it('waits at least 5 minutes before the first poll for 4-minute songs', () => {
    const strategy = getSegmentationPollingStrategy({ duration: 240 });

    expect(strategy.initialDelayMs).toBe(300_000);
    expect(strategy.pollIntervalMs).toBe(15_000);
    expect(strategy.maxPollAttempts).toBe(40);
  });

  it('waits about 6 minutes before the first poll for 5-minute songs', () => {
    const strategy = getSegmentationPollingStrategy({ duration: 300 });

    expect(strategy.initialDelayMs).toBe(360_000);
    expect(strategy.pollIntervalMs).toBe(15_000);
  });

  it('uses a shorter initial wait for shorter songs', () => {
    const strategy = getSegmentationPollingStrategy({ duration: 95 });

    expect(strategy.initialDelayMs).toBe(30_000);
    expect(strategy.pollIntervalMs).toBe(7_500);
    expect(strategy.maxPollAttempts).toBe(80);
  });

  it('polls reused long-song jobs sooner because they may already be in progress', () => {
    const strategy = getSegmentationPollingStrategy({ duration: 260 }, { reused: true });

    expect(strategy.initialDelayMs).toBe(15_000);
    expect(strategy.pollIntervalMs).toBe(15_000);
    expect(strategy.maxPollAttempts).toBe(48);
  });

  it('falls back to the last beat time when explicit song duration is unavailable', () => {
    expect(estimateSegmentationDurationSeconds({
      beats: [
        { time: 12, strength: 0.9 },
        { time: 187, strength: 0.8 },
      ],
    })).toBe(187);
  });
});
