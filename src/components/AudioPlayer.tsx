'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { YouTubePlayer } from '@/types/youtube';

interface AudioPlayerProps {
  youtubeVideoId?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onYouTubePlayerReady?: (player: YouTubePlayer) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  youtubeVideoId,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  onPlay,
  onPause,
  onSeek,
  onPlaybackRateChange,
}) => {
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [hasMounted]);

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    onSeek(newTime);
  }, [duration, onSeek]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) onPause();
    else onPlay();
  }, [isPlaying, onPlay, onPause]);

  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5];

  if (!isPlayerVisible || !hasMounted) {
    return null;
  }

  // --- RENDER LOGIC ---

  if (isMobile) {
    // --- STATE 1: Mobile View (Compact Floating Player) ---
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-blue-600 dark:bg-blue-700 rounded-full shadow-lg flex items-center gap-3 p-2">
          <button onClick={togglePlayPause} disabled={!youtubeVideoId} className="text-white rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-50">
            {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <div className="text-white text-sm font-semibold pr-2">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>
    );
  } else {
    // --- STATE 2: Desktop View (Full Player) ---
    return (
      <div className="relative w-full p-3 pt-8 bg-gray-50 dark:bg-content-bg rounded-lg mb-3 transition-colors duration-300 border border-gray-200 dark:border-gray-600">
        <button onClick={() => setIsPlayerVisible(false)} className="absolute top-2 right-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        </button>
        <div className="flex items-center justify-between mb-4">
          <button onClick={togglePlayPause} disabled={!youtubeVideoId} className="bg-blue-600 dark:bg-blue-700 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50">
            {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <div className="text-gray-700 dark:text-gray-300">{formatTime(currentTime)} / {formatTime(duration)}</div>
          <div className="flex flex-wrap gap-2">
            {playbackRates.map(rate => (
              <button key={rate} onClick={() => onPlaybackRateChange(rate)} className={`px-2 py-1 text-xs rounded ${playbackRate === rate ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'}`}>
                {rate}x
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full cursor-pointer" onClick={handleSeek}>
            <div className="h-full bg-blue-600 dark:bg-blue-500 rounded-full" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
        </div>
      </div>
    );
  }
};