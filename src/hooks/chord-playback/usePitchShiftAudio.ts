/**
 * Custom hook for managing pitch-shifted audio playback
 *
 * Integrates Tone.js pitch shifting with existing playback system.
 * Handles audio source switching between YouTube and pitch-shifted audio.
 *
 * Note: Accepts any audio URL (external stream URLs, Firebase Storage URLs, etc.)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SYNCHRONISATION MECHANISM (P2 documentation)
 * ─────────────────────────────────────────────────────────────────────────
 * Three independent playback surfaces must stay locked together:
 *
 *   1. GrainPlayer (Tone.js) — produces the audio the user *hears* when pitch
 *      shift is active. Internally advances its own `_currentTime` via a
 *      50 ms setInterval scaled by `_playbackRate`.
 *   2. YouTube iframe — visible video frame. Runs its own clock, which drifts
 *      from GrainPlayer whenever rate changes or user seeks.
 *   3. Beat grid animation — a rAF loop in `useScrollAndAnimation` that reads
 *      `currentTime` via `resolveBeatAtTime` (pure function, see beatResolver.ts)
 *      and writes `currentBeatIndex` to `playbackStore`.
 *
 * CLOCK AUTHORITY MODEL
 *   • When `isPitchShiftEnabled && isPitchShiftReady` the GrainPlayer is the
 *     master clock. Its 50 ms time-update callback publishes to
 *     `setCurrentTime`, which updates `audioPlayerState.currentTime` and
 *     (via `useAnalyzePageStoreSync`) `playbackStore.currentTime`.
 *   • A 100 ms interval (`syncYouTubeToGrainPlayer` below) compares the
 *     iframe's reported time against the GrainPlayer's master time. When the
 *     drift exceeds 150 ms we `youtubePlayer.seekTo(masterTime)`.
 *   • The beat grid rAF loop picks `rawTime` from the master — GrainPlayer
 *     when authority is active, else `youtubePlayer.getCurrentTime()`.
 *
 * RATE FAN-OUT (see `playbackStore.setPlayerPlaybackRate`)
 *   A single call must propagate to: (a) YouTube iframe, (b) GrainPlayer,
 *   (c) HTML5 `<audio>`. YouTube silently falls back to 1× for off-list
 *   rates, so the store first snaps the requested rate to the nearest value
 *   in `getAvailablePlaybackRates()`, then fans out the snapped value, then
 *   (dev-only) verifies the iframe actually accepted it after 200 ms.
 *
 * SEEK SAFETY (see `grainPlayerPitchShiftService.seek`)
 *   The Firebase audio buffer can be 100-300 ms shorter than the YouTube
 *   video's reported duration. Beat clicks clamp the target timestamp to
 *   `buffer.duration - 0.05` BEFORE calling `service.seek()` so the three
 *   surfaces never disagree on where "end of song" is. Seeks that arrive
 *   before the GrainPlayer buffer has loaded are parked in `pendingSeekTime`
 *   and drained from `handlePlayerLoad`.
 *
 * VERIFICATION
 *   • Unit: `__tests__/unit/stores/playbackStore.setPlayerPlaybackRate.test.ts`
 *     covers fan-out, clamping, and graceful failure.
 *   • Unit: `__tests__/unit/utils/beatResolver.test.ts` covers the pure beat
 *     cascade; any regression there will show up before a user notices.
 *   • Dev-only runtime: `playbackStore.setCurrentTime` logs a `console.debug`
 *     when `currentTime` moves backward by less than 500 ms, which is the
 *     signature of a second writer fighting the master clock.
 *   • Dev-only runtime: the rate fan-out re-reads `youtubePlayer.getPlaybackRate()`
 *     200 ms after every `setPlayerPlaybackRate` and warns if it differs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { YouTubePlayer } from '@/types/youtube';
import { getGrainPlayerPitchShiftService, getAudioContextState } from '@/services/audio/grainPlayerPitchShiftService';
import { setPitchShiftService as setGlobalPitchShiftService } from '@/services/audio/pitchShiftServiceInstance';
import { youtubeMasterClock } from '@/services/audio/youtubeMasterClock';
import {
  useIsPitchShiftEnabled,
  useSetIsPitchShiftReady,
  usePitchShiftSemitones,
  useSetIsProcessingPitchShift,
  useSetPitchShiftError,
  useSetIsFirebaseAudioAvailable
} from '@/stores/uiStore';

/**
 * Diagnostic helper — body removed to reduce console noise.
 * Re-add logging selectively when investigating specific bugs.
 */
