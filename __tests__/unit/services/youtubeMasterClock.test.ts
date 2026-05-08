/**
 * Unit tests for youtubeMasterClock
 *
 * Covers the invariants documented in `src/services/audio/youtubeMasterClock.ts`:
 *   • anchor-on-cold-start and re-anchor hysteresis (drift + age)
 *   • counter-snap on rate change
 *   • onPlay / onPause anchor transitions
 *   • onUserSeek fires storeAdapter hooks and resets backward-step tracker
 *   • dev-only backward-step warning
 *
 * We drive the clock via `jest.spyOn(performance, 'now')` so every test has
 * deterministic control over the wall-clock axis.
 */

import { youtubeMasterClock, type MasterClockStoreAdapter } from '@/services/audio/youtubeMasterClock';

describe('youtubeMasterClock', () => {
  let nowMs: number;
  let nowSpy: jest.SpiedFunction<typeof performance.now>;

  beforeEach(() => {
    youtubeMasterClock._debugReset();
    nowMs = 1_000_000; // start at a non-zero wall time to catch "== 0" bugs
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  /** Advance the fake wall clock by `ms` milliseconds. */
  const advance = (ms: number) => {
    nowMs += ms;
  };

  describe('cold-start and anchoring', () => {
    it('seeds the anchor from the first YouTube progress report', () => {
      youtubeMasterClock.onYoutubeProgress(12.5);
      const state = youtubeMasterClock._debugGetState();
      expect(state.anchorPositionSec).toBe(12.5);
      expect(state.anchorWallSec).toBeCloseTo(nowMs / 1000, 5);
      expect(state.lastReAnchorWallSec).toBe(state.anchorWallSec);
    });

    it('ignores non-finite or negative progress reports', () => {
      youtubeMasterClock.onYoutubeProgress(Number.NaN);
      youtubeMasterClock.onYoutubeProgress(-5);
      expect(youtubeMasterClock._debugGetState().anchorWallSec).toBe(0);
    });

    it('reports the anchor position verbatim while paused (no extrapolation)', () => {
      youtubeMasterClock.onYoutubeProgress(42);
      advance(500);
      expect(youtubeMasterClock.getLivePosition()).toBe(42);
    });

    it('extrapolates forward once playing at 1×', () => {
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onPlay();
      advance(1000);
      expect(youtubeMasterClock.getLivePosition()).toBeCloseTo(11, 4);
    });

    it('extrapolates forward proportional to rate', () => {
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onRateChange(2);
      youtubeMasterClock.onPlay();
      advance(1000);
      // extrapolation is 1.0 s × 2× = 2.0 s ahead of the anchor
      expect(youtubeMasterClock.getLivePosition()).toBeCloseTo(12, 4);
    });
  });

  describe('re-anchor hysteresis', () => {
    it('does NOT re-anchor when YT progress is within drift tolerance', () => {
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onPlay();
      advance(100);
      // Expected position at t+100ms at 1× is 10.1s.
      // YT reports 10.12s — drift of 20ms, well under the 80ms tolerance.
      const anchorWallBefore = youtubeMasterClock._debugGetState().lastReAnchorWallSec;
      youtubeMasterClock.onYoutubeProgress(10.12);
      const anchorWallAfter = youtubeMasterClock._debugGetState().lastReAnchorWallSec;
      expect(anchorWallAfter).toBe(anchorWallBefore);
    });

    it('re-anchors when YT progress exceeds drift tolerance', () => {
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onPlay();
      advance(100);
      // Expected 10.1s, but YT reports 10.5s — 400ms drift, way over 80ms tolerance.
      youtubeMasterClock.onYoutubeProgress(10.5);
      const state = youtubeMasterClock._debugGetState();
      expect(state.anchorPositionSec).toBe(10.5);
      expect(state.lastReAnchorWallSec).toBeCloseTo(nowMs / 1000, 5);
    });

    it('scales drift tolerance with rate', () => {
      youtubeMasterClock.onRateChange(2);
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onPlay();
      advance(100);
      // Expected at 2×: 10 + 0.1 × 2 = 10.2. Tolerance at 2× is 0.08 × 2 = 0.16.
      // A report of 10.34 drifts 0.14 — INSIDE the rate-scaled tolerance.
      const anchorWallBefore = youtubeMasterClock._debugGetState().lastReAnchorWallSec;
      youtubeMasterClock.onYoutubeProgress(10.34);
      expect(youtubeMasterClock._debugGetState().lastReAnchorWallSec).toBe(anchorWallBefore);
    });

    it('re-anchors by age when no drift correction has fired for > 400ms', () => {
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onPlay();
      advance(500); // exceed 400ms MAX_ANCHOR_AGE_SEC
      // Expected 10.5, YT reports 10.5 — zero drift, but age alone triggers re-anchor.
      const stateBefore = youtubeMasterClock._debugGetState();
      youtubeMasterClock.onYoutubeProgress(10.5);
      const stateAfter = youtubeMasterClock._debugGetState();
      expect(stateAfter.lastReAnchorWallSec).toBeGreaterThan(stateBefore.lastReAnchorWallSec);
      expect(stateAfter.anchorPositionSec).toBe(10.5);
    });
  });

  describe('onPlay / onPause', () => {
    it('onPause freezes the live position', () => {
      youtubeMasterClock.onYoutubeProgress(20);
      youtubeMasterClock.onPlay();
      advance(200); // live would be 20.2
      youtubeMasterClock.onPause();
      const pausedAt = youtubeMasterClock.getLivePosition();
      expect(pausedAt).toBeCloseTo(20.2, 4);
      advance(5000); // five seconds of wall time pass while paused
      expect(youtubeMasterClock.getLivePosition()).toBeCloseTo(pausedAt, 4);
    });

    it('onPlay after onPause resumes from the pause position, not the original anchor', () => {
      youtubeMasterClock.onYoutubeProgress(20);
      youtubeMasterClock.onPlay();
      advance(200);
      youtubeMasterClock.onPause();
      advance(5000); // dead time during pause
      youtubeMasterClock.onPlay();
      advance(100);
      expect(youtubeMasterClock.getLivePosition()).toBeCloseTo(20.3, 4);
    });
  });

  describe('counter-snap on rate change', () => {
    it('advances the anchor at the OLD rate before switching to the new rate', () => {
      youtubeMasterClock.onYoutubeProgress(30);
      youtubeMasterClock.onPlay();
      advance(1000); // one second at 1× → live = 31.0
      youtubeMasterClock.onRateChange(2);
      const state = youtubeMasterClock._debugGetState();
      // The anchor must now be at 31.0 (where we WERE when the rate changed),
      // NOT at 30 (the original anchor). Without counter-snap, the next
      // getLivePosition() call would extrapolate 2× over a window played at 1×.
      expect(state.anchorPositionSec).toBeCloseTo(31, 4);
      advance(500);
      // After the rate change, 500ms at 2× should add 1.0s → live = 32.0
      expect(youtubeMasterClock.getLivePosition()).toBeCloseTo(32, 4);
    });

    it('rejects non-finite or non-positive rates', () => {
      youtubeMasterClock.onRateChange(1.5);
      youtubeMasterClock.onRateChange(0);
      youtubeMasterClock.onRateChange(-1);
      youtubeMasterClock.onRateChange(Number.NaN);
      expect(youtubeMasterClock.getRate()).toBe(1.5);
    });
  });

  describe('onUserSeek', () => {
    it('anchors to the target, notifies the store, and publishes currentTime', () => {
      const adapter: MasterClockStoreAdapter = {
        noteUserSeek: jest.fn(),
        setCurrentTime: jest.fn(),
      };
      youtubeMasterClock.setStoreAdapter(adapter);
      youtubeMasterClock.onYoutubeProgress(10);
      youtubeMasterClock.onPlay();
      advance(500);

      youtubeMasterClock.onUserSeek(60);

      expect(adapter.noteUserSeek).toHaveBeenCalledTimes(1);
      expect(adapter.setCurrentTime).toHaveBeenCalledWith(60);
      expect(youtubeMasterClock.getLivePosition()).toBeCloseTo(60, 4);
    });

    it('resets the backward-step guard so the next YT report does not warn', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      youtubeMasterClock.onYoutubeProgress(120);
      youtubeMasterClock.onUserSeek(10); // legitimate backward seek
      youtubeMasterClock.onYoutubeProgress(10.05); // YT catches up — NOT a jump
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('ignores non-finite or negative seek targets', () => {
      const adapter: MasterClockStoreAdapter = {
        noteUserSeek: jest.fn(),
        setCurrentTime: jest.fn(),
      };
      youtubeMasterClock.setStoreAdapter(adapter);
      youtubeMasterClock.onUserSeek(Number.NaN);
      youtubeMasterClock.onUserSeek(-1);
      expect(adapter.noteUserSeek).not.toHaveBeenCalled();
    });
  });

  describe('backward-step dev guard', () => {
    const origEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = origEnv;
    });

    it('warns in development when YT jumps backward without a user seek', () => {
      process.env.NODE_ENV = 'development';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      youtubeMasterClock.onYoutubeProgress(120);
      youtubeMasterClock.onYoutubeProgress(10); // 110s backward step, no seek
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does NOT warn for small jitter-sized backward reports', () => {
      process.env.NODE_ENV = 'development';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      youtubeMasterClock.onYoutubeProgress(120.05);
      youtubeMasterClock.onYoutubeProgress(120.0); // 50ms wobble, under 250ms threshold
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
