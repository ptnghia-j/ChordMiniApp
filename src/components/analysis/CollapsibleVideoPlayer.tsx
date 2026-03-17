'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress } from 'react-icons/fa';
import { Slider } from '@heroui/react';

// Import ReactPlayer type for TypeScript
import ReactPlayer from 'react-player';

// Dynamically import ReactPlayer to avoid SSR issues
const DynamicReactPlayer = dynamic(() => import('react-player/youtube'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video rounded-lg border border-white/30 bg-white/55 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40">
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full bg-white/80 animate-pulse dark:bg-white/10" />
          <div className="h-3 w-28 rounded-full bg-white/70 animate-pulse dark:bg-white/10" />
        </div>
      </div>
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
  onEnded?: () => void;
}

export const CollapsibleVideoPlayer = React.memo<CollapsibleVideoPlayerProps>(({
  videoId,
  isPlaying,
  playbackRate,
  currentTime = 0,
  duration = 0,
  onReady,
  onPlay,
  onPause,
  onProgress,
  onSeek,
  onEnded
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const playerRef = useRef<ReactPlayer>(null);

  // Sync playback rate with YouTube player
  useEffect(() => {
    if (playerRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalPlayer = (playerRef.current as any).getInternalPlayer();
        if (internalPlayer && typeof internalPlayer.setPlaybackRate === 'function') {
          internalPlayer.setPlaybackRate(playbackRate);
        }
      } catch (error) {
        console.error('Error setting playback rate:', error);
      }
    }
  }, [playbackRate]);

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

  // Handle ReactPlayer ready event and expose internal YouTube player
  const handleReady = (player: ReactPlayer) => {
    playerRef.current = player;

    // Try to get the internal YouTube player instance
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internalPlayer = (player as any).getInternalPlayer();
      if (internalPlayer && typeof internalPlayer.setVolume === 'function') {
        // Create a wrapper that includes volume control methods
        const enhancedPlayer = {
          // ReactPlayer methods
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          seekTo: (time: number, type?: 'seconds' | 'fraction') => (player as any).seekTo(time, type),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getCurrentTime: () => (player as any).getCurrentTime(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getDuration: () => (player as any).getDuration(),
          // YouTube iframe API methods through internal player
          setVolume: (volume: number) => internalPlayer.setVolume(volume),
          getVolume: () => internalPlayer.getVolume(),
          mute: () => internalPlayer.mute(),
          unMute: () => internalPlayer.unMute(),
          isMuted: () => internalPlayer.isMuted(),
          playVideo: () => internalPlayer.playVideo(),
          pauseVideo: () => internalPlayer.pauseVideo(),
          setPlaybackRate: (rate: number) => internalPlayer.setPlaybackRate(rate),
          muted: false
        };
        onReady?.(enhancedPlayer);
      } else {
        // Fallback: create a basic wrapper without volume control
        const basicPlayer = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          seekTo: (time: number, type?: 'seconds' | 'fraction') => (player as any).seekTo(time, type),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getCurrentTime: () => (player as any).getCurrentTime(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getDuration: () => (player as any).getDuration(),
          playVideo: () => console.warn('playVideo not available'),
          pauseVideo: () => console.warn('pauseVideo not available'),
          setPlaybackRate: (rate: number) => console.warn('setPlaybackRate not available', rate),
          muted: false
        };
        onReady?.(basicPlayer);
      }
    } catch (error) {
      console.warn('Could not access internal YouTube player for volume control:', error);
      // Fallback: create a basic wrapper
      const fallbackPlayer = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seekTo: (time: number, type?: 'seconds' | 'fraction') => (player as any).seekTo(time, type),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getCurrentTime: () => (player as any).getCurrentTime(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getDuration: () => (player as any).getDuration(),
        playVideo: () => console.warn('playVideo not available'),
        pauseVideo: () => console.warn('pauseVideo not available'),
        setPlaybackRate: (rate: number) => console.warn('setPlaybackRate not available', rate),
        muted: false
      };
      onReady?.(fallbackPlayer);
    }
  };

  // Collapsed mobile view - enhanced bar with video frame
  if (isMobile && isCollapsed) {
    return (
      <div className="rounded-[22px] border border-white/15 bg-slate-950/90 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.88)] backdrop-blur-md">
        <div className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          {/* Left side - Video frame and controls */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
            {/* Mini video frame */}
            <div className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded-md bg-black sm:h-12 sm:w-20">
              <DynamicReactPlayer
                ref={playerRef}
                url={`https://www.youtube.com/watch?v=${videoId}`}
                width="100%"
                height="100%"
                controls={false}
                playing={isPlaying}
                playbackRate={playbackRate}
                onReady={handleReady}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}

                onProgress={onProgress}
                progressInterval={250}
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
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-colors duration-300 hover:bg-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            {/* Video progress slider */}
            <div className="flex min-w-0 flex-1 items-center">
              <Slider
                color="foreground"
                renderThumb={(props) => (
                  <div
                    {...props}
                    className="h-4 w-4 rounded-full bg-blue-400 dark:bg-blue-200"
                  />
                )}
                size="sm"
                step={0.1}
                minValue={0}
                maxValue={duration || 100}
                value={currentTime}
                onChange={(value) => onSeek && onSeek(Array.isArray(value) ? value[0] : value)}
                className="w-full"
                classNames={{
                  base: "max-w-none",
                  track: "border-s-secondary-100",
                  filler: "bg-gradient-to-r from-primary-100 to-primary-500",
                }}
                formatOptions={{style: "unit", unit: "second"}}
                aria-label="Video progress"
              />
            </div>
          </div>

          {/* Right side - Expand button */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={() => setIsCollapsed(false)}
              className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/10 hover:text-blue-300"
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
        <DynamicReactPlayer
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${videoId}`}
          width="100%"
          height="100%"
          controls={true}
          playing={isPlaying}
          playbackRate={playbackRate}
          onReady={handleReady}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}

          onProgress={onProgress}
          progressInterval={250}
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
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo optimization
  const prevTime = prevProps.currentTime ?? 0;
  const nextTime = nextProps.currentTime ?? 0;

  return prevProps.videoId === nextProps.videoId &&
         prevProps.isPlaying === nextProps.isPlaying &&
         prevProps.playbackRate === nextProps.playbackRate &&
         Math.abs(prevTime - nextTime) < 0.1 &&
         prevProps.duration === nextProps.duration;
});

// Set display name for React DevTools
CollapsibleVideoPlayer.displayName = 'CollapsibleVideoPlayer';

export default CollapsibleVideoPlayer;
