'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress } from 'react-icons/fa';

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
  preferredAudioSource: 'youtube' | 'extracted';
  onReady?: (player: unknown) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onProgress?: (state: { playedSeconds: number; played: number; loadedSeconds: number; loaded: number }) => void;
}

export const CollapsibleVideoPlayer: React.FC<CollapsibleVideoPlayerProps> = ({
  videoId,
  isPlaying,
  playbackRate,
  preferredAudioSource,
  onReady,
  onPlay,
  onPause,
  onProgress
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
                muted={preferredAudioSource === 'extracted'}
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

            {/* Play/pause button */}
            <button
              onClick={isPlaying ? onPause : onPlay}
              className="text-gray-700 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Video title/info */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-gray-800 dark:text-white text-sm font-medium truncate">
                Video Player
              </span>
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
          muted={preferredAudioSource === 'extracted'}
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
