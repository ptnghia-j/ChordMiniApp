import { useCallback } from 'react';
import { YouTubePlayer } from '@/types/youtube';

export interface NavigationHelpersDependencies {
  // State setters for UI controls
  setIsVideoMinimized: (updater: (prev: boolean) => boolean) => void;
  setIsFollowModeEnabled: (updater: (prev: boolean) => boolean) => void;
  
  // Audio source management
  preferredAudioSource: 'youtube' | 'extracted';
  setPreferredAudioSource: (source: 'youtube' | 'extracted') => void;
  youtubePlayer: YouTubePlayer | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export interface NavigationHelpers {
  handleTryAnotherVideo: () => void;
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;
  toggleAudioSource: () => void;
}

/**
 * Custom hook for navigation helper functions
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useNavigationHelpers = (deps: NavigationHelpersDependencies): NavigationHelpers => {
  const {
    setIsVideoMinimized,
    setIsFollowModeEnabled,
    preferredAudioSource,
    setPreferredAudioSource,
    youtubePlayer,
    audioRef
  } = deps;

  // Handle "Try Another Video" action
  const handleTryAnotherVideo = useCallback(() => {
    // Navigate back to search
    window.location.href = '/';
  }, []);

  // Function to toggle video minimization
  const toggleVideoMinimization = useCallback(() => {
    setIsVideoMinimized(prev => !prev);
  }, [setIsVideoMinimized]);

  // Function to toggle follow mode
  const toggleFollowMode = useCallback(() => {
    setIsFollowModeEnabled(prev => !prev);
  }, [setIsFollowModeEnabled]);

  // Function to toggle preferred audio source
  const toggleAudioSource = useCallback(() => {
    setPreferredAudioSource(preferredAudioSource === 'youtube' ? 'extracted' : 'youtube');

    // Mute/unmute appropriate audio source
    if (preferredAudioSource === 'youtube' && youtubePlayer) {
      // If switching to extracted, mute YouTube
      youtubePlayer.muted = true;
      if (audioRef.current) {
        audioRef.current.muted = false;
      }
    } else {
      // If switching to YouTube, mute extracted audio
      if (youtubePlayer) {
        youtubePlayer.muted = false;
      }
      if (audioRef.current) {
        audioRef.current.muted = true;
      }
    }
  }, [preferredAudioSource, setPreferredAudioSource, youtubePlayer, audioRef]);

  return {
    handleTryAnotherVideo,
    toggleVideoMinimization,
    toggleFollowMode,
    toggleAudioSource,
  };
};
