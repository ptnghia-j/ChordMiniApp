import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { RefObject } from 'react';
import { getPitchShiftService } from '@/services/audio/pitchShiftServiceInstance';
import { youtubeMasterClock } from '@/services/audio/youtubeMasterClock';

type BeatClickHandler = (beatIndex: number, timestamp: number) => void;

// Identity wrapper to disable devtools middleware in production with proper typing
function identityDevtools<S, Mps extends [] = [], Mcs extends [] = []>(
  fn: import('zustand/vanilla').StateCreator<S, Mps, Mcs>
) {
  return fn;
}

/**
 * Clock-authority invariant (dev-only, P2).
 *
 * When pitch-shift is active, GrainPlayer is the master clock: its 50 ms
 * time-update callback drives the store's currentTime, which in turn drives
 * the beat grid animation, the auto-scroll follow mode, and a 100 ms drift
 * correction loop that issues `youtubePlayer.seekTo(masterTime)` on the
 * embedded iframe. If some other writer publishes a currentTime while the
 * GrainPlayer is authoritative, the beat grid will visibly skip backwards.
 */

// Verify-cancellation token for setPlayerPlaybackRate. Each call increments
// it; the deferred 200 ms verifier captures its own token and silently bails
// if a NEWER rate change has fired in the meantime. Without this, dragging
// the slider quickly across snap points (1.25 → 1.75 → 2 in <100 ms)
// produces a cascade of stale verify warnings + re-issue calls that race
// the legitimate latest target.
let setRateCallToken = 0;

interface PlaybackStore {
  // Audio player state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;

  // Player refs (stored as any to avoid React ref issues in Zustand)
  audioRef: RefObject<HTMLAudioElement> | null;
  youtubePlayer: unknown;

  // Beat tracking
  currentBeatIndex: number;
  currentDownbeatIndex: number;
  beatClickHandler: BeatClickHandler | null;

  // Seek coordination (R2 + R3)
  //   seekToken      — monotonic counter bumped by any user-initiated seek.
  //                    Async coordination loops (e.g. drift correction) read
  //                    it at the start of their tick and bail out if it
  //                    changes before they finish, preventing tug-of-war
  //                    between the click path and the drift loop.
  //   lastUserSeekAt — `performance.now()` timestamp of the most recent user
  //                    seek. Loops gate on `now - lastUserSeekAt < FENCE_MS`
  //                    so a user scrub is never immediately reversed by a
  //                    stale drift-correction fire.
  seekToken: number;
  lastUserSeekAt: number;

  // Video UI state
  isVideoMinimized: boolean;
  isFollowModeEnabled: boolean;

  // State setters
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioRef: (ref: RefObject<HTMLAudioElement> | null) => void;
  setYoutubePlayer: (player: unknown) => void;
  setCurrentBeatIndex: (index: number) => void;
  setCurrentDownbeatIndex: (index: number) => void;
  setBeatClickHandler: (handler: BeatClickHandler | null) => void;
  setIsVideoMinimized: (minimized: boolean) => void;
  setIsFollowModeEnabled: (enabled: boolean) => void;

  // Playback controls
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlayerPlaybackRate: (rate: number) => void;

  // Seek coordination actions (R2 + R3)
  noteUserSeek: () => void;

  // Video UI toggles
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;

  // Beat click handler
  onBeatClick: (beatIndex: number, timestamp: number) => void;

  // Initialization
  reset: () => void;
}

