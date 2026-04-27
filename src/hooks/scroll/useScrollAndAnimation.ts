import { useCallback, useEffect, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { YouTubePlayer } from '@/types/youtube';
import { useIsPitchShiftEnabled, useIsPitchShiftReady } from '@/stores/uiStore';
import { youtubeMasterClock } from '@/services/audio/youtubeMasterClock';
import {
  resolveBeatAtTime,
  findDownbeatIndexAtTime,
  INITIAL_HYSTERESIS_STATE,
  STABILITY_THRESHOLD,
  type HysteresisState,
} from '@/utils/beatResolver';

/**
 * DIAGNOSTIC TAG for logs emitted from the beat-grid animation loop. Paired
 * with `[pitch-diag/service]` and `[pitch-diag/hook]`, these three streams
 * let us reconstruct whether "animation frozen at current beat" is caused
 * by the rAF seeing a stuck `rawTime` (service-side freeze) or the rAF
 * correctly reading a live time but the resolver deciding not to emit a
 * new beat index. We throttle to ~1 Hz because the rAF loop runs at 20 fps
 * and we don't want to flood the console.
 */
const _ANIM_DIAG_TAG = '[pitch-diag/anim]';

// Define ChordGridData type based on the analyze page implementation
export interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount: number;
  originalAudioMapping?: Array<{
    timestamp: number;
    chord: string;
    visualIndex: number;
  }>;
  animationMapping?: Array<{
    timestamp: number;
    visualIndex: number;
    chord: string;
  }>;
}

export interface ScrollAndAnimationDependencies {
  // Audio and playback state
  youtubePlayer: YouTubePlayer | null; // YouTube player for timing
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  analysisResults: AnalysisResult | null;

  // Beat tracking state
  currentBeatIndex: number;
  currentBeatIndexRef: React.MutableRefObject<number>;
  setCurrentBeatIndex: (index: number) => void;
  setCurrentDownbeatIndex: (index: number) => void;
  setCurrentTime: (time: number) => void;

  // UI state
  isFollowModeEnabled: boolean;

  // Animation data
  chordGridData: ChordGridData | null;
  globalSpeedAdjustment: number | null;
  setGlobalSpeedAdjustment: (adjustment: number | null) => void;
  lastClickInfo: {
    visualIndex: number;
    timestamp: number;
    clickTime: number;
  } | null;
}

export interface ScrollAndAnimationHelpers {
  scrollToCurrentBeat: () => void;
}

