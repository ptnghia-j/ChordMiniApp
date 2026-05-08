/**
 * Regression tests for seek coordination (R1/R2/R3).
 *
 * Contract:
 *   - `noteUserSeek()` MUST bump `seekToken` and stamp `lastUserSeekAt` with
 *     the current `performance.now()` value.
 *   - `onBeatClick()` MUST behave identically (it is a user-initiated seek).
 *   - `seekToken` MUST advance monotonically so async coordination loops
 *     (drift correction) can detect a user seek that landed after they
 *     started gathering data and bail out before writing stale values.
 *   - `lastUserSeekAt` MUST be readable via selector + exported constant
 *     `USER_SEEK_FENCE_MS` so consumers can implement the fence gate.
 */

import {
  usePlaybackStore,
  USER_SEEK_FENCE_MS,
} from '@/stores/playbackStore';

describe('playbackStore seek coordination (R1/R2/R3)', () => {
  beforeEach(() => {
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
  });

  it('exposes a sensible default seek fence window', () => {
    // The default should cover worst-case iframe postMessage round-trip
    // (~250 ms) plus GrainPlayer tick (~50 ms). Must be > 300 ms and
    // well under 1 s so genuine drift is still corrected promptly.
    expect(USER_SEEK_FENCE_MS).toBeGreaterThan(300);
    expect(USER_SEEK_FENCE_MS).toBeLessThanOrEqual(1000);
  });

  it('initial seekToken is zero and lastUserSeekAt is zero', () => {
    const state = usePlaybackStore.getState();
    expect(state.seekToken).toBe(0);
    expect(state.lastUserSeekAt).toBe(0);
  });

  it('noteUserSeek bumps seekToken monotonically', () => {
    const store = usePlaybackStore.getState();

    store.noteUserSeek();
    expect(usePlaybackStore.getState().seekToken).toBe(1);

    store.noteUserSeek();
    expect(usePlaybackStore.getState().seekToken).toBe(2);

    store.noteUserSeek();
    expect(usePlaybackStore.getState().seekToken).toBe(3);
  });

  it('noteUserSeek stamps lastUserSeekAt with performance.now() at call time', () => {
    const before = performance.now();
    usePlaybackStore.getState().noteUserSeek();
    const after = performance.now();

    const stamped = usePlaybackStore.getState().lastUserSeekAt;
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('onBeatClick bumps seekToken and stamps lastUserSeekAt like noteUserSeek', () => {
    // The chord-grid beat click is a user-initiated seek and must
    // participate in the same coordination as a YouTube scrubber click.
    expect(usePlaybackStore.getState().seekToken).toBe(0);

    usePlaybackStore.getState().onBeatClick(5, 12.345);

    const next = usePlaybackStore.getState();
    expect(next.seekToken).toBe(1);
    expect(next.lastUserSeekAt).toBeGreaterThan(0);
    // onBeatClick also updates the beat index and current time, preserving
    // its pre-existing contract.
    expect(next.currentBeatIndex).toBe(5);
    expect(next.currentTime).toBeCloseTo(12.345);
  });

  it('multiple rapid seeks all advance the token (drift loop must see every one)', () => {
    // Simulates a user scrubbing the YouTube timeline fast — each
    // fired onSeek must advance the token so a slow drift-correction
    // tick that started mid-scrub bails on the next re-check.
    const store = usePlaybackStore.getState();
    for (let i = 0; i < 10; i += 1) {
      store.noteUserSeek();
    }
    expect(usePlaybackStore.getState().seekToken).toBe(10);
  });

  it('reset() clears seek coordination fields back to zero', () => {
    usePlaybackStore.getState().noteUserSeek();
    usePlaybackStore.getState().noteUserSeek();
    expect(usePlaybackStore.getState().seekToken).toBe(2);

    usePlaybackStore.getState().reset();

    const after = usePlaybackStore.getState();
    expect(after.seekToken).toBe(0);
    expect(after.lastUserSeekAt).toBe(0);
  });
});