export const usePlaybackStore = create<PlaybackStore>()(
  ((process.env.NODE_ENV !== 'production' ? devtools : identityDevtools) as unknown as typeof devtools)(
    (set, get) => ({
      // Initial state
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
      audioRef: null,
      youtubePlayer: null,
      currentBeatIndex: -1,
      currentDownbeatIndex: -1,
      beatClickHandler: null,
      seekToken: 0,
      lastUserSeekAt: 0,
      isVideoMinimized: false,
      isFollowModeEnabled: true,

      // State setters
      setIsPlaying: (playing) => set({ isPlaying: playing }, false, 'setIsPlaying'),

      setCurrentTime: (time) => {
        set({ currentTime: time }, false, 'setCurrentTime');
      },

      setDuration: (duration) => set({ duration }, false, 'setDuration'),

      setPlaybackRate: (rate) => set({ playbackRate: rate }, false, 'setPlaybackRate'),

      setAudioRef: (ref) => set({ audioRef: ref }, false, 'setAudioRef'),

      setYoutubePlayer: (player) => set({ youtubePlayer: player }, false, 'setYoutubePlayer'),

      setCurrentBeatIndex: (index) => set({ currentBeatIndex: index }, false, 'setCurrentBeatIndex'),

      setCurrentDownbeatIndex: (index) => set({ currentDownbeatIndex: index }, false, 'setCurrentDownbeatIndex'),

      setBeatClickHandler: (handler) => set({ beatClickHandler: handler }, false, 'setBeatClickHandler'),

      setIsVideoMinimized: (minimized) => set({ isVideoMinimized: minimized }, false, 'setIsVideoMinimized'),

      setIsFollowModeEnabled: (enabled) => set({ isFollowModeEnabled: enabled }, false, 'setIsFollowModeEnabled'),

      // Playback controls
      play: () => {
        const state = get();
        const player = state.youtubePlayer as { playVideo?: () => void } | null;
        if (player && typeof player.playVideo === 'function') {
          player.playVideo();
        }
        set({ isPlaying: true }, false, 'play');
      },

      pause: () => {
        const state = get();
        const player = state.youtubePlayer as { pauseVideo?: () => void } | null;
        if (player && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
        set({ isPlaying: false }, false, 'pause');
      },

      seek: (time) => {
        const state = get();
        const player = state.youtubePlayer as { seekTo?: (time: number, allowSeekAhead: string) => void } | null;
        if (player && typeof player.seekTo === 'function') {
          player.seekTo(time, 'seconds');
        }
        set({ currentTime: time }, false, 'seek');
      },

      setPlayerPlaybackRate: (rate) => {
        const state = get();
        const myToken = ++setRateCallToken;

        // SIGNAL-ONLY LOGGING: build ONE summary log per call instead of
        // 5+ fan-out entries. The previous per-surface logs were useful
        // when wiring everything up but now flood the console (a single
        // slider drag can fire 3 rate changes × 6 logs = 18 entries in
        // <100 ms). Errors and skips still log immediately so failures
        // are never silenced.
        const summary: Record<string, unknown> = {
          requestedRate: rate,
          previousRate: state.playbackRate,
        };

        // IDEMPOTENT SHORT-CIRCUIT: slider `onChange` cascades and derived-state
        // effects regularly fire this setter multiple times with identical
        // values within a single user drag. Each redundant call (a) spams the
        // YouTube iframe with postMessage commands and (b) resets the 200 ms
        // verification timer so it never has a chance to fire. Bail out early
        // when the requested rate matches the currently-stored rate within a
        // tight tolerance; distinct values still take the full fan-out path.
        if (Math.abs(rate - state.playbackRate) < 0.001) {
          // Skip log entirely — short-circuit fires constantly during slider
          // drag and is the loudest source of noise. Real callers (chord
          // engine, pitch popover) only invoke this with distinct values.
          return;
        }

        // P0 FIX: The YouTube iframe API silently falls back to 1.0x for rates
        // that are not in its `getAvailablePlaybackRates()` set (typically
        // [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]). GrainPlayer accepts any
        // positive rate, but we must align all surfaces on the same value so
        // the beat grid animation and YouTube frame stay locked. We therefore:
        //   (a) snap the requested rate to the closest value YouTube supports,
        //   (b) apply the snapped rate to every surface,
        //   (c) verify YouTube actually accepted it after ~150 ms and log a
        //       dev-only warning when the iframe reports a different rate.
        const player = state.youtubePlayer as {
          setPlaybackRate?: (rate: number) => void;
          getPlaybackRate?: () => number;
          getAvailablePlaybackRates?: () => number[];
        } | null;

        let effectiveRate = rate;
        if (player && typeof player.getAvailablePlaybackRates === 'function') {
          try {
            const available = player.getAvailablePlaybackRates();
            if (Array.isArray(available) && available.length > 0) {
              effectiveRate = available.reduce((closest, candidate) =>
                Math.abs(candidate - rate) < Math.abs(closest - rate) ? candidate : closest,
              available[0]);
              if (Math.abs(effectiveRate - rate) > 0.001) {
                summary.snappedTo = effectiveRate;
                if (process.env.NODE_ENV !== 'production') {
                  console.warn(
                    `[playbackStore] Requested rate ${rate}x is not in YouTube's supported set; snapping to ${effectiveRate}x`,
                  );
                }
              }
            }
          } catch {
            /* fall through with the caller-provided rate */
          }
        }
        summary.effectiveRate = effectiveRate;

        // 1. YouTube iframe (if present). YT is the master of rate: whatever
        // rate actually takes effect on the iframe is the one the master
        // clock and the GrainPlayer must mirror.
        let ytPreRate: number | undefined;
        if (player && typeof player.setPlaybackRate === 'function') {
          try {
            if (typeof player.getPlaybackRate === 'function') {
              try { ytPreRate = player.getPlaybackRate(); } catch {}
            }
            player.setPlaybackRate(effectiveRate);
            summary.ytPreRate = ytPreRate;
            summary.ytApplied = true;
          } catch (error) {
            summary.ytApplied = false;
            console.warn('YouTube setPlaybackRate failed:', error);
          }
        } else {
          summary.ytSkipped = player ? 'no-setPlaybackRate-method' : 'no-player';
        }

        // 2. Master clock. The master performs its own counter-snap (advances
        // the anchor at the OLD rate before switching) so the live position
        // doesn't jump on rate change. See `youtubeMasterClock.onRateChange`.
        try {
          youtubeMasterClock.onRateChange(effectiveRate);
        } catch (error) {
          console.warn('Master clock onRateChange failed:', error);
        }

        // 3. Pitch shift service (if initialised). GrainPlayer is a slave to
        // the master; its rate must match the effective rate YouTube will
        // actually run at.
        try {
          const service = getPitchShiftService();
          if (service) {
            // Sample pre-state defensively — the debug log is best-effort and
            // MUST NEVER block the setPlaybackRate fan-out if a fake/partial
            // service mock lacks `getState`.
            let preState: { playbackRate?: number; isPlaying?: boolean; currentTime?: number } | undefined;
            try {
              preState = service.getState();
            } catch {
              /* non-fatal: log without pre-state */
            }
            service.setPlaybackRate(effectiveRate);
            summary.grainPlayerPreRate = preState?.playbackRate;
            summary.grainPlayerPlaying = preState?.isPlaying;
            summary.grainPlayerTime = preState?.currentTime;
          } else {
            summary.grainPlayerSkipped = 'no-service';
          }
        } catch (error) {
          console.warn('Pitch shift setPlaybackRate failed:', error);
        }

        // 4. HTML5 audio element fallback (upload page).
        const audio = state.audioRef?.current;
        if (audio) {
          try {
            const prePlaybackRate = audio.playbackRate;
            audio.playbackRate = effectiveRate;
            summary.htmlAudioPreRate = prePlaybackRate;
          } catch (error) {
            console.warn('HTMLAudioElement.playbackRate failed:', error);
          }
        }

        // Summary log removed — rate fan-out path is stable.

        set({ playbackRate: effectiveRate }, false, 'setPlayerPlaybackRate');

        // P2 VERIFICATION: confirm YouTube actually applied the rate after the
        // iframe round-trip settles. When the iframe reports a different rate
        // (e.g. silent snap-to-list to an unsupported value), we
        //   (a) update the master clock and GrainPlayer to match YT's actual
        //       effective rate so all three stay locked, and
        //   (b) emit a dev-only warning so regressions surface in logs.
        if (player
          && typeof player.getPlaybackRate === 'function'
          && typeof player.setPlaybackRate === 'function'
        ) {
          const verifyAfterMs = 200;
          setTimeout(() => {
            // STALE-VERIFY GUARD: a newer setPlayerPlaybackRate call has
            // already superseded ours. Bail silently — its own verifier
            // will check the current state. Logging or re-issuing here
            // would race the latest target.
            if (myToken !== setRateCallToken) return;
            try {
              const applied = player.getPlaybackRate!();
              if (typeof applied === 'number' && Math.abs(applied - effectiveRate) > 0.01) {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn(
                    `[playbackStore] YouTube rate verification mismatch: requested ${effectiveRate}x, got ${applied}x; mirroring actual rate to master + GrainPlayer`,
                  );
                }
                // Mirror YT's actual effective rate everywhere instead of
                // fighting the iframe. Re-firing the master handles the
                // counter-snap; also propagate to GrainPlayer + store so the
                // beat grid and pitch-shifted audio match the video.
                try { youtubeMasterClock.onRateChange(applied); } catch {}
                try {
                  const svc = getPitchShiftService();
                  svc?.setPlaybackRate(applied);
                } catch {}
                set({ playbackRate: applied }, false, 'setPlayerPlaybackRate.verify.mirror');
              }
            } catch {
              /* iframe not ready yet; ignore */
            }
          }, verifyAfterMs);
        }
      },

      // Video UI toggles
      toggleVideoMinimization: () =>
        set((state) => ({ isVideoMinimized: !state.isVideoMinimized }), false, 'toggleVideoMinimization'),

      toggleFollowMode: () =>
        set((state) => ({ isFollowModeEnabled: !state.isFollowModeEnabled }), false, 'toggleFollowMode'),

      // Seek coordination (R2 + R3).
      //
      // `noteUserSeek` must be called by EVERY user-initiated seek path
      // (chord-grid click, YouTube scrubber, loop-end wrap, keyboard arrow,
      // etc.) BEFORE the seek is dispatched to the underlying surfaces. It
      //   (a) bumps `seekToken` so any in-flight async coordination loop
      //       (drift correction, rate verification) can detect the seek and
      //       abort its stale work, and
      //   (b) stamps `lastUserSeekAt` with `performance.now()` so those
      //       loops can skip their next tick if it falls within the 500 ms
      //       user-seek fence.
      noteUserSeek: () => {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        set(
          (state) => ({
            seekToken: state.seekToken + 1,
            lastUserSeekAt: now,
          }),
          false,
          'noteUserSeek',
        );
      },

      // Beat click handler
      onBeatClick: (beatIndex, timestamp) => {
        const state = get();
        const delegatedHandler = state.beatClickHandler;
        const player = state.youtubePlayer as { seekTo?: (time: number, allowSeekAhead: string) => void } | null;
        const audioRef = state.audioRef as RefObject<HTMLAudioElement> | null;

        // UNIFIED CLOCK: route every user-initiated seek through the master.
        // `onUserSeek` (via the store adapter wired at module bottom) calls
        // back into `noteUserSeek()` (which bumps `seekToken` and stamps
        // `lastUserSeekAt`) AND `setCurrentTime(timestamp)` — so by the time
        // this line returns the store and the master clock are atomically
        // consistent. Any in-flight drift loop will see the bumped token and
        // abort rather than drag the iframe back to the pre-click position.
        youtubeMasterClock.onUserSeek(timestamp);

        // currentBeatIndex is the only piece NOT touched by onUserSeek.
        set(
          { currentBeatIndex: beatIndex },
          false,
          'onBeatClick',
        );

        if (delegatedHandler) {
          try {
            delegatedHandler(beatIndex, timestamp);
          } catch (error) {
            console.error('Failed to delegate beat click handler:', error);
          }
        } else {
          // Prefer YouTube player when present
          if (player && typeof player.seekTo === 'function') {
            try { player.seekTo(timestamp, 'seconds'); } catch {}
          } else if (audioRef?.current) {
            // Fallback to HTMLAudioElement for the upload page
            try {
              audioRef.current.currentTime = timestamp;
              // If paused, keep state consistent with click navigation expectations
              // Do not auto-play here; leave play/pause to user controls
            } catch {}
          }
        }

      },

      // Reset state
      reset: () =>
        set(
          {
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            currentBeatIndex: -1,
            currentDownbeatIndex: -1,
            beatClickHandler: null,
            seekToken: 0,
            lastUserSeekAt: 0,
            isVideoMinimized: false,
            isFollowModeEnabled: true,
          },
          false,
          'reset'
        ),
    }),
    { name: 'PlaybackStore' }
  )
);

