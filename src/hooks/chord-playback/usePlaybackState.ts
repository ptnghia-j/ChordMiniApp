import { useState, useRef, useCallback, useEffect } from 'react';
import { YouTubePlayer } from '@/types/youtube';
import { getPitchShiftService } from '@/services/audio/pitchShiftServiceInstance';
import { youtubeMasterClock } from '@/services/audio/youtubeMasterClock';
import {
  usePlaybackStore,
  useCurrentBeatIndex,
  useCurrentDownbeatIndex,
} from '@/stores/playbackStore';
import { useIsPitchShiftEnabled, useIsPitchShiftReady } from '@/stores/uiStore';
import { setYouTubePlayerMuted } from '@/utils/youtubePlayerAudio';

// Types for playback state management
interface ClickInfo {
  visualIndex: number;
  timestamp: number;
  clickTime: number;
}

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

interface UsePlaybackStateProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  youtubePlayer: YouTubePlayer | null;
  setYoutubePlayer: (player: YouTubePlayer | null) => void;
  audioPlayerState: AudioPlayerState;
  setAudioPlayerState: (updater: (prev: AudioPlayerState) => AudioPlayerState) => void;
  setDuration: (duration: number) => void;
  isFollowModeEnabled: boolean;
  // Optional: allow this hook to manage auto-scroll internally; off by default to avoid conflicts
  enableAutoScroll?: boolean;
}

interface UsePlaybackStateReturn {
  // Beat tracking state
  currentBeatIndex: number;
  setCurrentBeatIndex: (index: number) => void;
  currentBeatIndexRef: React.MutableRefObject<number>;
  currentDownbeatIndex: number;
  setCurrentDownbeatIndex: (index: number) => void;
  
  // Click handling state
  lastClickInfo: ClickInfo | null;
  setLastClickInfo: (info: ClickInfo | null) => void;
  
  // Speed adjustment state
  globalSpeedAdjustment: number | null;
  setGlobalSpeedAdjustment: (adjustment: number | null) => void;
  
  // Audio player state accessors
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  
  // Audio player state setters
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  
  // Event handlers
  handleBeatClick: (beatIndex: number, timestamp: number) => void;
  handleYouTubeReady: (player: unknown) => void;
  handleYouTubePlay: () => void;
  handleYouTubePause: () => void;
  handleYouTubeProgress: (state: { played: number; playedSeconds: number }) => void;
  scrollToCurrentBeat: () => void;
}

/**
 * Custom hook for managing playback state including beat tracking, click handling, and audio synchronization
 * Extracted from lines 311-330, 1122-1191, 2515-2590 of original component
 */
