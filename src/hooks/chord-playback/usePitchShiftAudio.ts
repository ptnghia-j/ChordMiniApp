/**
 * Custom hook for managing pitch-shifted audio playback
 *
 * Integrates Tone.js pitch shifting with existing playback system.
 * Handles audio source switching between YouTube and pitch-shifted audio.
 *
 * Note: Accepts any audio URL (external stream URLs, Firebase Storage URLs, etc.)
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { YouTubePlayer } from '@/types/youtube';
import { getGrainPlayerPitchShiftService } from '@/services/audio/grainPlayerPitchShiftService';
import { setPitchShiftService as setGlobalPitchShiftService } from '@/services/audio/pitchShiftServiceInstance';
import {
  useIsPitchShiftEnabled,
  usePitchShiftSemitones,
  useSetIsProcessingPitchShift,
  useSetPitchShiftError,
  useSetIsFirebaseAudioAvailable
} from '@/stores/uiStore';

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
  const pitchShiftSemitones = usePitchShiftSemitones();
  const setIsProcessingPitchShift = useSetIsProcessingPitchShift();
  const setPitchShiftError = useSetPitchShiftError();
  const setIsFirebaseAudioAvailable = useSetIsFirebaseAudioAvailable();

  const [isPitchShiftReady, setIsPitchShiftReady] = useState(false);
  const pitchShiftService = useRef(getGrainPlayerPitchShiftService());
  const isInitializing = useRef(false);
  const lastSemitones = useRef(pitchShiftSemitones);

  // Track if time update is from pitch shift service (to prevent seek feedback loop)
  const isTimeUpdateFromService = useRef(false);

  // Track the last known playing state from the service (to prevent auto-pause)
  const lastServicePlayingState = useRef(false);

  // CRITICAL FIX: Track the last time we synced to prevent seek feedback loop
  // This prevents the seek effect from triggering on every time update from the service
  const lastSyncedTime = useRef(0);

  // REGRESSION FIX: Store pending playback rate to apply when service becomes ready
  // This prevents race conditions when playback rate is changed before service initialization completes
  const pendingPlaybackRate = useRef<number | null>(null);

  // Register service instance globally for volume control access
  useEffect(() => {
    setGlobalPitchShiftService(pitchShiftService.current);
    return () => {
      setGlobalPitchShiftService(null);
    };
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
      setIsProcessingPitchShift(true);
      setPitchShiftError(null);

      // CRITICAL: Reset tracking refs before initialization
      // This ensures playback sync works correctly even if user toggles multiple times
      lastServicePlayingState.current = false;
      isTimeUpdateFromService.current = false;
      lastSyncedTime.current = 0;

      // Load audio with current pitch shift amount
      await pitchShiftService.current.loadAudio(firebaseAudioUrl, pitchShiftSemitones);

      // Set up time update callback
      // CRITICAL FIX: Mark time updates from service to prevent seek feedback loop
      pitchShiftService.current.setOnTimeUpdate((time) => {
        isTimeUpdateFromService.current = true;
        lastSyncedTime.current = time;
        setCurrentTime(time);
        // Reset flag after React has processed the state update
        // Use a shorter delay to allow legitimate seeks to happen quickly
        setTimeout(() => {
          isTimeUpdateFromService.current = false;
        }, 50);
      });

      // Set up playback ended callback
      pitchShiftService.current.setOnEnded(() => {
        setIsPlaying(false);
      });

      setIsPitchShiftReady(true);
      setIsFirebaseAudioAvailable(true);
      lastSemitones.current = pitchShiftSemitones;
    } catch (error) {
      console.error('❌ Failed to initialize pitch shift:', error);
      setPitchShiftError('Failed to load pitch-shifted audio. Please try again.');
      setIsPitchShiftReady(false);
      setIsFirebaseAudioAvailable(false);
    } finally {
      setIsProcessingPitchShift(false);
      isInitializing.current = false;
    }
  }, [
    firebaseAudioUrl,
    pitchShiftSemitones,
    setIsProcessingPitchShift,
    setPitchShiftError,
    setIsFirebaseAudioAvailable,
    setCurrentTime,
    setIsPlaying,
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

    // Mark as not ready so we re-initialize on next toggle
    setIsPitchShiftReady(false);
    isInitializing.current = false;
  }, []);

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

    // CRITICAL: Only sync if playing state has actually changed
    // This prevents auto-pause during pitch changes or other re-renders
    if (isPlaying !== lastServicePlayingState.current) {
      lastServicePlayingState.current = isPlaying;

      if (isPlaying) {
        // Only call play() if service is not already playing
        if (!serviceState.isPlaying) {
          service.play();
        }
      } else {
        // Only call pause() if service is actually playing
        if (serviceState.isPlaying) {
          service.pause();
        }
      }
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, isPlaying]);

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
      // Service is ready - apply playback rate immediately
      const service = pitchShiftService.current;
      service.setPlaybackRate(playbackRate);
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

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Applied pending playback rate: ${rate.toFixed(2)}x (service now ready)`);
      }
    }
  }, [isPitchShiftEnabled, isPitchShiftReady]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
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