// Selector hooks for optimized re-renders
export const useIsPlaying = () => usePlaybackStore((state) => state.isPlaying);
export const useCurrentTime = () => usePlaybackStore((state) => state.currentTime);
export const useDuration = () => usePlaybackStore((state) => state.duration);
export const usePlaybackRate = () => usePlaybackStore((state) => state.playbackRate);
export const useYoutubePlayer = () => usePlaybackStore((state) => state.youtubePlayer);
export const useCurrentBeatIndex = () => usePlaybackStore((state) => state.currentBeatIndex);
export const useCurrentDownbeatIndex = () => usePlaybackStore((state) => state.currentDownbeatIndex);
export const useIsVideoMinimized = () => usePlaybackStore((state) => state.isVideoMinimized);
export const useIsFollowModeEnabled = () => usePlaybackStore((state) => state.isFollowModeEnabled);
export const useSeekToken = () => usePlaybackStore((state) => state.seekToken);
export const useLastUserSeekAt = () => usePlaybackStore((state) => state.lastUserSeekAt);

/**
 * User-seek fence window (R2). Async coordination loops should bail out when
 * `performance.now() - lastUserSeekAt < USER_SEEK_FENCE_MS`. 500 ms comfortably
 * covers the worst-case YouTube iframe postMessage seek round-trip (~250 ms)
 * plus a little slack for the GrainPlayer 50 ms tick to settle.
 */