/**
 * Custom hook for scroll and animation functions
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useScrollAndAnimation = (deps: ScrollAndAnimationDependencies): ScrollAndAnimationHelpers => {
  const {
    youtubePlayer,
    isPlaying,
    currentTime,
    playbackRate: _playbackRate,
    analysisResults,
    currentBeatIndex,
    currentBeatIndexRef,
    setCurrentBeatIndex,
    setCurrentDownbeatIndex,
    setCurrentTime,
    isFollowModeEnabled,
    chordGridData,
    globalSpeedAdjustment,
    setGlobalSpeedAdjustment,
    lastClickInfo,
  } = deps;
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const isPitchShiftReady = useIsPitchShiftReady();
  const isPitchShiftTimeAuthorityActive = isPitchShiftEnabled && isPitchShiftReady;
  const currentTimeRef = useRef(currentTime);
  // LIVE-CLOCK SOURCE: always read the current singleton on every rAF tick.
  // We must NOT cache the service in a useRef, because React StrictMode
  // double-mount (or pitch-shift toggle cleanup) resets the singleton and
  // creates a fresh instance — a stale ref would read from the disposed
  // instance forever (currentTime=0, isPlaying=false).

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // ANTI-JITTER: Hysteresis-based beat tracking to prevent oscillation
  // The full cascade (padding lookup, BPM virtual estimation, audio-mapping
  // binary search, stability gating, dwell/rewind handling) now lives in the
  // pure `resolveBeatAtTime` utility. This hook only owns the rAF scheduling,
  // the React state writes, and the hysteresis bookkeeping ref.
  const hysteresisStateRef = useRef<HysteresisState>(INITIAL_HYSTERESIS_STATE);

  // PERFORMANCE P1-D: Page Visibility API — pause rAF computation when tab is hidden
  const isTabVisibleRef = useRef(true);

  useEffect(() => {
    const handleVisibility = () => {
      isTabVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // PERFORMANCE P3-H: Time-delta tracking to skip redundant computation
  const lastComputedTimeRef = useRef(0);

  // PERFORMANCE FIX #3: Auto-scroll optimization
  // Track last scroll time and beat index to reduce scroll frequency
  const lastScrollTimeRef = useRef(0);
  const lastScrolledBeatIndexRef = useRef(-1);
  // Track last scrolled measure to trigger scrolls only on measure boundaries (downbeats)
  const lastScrolledMeasureIndexRef = useRef(-1);

  // JITTER GUARDS: `hysteresisStateRef` above tracks last emitted beat,
  // last emit time, and previous frame time for dwell/rewind checks.

  // ANTI-JITTER: Centralized state update function to prevent multiple conflicting updates
  const updateBeatIndexSafely = useCallback((
    newBeatIndex: number,
    options?: {
      downbeatIndex?: number;
      emitTime?: number;
    }
  ) => {
    const beatChanged = currentBeatIndexRef.current !== newBeatIndex;

    if (!beatChanged && typeof options?.downbeatIndex !== 'number') {
      return;
    }

    unstable_batchedUpdates(() => {
      if (beatChanged) {
        currentBeatIndexRef.current = newBeatIndex;
        setCurrentBeatIndex(newBeatIndex);
        hysteresisStateRef.current = {
          ...hysteresisStateRef.current,
          lastEmittedBeat: newBeatIndex,
          lastEmitTime: typeof options?.emitTime === 'number'
            ? options.emitTime
            : hysteresisStateRef.current.lastEmitTime,
        };
      }

      if (typeof options?.downbeatIndex === 'number') {
        setCurrentDownbeatIndex(options.downbeatIndex);
      }
    });
  }, [setCurrentBeatIndex, currentBeatIndexRef, setCurrentDownbeatIndex]);

  // PERFORMANCE FIX #3: Optimized auto-scrolling with reduced frequency
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    // Measure-boundary gating: only scroll when entering a new measure (downbeat)
    const beatTime = (typeof chordGridData?.beats?.[currentBeatIndex] === 'number')
      ? (chordGridData!.beats![currentBeatIndex] as number)
      : null;
    if (beatTime === null) return;

    const measureIndex = findDownbeatIndexAtTime(beatTime, analysisResults?.downbeats);
    if (measureIndex === -1) return;

    const downbeats = analysisResults?.downbeats || [];
    const downbeatTime = downbeats[measureIndex];
    const DOWNBEAT_TOLERANCE = 0.12; // 120ms tolerance
    const isAtDownbeat = Math.abs(beatTime - downbeatTime) <= DOWNBEAT_TOLERANCE;

    // Only scroll exactly at downbeat and only once per measure
    if (!isAtDownbeat || measureIndex === lastScrolledMeasureIndexRef.current) {
      return;
    }

    const now = Date.now();

    // Preserve throttle: max 5 scrolls/second
    if (now - lastScrollTimeRef.current < 200) {
      return;
    }

    // Keep position-based debouncing as an extra guard
    const beatIndexDelta = Math.abs(currentBeatIndex - lastScrolledBeatIndexRef.current);
    if (beatIndexDelta === 0) {
      return; // Same beat, no need to scroll
    }
    if (beatIndexDelta <= 2 && now - lastScrollTimeRef.current < 400) {
      return;
    }

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      // Find nearest scrollable container (fallback to window viewport)
      const getNearestScrollContainer = (el: HTMLElement | null): HTMLElement | null => {
        let node: HTMLElement | null = el?.parentElement || null;
        while (node) {
          const style = window.getComputedStyle(node);
          const overflowY = style.overflowY;
          const hasScrollableY = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
          if (hasScrollableY) return node;
          node = node.parentElement;
        }
        return null;
      };

      const containerEl = getNearestScrollContainer(beatElement);
      const elementRect = beatElement.getBoundingClientRect();

      if (containerEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const containerHeight = containerRect.height;
        const containerCenter = containerRect.top + containerHeight / 2;
        const elementCenter = elementRect.top + elementRect.height / 2;
        const deltaFromCenter = elementCenter - containerCenter;

        // Viewport boundary check relative to the scroll container
        const isOutsideViewport = elementRect.bottom < containerRect.top || elementRect.top > containerRect.bottom;

        // Comfort zone scaled by container size: 20% of container height, clamped to [24, 80] px
        const comfortZone = Math.min(80, Math.max(24, containerHeight * 0.2));
        const isOutsideComfortZone = Math.abs(deltaFromCenter) > comfortZone;

        if (!isOutsideViewport && !isOutsideComfortZone) {
          return; // Element is visible and reasonably centered within container, skip scroll
        }
      } else {
        // Fallback: window viewport logic
        const viewportHeight = window.innerHeight;
        const viewportCenter = viewportHeight / 2;
        const elementCenter = elementRect.top + elementRect.height / 2;
        const delta = elementCenter - viewportCenter;
        const isOutsideViewport = elementRect.bottom < 0 || elementRect.top > viewportHeight;
        const isOutsideComfortZone = Math.abs(delta) > 80;
        if (!isOutsideViewport && !isOutsideComfortZone) {
          return;
        }
      }

      // OPTIMIZATION: Single RAF; set measure + beat tracking and choose scroll behavior
      requestAnimationFrame(() => {
        lastScrollTimeRef.current = Date.now();
        lastScrolledBeatIndexRef.current = currentBeatIndex;
        lastScrolledMeasureIndexRef.current = measureIndex;
        const isMobile = typeof window !== 'undefined' && ((window.innerWidth <= 768) || (/Mobi|Android/i.test(navigator.userAgent)));
        beatElement.scrollIntoView({
          behavior: isMobile ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled, chordGridData, analysisResults]);

  // Auto-scroll when current beat changes
  useEffect(() => {
    scrollToCurrentBeat();
  }, [currentBeatIndex, scrollToCurrentBeat, isFollowModeEnabled]); // Include isFollowModeEnabled dependency

  // PERFORMANCE OPTIMIZATION: RequestAnimationFrame with frame skipping
  const rafRef = useRef<number | undefined>(undefined);
  const frameCounterRef = useRef<number>(0);
  const FRAME_SKIP = 2; // Run every 3rd frame (60fps / 3 = 20fps)
  // PERFORMANCE OPTIMIZATION: Debounce state updates to reduce re-renders
  const lastStateUpdateTimeRef = useRef<number>(0);
  const STATE_UPDATE_INTERVAL = 50; // Update at most every 50ms (20fps) instead of 60fps

  // PERFORMANCE OPTIMIZATION: Throttle currentTime writes to store to reduce re-renders
  const lastTimeUpdateRef = useRef<number>(0);
  
  // DIAGNOSTIC: throttle log counter for the rAF loop. Set at most once per
  // ~1000 ms of wall-clock time. Outside the effect so successive effect runs
  // keep rate-limiting correctly across re-renders.
  const TIME_UPDATE_INTERVAL = 100; // Keep visual/audio consumers fresher to reduce residual interpolation snaps

  const resetAnimationTrackingState = useCallback((timestamp: number, visualIndex: number = -1) => {
    const shouldSeedBeat = visualIndex >= 0;

    currentTimeRef.current = timestamp;
    lastComputedTimeRef.current = Number.NEGATIVE_INFINITY;
    lastStateUpdateTimeRef.current = 0;
    hysteresisStateRef.current = {
      lastStableBeat: shouldSeedBeat ? visualIndex : -1,
      beatStabilityCounter: shouldSeedBeat ? STABILITY_THRESHOLD : 0,
      lastEmittedBeat: shouldSeedBeat ? visualIndex : -1,
      lastEmitTime: timestamp,
      prevTime: timestamp,
    };
  }, []);

  useEffect(() => {
    if (!lastClickInfo) {
      return;
    }

    // Manual beat jumps must also reset the animation hook's internal rewind
    // guards. Otherwise a backward seek can inherit the prior forward-only
    // state and appear frozen until playback catches back up.
    resetAnimationTrackingState(lastClickInfo.timestamp, lastClickInfo.visualIndex);
  }, [lastClickInfo, resetAnimationTrackingState]);

  // Update current time and check for current beat
  useEffect(() => {
    // CRITICAL FIX: Only set up animation loop when playing
    // This prevents unnecessary CPU usage when paused
    if (!analysisResults || !isPlaying) {
      return;
    }

    // UNIFIED CLOCK: the master clock always returns a usable position once
    // it's been anchored (cold-start is handled inside the master by a
    // `onYoutubeProgress` or `onUserSeek`). We therefore no longer need to
    // require `youtubePlayer.getCurrentTime` as a precondition for the rAF
    // to run — the master is the single source of truth regardless of
    // whether pitch shift is active.

    lastComputedTimeRef.current = Number.NEGATIVE_INFINITY;

    // PERFORMANCE OPTIMIZATION: Use RequestAnimationFrame with frame skipping
    // This provides 20fps updates (every 3rd frame) to match state update throttle
    const updateBeatTracking = () => {
      // CRITICAL FIX: Check current playing state dynamically
      // If paused, stop the loop immediately (don't schedule next frame)
      if (!isPlaying) {
        return; // Stop the loop when paused
      }

      // PERFORMANCE FIX #1: Frame skipping to reduce CPU usage
      // Increment frame counter and skip frames that don't match our target rate
      frameCounterRef.current++;
      if (frameCounterRef.current % (FRAME_SKIP + 1) !== 0) {
        // Skip this frame, but schedule next one to maintain loop
        rafRef.current = requestAnimationFrame(updateBeatTracking);
        return;
      }

      // PERFORMANCE P1-D: Skip expensive beat tracking computation when tab is hidden
      // The rAF loop continues to run but skips all CPU-intensive work
      if (!isTabVisibleRef.current) {
        rafRef.current = requestAnimationFrame(updateBeatTracking);
        return;
      }

      // UNIFIED CLOCK: the beat grid reads from the YouTube master clock on
      // EVERY rAF tick, regardless of whether pitch shift is active. The
      // master extrapolates `performance.now() × rate` between YouTube
      // progress samples, so the grid always animates smoothly even when
      // YT's onProgress fires infrequently. When pitch shift is active the
      // GrainPlayer is a slave that re-anchors to this same master in
      // `usePitchShiftAudio`'s 40 ms slave loop — so the grid, the video,
      // and the pitch-shifted audio are all locked to ONE time source.
      const rawTime = youtubeMasterClock.getLivePosition();
      const time = rawTime;

      // NOTE: The previous implementation extrapolated a "virtual click time"
      // from Date.now() and `playbackRate` to paper over player seek latency
      // after a beat click. That extrapolation was a third, independent place
      // where `playbackRate` was applied to time advancement and was a known
      // source of desync when the slider changed. With the unified clock
      // (GrainPlayer master on pitch-shift, YouTube master otherwise) the
      // click handler seeds `currentTime` synchronously before the next rAF,
      // so the raw clock is always good enough.

      const REWIND_RESET_THRESHOLD_SECONDS = 0.2;
      if (time + REWIND_RESET_THRESHOLD_SECONDS < hysteresisStateRef.current.prevTime) {
        // Native YouTube replay/scrub actions can jump backward without going
        // through the beat-grid click path. Reset the forward-only guards so
        // the animation can immediately re-lock to the new timeline position.
        resetAnimationTrackingState(time);
      }

      // PERFORMANCE P3-H: Skip computation if player time hasn't meaningfully changed
      // This avoids redundant binary searches and state updates on near-identical frames
      if (Math.abs(time - lastComputedTimeRef.current) < 0.01) {
        rafRef.current = requestAnimationFrame(updateBeatTracking);
        return;
      }
      lastComputedTimeRef.current = time;
      const stamp = Date.now();
      // UNIFIED CLOCK: publish the master clock's live position to React
      // state every TIME_UPDATE_INTERVAL ms regardless of whether pitch
      // shift is active. Previously this publish was gated on
      // `!isPitchShiftTimeAuthorityActive` because the GrainPlayer's
      // time-update callback owned the publish in pitch-shift mode; with
      // the master as single source of truth the gate is no longer needed
      // and a uniform rate here eliminates the divergence between the two
      // modes that users could feel when toggling pitch shift.
      if (stamp - lastTimeUpdateRef.current >= TIME_UPDATE_INTERVAL) {
        setCurrentTime(time);
        lastTimeUpdateRef.current = stamp;
      }

        // DEBUG: Log animation interval execution every 5 seconds
        // if (Math.floor(time) % 5 === 0 && Math.floor(time * 10) % 10 === 0) {
        //   console.log(`🔄 ANIMATION INTERVAL: time=${time.toFixed(3)}s, isPlaying=${isPlaying}, chordGridData exists=${!!chordGridData}, currentBeatIndex=${currentBeatIndexRef.current}, manualOverride=${manualBeatIndexOverride}`);
        // }

        // Delegate the full beat-resolution cascade to the pure utility.
        // The utility returns the next hysteresis state and (optionally) a
        // new global speed adjustment; this hook is responsible only for
        // React state writes, the rAF schedule, and time bookkeeping.
        if (chordGridData && chordGridData.chords.length > 0) {
          const result = resolveBeatAtTime({
            time,
            chordGridData,
            analysisResults,
            hysteresisState: hysteresisStateRef.current,
            globalSpeedAdjustment,
          });

          hysteresisStateRef.current = result.nextHysteresisState;

          if (result.nextGlobalSpeedAdjustment !== globalSpeedAdjustment) {
            setGlobalSpeedAdjustment(result.nextGlobalSpeedAdjustment);
          }

          if (!result.shouldSkipEmit) {
            const now = Date.now();
            const shouldUpdate =
              (now - lastStateUpdateTimeRef.current >= STATE_UPDATE_INTERVAL) ||
              (currentBeatIndexRef.current !== result.beatIndex);

            if (shouldUpdate) {
              updateBeatIndexSafely(result.beatIndex, {
                downbeatIndex: result.downbeatIndex,
                emitTime: time,
              });
              lastStateUpdateTimeRef.current = now;
            }
          }
        }

      // PERFORMANCE OPTIMIZATION: Schedule next frame for smooth 60fps updates
      // Only schedule if still playing (checked at start of next frame)
      hysteresisStateRef.current = {
        ...hysteresisStateRef.current,
        prevTime: time,
      };
      rafRef.current = requestAnimationFrame(updateBeatTracking);
    };

    // Start the animation loop only when playing
    rafRef.current = requestAnimationFrame(updateBeatTracking);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      // Reset frame counter when effect cleanup runs
      frameCounterRef.current = 0;
    };
  // CRITICAL FIX: Include isPlaying to ensure animation starts/stops when playback changes
  // The effect will restart the loop when isPlaying becomes true
  // and cleanup will stop it when isPlaying becomes false
  }, [isPlaying, analysisResults, youtubePlayer, chordGridData, globalSpeedAdjustment, lastClickInfo, currentBeatIndexRef, setCurrentBeatIndex, setCurrentDownbeatIndex, setGlobalSpeedAdjustment, setCurrentTime, updateBeatIndexSafely, isPitchShiftTimeAuthorityActive, resetAnimationTrackingState]); // Updated to use centralized beat updates

  return {
    scrollToCurrentBeat,
  };
};