function _hookDiag(_tag: string, _extra?: Record<string, unknown>): void {
  // intentionally empty
}

export interface UsePitchShiftAudioProps {
  youtubePlayer: YouTubePlayer | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  firebaseAudioUrl: string | null; // Actually any audio URL (external stream, Firebase Storage, etc.)
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
}

export interface UsePitchShiftAudioReturn {
  // Pitch shift service ready state
  isPitchShiftReady: boolean;

  // Initialize pitch shift with Firebase audio
  initializePitchShift: () => Promise<void>;

  // Cleanup
  cleanupPitchShift: () => void;

  // Volume control
  setPitchShiftVolume: (volume: number) => void;
  getPitchShiftVolume: () => number;
}

const YOUTUBE_DRIFT_CORRECTION_THRESHOLD_SECONDS = 0.15;

/**
 * Hook for managing pitch-shifted audio playback
 */
export const usePitchShiftAudio = ({
  youtubePlayer,
  audioRef,
  firebaseAudioUrl,
  isPlaying,
  currentTime,
  playbackRate,
  setIsPlaying,
  setCurrentTime,
}: UsePitchShiftAudioProps): UsePitchShiftAudioReturn => {
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const setIsPitchShiftReadyInStore = useSetIsPitchShiftReady();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const setIsProcessingPitchShift = useSetIsProcessingPitchShift();
  const setPitchShiftError = useSetPitchShiftError();
  const setIsFirebaseAudioAvailable = useSetIsFirebaseAudioAvailable();

  const [isPitchShiftReady, setIsPitchShiftReady] = useState(false);
  const pitchShiftService = useRef(getGrainPlayerPitchShiftService());
  const isInitializing = useRef(false);
  const lastSemitones = useRef(pitchShiftSemitones);
  // Stable ref for semitones — read inside initializePitchShift so the
  // callback identity does not change on every slider tick. The separate
  // semitone-change effect (L442) handles live updates after init.
  const pitchShiftSemitonesRef = useRef(pitchShiftSemitones);

  // Track if time update is from pitch shift service (to prevent seek feedback loop)
  const isTimeUpdateFromService = useRef(false);
  const resetServiceTimeUpdateFlagTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the last known playing state from the service (to prevent auto-pause)
  const lastServicePlayingState = useRef(false);

  // CRITICAL FIX: Track the last time we synced to prevent seek feedback loop
  // This prevents the seek effect from triggering on every time update from the service
  const lastSyncedTime = useRef(0);

  // REGRESSION FIX: Store pending playback rate to apply when service becomes ready
  // This prevents race conditions when playback rate is changed before service initialization completes
  const pendingPlaybackRate = useRef<number | null>(null);
  const currentTimeRef = useRef(currentTime);
  const isPlayingRef = useRef(isPlaying);
  const playbackRateRef = useRef(playbackRate);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(youtubePlayer);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    pitchShiftSemitonesRef.current = pitchShiftSemitones;
  }, [pitchShiftSemitones]);

  useEffect(() => {
    youtubePlayerRef.current = youtubePlayer;
  }, [youtubePlayer]);

  // Register service instance globally for volume control access
  useEffect(() => {
    setGlobalPitchShiftService(pitchShiftService.current);
    return () => {
      setGlobalPitchShiftService(null);
    };
  }, []);

  const getYoutubeTimelineTime = useCallback((): number | null => {
    const player = youtubePlayerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') {
      return null;
    }

    try {
      const time = player.getCurrentTime();
      return Number.isFinite(time) ? time : null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Update audio availability when URL changes
   */
  useEffect(() => {
    const isAvailable = !!firebaseAudioUrl;
    setIsFirebaseAudioAvailable(isAvailable);
  }, [firebaseAudioUrl, setIsFirebaseAudioAvailable]);

  /**
   * Initialize pitch shift service with audio URL
   */
  const initializePitchShift = useCallback(async () => {
    if (!firebaseAudioUrl) {
      console.warn('⚠️ No audio URL available for pitch shift');
      setIsFirebaseAudioAvailable(false);
      return;
    }

    if (isInitializing.current) {
      return;
    }

    try {
      isInitializing.current = true;
      setIsPitchShiftReady(false);
      setIsPitchShiftReadyInStore(false);
      setIsProcessingPitchShift(true);
      setPitchShiftError(null);

      // CRITICAL: Reset tracking refs before initialization
      // This ensures playback sync works correctly even if user toggles multiple times
      lastServicePlayingState.current = false;
      isTimeUpdateFromService.current = false;
      lastSyncedTime.current = 0;

      // Load audio with current pitch shift amount
      _hookDiag('init.loadAudio.start', {
        audioUrl: firebaseAudioUrl,
        semitones: pitchShiftSemitonesRef.current,
        ctxStateBeforeLoad: getAudioContextState(),
      });
      await pitchShiftService.current.loadAudio(
        firebaseAudioUrl,
        pitchShiftSemitonesRef.current,
        playbackRateRef.current, // 🔧 OFF→ON fix: never construct at default rate 1.0
      );
      _hookDiag('init.loadAudio.done', {
        ctxStateAfterLoad: getAudioContextState(),
        serviceState: pitchShiftService.current.getState(),
      });

      // Set up time update callback
      // CLOCK AUTHORITY: When pitch shift is active, the GrainPlayer is the
      // master clock for the whole app — on YouTube pages we publish its
      // time to the store and correct the iframe via seekTo elsewhere in this
      // hook instead of listening to YouTube's onProgress. This prevents the
      // "audio fast, video/beat-animation slow" desync when the slider is moved.
      pitchShiftService.current.setOnTimeUpdate((time) => {
        lastSyncedTime.current = time;

        isTimeUpdateFromService.current = true;
        setCurrentTime(time);

        if (resetServiceTimeUpdateFlagTimeout.current) {
          clearTimeout(resetServiceTimeUpdateFlagTimeout.current);
        }

        // Reset the flag shortly after the state update has propagated.
        resetServiceTimeUpdateFlagTimeout.current = setTimeout(() => {
          isTimeUpdateFromService.current = false;
          resetServiceTimeUpdateFlagTimeout.current = null;
        }, 50);
      });

      // Set up playback ended callback
      pitchShiftService.current.setOnEnded(() => {
        setIsPlaying(false);
      });

      setIsPitchShiftReady(true);
      setIsPitchShiftReadyInStore(true);
      setIsFirebaseAudioAvailable(true);
      lastSemitones.current = pitchShiftSemitonesRef.current;

      // Ensure service is aligned with current page state immediately
      try {
        const timelineTime = getYoutubeTimelineTime();
        const initialTime = timelineTime ?? currentTimeRef.current ?? 0;
        _hookDiag('init.alignment', {
          timelineTime,
          currentTimeRef: currentTimeRef.current,
          initialTime,
          isPlayingRef: isPlayingRef.current,
          playbackRateRef: playbackRateRef.current,
        });

        // Apply playback rate and seek position before starting
        pitchShiftService.current.setPlaybackRate(playbackRateRef.current);
        pitchShiftService.current.seek(initialTime);
        if (isPlayingRef.current) {
          // Start playback right away for upload page; YouTube visual sync not needed here
          pitchShiftService.current.play();
          lastServicePlayingState.current = true;
          _hookDiag('init.autoPlay', {
            postPlayState: pitchShiftService.current.getState(),
          });
        }
      } catch (error) {
        _hookDiag('init.alignment.error', { message: (error as Error)?.message });
      }

    } catch (error) {
      console.error('❌ Failed to initialize pitch shift:', error);
      setPitchShiftError('Failed to load pitch-shifted audio. Please try again.');
      setIsPitchShiftReady(false);
      setIsPitchShiftReadyInStore(false);
      setIsFirebaseAudioAvailable(false);
    } finally {
      setIsProcessingPitchShift(false);
      isInitializing.current = false;
    }
  }, [
    firebaseAudioUrl,
    // pitchShiftSemitones intentionally read from pitchShiftSemitonesRef
    // so the callback identity stays stable during slider drags. The
    // semitone-change effect handles live updates after init.
    setIsProcessingPitchShift,
    setIsPitchShiftReadyInStore,
    setPitchShiftError,
    setIsFirebaseAudioAvailable,
    setCurrentTime,
    setIsPlaying,
    getYoutubeTimelineTime,
  ]);

  /**
   * Cleanup pitch shift service
   *
   * CRITICAL FIX: Reset the singleton instance AND all tracking refs
   * The issue is that dispose() destroys audio nodes but keeps the same instance.
   * Additionally, we need to reset all tracking refs (lastServicePlayingState, lastSemitones)
   * so that playback state sync works correctly on the next toggle.
   */
  const cleanupPitchShift = useCallback(async () => {
    // Import the reset function dynamically
    const { resetGrainPlayerPitchShiftService } = await import('@/services/audio/grainPlayerPitchShiftService');

    // Reset the singleton instance (disposes and sets to null)
    resetGrainPlayerPitchShiftService();

    // Get a fresh instance for next time
    const { getGrainPlayerPitchShiftService } = await import('@/services/audio/grainPlayerPitchShiftService');
    pitchShiftService.current = getGrainPlayerPitchShiftService();

    // Register the new instance globally
    setGlobalPitchShiftService(pitchShiftService.current);

    // CRITICAL: Reset all tracking refs so playback sync works on next toggle
    lastServicePlayingState.current = false;
    lastSemitones.current = 0;
    isTimeUpdateFromService.current = false;
    lastSyncedTime.current = 0;
    if (resetServiceTimeUpdateFlagTimeout.current) {
      clearTimeout(resetServiceTimeUpdateFlagTimeout.current);
      resetServiceTimeUpdateFlagTimeout.current = null;
    }

    // Mark as not ready so we re-initialize on next toggle
    setIsPitchShiftReady(false);
    setIsPitchShiftReadyInStore(false);
    isInitializing.current = false;
  }, [setIsPitchShiftReadyInStore]);

  /**
   * Handle pitch shift toggle
   * Switch between YouTube and pitch-shifted audio
   */
  useEffect(() => {
    if (isPitchShiftEnabled && firebaseAudioUrl) {
      // Pitch shift enabled: mute YouTube (but keep it playing for visual sync)
      if (youtubePlayer) {
        // Use YouTube IFrame API mute() method
        if (typeof youtubePlayer.mute === 'function') {
          youtubePlayer.mute();
        } else {
          youtubePlayer.muted = true;
        }

        // CRITICAL: DO NOT pause YouTube - keep it playing for visual sync
        // The YouTube video timeline should stay synchronized with the pitch-shifted audio
        // Only the audio is muted, the video continues playing
      }

      if (audioRef.current) {
        audioRef.current.muted = true; // Keep extracted audio muted
      }

      // Initialize pitch shift if not ready
      if (!isPitchShiftReady) {
        initializePitchShift();
      }
    } else {
      // Pitch shift disabled: unmute YouTube, cleanup pitch shift
      if (youtubePlayer) {
        // Use YouTube IFrame API unMute() method
        if (typeof youtubePlayer.unMute === 'function') {
          youtubePlayer.unMute();
        } else {
          youtubePlayer.muted = false;
        }
      }

      if (audioRef.current) {
        // CRITICAL FIX: Unmute audio element when pitch shift is disabled
        // This allows normal audio playback for local audio upload page
        audioRef.current.muted = false;
      }

      // Cleanup pitch shift service (async)
      if (isPitchShiftReady) {
        cleanupPitchShift().catch((error) => {
          console.error('❌ Failed to cleanup pitch shift:', error);
        });
      }
    }
  }, [
    isPitchShiftEnabled,
    firebaseAudioUrl,
    youtubePlayer,
    audioRef,
    isPitchShiftReady,
    initializePitchShift,
    cleanupPitchShift,
  ]);

  /**
   * Handle semitone changes WITHOUT debouncing
   * Update pitch immediately to prevent multiple audio sources
   *
   * CRITICAL FIX:
   * - NO debouncing - update pitch IMMEDIATELY
   * - Debouncing was causing the cleanup to cancel pitch updates
   * - This left old PitchShift nodes playing with different pitches
   * - Result: Multiple audio sources playing simultaneously
   *
   * - Tone.js PitchShift.pitch is a simple parameter update
   * - It does NOT create new audio nodes or restart playback
   * - Safe to update on every slider change
   *
   * ADDITIONAL FIX: Ensure playback continues after pitch change
   * - If audio was playing before pitch change, ensure it continues playing
   * - This prevents auto-pause when sliding the pitch slider
   */
  useEffect(() => {
    if (isPitchShiftEnabled && isPitchShiftReady && pitchShiftSemitones !== lastSemitones.current) {
      try {
        const service = pitchShiftService.current;

        // Update pitch IMMEDIATELY - no debouncing
        // CRITICAL: setPitch() only changes the pitch parameter
        // It does NOT stop or restart playback
        // The audio continues playing at the new pitch seamlessly
        service.setPitch(pitchShiftSemitones);
        lastSemitones.current = pitchShiftSemitones;

        // NOTE: No need to call service.play() here!
        // setPitch() is a simple parameter update that doesn't affect playback state
        // The playback sync effect will handle any necessary play/pause operations
      } catch (error) {
        console.error('❌ Failed to update pitch:', error);
        setPitchShiftError('Failed to update pitch shift amount.');
      }
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, pitchShiftSemitones, setPitchShiftError]);

  /**
   * Sync playback state with pitch shift service
   *
   * CRITICAL FIX: Prevent auto-pause during pitch changes
   * - Only sync if the playing state has actually changed
   * - This prevents the effect from pausing audio during re-renders
   */
  useEffect(() => {
    if (!isPitchShiftEnabled || !isPitchShiftReady) return;

    const service = pitchShiftService.current;
    const serviceState = service.getState();

    // DIAGNOSTIC: this effect is the primary candidate for "animation frozen
    // at current beat" — if `lastServicePlayingState.current` is ALREADY
    // equal to `isPlaying` when we get here, the recovery path is skipped
    // entirely, and the service stays paused forever even though the app
    // thinks it's playing. Emit the snapshot BEFORE the skip check so we
    // can see it in the log stream.
    _hookDiag('playbackSync.tick', {
      isPlayingProp: isPlaying,
      lastServicePlayingState: lastServicePlayingState.current,
      serviceIsPlaying: serviceState.isPlaying,
      serviceCurrentTime: Number(serviceState.currentTime.toFixed(3)),
      ctxState: getAudioContextState(),
      willSkipRecovery: isPlaying === lastServicePlayingState.current,
    });

    // CRITICAL: Only sync if playing state has actually changed
    // This prevents auto-pause during pitch changes or other re-renders
    if (isPlaying !== lastServicePlayingState.current) {
      lastServicePlayingState.current = isPlaying;

      if (isPlaying) {
        const youtubeTimelineTime = getYoutubeTimelineTime();
        if (youtubeTimelineTime !== null) {
          const drift = Math.abs(serviceState.currentTime - youtubeTimelineTime);
          if (drift > YOUTUBE_DRIFT_CORRECTION_THRESHOLD_SECONDS) {
            _hookDiag('playbackSync.seekBeforePlay', {
              drift,
              target: youtubeTimelineTime,
            });
            service.seek(youtubeTimelineTime);
          }
        }

        // Only call play() if service is not already playing
        if (!serviceState.isPlaying) {
          _hookDiag('playbackSync.callPlay');
          service.play();
        }
      } else {
        // Only call pause() if service is actually playing
        if (serviceState.isPlaying) {
          _hookDiag('playbackSync.callPause');
          service.pause();
        }
      }
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, isPlaying, getYoutubeTimelineTime]);

  /**
   * Sync seek position with pitch shift service
   *
   * CRITICAL FIX: Prevent seek feedback loop
   * - Only seek if time update is NOT from the pitch shift service itself
   * - This prevents the service from seeking to its own time updates
   * - Use lastSyncedTime to track the last time we synced from the service
   */
  useEffect(() => {
    if (!isPitchShiftEnabled || !isPitchShiftReady) return;

    const service = pitchShiftService.current;
    const serviceState = service.getState();
    const timeDiff = Math.abs(serviceState.currentTime - currentTime);

    // CRITICAL: Skip if time update came from pitch shift service
    // This prevents feedback loop where service updates time -> triggers seek -> updates time -> ...
    if (isTimeUpdateFromService.current) {
      return;
    }

    // Only seek if there's a significant difference (> 0.5 seconds)
    // This allows user-initiated seeks (from YouTube player, seek bar, etc.)
    // while preventing seeks from service's own time updates
    if (timeDiff > 0.5) {
      lastSyncedTime.current = currentTime;
      service.seek(currentTime);
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, currentTime]);

  /**
   * SLAVE RE-ANCHOR LOOP
   *
   * CLOCK AUTHORITY (post-unification): `youtubeMasterClock` is the single
   * source of truth for position. The GrainPlayer is a pure slave — it
   * produces audio but does not advance any counter on its own. This loop
   * runs every 40 ms while pitch shift is active and re-seeks the
   * GrainPlayer to the master's live position whenever drift exceeds a
   * rate-scaled threshold.
   *
   * KEY DESIGN POINTS
   *   • Frequency (40 ms / 25 Hz): dense enough that user-perceptible
   *     pitch/timing glitches from re-seeks stay under one grain
   *     (grainSize=200 ms), and sparse enough to avoid saturating the
   *     grain scheduler.
   *   • Drift threshold scales with rate: `0.08 * max(rate, 1)` — identical
   *     to the master clock's re-anchor hysteresis, so the slave never
   *     fires on noise the master already considers acceptable.
   *   • Absolute floor of 40 ms: below that, re-seeks are audible as
   *     "ticks" from grain-schedule boundary realignment.
   *   • No `seekTo()` on YouTube: the master receives YouTube's
   *     `onProgress` callbacks directly; if the iframe drifts, the master
   *     re-anchors and the slave follows automatically on the next tick.
   *   • Respects the seek fence (R2): the store's `lastUserSeekAt` gate
   *     also protects the slave, because `onUserSeek` on the master jumps
   *     the anchor forward/backward discontinuously — we want that jump
   *     applied in one re-seek, not smeared across several.
   */
  useEffect(() => {
    if (!isPitchShiftEnabled || !isPitchShiftReady) return;

    const service = pitchShiftService.current;

    // ANCHOR SYNC: When the master clock re-anchors (YouTube progress, user
    // seek, rate change), update the GrainPlayer's passive accumulator to
    // match so position extrapolations stay locked. Without this, the master
    // and GrainPlayer anchor to slightly different positions on every YouTube
    // re-anchor, producing a persistent 50-80ms offset that the slave loop
    // never corrects (both advance at the same rate → drift stays constant).
    //
    // SCRUB DETECTION (P0): `syncAnchor` only rewrites the passive-accumulator
    // numbers — it does NOT call `grainPlayer.stop()/start(newOffset)`, so
    // the audio buffer cursor keeps playing from its OLD position. That is
    // fine for sub-second drift corrections (keeps audio seamless). But
    // YouTube iframe native scrubs arrive through THIS exact path (the
    // iframe API has no reliable 'seeked' event, so the master clock's
    // drift-threshold branch in `onYoutubeProgress` is how those scrubs get
    // detected in the first place). When the jump is scrub-sized we must
    // actually SEEK the buffer, not merely rewrite the anchor — otherwise
    // the reported `currentTime` jumps to the scrubbed position while the
    // audio plays on from where it was (the reported bug). After the seek
    // we also have to bridge the slave loop's drift-check blindness:
    // `syncAnchor` would have set `_currentTime = positionSec` so the next
    // tick's `drift` reads ≈ 0 even while the buffer is still catching up;
    // by calling `seek` the service's own `_currentTime` is set to the
    // target and the grain scheduler restarts from the new offset, which
    // is what keeps audio, grid and iframe locked.
    const SCRUB_JUMP_THRESHOLD_SEC = 0.75;
    youtubeMasterClock.setReAnchorListener((positionSec, wallSec) => {
      // Measure the jump BEFORE touching the service — `syncAnchor` would
      // overwrite `_currentTime` to `positionSec`, masking the magnitude.
      const priorPos = service.getState().currentTime;
      const jump = Math.abs(positionSec - priorPos);
      if (jump >= SCRUB_JUMP_THRESHOLD_SEC) {
        try {
          service.seek(positionSec);
        } catch { /* best-effort: slave loop will retry */ }
      } else {
        service.syncAnchor(positionSec, wallSec);
      }
    });

    const SLAVE_LOOP_INTERVAL_MS = 40;
    const BASE_SLAVE_DRIFT_TOLERANCE_SEC = 0.08;

    const syncGrainPlayerToMaster = () => {
      if (!youtubeMasterClock.isPlaying()) {
        // Master is paused — ensure grain is paused too.
        const st = service.getState();
        if (st.isPlaying) {
          try { service.pause(); } catch { /* best-effort */ }
        }
        return;
      }

      const masterPos = youtubeMasterClock.getLivePosition();
      const rate = youtubeMasterClock.getRate();
      const serviceState = service.getState();

      if (!serviceState.isPlaying) {
        // SELF-HEALING: master is playing but grain is not.
        try {
          service.seek(masterPos);
          service.setPlaybackRate(rate);
          service.play();
        } catch {
          // best-effort: next tick will retry
        }
        return;
      }

      const drift = Math.abs(serviceState.currentTime - masterPos);
      const tolerance = BASE_SLAVE_DRIFT_TOLERANCE_SEC * Math.max(rate, 1);

      if (drift > tolerance) {
        try {
          service.seek(masterPos);
          _hookDiag('slave.reAnchor', {
            drift: Number(drift.toFixed(4)),
            masterPos: Number(masterPos.toFixed(4)),
            rate,
          });
        } catch {
          // best-effort: next tick will retry
        }
      }
    };

    syncGrainPlayerToMaster();
    const intervalId = window.setInterval(
      syncGrainPlayerToMaster,
      SLAVE_LOOP_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(intervalId);
      youtubeMasterClock.setReAnchorListener(null);
    };
  }, [
    isPitchShiftEnabled,
    isPitchShiftReady,
  ]);

  /**
   * Sync playback rate with pitch shift service
   *
   * REGRESSION FIX: Store pending playback rate changes and apply when service is ready
   * This prevents race conditions when user changes playback rate before initialization completes
   */
  useEffect(() => {
    if (!isPitchShiftEnabled) {
      // Pitch shift disabled - clear pending rate
      pendingPlaybackRate.current = null;
      return;
    }

    if (isPitchShiftReady) {
      // Service is ready - apply playback rate if it actually differs.
      // IDEMPOTENT CHECK: The playbackStore fan-out already called
      // service.setPlaybackRate() synchronously during the user's
      // slider event.  Calling it *again* here would trigger a
      // redundant counter-snap on the passive accumulator, advancing
      // the anchor by (elapsedWall × rate) twice and introducing a
      // tiny position discontinuity the slave loop then chases.
      const service = pitchShiftService.current;
      const currentRate = service.getState().playbackRate;
      if (Math.abs(currentRate - playbackRate) > 0.001) {
        service.setPlaybackRate(playbackRate);
      }
      pendingPlaybackRate.current = null;
    } else {
      // Service not ready - store for later application
      pendingPlaybackRate.current = playbackRate;
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, playbackRate]);

  /**
   * Apply pending playback rate when service becomes ready
   *
   * REGRESSION FIX: This ensures playback rate changes made before initialization
   * are applied as soon as the service is ready
   */
  useEffect(() => {
    if (isPitchShiftEnabled && isPitchShiftReady && pendingPlaybackRate.current !== null) {
      const service = pitchShiftService.current;
      const rate = pendingPlaybackRate.current;
      service.setPlaybackRate(rate);
      pendingPlaybackRate.current = null;
    }
  }, [isPitchShiftEnabled, isPitchShiftReady]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (resetServiceTimeUpdateFlagTimeout.current) {
        clearTimeout(resetServiceTimeUpdateFlagTimeout.current);
        resetServiceTimeUpdateFlagTimeout.current = null;
      }

      cleanupPitchShift().catch((error) => {
        console.error('❌ Failed to cleanup pitch shift on unmount:', error);
      });
    };
  }, [cleanupPitchShift]);

  /**
   * Expose volume control for pitch-shifted audio
   */
  const setPitchShiftVolume = useCallback((volume: number) => {
    if (isPitchShiftReady) {
      pitchShiftService.current.setVolume(volume);
    }
  }, [isPitchShiftReady]);

  const getPitchShiftVolume = useCallback((): number => {
    if (isPitchShiftReady) {
      return pitchShiftService.current.getVolume();
    }
    return 100;
  }, [isPitchShiftReady]);

  return {
    isPitchShiftReady,
    initializePitchShift,
    cleanupPitchShift,
    setPitchShiftVolume,
    getPitchShiftVolume,
  };
};

