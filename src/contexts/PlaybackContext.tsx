'use client';

import React, { createContext, useContext, useMemo, ReactNode, RefObject } from 'react';

// Playback state types
interface PlaybackState {
  // Audio player state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  
  // Player refs
  audioRef: RefObject<HTMLAudioElement>;
  youtubePlayer: unknown; // YouTube player instance
  
  // Playback controls
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlayerPlaybackRate: (rate: number) => void;
  
  // Video UI state
  isVideoMinimized: boolean;
  isFollowModeEnabled: boolean;
  
  // Video UI toggles
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;
  
  // State setters (for integration with existing hooks)
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setYoutubePlayer: (player: unknown) => void;
  setIsVideoMinimized: (minimized: boolean) => void;
  setIsFollowModeEnabled: (enabled: boolean) => void;
}

const PlaybackContext = createContext<PlaybackState | undefined>(undefined);

interface PlaybackProviderProps {
  children: ReactNode;
  // Inject existing state and handlers from hooks
  audioPlayerState: {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
  };
  audioRef: RefObject<HTMLAudioElement>;
  youtubePlayer: unknown;
  playbackControls: {
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setPlayerPlaybackRate: (rate: number) => void;
  };
  videoUIState: {
    isVideoMinimized: boolean;
    isFollowModeEnabled: boolean;
  };
  videoUIControls: {
    toggleVideoMinimization: () => void;
    toggleFollowMode: () => void;
  };
  // State setters for integration
  setters: {
    setIsPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    setPlaybackRate: (rate: number) => void;
    setYoutubePlayer: (player: unknown) => void;
    setIsVideoMinimized: (minimized: boolean) => void;
    setIsFollowModeEnabled: (enabled: boolean) => void;
  };
}

export const PlaybackProvider: React.FC<PlaybackProviderProps> = ({
  children,
  audioPlayerState,
  audioRef,
  youtubePlayer,
  playbackControls,
  videoUIState,
  videoUIControls,
  setters,
}) => {
  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo((): PlaybackState => ({
    // Audio player state
    isPlaying: audioPlayerState.isPlaying,
    currentTime: audioPlayerState.currentTime,
    duration: audioPlayerState.duration,
    playbackRate: audioPlayerState.playbackRate,
    
    // Player refs
    audioRef,
    youtubePlayer,
    
    // Playback controls
    play: playbackControls.play,
    pause: playbackControls.pause,
    seek: playbackControls.seek,
    setPlayerPlaybackRate: playbackControls.setPlayerPlaybackRate,
    
    // Video UI state
    isVideoMinimized: videoUIState.isVideoMinimized,
    isFollowModeEnabled: videoUIState.isFollowModeEnabled,
    
    // Video UI toggles
    toggleVideoMinimization: videoUIControls.toggleVideoMinimization,
    toggleFollowMode: videoUIControls.toggleFollowMode,
    
    // State setters
    setIsPlaying: setters.setIsPlaying,
    setCurrentTime: setters.setCurrentTime,
    setDuration: setters.setDuration,
    setPlaybackRate: setters.setPlaybackRate,
    setYoutubePlayer: setters.setYoutubePlayer,
    setIsVideoMinimized: setters.setIsVideoMinimized,
    setIsFollowModeEnabled: setters.setIsFollowModeEnabled,
  }), [
    audioPlayerState,
    audioRef,
    youtubePlayer,
    playbackControls,
    videoUIState,
    videoUIControls,
    setters,
  ]);

  return (
    <PlaybackContext.Provider value={contextValue}>
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = (): PlaybackState => {
  const context = useContext(PlaybackContext);
  if (context === undefined) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};

export default PlaybackContext;
