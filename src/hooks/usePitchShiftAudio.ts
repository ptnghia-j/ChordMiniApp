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
import { getPitchShiftService } from '@/services/pitchShiftService';
import { setPitchShiftService as setGlobalPitchShiftService } from '@/services/pitchShiftServiceInstance';
import { useUI } from '@/contexts/UIContext';

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
  const {
    isPitchShiftEnabled,
    pitchShiftSemitones,
    setIsProcessingPitchShift,
    setPitchShiftError,
    setIsFirebaseAudioAvailable,
  } = useUI();

  const [isPitchShiftReady, setIsPitchShiftReady] = useState(false);
  const pitchShiftService = useRef(getPitchShiftService());
  const isInitializing = useRef(false);
  const lastSemitones = useRef(pitchShiftSemitones);

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
    console.log(`🎵 Audio URL ${isAvailable ? 'available' : 'not available'} for pitch shift:`, firebaseAudioUrl);
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
      console.log('⏳ Pitch shift already initializing...');
      return;
    }

    try {
      isInitializing.current = true;
      setIsProcessingPitchShift(true);
      setPitchShiftError(null);

      console.log('🎵 Initializing pitch shift service with audio URL:', firebaseAudioUrl);

      // Load audio with current pitch shift amount
      await pitchShiftService.current.loadAudio(firebaseAudioUrl, pitchShiftSemitones);

      // Set up time update callback
      pitchShiftService.current.setOnTimeUpdate((time) => {
        setCurrentTime(time);
      });

      // Set up playback ended callback
      pitchShiftService.current.setOnEnded(() => {
        setIsPlaying(false);
      });

      setIsPitchShiftReady(true);
      setIsFirebaseAudioAvailable(true);
      lastSemitones.current = pitchShiftSemitones;

      console.log('✅ Pitch shift service initialized successfully');
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
   */
  const cleanupPitchShift = useCallback(() => {
    console.log('🧹 Cleaning up pitch shift service');
    pitchShiftService.current.dispose();
    setIsPitchShiftReady(false);
    isInitializing.current = false;
  }, []);

  /**
   * Handle pitch shift toggle
   * Switch between YouTube and pitch-shifted audio
   */
  useEffect(() => {
    if (isPitchShiftEnabled && firebaseAudioUrl) {
      // Pitch shift enabled: mute YouTube, initialize pitch shift
      console.log('🎚️ Pitch shift enabled, switching to pitch-shifted audio');

      if (youtubePlayer) {
        // Use YouTube IFrame API mute() method
        if (typeof youtubePlayer.mute === 'function') {
          youtubePlayer.mute();
          console.log('🔇 YouTube player muted via mute() method');
        } else {
          youtubePlayer.muted = true;
          console.log('🔇 YouTube player muted via muted property');
        }
        // Optionally pause YouTube to save bandwidth
        // youtubePlayer.pauseVideo();
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
      console.log('🎚️ Pitch shift disabled, switching to YouTube audio');

      if (youtubePlayer) {
        // Use YouTube IFrame API unMute() method
        if (typeof youtubePlayer.unMute === 'function') {
          youtubePlayer.unMute();
          console.log('🔊 YouTube player unmuted via unMute() method');
        } else {
          youtubePlayer.muted = false;
          console.log('🔊 YouTube player unmuted via muted property');
        }
      }

      if (audioRef.current) {
        audioRef.current.muted = true; // Keep extracted audio muted
      }

      // Cleanup pitch shift service
      if (isPitchShiftReady) {
        cleanupPitchShift();
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
   * Handle semitone changes
   * Update pitch without reloading audio
   */
  useEffect(() => {
    if (isPitchShiftEnabled && isPitchShiftReady && pitchShiftSemitones !== lastSemitones.current) {
      console.log(`🎚️ Updating pitch shift: ${pitchShiftSemitones} semitones`);
      
      try {
        pitchShiftService.current.setPitch(pitchShiftSemitones);
        lastSemitones.current = pitchShiftSemitones;
      } catch (error) {
        console.error('❌ Failed to update pitch:', error);
        setPitchShiftError('Failed to update pitch shift amount.');
      }
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, pitchShiftSemitones, setPitchShiftError]);

  /**
   * Sync playback state with pitch shift service
   */
  useEffect(() => {
    if (!isPitchShiftEnabled || !isPitchShiftReady) return;

    const service = pitchShiftService.current;

    if (isPlaying) {
      service.play();
    } else {
      service.pause();
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, isPlaying]);

  /**
   * Sync seek position with pitch shift service
   */
  useEffect(() => {
    if (!isPitchShiftEnabled || !isPitchShiftReady) return;

    const service = pitchShiftService.current;
    const serviceState = service.getState();

    // Only seek if there's a significant difference (> 0.5 seconds)
    if (Math.abs(serviceState.currentTime - currentTime) > 0.5) {
      service.seek(currentTime);
    }
  }, [isPitchShiftEnabled, isPitchShiftReady, currentTime]);

  /**
   * Sync playback rate with pitch shift service
   */
  useEffect(() => {
    if (!isPitchShiftEnabled || !isPitchShiftReady) return;

    const service = pitchShiftService.current;
    service.setPlaybackRate(playbackRate);
  }, [isPitchShiftEnabled, isPitchShiftReady, playbackRate]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanupPitchShift();
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

