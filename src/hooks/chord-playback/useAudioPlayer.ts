import { useState, useCallback, useRef, useEffect } from 'react';
import { YouTubePlayer } from '@/types/youtube';

export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

export const useAudioPlayer = () => {
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const [youtubePlayer, setYoutubePlayer] = useState<YouTubePlayer | null>(null);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
    if (youtubePlayer) {
      youtubePlayer.playVideo();
    }
  }, [youtubePlayer]);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
    if (youtubePlayer) {
      youtubePlayer.pauseVideo();
    }
  }, [youtubePlayer]);

  const seek = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
    if (youtubePlayer) {
      youtubePlayer.seekTo(time, 'seconds');
    }
  }, [youtubePlayer]);

  const setPlaybackRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, playbackRate: rate }));
    if (youtubePlayer) {
      youtubePlayer.setPlaybackRate(rate);
    }
  }, [youtubePlayer]);



  const handleTimeUpdate = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  const handleLoadedMetadata = useCallback((duration: number) => {
    setState(prev => ({ ...prev, duration }));
  }, []);

  const handleYouTubePlayerReady = useCallback((player: YouTubePlayer) => {
    setYoutubePlayer(player);
  }, []);

  // Ensure YouTube player is unmuted and extracted audio is muted
  useEffect(() => {
    if (youtubePlayer) {
      youtubePlayer.muted = false;
    }
    if (audioRef.current) {
      audioRef.current.muted = true;
    }
  }, [youtubePlayer]);

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
    handleTimeUpdate,
    handleLoadedMetadata,
    handleYouTubePlayerReady,
    setState,
    setYoutubePlayer,
    setDuration
  };
};