export const USER_SEEK_FENCE_MS = 500;

// ─────────────────────────────────────────────────────────────────────────
// MASTER CLOCK ADAPTER WIRING
// ─────────────────────────────────────────────────────────────────────────
// The master clock lives in its own module and intentionally has no direct
// knowledge of the Zustand store (keeps the module graph acyclic). Here, at
// module load, we inject a thin adapter so the master can:
//   • bump `seekToken` + stamp `lastUserSeekAt` on every user-initiated seek
//     (via `noteUserSeek`)
//   • publish the post-seek position to React subscribers immediately
//     (via `setCurrentTime`)
// This is a module-level side effect, not a hook. There is exactly one
// store and one master per page, so the adapter is permanent.
youtubeMasterClock.setStoreAdapter({
  noteUserSeek: () => usePlaybackStore.getState().noteUserSeek(),
  setCurrentTime: (time: number) => usePlaybackStore.getState().setCurrentTime(time),
});

// Action selectors
export const usePlaybackControls = () =>
  usePlaybackStore((state) => ({
    play: state.play,
    pause: state.pause,
    seek: state.seek,
    setPlayerPlaybackRate: state.setPlayerPlaybackRate,
  }));

export const useBeatHandlers = () =>
  usePlaybackStore((state) => ({
    onBeatClick: state.onBeatClick,
    setCurrentBeatIndex: state.setCurrentBeatIndex,
    setCurrentDownbeatIndex: state.setCurrentDownbeatIndex,
  }));

export const useVideoUIControls = () =>
  usePlaybackStore((state) => ({
    toggleVideoMinimization: state.toggleVideoMinimization,
    toggleFollowMode: state.toggleFollowMode,
  }));
