import { useState, useCallback, useRef, useEffect } from 'react';
import { YouTubePlayer } from '@/types/youtube';

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  preferredAudioSource: 'youtube' | 'extracted';
}

export const useAudioPlayer = (audioUrl?: string) => {
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    preferredAudioSource: 'extracted'
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const [youtubePlayer, setYoutubePlayer] = useState<YouTubePlayer | null>(null);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
    if (audioRef.current && state.preferredAudioSource === 'extracted') {
      audioRef.current.play().catch(console.error);
    }
    if (youtubePlayer && state.preferredAudioSource === 'youtube') {
      youtubePlayer.playVideo();
    }
  }, [state.preferredAudioSource, youtubePlayer]);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
    if (audioRef.current && state.preferredAudioSource === 'extracted') {
      audioRef.current.pause();
    }
    if (youtubePlayer && state.preferredAudioSource === 'youtube') {
      youtubePlayer.pauseVideo();
    }
  }, [state.preferredAudioSource, youtubePlayer]);

  const seek = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
    if (audioRef.current && state.preferredAudioSource === 'extracted') {
      audioRef.current.currentTime = time;
    }
    if (youtubePlayer && state.preferredAudioSource === 'youtube') {
      youtubePlayer.seekTo(time, 'seconds');
    }
  }, [state.preferredAudioSource, youtubePlayer]);

  const setPlaybackRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, playbackRate: rate }));
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    if (youtubePlayer) {
      youtubePlayer.setPlaybackRate(rate);
    }
  }, [youtubePlayer]);

  const setPreferredAudioSource = useCallback((source: 'youtube' | 'extracted') => {
    setState(prev => ({ ...prev, preferredAudioSource: source }));
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  const handleLoadedMetadata = useCallback((duration: number) => {
    setState(prev => ({ ...prev, duration }));
  }, []);

  const handleYouTubePlayerReady = useCallback((player: YouTubePlayer) => {
    setYoutubePlayer(player);
  }, []);

  // Sync audio sources based on preference
  useEffect(() => {
    if (youtubePlayer && audioRef.current) {
      if (state.preferredAudioSource === 'youtube') {
        youtubePlayer.muted = false;
        audioRef.current.muted = true;
      } else {
        youtubePlayer.muted = true;
        audioRef.current.muted = false;
      }
    }
  }, [state.preferredAudioSource, youtubePlayer]);

  const setDuration = useCallback((duration: number) => {
    setState(prev => ({ ...prev, duration }));
  }, []);

  return {
    state,
    audioRef,
    youtubePlayer,
    play,
    pause,
    seek,
    setPlaybackRate,
    setPreferredAudioSource,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleYouTubePlayerReady,
    setState,
    setYoutubePlayer,
    setDuration
  };
};
