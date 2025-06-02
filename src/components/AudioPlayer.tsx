'use client';

import React, { useRef, useEffect, /* useState,*/ useCallback } from 'react';
import { YouTubePlayer } from '@/types/youtube';
// import { useTheme } from '@/contexts/ThemeContext';

interface AudioPlayerProps {
  audioUrl?: string;
  youtubeVideoId?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  preferredAudioSource: 'youtube' | 'extracted';
  onPlay: () => void;
  onPause: () => void;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onSeek: (time: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onPreferredAudioSourceChange: (source: 'youtube' | 'extracted') => void;
  onYouTubePlayerReady?: (player: YouTubePlayer) => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  youtubeVideoId,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  preferredAudioSource,
  onPlay,
  onPause,
  onTimeUpdate,
  onLoadedMetadata,
  onSeek,
  onPlaybackRateChange,
  onPreferredAudioSourceChange,
  // onYouTubePlayerReady,
  audioRef: externalAudioRef
}) => {
  //const { theme } = useTheme();
  const internalAudioRef = useRef<HTMLAudioElement>(null);
  const audioRef = externalAudioRef || internalAudioRef;
  // const [youtubePlayer, setYoutubePlayer] = useState<any>(null);

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle audio element events
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      onLoadedMetadata(audioRef.current.duration);
    }
  }, [onLoadedMetadata]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      onTimeUpdate(audioRef.current.currentTime);
    }
  }, [onTimeUpdate]);

  const handlePlay = useCallback(() => {
    onPlay();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    onPause();
  }, [onPause]);

  // Sync audio element with props
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(console.error);
      } else if (!isPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle seeking
  const handleSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    onSeek(newTime);
  }, [duration, onSeek]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  // Playback rate options
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  return (
    <div className="w-full p-3 bg-gray-50 dark:bg-content-bg rounded-lg mb-3 transition-colors duration-300 border border-gray-200 dark:border-gray-600">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        className="hidden"
      />

      {/* Player controls */}
      <div className="flex items-center justify-between mb-4">
        {/* Play/Pause button */}
        <button
          onClick={togglePlayPause}
          disabled={!audioUrl && !youtubeVideoId}
          className="bg-blue-600 dark:bg-blue-700 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Time display */}
        <div className="text-gray-700 dark:text-gray-300 transition-colors duration-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Playback rate controls */}
        <div className="flex flex-wrap gap-2">
          {playbackRates.map(rate => (
            <button
              key={rate}
              onClick={() => onPlaybackRateChange(rate)}
              className={`px-2 py-1 text-xs rounded ${
                playbackRate === rate
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div
          className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-100"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Audio source selection */}
      {audioUrl && youtubeVideoId && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Audio Source:</span>
          <div className="flex gap-2">
            <button
              onClick={() => onPreferredAudioSourceChange('youtube')}
              className={`px-3 py-1 rounded ${
                preferredAudioSource === 'youtube'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              YouTube
            </button>
            <button
              onClick={() => onPreferredAudioSourceChange('extracted')}
              className={`px-3 py-1 rounded ${
                preferredAudioSource === 'extracted'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              Extracted
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
