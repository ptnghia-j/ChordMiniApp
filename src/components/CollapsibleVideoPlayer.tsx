'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress } from 'react-icons/fa';
import { Slider } from '@heroui/react';

// Dynamically import ReactPlayer to avoid SSR issues
const ReactPlayer = dynamic(() => import('react-player/youtube'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
      <div className="text-white text-sm">Loading player...</div>
    </div>
  )
});

interface CollapsibleVideoPlayerProps {
  videoId: string;
  isPlaying: boolean;
  playbackRate: number;
  currentTime?: number;
  duration?: number;
  onReady?: (player: unknown) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onProgress?: (state: { playedSeconds: number; played: number; loadedSeconds: number; loaded: number }) => void;
  onSeek?: (time: number) => void;
}

export const CollapsibleVideoPlayer: React.FC<CollapsibleVideoPlayerProps> = ({
  videoId,
  isPlaying,
  playbackRate,
  currentTime = 0,
  duration = 0,
  onReady,
  onPlay,
  onPause,
  onProgress,
  onSeek
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // Auto-collapse on mobile by default
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Collapsed mobile view - enhanced bar with video frame
  if (isMobile && isCollapsed) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-2xl">
        {/* Enhanced control bar with video frame */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Left side - Video frame and controls */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mini video frame */}
            <div className="w-20 h-12 bg-black rounded overflow-hidden flex-shrink-0 relative">
              <ReactPlayer
                url={`https://www.youtube.com/watch?v=${videoId}`}
                width="100%"
                height="100%"
                controls={false}
                playing={isPlaying}
                playbackRate={playbackRate}
                onReady={onReady}
                onPlay={onPlay}
                onPause={onPause}
                onProgress={onProgress}
                progressInterval={100}
                muted={false}
                config={{
                  playerVars: {
                    showinfo: 0,
                    controls: 0,
                    modestbranding: 1,
                    rel: 0,
                    origin: typeof window !== 'undefined' ? window.location.origin : undefined
                  }
                }}
              />
            </div>

            {/* Play/pause button - larger and more accessible for mobile */}
            <button
              onClick={isPlaying ? onPause : onPlay}
              className="bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-full w-12 h-12 flex items-center justify-center hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors duration-300 flex-shrink-0 shadow-lg"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            {/* Video progress slider */}
            <div className="flex-1 min-w-0 flex items-center">
              <Slider
                color="foreground"
                renderThumb={(props) => (
                  <div
                    {...props}
                    className="h-5 w-5 rounded-full bg-blue-400 dark:bg-blue-200"
                  />
                )}
                size="sm"
                step={0.1}
                minValue={0}
                maxValue={duration || 100}
                value={currentTime}
                onChange={(value) => onSeek && onSeek(Array.isArray(value) ? value[0] : value)}
                className="w-5/6"
                classNames={{
                  base: "max-w-md",
                  track: "border-s-secondary-100",
                  filler: "bg-gradient-to-r from-primary-100 to-primary-500",
                }}
                formatOptions={{style: "unit", unit: "second"}}
                aria-label="Video progress"
              />
            </div>
          </div>

          {/* Right side - Expand button */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setIsCollapsed(false)}
              className="text-gray-700 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              aria-label="Expand video player"
            >
              <FaExpand className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full video player view
  return (
    <div className="relative">
      {/* Mobile collapse button */}
      {isMobile && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={() => setIsCollapsed(true)}
            className="bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
            aria-label="Minimize video player"
          >
            <FaCompress className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full video player */}
      <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg">
        <ReactPlayer
          url={`https://www.youtube.com/watch?v=${videoId}`}
          width="100%"
          height="100%"
          controls={true}
          playing={isPlaying}
          playbackRate={playbackRate}
          onReady={onReady}
          onPlay={onPlay}
          onPause={onPause}
          onProgress={onProgress}
          progressInterval={100}
          muted={false}
          config={{
            playerVars: {
              showinfo: 1,
              origin: typeof window !== 'undefined' ? window.location.origin : undefined
            }
          }}
        />
      </div>
    </div>
  );
};

export default CollapsibleVideoPlayer;