export const usePlaybackState = ({
  audioRef,
  youtubePlayer,
  setYoutubePlayer,
  audioPlayerState,
  setAudioPlayerState,
  setDuration,
  isFollowModeEnabled,
  enableAutoScroll = false,
}: UsePlaybackStateProps): UsePlaybackStateReturn => {

  // Current state for playback (lines 319-329)
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const isPitchShiftReady = useIsPitchShiftReady();

  // Beat/downbeat indices are owned by playbackStore. Subscribe to them here
  // so consumers of this hook see changes; avoid maintaining a duplicate
  // React state copy that must be kept in sync.
  const currentBeatIndex = useCurrentBeatIndex();
  const currentDownbeatIndex = useCurrentDownbeatIndex();
  const currentBeatIndexRef = useRef(-1);

  // Track recent user clicks for smart animation positioning
  const [lastClickInfo, setLastClickInfo] = useState<ClickInfo | null>(null);
  const [globalSpeedAdjustmentState, setGlobalSpeedAdjustmentState] = useState<number | null>(null); // Store calculated speed adjustment

  // Create stable setter functions with useCallback to prevent infinite loops.
  // The ref mirrors the store value so synchronous readers (e.g. the rAF loop)
  // can avoid waiting for a re-render.
  const setCurrentBeatIndex = useCallback((index: number) => {
    currentBeatIndexRef.current = index;
    usePlaybackStore.getState().setCurrentBeatIndex(index);
  }, []);

  const setCurrentDownbeatIndex = useCallback((index: number) => {
    usePlaybackStore.getState().setCurrentDownbeatIndex(index);
  }, []);

  const setGlobalSpeedAdjustment = useCallback((adjustment: number | null) => {
    setGlobalSpeedAdjustmentState(adjustment);
  }, []);

  // Extract state from audio player hook (lines 262-263)
  const { isPlaying, currentTime, duration, playbackRate } = audioPlayerState;

  const globalSpeedAdjustment = globalSpeedAdjustmentState;

  // Create setters for individual state properties (lines 265-272)
  const setIsPlaying = useCallback((playing: boolean) => {
    setAudioPlayerState(prev => ({ ...prev, isPlaying: playing }));
  }, [setAudioPlayerState]);

  const setCurrentTime = useCallback((time: number) => {
    setAudioPlayerState(prev => ({ ...prev, currentTime: time }));
  }, [setAudioPlayerState]);

  // Beat click navigation: seek the active playback source and update jump state once.
  const handleBeatClick = useCallback((beatIndex: number, timestamp: number) => {
    const clickTime = Date.now();

    // P0 FIX: When pitch-shift is active, clamp the click timestamp to the
    // actually-loaded audio buffer duration BEFORE any publisher writes. The
    // Firebase audio buffer can be 100-300 ms shorter than the YouTube video's
    // reported duration; an un-clamped click near the end would cause
    // GrainPlayer.seek() to clamp internally to `_duration`, and the clamped
    // value then propagates to all three surfaces, which users perceive as
    // "audio jumped to the end". By clamping up-front we keep all three
    // surfaces (store, GrainPlayer, YouTube) agreeing on the same safe target.
    let effectiveTimestamp = timestamp;
    if (isPitchShiftEnabled && isPitchShiftReady) {
      const service = getPitchShiftService();
      const serviceDuration = service?.getState().duration ?? 0;
      if (serviceDuration > 0 && timestamp > serviceDuration - 0.05) {
        const clamped = Math.max(0, serviceDuration - 0.05);
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[pitch-shift] beat click timestamp ${timestamp.toFixed(3)}s exceeds buffer duration ${serviceDuration.toFixed(3)}s; clamping to ${clamped.toFixed(3)}s`,
          );
        }
        effectiveTimestamp = clamped;
      }
    }

    // P0 FIX: Re-anchor the master clock with the EFFECTIVE (potentially
    // clamped) timestamp. The store's `onBeatClick` already called
    // `youtubeMasterClock.onUserSeek(timestamp)` with the RAW timestamp,
    // but if we clamped `effectiveTimestamp` (because the Firebase audio
    // buffer is shorter than the YouTube video), the master clock anchor
    // is now past the buffer boundary while the GrainPlayer (sought below)
    // is at the clamped position. Re-anchoring here keeps all three
    // surfaces — master clock, GrainPlayer, YouTube — pointing at the
    // same safe target. In the non-clamping case this call is idempotent.
    if (effectiveTimestamp !== timestamp) {
      youtubeMasterClock.onUserSeek(effectiveTimestamp);
    }

    // R2 + R3 FIX: This path was missing a `noteUserSeek()` call, which meant
    // the drift-correction loop in usePitchShiftAudio didn't know a user seek
    // had just happened. The loop would then fire a correction immediately
    // after the click — fighting the user's target. Calling this FIRST bumps
    // `seekToken` (aborts any in-flight async coordination work) and stamps
    // `lastUserSeekAt` so the 500 ms user-seek fence kicks in. Without this,
    // beat clicks at non-1× playback rates cause the "YouTube keeps
    // refreshing to catch up" flicker the user reported.
    const playbackStore = usePlaybackStore.getState();
    playbackStore.noteUserSeek();

    // Establish the clicked beat as the immediate visual source of truth before
    // asynchronous media players catch up to the target timestamp.
    setCurrentTime(effectiveTimestamp);
    setCurrentBeatIndex(beatIndex);
    setLastClickInfo({
      visualIndex: beatIndex,
      timestamp: effectiveTimestamp,
      clickTime,
    });

    playbackStore.setCurrentTime(effectiveTimestamp);

    if (isPitchShiftEnabled && isPitchShiftReady) {
      try {
        getPitchShiftService()?.seek(effectiveTimestamp);
      } catch {}
    }

    if (youtubePlayer && youtubePlayer.seekTo) {
      try {
        youtubePlayer.seekTo(effectiveTimestamp, 'seconds');

        // RATE RE-APPLY AFTER SEEK: the YouTube iframe silently resets its
        // effective playback rate during the seekTo round-trip (the rate
        // value reported by getPlaybackRate stays correct, but the rendered
        // frames for ~200–500 ms after seek are paced at ~1× until the
        // buffer catches up). At non-1× rates this produces: GrainPlayer
        // audio racing ahead at 2×, YouTube frames crawling at ~1.6×, drift
        // accumulates fast, drift-loop seeks again, cycle repeats — exactly
        // the "keeps refreshing like crazy" symptom. Re-push the rate ~250 ms
        // after the seek settles so the iframe picks up the intended tempo.
        if (
          isPitchShiftEnabled
          && isPitchShiftReady
          && Math.abs(playbackRate - 1) > 0.001
        ) {
          const playerWithRate = youtubePlayer as unknown as {
            setPlaybackRate?: (rate: number) => void;
          };
          if (typeof playerWithRate.setPlaybackRate === 'function') {
            setTimeout(() => {
              try {
                playerWithRate.setPlaybackRate!(playbackRate);
              } catch {}
            }, 250);
          }
        }
      } catch {}
    } else if (audioRef.current) {
      try {
        audioRef.current.currentTime = effectiveTimestamp;
      } catch {}
    }

  }, [audioRef, isPitchShiftEnabled, isPitchShiftReady, youtubePlayer, setCurrentTime, setCurrentBeatIndex, playbackRate]);

  // YouTube player event handlers (lines 1150-1191): Comprehensive player integration
  const handleYouTubeReady = useCallback((player: unknown) => {
    // console.log('YouTube player ready');

    // ReactPlayer doesn't directly expose the YouTube player instance
    // Instead, it provides a ref to the player object which has its own API
    // Type assertion to our YouTubePlayer interface
    const typedPlayer = player as YouTubePlayer;
    setYouTubePlayerMuted(typedPlayer, isPitchShiftEnabled);
    setYoutubePlayer(typedPlayer);

    // We can't directly call YouTube player methods here
    // ReactPlayer handles playback rate through its props
  }, [setYoutubePlayer, isPitchShiftEnabled]);

  const handleYouTubePlay = useCallback(() => {
    setYouTubePlayerMuted(youtubePlayer, isPitchShiftEnabled);
    // Update state when YouTube starts playing
    setIsPlaying(true);
    // CLOCK AUTHORITY: notify the master clock so its live-position
    // extrapolation begins advancing.
    youtubeMasterClock.onPlay();
  }, [youtubePlayer, isPitchShiftEnabled, setIsPlaying]);

  const handleYouTubePause = useCallback(() => {
    // Update state when YouTube pauses
    setIsPlaying(false);
    // CLOCK AUTHORITY: freeze the master clock's live position at the
    // current anchor so the beat animation stops advancing.
    youtubeMasterClock.onPause();
  }, [setIsPlaying]);

  const handleYouTubeProgress = useCallback((state: { played: number; playedSeconds: number }) => {
    // CLOCK AUTHORITY (post-unification): the YouTube iframe is the primary
    // controller and feeds its reported position into the master clock. The
    // master applies hysteresis (drift > 0.08 × rate or age > 400 ms) before
    // re-anchoring, so calling this on every onProgress tick is cheap and
    // correct. The master's `getLivePosition()` is the single source of
    // truth read by the beat animation rAF loop; we do NOT write to the
    // store here — that would compete with the master clock publish.
    youtubeMasterClock.onYoutubeProgress(state.playedSeconds);
  }, []);

  // Auto-scroll implementation (lines 2561-2576): Smooth scrolling to current beat
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      beatElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);

  // Auto-scroll when current beat changes (optional)
  useEffect(() => {
    if (enableAutoScroll) {
      scrollToCurrentBeat();
    }
  }, [currentBeatIndex, scrollToCurrentBeat, enableAutoScroll]);

  // Set up audio element event listeners (lines 2515-2553): Complete audio event handling
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleLoadedMetadata = () => {
      if (audioElement) {
        setDuration(audioElement.duration);
      }
    };

    const handlePlay = () => {
      // console.log(`🎵 AUDIO PLAY EVENT: Setting isPlaying=true`);
      setIsPlaying(true);
    };
    const handlePause = () => {
      // console.log(`⏸️ AUDIO PAUSE EVENT: Setting isPlaying=false`);
      setIsPlaying(false);
    };
    const handleTimeUpdate = () => {
      if (!audioElement) return;
      // CLOCK AUTHORITY GUARD: when pitch-shift is active, GrainPlayer is
      // the sole writer of `currentTime`. The HTMLAudioElement keeps playing
      // (muted) behind the scenes, and its `timeupdate` events run on a
      // different clock (native media element) than the Tone.js AudioContext
      // that drives the GrainPlayer counter. If we let this listener write,
      // it races the GrainPlayer tick and produces 90-300 ms backward-step
      // jitter in the store (the "GrainPlayer must be sole writer" guard
      // in playbackStore.setCurrentTime fires exactly this symptom).
      if (isPitchShiftEnabled && isPitchShiftReady) return;
      setCurrentTime(audioElement.currentTime);
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [audioRef, setCurrentTime, setDuration, setIsPlaying, isPitchShiftEnabled, isPitchShiftReady]);

  // Audio source management: YouTube is muted whenever pitch-shifted audio is
  // the active source, including after iframe-ready/replay cycles.
  useEffect(() => {
    if (youtubePlayer) {
      setYouTubePlayerMuted(youtubePlayer, isPitchShiftEnabled);
    }
    if (audioRef.current) {
      audioRef.current.muted = true;
    }
  }, [youtubePlayer, audioRef, isPitchShiftEnabled]);

  return {
    // Beat tracking state
    currentBeatIndex,
    setCurrentBeatIndex,
    currentBeatIndexRef,
    currentDownbeatIndex,
    setCurrentDownbeatIndex,
    
    // Click handling state
    lastClickInfo,
    setLastClickInfo,
    
    // Speed adjustment state
    globalSpeedAdjustment,
    setGlobalSpeedAdjustment,
    
    // Audio player state accessors
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    
    // Audio player state setters
    setIsPlaying,
    setCurrentTime,
    
    // Event handlers
    handleBeatClick,
    handleYouTubeReady,
    handleYouTubePlay,
    handleYouTubePause,
    handleYouTubeProgress,
    scrollToCurrentBeat,
  };
};
