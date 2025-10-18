/**
 * Conditional Playback Controls Component
 * 
 * Wrapper component that provides playback controls with conditional YouTube control.
 * When pitch shift is enabled, YouTube playback is NOT controlled (only pitch shift plays).
 * When pitch shift is disabled, YouTube playback is controlled normally.
 * 
 * This component MUST be rendered INSIDE UIProvider to access isPitchShiftEnabled.
 */

'use client';

import React, { useMemo } from 'react';
import { YouTubePlayer } from '@/types/youtube';

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

interface ConditionalPlaybackControlsProps {
  youtubePlayer: YouTubePlayer | null;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setAudioPlayerState: (updater: (prev: AudioPlayerState) => AudioPlayerState) => void;
  children: (controls: {
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setPlayerPlaybackRate: (rate: number) => void;
  }) => React.ReactNode;
}

/**
 * Component that provides conditional playback controls based on pitch shift state.
 * This component MUST be rendered inside UIProvider.
 */
export const ConditionalPlaybackControls: React.FC<ConditionalPlaybackControlsProps> = ({
  youtubePlayer,
  setIsPlaying,
  setCurrentTime,
  setAudioPlayerState,
  children,
}) => {
  // Note: isPitchShiftEnabled is not needed here since YouTube playback is always controlled
  // When pitch shift is enabled, YouTube is muted but continues playing for visual sync

  // Create playback controls with conditional YouTube control
  const playbackControls = useMemo(() => ({
    play: () => {
      // CRITICAL FIX: Always control YouTube playback for visual sync
      // When pitch shift is enabled, YouTube is muted but continues playing
      // This ensures the video timeline stays synchronized with the pitch-shifted audio
      if (youtubePlayer) {
        try {
          youtubePlayer.playVideo();
        } catch (error) {
          console.warn('⚠️ Failed to play YouTube:', error);
        }
      }
      setIsPlaying(true);
    },

    pause: () => {
      // CRITICAL FIX: Always control YouTube playback for visual sync
      if (youtubePlayer) {
        try {
          youtubePlayer.pauseVideo();
        } catch (error) {
          console.warn('⚠️ Failed to pause YouTube:', error);
        }
      }
      setIsPlaying(false);
    },

    seek: (time: number) => {
      // Seek is allowed for both YouTube and pitch shift
      // YouTube seek updates the video position (visual sync)
      // Pitch shift seek is handled separately in usePitchShiftAudio
      if (youtubePlayer) {
        try {
          youtubePlayer.seekTo(time, 'seconds');
        } catch (error) {
          console.warn('⚠️ Failed to seek YouTube:', error);
        }
      }
      setCurrentTime(time);
    },

    setPlayerPlaybackRate: (rate: number) => {
      // Playback rate is allowed for both YouTube and pitch shift
      // YouTube rate updates the video speed (visual sync)
      // Pitch shift rate is handled separately in usePitchShiftAudio
      if (youtubePlayer) {
        try {
          youtubePlayer.setPlaybackRate(rate);
        } catch (error) {
          console.warn('⚠️ Failed to set YouTube playback rate:', error);
        }
      }
      setAudioPlayerState(prev => ({ ...prev, playbackRate: rate }));
    },
  }), [youtubePlayer, setIsPlaying, setCurrentTime, setAudioPlayerState]);

  // Render children with playback controls
  return <>{children(playbackControls)}</>;
};

export default ConditionalPlaybackControls;

