/**
 * YouTube Master Clock
 * ────────────────────
 * Single source of truth for playback position and rate across the app.
 *
 * BACKGROUND
 *   The pitch-shift + playback-speed feature previously had three independent
 *   time sources fighting each other:
 *     1. YouTube iframe's internal clock (via onProgress / getCurrentTime)
 *     2. GrainPlayer's 50 ms setInterval counter
 *     3. A drift-correction loop that seek'd one from the other every 100 ms
 *   At non-1× rates this turned into a positive feedback loop: the drift loop
 *   would seek YouTube, YouTube would silently fall back to 1× during re-buffer,
 *   GrainPlayer would race ahead, the loop would seek again, … → "keeps
 *   refreshing like crazy" and "beat click jumps to wrong position at 2×".
 *
 * DESIGN
 *   • YouTube iframe is the permanent MASTER of {position, rate}.
 *   • This module exposes a live, smoothly-extrapolated position derived from
 *     the last YouTube sample plus `performance.now()` × rate. It is the ONLY
 *     thing the beat grid rAF loop should read.
 *   • The GrainPlayer becomes a pure slave: its own re-anchor loop (in
 *     `usePitchShiftAudio`) reads `getLivePosition()` every 40 ms and
 *     corrects itself if drift exceeds the hysteresis threshold.
 *   • Rate changes write ONLY to YouTube. YouTube's actual effective rate is
 *     mirrored back into the master via `onRateChange`, and from the master
 *     into GrainPlayer. YouTube snap-to-list (0.25, 0.5, 0.75, 1, 1.25, 1.5,
 *     1.75, 2) is tolerated by the 200 ms verify step in the store fan-out.
 *
 * CLOCK CHOICE: `performance.now()` (not AudioContext.currentTime)
 *   The master clock must run even when the AudioContext is suspended (e.g.
 *   pitch shift off, or browser autoplay policy holding the context).
 *   `performance.now()` is guaranteed-monotonic wall time, gives us
 *   sub-millisecond resolution, and is available in every environment the
 *   app runs in (jsdom included, for tests).
 *
 * RE-ANCHOR HYSTERESIS
 *   YouTube's `getCurrentTime()` has ~30-50 ms jitter even at steady state,
 *   and much more (several hundred ms) right after a seek or rate change.
 *   Re-anchoring on every sample would leak that jitter into the beat grid.
 *   We only re-anchor when EITHER:
 *     • the delta between YT's reported time and our extrapolated position
 *       exceeds `0.08 × max(rate, 1)` seconds, OR
 *     • the age of the current anchor (now - lastReAnchorWallSec) exceeds
 *       400 ms (safety valve — prevents accumulated extrapolation error from
 *       getting unboundedly large if YT's progress fires less often than
 *       expected).
 *
 * COUNTER-SNAP ON RATE CHANGE
 *   When rate changes mid-playback, we MUST advance the anchor by the
 *   elapsed wall-time × OLD rate before switching to the new rate. Without
 *   this, the next `getLivePosition()` call extrapolates the new rate over
 *   a window that was actually played at the old rate — a permanent,
 *   rate-change-amount-dependent offset that users perceive as "beat grid
 *   is ahead/behind after I move the speed slider".
 *
 * VERIFICATION
 *   See `__tests__/unit/services/youtubeMasterClock.test.ts` for coverage
 *   of anchoring, re-anchor hysteresis, counter-snap, seek, and the
 *   backward-step dev guard.
 */

/**
 * Diagnostic tag for master-clock logs — intentionally kept as a named
 * constant so the few remaining `console.warn` paths (backward-step guard)
 * share a grep-able prefix.
 */
const DIAG_TAG = '[pitch-diag/master]';

/**
 * Read `performance.now() / 1000` as a number of seconds. Separated into a
 * named helper so tests can patch the clock via a single jest.spyOn rather
 * than juggling globals. Falls back to `Date.now() / 1000` if `performance`
 * is unavailable (shouldn't happen in any supported environment, but guards
 * against exotic test harnesses).
 */
