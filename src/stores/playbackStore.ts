import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { RefObject } from 'react';

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
  setIsVideoMinimized: (minimized: boolean) => void;
  setIsFollowModeEnabled: (enabled: boolean) => void;

  // Playback controls
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlayerPlaybackRate: (rate: number) => void;

  // Video UI toggles
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;

  // Beat click handler
  onBeatClick: (beatIndex: number, timestamp: number) => void;

  // Initialization
  reset: () => void;
}

export const usePlaybackStore = create<PlaybackStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
      audioRef: null,
      youtubePlayer: null,
      currentBeatIndex: 0,
      currentDownbeatIndex: 0,
      isVideoMinimized: false,
      isFollowModeEnabled: true,

      // State setters
      setIsPlaying: (playing) => set({ isPlaying: playing }, false, 'setIsPlaying'),

      setCurrentTime: (time) => set({ currentTime: time }, false, 'setCurrentTime'),

      setDuration: (duration) => set({ duration }, false, 'setDuration'),

      setPlaybackRate: (rate) => set({ playbackRate: rate }, false, 'setPlaybackRate'),

      setAudioRef: (ref) => set({ audioRef: ref }, false, 'setAudioRef'),

      setYoutubePlayer: (player) => set({ youtubePlayer: player }, false, 'setYoutubePlayer'),

      setCurrentBeatIndex: (index) => set({ currentBeatIndex: index }, false, 'setCurrentBeatIndex'),

      setCurrentDownbeatIndex: (index) => set({ currentDownbeatIndex: index }, false, 'setCurrentDownbeatIndex'),

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
        const player = state.youtubePlayer as { setPlaybackRate?: (rate: number) => void } | null;
        if (player && typeof player.setPlaybackRate === 'function') {
          player.setPlaybackRate(rate);
        }
        set({ playbackRate: rate }, false, 'setPlayerPlaybackRate');
      },

      // Video UI toggles
      toggleVideoMinimization: () =>
        set((state) => ({ isVideoMinimized: !state.isVideoMinimized }), false, 'toggleVideoMinimization'),

      toggleFollowMode: () =>
        set((state) => ({ isFollowModeEnabled: !state.isFollowModeEnabled }), false, 'toggleFollowMode'),

      // Beat click handler
      onBeatClick: (beatIndex, timestamp) => {
        const state = get();
        const player = state.youtubePlayer as { seekTo?: (time: number, allowSeekAhead: string) => void } | null;
        if (player && typeof player.seekTo === 'function') {
          player.seekTo(timestamp, 'seconds');
        }
        set(
          {
            currentBeatIndex: beatIndex,
            currentTime: timestamp,
          },
          false,
          'onBeatClick'
        );
      },

      // Reset state
      reset: () =>
        set(
          {
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            currentBeatIndex: 0,
            currentDownbeatIndex: 0,
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

