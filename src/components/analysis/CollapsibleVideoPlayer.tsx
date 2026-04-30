'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress } from 'react-icons/fa';
import { Slider } from '@heroui/react';
import { getAppSliderClassNames } from '@/components/ui/appSliderStyles';

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
  muted?: boolean;
  /** Fired when the user changes rate via YouTube's native gear-menu. */
  onPlaybackRateChange?: (rate: number) => void;
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
  onEnded,
  muted = false,
  onPlaybackRateChange
}) => {
  const getInitialIsMobile = () => (
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [isMobile, setIsMobile] = useState(getInitialIsMobile);
  const [isCollapsed, setIsCollapsed] = useState(() => getInitialIsMobile());
  const [readyVideoId, setReadyVideoId] = useState<string | null>(null);
  const playerRef = useRef<ReactPlayer>(null);
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const isPlayerReady = readyVideoId === videoId;

  // Sync playback rate with YouTube iframe.
  // Re-run when the player becomes ready so the initial rate is always applied,
  // and clamp to the nearest YouTube-supported rate (YouTube only honours a
  // fixed set of rates; off-list values silently fall back to 1.0x).
  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internalPlayer = (playerRef.current as any).getInternalPlayer();
      if (!internalPlayer || typeof internalPlayer.setPlaybackRate !== 'function') return;

      let targetRate = playbackRate;
      try {
        if (typeof internalPlayer.getAvailablePlaybackRates === 'function') {
          const available: number[] = internalPlayer.getAvailablePlaybackRates() || [];
          if (Array.isArray(available) && available.length > 0) {
            targetRate = available.reduce((best, rate) =>
              Math.abs(rate - playbackRate) < Math.abs(best - playbackRate) ? rate : best
            );
          }
        }
      } catch {
        // Ignore – fall back to the raw rate if clamping fails.
      }

      internalPlayer.setPlaybackRate(targetRate);
    } catch (error) {
      console.error('Error setting playback rate:', error);
    }
  }, [playbackRate, isPlayerReady]);

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internalPlayer = (playerRef.current as any).getInternalPlayer();
      if (!internalPlayer) return;

      if (muted && typeof internalPlayer.mute === 'function') {
        internalPlayer.mute();
      } else if (!muted && typeof internalPlayer.unMute === 'function') {
        internalPlayer.unMute();
      }
    } catch {
      // ReactPlayer also applies the muted prop. This best-effort iframe API
      // sync makes the native YouTube speaker icon update promptly.
    }
  }, [muted, isPlayerReady]);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Auto-collapse on mobile by default
      if (mobile) {
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
    setReadyVideoId(videoId);

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
          // Forward rate inspection methods so the playbackStore can
          // (a) snap requested rates to the YouTube-supported set, and
          // (b) verify the iframe actually applied the rate after ~200 ms.
          // Without these, the store sees `undefined` and silently skips both.
          getPlaybackRate: () => {
            try {
              return typeof internalPlayer.getPlaybackRate === 'function'
                ? internalPlayer.getPlaybackRate()
                : undefined;
            } catch {
              return undefined;
            }
          },
          getAvailablePlaybackRates: () => {
            try {
              return typeof internalPlayer.getAvailablePlaybackRates === 'function'
                ? internalPlayer.getAvailablePlaybackRates()
                : undefined;
            } catch {
              return undefined;
            }
          },
          muted
        };
        onReady?.(enhancedPlayer);

        // Subscribe to YouTube's native onPlaybackRateChange event.
        // This fires when the user changes rate via YouTube's gear-menu
        // INSIDE the iframe — a code path the app's own rate slider doesn't
        // cover. Without this, the master clock and GrainPlayer retain the
        // old rate → extrapolation drift → constant re-seeks.
        if (typeof internalPlayer.addEventListener === 'function') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            internalPlayer.addEventListener('onPlaybackRateChange', (event: any) => {
              const newRate = typeof event === 'number' ? event : event?.data;
              if (typeof newRate === 'number' && newRate > 0) {
                onPlaybackRateChange?.(newRate);
              }
            });
          } catch {
            /* best-effort: some YT player builds don't expose addEventListener */
          }
        }
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
          muted
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
        muted
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
            <div className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded-md bg-slate-900 sm:h-12 sm:w-20">
              <div
                aria-hidden
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-300 ${isPlayerReady ? 'opacity-0' : 'opacity-100'}`}
                style={{ backgroundImage: `url("${thumbnailUrl}")` }}
              />
              <div
                aria-hidden
                className={`absolute inset-0 bg-gradient-to-br from-slate-900/30 via-slate-900/55 to-slate-950/85 transition-opacity duration-300 ${isPlayerReady ? 'opacity-0' : 'opacity-100'}`}
              />
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
                onSeek={onSeek}
                progressInterval={250}
                muted={muted}
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
                size="sm"
                step={0.1}
                minValue={0}
                maxValue={duration || 100}
                value={currentTime}
                onChange={(value) => onSeek && onSeek(Array.isArray(value) ? value[0] : value)}
                className="w-full"
                classNames={{
                  base: "max-w-none",
                  ...getAppSliderClassNames('primary'),
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
      <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg bg-slate-900">
        <div
          aria-hidden
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-300 ${isPlayerReady ? 'opacity-0' : 'opacity-100'}`}
          style={{ backgroundImage: `url("${thumbnailUrl}")` }}
        />
        <div
          aria-hidden
          className={`absolute inset-0 transition-opacity duration-300 ${isPlayerReady ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/25 via-slate-900/55 to-slate-950/90" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm animate-pulse" />
              <div className="h-3 w-32 rounded-full bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>

        <div className={`absolute inset-0 transition-opacity duration-300 ${isPlayerReady ? 'opacity-100' : 'opacity-0'}`}>
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
            onSeek={onSeek}
            progressInterval={250}
            muted={muted}
            config={{
              playerVars: {
                showinfo: 1,
                origin: typeof window !== 'undefined' ? window.location.origin : undefined
              }
            }}
          />
        </div>
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
         prevProps.muted === nextProps.muted &&
         Math.abs(prevTime - nextTime) < 0.1 &&
         prevProps.duration === nextProps.duration;
});

// Set display name for React DevTools
CollapsibleVideoPlayer.displayName = 'CollapsibleVideoPlayer';

export default CollapsibleVideoPlayer;