function wallNowSec(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

/**
 * RE-ANCHOR HYSTERESIS TUNABLES — see module-level doc block for rationale.
 *   BASE_DRIFT_SEC is scaled by `max(rate, 1)` to keep the subjective
 *   tolerance constant (a 150 ms wall-time gap is less tolerable at 2× than
 *   at 1× because musical events pass twice as fast).
 */
const BASE_DRIFT_TOLERANCE_SEC = 0.08;
const MAX_ANCHOR_AGE_SEC = 0.4;
const BACKWARD_STEP_WARN_SEC = 0.25; // dev-only: YT reporting backward this much is a red flag

/**
 * After a user-initiated seek, YouTube's iframe takes ~150-300 ms to apply
 * the seek. During that window `onProgress` still reports the STALE pre-seek
 * position. If we blindly re-anchor on that stale sample, the master jumps
 * BACKWARD, the slave re-seeks GrainPlayer to the stale position, and the
 * user hears a rewind + fast-forward glitch. This fence blanks out
 * `onYoutubeProgress` for 500 ms after every `onUserSeek`. The first
 * legitimate sample after the fence will be close to the true seek target
 * and re-anchor normally if drift warrants it.
 */
const USER_SEEK_FENCE_SEC = 0.5;

type MasterClockState = {
  /** video/audio position at the moment the anchor was set, in seconds */
  anchorPositionSec: number;
  /** `performance.now()/1000` at the moment the anchor was set */
  anchorWallSec: number;
  /** last-known effective playback rate (1.0 by default) */
  rate: number;
  /** whether the master clock is currently advancing */
  isPlaying: boolean;
  /** wall-clock of the last time we re-anchored, for age-based re-anchor */
  lastReAnchorWallSec: number;
  /** last YT-reported time we saw; used for backward-step dev guard only */
  lastYoutubeReportedSec: number;
};

/**
 * Optional store adapter — injected from the consumer side so the master
 * clock doesn't import the Zustand store directly (keeps testability and
 * breaks a circular module graph: store → master → store).
 *
 * The adapter is used on `onUserSeek` to:
 *   • bump the seekToken (so in-flight drift corrections abort)
 *   • stamp `lastUserSeekAt` (so the 500 ms user-seek fence opens)
 *   • publish the post-seek position to `currentTime` so React subscribers
 *     see the jump immediately without waiting for the next push tick.
 */
export interface MasterClockStoreAdapter {
  noteUserSeek: () => void;
  setCurrentTime: (time: number) => void;
}

/**
 * Called every time the master clock re-anchors to a new position (Youtube
 * progress, user seek, rate change counter-snap). Consumers — primarily the
 * GrainPlayer slave loop — use this to synchronize their own passive
 * accumulator anchors so position extrapolations stay locked without seeking.
 */
export type ReAnchorListener = (positionSec: number, wallSec: number) => void;

class YoutubeMasterClock {
  private state: MasterClockState = {
    anchorPositionSec: 0,
    anchorWallSec: 0,
    rate: 1,
    isPlaying: false,
    lastReAnchorWallSec: 0,
    lastYoutubeReportedSec: 0,
  };

  private storeAdapter: MasterClockStoreAdapter | null = null;
  private reAnchorListener: ReAnchorListener | null = null;

  /** Dev-only: throttle backward-step warnings so one bad YT sample doesn't spam. */
  private lastBackwardStepWarnAt = 0;

  /** Wall-clock of the last `onUserSeek`. Used by the progress-fence. */
  private lastUserSeekWallSec = 0;

  /**
   * Inject the store adapter. Called once, near the app's React root. Null
   * unwires — useful in tests and when unmounting the analyze page.
   */
  setStoreAdapter(adapter: MasterClockStoreAdapter | null): void {
    this.storeAdapter = adapter;
  }

  /**
   * Register a listener that is called every time the master anchors to a
   * new position — whether from a YouTube progress re-anchor, a user seek,
   * a cold start, or a rate-change counter-snap. Null unwires.
   */
  setReAnchorListener(listener: ReAnchorListener | null): void {
    this.reAnchorListener = listener;
  }

  /**
   * Seed the master with an initial known position. Should be called the
   * first time we get a real position from either YT or a seek — NOT used
   * for every update; subsequent updates go through `onYoutubeProgress`.
   */
  private anchorTo(positionSec: number, wallSec: number, _reason: string): void {
    this.state.anchorPositionSec = positionSec;
    this.state.anchorWallSec = wallSec;
    this.state.lastReAnchorWallSec = wallSec;
    this.reAnchorListener?.(positionSec, wallSec);
  }

  /**
   * Called by the YouTube progress handler every time ReactPlayer reports a
   * new time. Most of the time this is a small forward step; we apply the
   * hysteresis rules above and only re-anchor when a correction is warranted.
   *
   * The dev-only backward-step guard fires when YT reports a time that is
   * more than `BACKWARD_STEP_WARN_SEC` behind its own previous report
   * WITHOUT an intervening `onUserSeek`. That signals either a YT bug (the
   * iframe lost state during a network blip) or a seek that went through
   * the wrong code path — either way we want to know early.
   */
  onYoutubeProgress(reportedSec: number): void {
    if (!Number.isFinite(reportedSec) || reportedSec < 0) return;

    const wallSec = wallNowSec();

    // SEEK FENCE: after a user-initiated seek, the YT iframe needs time to
    // apply the new position. During that window `onProgress` still reports
    // the STALE pre-seek position. Consuming those stale samples would yank
    // the master anchor backward, causing the slave loop to rewind the
    // GrainPlayer and the beat grid to jump back then forward. Drop them.
    if (wallSec - this.lastUserSeekWallSec < USER_SEEK_FENCE_SEC) {
      return;
    }

    // Dev guard: backward step without a user seek. `onUserSeek` updates
    // `lastYoutubeReportedSec` so legitimate backward jumps don't trip this.
    if (process.env.NODE_ENV !== 'production') {
      const backwardStep = this.state.lastYoutubeReportedSec - reportedSec;
      if (backwardStep > BACKWARD_STEP_WARN_SEC) {
        // Throttle to 1/sec so a jittering YT source doesn't flood.
        if (wallSec - this.lastBackwardStepWarnAt > 1) {
          this.lastBackwardStepWarnAt = wallSec;
          console.warn(
            `${DIAG_TAG} backward-step: YT jumped from ${this.state.lastYoutubeReportedSec.toFixed(3)}s to ${reportedSec.toFixed(3)}s without onUserSeek()`,
          );
        }
      }
    }
    this.state.lastYoutubeReportedSec = reportedSec;

    // Cold start: no anchor yet. Seed it.
    if (this.state.anchorWallSec === 0) {
      this.anchorTo(reportedSec, wallSec, 'cold-start');
      return;
    }

    // Compare YT's reported position against our extrapolation.
    const extrapolated = this.computeLivePosition(wallSec);
    const drift = Math.abs(reportedSec - extrapolated);
    const driftThreshold = BASE_DRIFT_TOLERANCE_SEC * Math.max(this.state.rate, 1);
    const age = wallSec - this.state.lastReAnchorWallSec;

    if (drift > driftThreshold || age > MAX_ANCHOR_AGE_SEC) {
      const reason = drift > driftThreshold ? 're-anchor.drift' : 're-anchor.age';
      this.anchorTo(reportedSec, wallSec, reason);
    }
  }

  /**
   * Transition the master from paused → playing. Anchor becomes the current
   * live position (which, if we were paused, equals the last known anchor
   * verbatim — no extrapolation during pause).
   */
  onPlay(): void {
    const wallSec = wallNowSec();
    const livePos = this.computeLivePosition(wallSec);
    this.state.anchorPositionSec = livePos;
    this.state.anchorWallSec = wallSec;
    this.state.lastReAnchorWallSec = wallSec;
    this.state.isPlaying = true;
  }

  /**
   * Transition playing → paused. We still advance the anchor to the
   * current live position so subsequent reads return the "frozen at the
   * moment of pause" value, not the stale anchor from whenever play was
   * called.
   */
  onPause(): void {
    const wallSec = wallNowSec();
    const livePos = this.computeLivePosition(wallSec);
    this.state.anchorPositionSec = livePos;
    this.state.anchorWallSec = wallSec;
    this.state.lastReAnchorWallSec = wallSec;
    this.state.isPlaying = false;
  }

  /**
   * Called by every code path that issues a user-initiated seek (beat
   * click, YT scrubber, keyboard shortcut, loop wrap). This is the unified
   * entry point — callers MUST go through here so:
   *   1. the master clock re-anchors atomically (no stale extrapolation)
   *   2. the store gets `noteUserSeek()` (opens the 500 ms drift fence)
   *   3. React subscribers see the jump immediately
   *
   * NOTE: This method does NOT forward the seek to YT or GrainPlayer — those
   * side-effects belong to the calling code so failure modes stay local.
   */
  onUserSeek(targetSec: number): void {
    if (!Number.isFinite(targetSec) || targetSec < 0) return;

    const wallSec = wallNowSec();
    this.state.anchorPositionSec = targetSec;
    this.state.anchorWallSec = wallSec;
    this.state.lastReAnchorWallSec = wallSec;
    // Also update the "last YT reported" so the backward-step guard
    // doesn't false-positive on the next legitimate progress callback.
    this.state.lastYoutubeReportedSec = targetSec;

    // Stamp the seek fence — `onYoutubeProgress` will drop stale samples
    // until `wallNow - lastUserSeekWallSec > USER_SEEK_FENCE_SEC`.
    this.lastUserSeekWallSec = wallSec;

    this.storeAdapter?.noteUserSeek();
    this.storeAdapter?.setCurrentTime(targetSec);
  }

  /**
   * Called when the playback rate changes. The COUNTER-SNAP is critical:
   * we must advance the anchor using the OLD rate up to `wallSec` BEFORE
   * switching the rate. See module doc for failure mode.
   *
   * Note: this method trusts the caller's `rate` argument as the
   * authoritative new rate. If YouTube silently snapped to a different
   * value, the 200 ms verify step in `playbackStore.setPlayerPlaybackRate`
   * re-fires this method with the actual value.
   */
  onRateChange(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;

    const wallSec = wallNowSec();
    // COUNTER-SNAP: extrapolate at OLD rate up to now
    const livePosAtOldRate = this.computeLivePosition(wallSec);
    this.state.anchorPositionSec = livePosAtOldRate;
    this.state.anchorWallSec = wallSec;
    this.state.lastReAnchorWallSec = wallSec;
    this.state.rate = rate;

    // 🔧 Notify the ReAnchorListener so the GrainPlayer's passive
    //    accumulator is synchronised with the master's counter-snapped
    //    position BEFORE the GrainPlayer applies its own rate change.
    //    Without this, the GrainPlayer counter-snaps from a stale anchor,
    //    producing a cumulative position offset on every rate change.
    this.reAnchorListener?.(livePosAtOldRate, wallSec);
  }

  /**
   * Read the current live position. This is the ONLY method the beat-grid
   * rAF loop and the GrainPlayer slave loop should call. It returns a
   * smoothly-advancing number every time it's called while `isPlaying`,
   * regardless of how long ago the last `onYoutubeProgress` was.
   */
  getLivePosition(): number {
    return this.computeLivePosition(wallNowSec());
  }

  /**
   * Read the effective playback rate known to the master. The rate slider
   * and rate-verify step both use this to detect snap-to-list.
   */
  getRate(): number {
    return this.state.rate;
  }

  /** Is the master currently advancing? */
  isPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * Internal pure function: compute live position given a wall-clock
   * instant. Extracted so every public method uses exactly the same
   * extrapolation formula.
   */
  private computeLivePosition(wallSec: number): number {
    if (!this.state.isPlaying) {
      return this.state.anchorPositionSec;
    }
    const elapsedWall = Math.max(0, wallSec - this.state.anchorWallSec);
    return this.state.anchorPositionSec + elapsedWall * this.state.rate;
  }

  /**
   * TEST-ONLY: snapshot the full internal state. Exposed so unit tests can
   * assert anchor invariants without reaching into private fields.
   * Intentionally named with an underscore prefix to discourage production
   * use from application code.
   */
  _debugGetState(): Readonly<MasterClockState> {
    return { ...this.state };
  }

  /**
   * TEST-ONLY: reset to pristine state. Used by test `beforeEach` blocks.
   */
  _debugReset(): void {
    this.state = {
      anchorPositionSec: 0,
      anchorWallSec: 0,
      rate: 1,
      isPlaying: false,
      lastReAnchorWallSec: 0,
      lastYoutubeReportedSec: 0,
    };
    this.storeAdapter = null;
    this.lastBackwardStepWarnAt = 0;
    this.lastUserSeekWallSec = 0;
  }
}

/**
 * Module-scoped singleton. The master clock is true global state — there is
 * one YouTube iframe and one GrainPlayer per page, so one master is correct.
 */
export const youtubeMasterClock = new YoutubeMasterClock();
