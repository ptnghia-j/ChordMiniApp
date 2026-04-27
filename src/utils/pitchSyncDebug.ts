/**
 * Pitch-shift synchronization debug logging.
 *
 * All three surfaces that must stay locked together when playback rate
 * changes — pitch-shifted audio (GrainPlayer), YouTube iframe, and the beat
 * chord grid animation — have independent clocks, listeners, and apply paths.
 * When a mismatch appears (e.g. audio speeds up but the grid/iframe stay at
 * the old rate), the shortest route to the root cause is to see every clock
 * value and every rate-change event on the same timeline.
 *
 * USAGE (enable in DevTools console):
 *   window.__PITCH_SYNC_DEBUG__ = true;          // for the current tab
 *   localStorage.setItem('debug:pitch-sync','1'); // persists across reloads
 *
 * USAGE (disable):
 *   window.__PITCH_SYNC_DEBUG__ = false;
 *   localStorage.removeItem('debug:pitch-sync');
 *
 * All logs are GATED — they incur no cost when the flag is off.
 * High-frequency call-sites (50 ms service ticks, requestAnimationFrame loops)
 * MUST use `pitchSyncLogThrottled` so the console is readable.
 */

const THROTTLE_STATE = new Map<string, number>();

declare global {
  var __PITCH_SYNC_DEBUG__: boolean | undefined;
}

/**
 * Returns true if pitch-sync debug logging is enabled.
 * Checked on every call so consumers can flip the flag at runtime without
 * re-mounting React trees. Cheap: two property reads + one localStorage read
 * (only on first hit in a tab session if we cache, but the perf impact is
 * negligible and keeping it fresh avoids "flag flipped but logs still silent"
 * confusion).
 */
export const isPitchSyncDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__PITCH_SYNC_DEBUG__ === true) return true;
    if (typeof localStorage !== 'undefined'
      && localStorage.getItem('debug:pitch-sync') === '1'
    ) {
      return true;
    }
  } catch {
    /* SSR / sandbox */
  }
  return false;
};

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

/**
 * Log once when the debug flag is set. Use for discrete events (rate change,
 * seek, drift correction, gate decisions). Tag format: [pitchSync.<area>].
 */
export const pitchSyncLog = (tag: string, data?: Record<string, unknown>): void => {
  if (!isPitchSyncDebugEnabled()) return;
  const t = nowMs().toFixed(1);
  console.log(`[pitchSync +${t}ms] ${tag}`, data ?? {});
};

/**
 * Throttled log — emit at most once per `intervalMs` per `tag`. Use inside
 * high-frequency loops (GrainPlayer 50 ms tick, rAF at 30-60 Hz). The tag
 * identity must remain stable across calls from the same call-site.
 */
export const pitchSyncLogThrottled = (
  tag: string,
  intervalMs: number,
  data?: Record<string, unknown>,
): void => {
  if (!isPitchSyncDebugEnabled()) return;
  const now = nowMs();
  const last = THROTTLE_STATE.get(tag) ?? 0;
  if (now - last < intervalMs) return;
  THROTTLE_STATE.set(tag, now);
  console.log(`[pitchSync +${now.toFixed(1)}ms] ${tag}`, data ?? {});
};

/**
 * Reset throttle state. Mainly useful from unit tests; no production callers.
 */
export const __resetPitchSyncDebugThrottles = (): void => {
  THROTTLE_STATE.clear();
};
