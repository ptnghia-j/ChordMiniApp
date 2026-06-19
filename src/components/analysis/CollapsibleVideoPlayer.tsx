'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress, FaMusic } from 'react-icons/fa';
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
  audioUrl?: string | null;
  videoTitle?: string;
  channelName?: string;
  thumbnailUrl?: string;
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
  audioUrl,
  videoTitle: _videoTitle,
  channelName: _channelName,
  thumbnailUrl: propThumbnailUrl,
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
  const [hasVideoError, setHasVideoError] = useState(false);
  const playerRef = useRef<ReactPlayer>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  
  const thumbnailUrl = propThumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const isPlayerReady = readyVideoId === videoId;

  // Reset video error state when videoId changes, or when transitioning to fallback audio mode (hasVideoError becomes true)
  const [prevVideoId, setPrevVideoId] = useState(videoId);
  const [prevHasVideoError, setPrevHasVideoError] = useState(hasVideoError);
  if (videoId !== prevVideoId) {
    setPrevVideoId(videoId);
    setPrevHasVideoError(false);
    setHasVideoError(false);
    setReadyVideoId(null);
  } else if (hasVideoError && !prevHasVideoError) {
    setPrevHasVideoError(true);
    setReadyVideoId(null);
  }

  // Reset ready state when collapsed/expanded state changes to force re-initialization of the audio element
  const [prevIsCollapsed, setPrevIsCollapsed] = useState(isCollapsed);
  if (isCollapsed !== prevIsCollapsed) {
    setPrevIsCollapsed(isCollapsed);
    if (hasVideoError) {
      setReadyVideoId(null);
    }
  }

  // Construct a mock YouTube player interface using HTML5 Audio element
  const createMockPlayer = useCallback((audio: HTMLAudioElement) => {
    return {
      seekTo: (time: number, _type?: 'seconds' | 'fraction') => {
        audio.currentTime = time;
      },
      getCurrentTime: () => audio.currentTime,
      getDuration: () => audio.duration || duration || 0,
      setPlaybackRate: (rate: number) => {
        audio.playbackRate = rate;
      },
      getPlaybackRate: () => audio.playbackRate,
      getAvailablePlaybackRates: () => [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
      playVideo: () => {
        audio.play().catch(err => console.warn("Failed to play audio:", err));
      },
      pauseVideo: () => {
        audio.pause();
      },
      setVolume: (volume: number) => {
        audio.volume = volume / 100;
      },
      getVolume: () => audio.volume * 100,
      mute: () => {
        audio.muted = true;
      },
      unMute: () => {
        audio.muted = false;
      },
      isMuted: () => audio.muted,
      muted: audio.muted,
    };
  }, [duration]);

  const handleAudioPlay = () => {
    onPlay?.();
  };

  const handleAudioPause = () => {
    onPause?.();
  };

  const handleAudioEnded = () => {
    onEnded?.();
  };

  const handleAudioTimeUpdate = () => {
    if (!audioElRef.current) return;
    const audio = audioElRef.current;
    const playedSeconds = audio.currentTime;
    const durationVal = audio.duration || duration || 1;
    const played = playedSeconds / durationVal;
    onProgress?.({
      playedSeconds,
      played,
      loadedSeconds: audio.buffered.length > 0 ? audio.buffered.end(audio.buffered.length - 1) : 0,
      loaded: audio.buffered.length > 0 ? audio.buffered.end(audio.buffered.length - 1) / durationVal : 0,
    });
  };

  const handleAudioLoadedMetadata = () => {
    if (!audioElRef.current) return;
    const audio = audioElRef.current;
    onReady?.(createMockPlayer(audio));
    setReadyVideoId(videoId);
  };

  // Sync isPlaying with audio element in fallback mode
  useEffect(() => {
    if (!hasVideoError || !audioElRef.current || !isPlayerReady) return;
    const audio = audioElRef.current;
    if (isPlaying) {
      audio.play().catch(err => console.warn("Autoplay block or error playing audio fallback:", err));
    } else {
      audio.pause();
    }
  }, [isPlaying, hasVideoError, isPlayerReady]);

  // Sync playbackRate with audio element in fallback mode
  useEffect(() => {
    if (!hasVideoError || !audioElRef.current) return;
    audioElRef.current.playbackRate = playbackRate;
  }, [playbackRate, hasVideoError]);

  // Sync muted with audio element in fallback mode
  useEffect(() => {
    if (!hasVideoError || !audioElRef.current) return;
    audioElRef.current.muted = muted;
  }, [muted, hasVideoError]);

  // Trigger onReady immediately if the audio element is already loaded when fallback starts
  useEffect(() => {
    if (hasVideoError && audioElRef.current && audioElRef.current.readyState >= 1) {
      onReady?.(createMockPlayer(audioElRef.current));
      setTimeout(() => {
        setReadyVideoId(videoId);
      }, 0);
    }
  }, [hasVideoError, videoId, onReady, createMockPlayer]);


  const formatTime = (t: number) => {
    if (!isFinite(t) || t < 0) return '0:00';
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

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
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-300 ${(isPlayerReady && !hasVideoError) ? 'opacity-0' : 'opacity-100'}`}
                style={{ backgroundImage: `url("${thumbnailUrl}")` }}
              />
              <div
                aria-hidden
                className={`absolute inset-0 bg-gradient-to-br from-slate-900/30 via-slate-900/55 to-slate-950/85 transition-opacity duration-300 ${(isPlayerReady && !hasVideoError) ? 'opacity-0' : 'opacity-100'}`}
              />
              {hasVideoError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
                  <FaMusic className={`w-4 h-4 text-sky-400 ${isPlaying ? 'animate-pulse' : ''}`} />
                  {audioUrl && (
                    <audio
                      ref={audioElRef}
                      src={audioUrl}
                      preload="auto"
                      onPlay={handleAudioPlay}
                      onPause={handleAudioPause}
                      onEnded={handleAudioEnded}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onLoadedMetadata={handleAudioLoadedMetadata}
                      className="hidden"
                    />
                  )}
                </div>
              ) : (
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
                  onError={() => setHasVideoError(true)}
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
              )}
            </div>

            {/* Play/pause button - larger and more accessible for mobile */}
            <button
              onClick={isPlaying ? onPause : onPlay}
              disabled={!isPlayerReady}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-all duration-300 ${
                !isPlayerReady
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {!isPlayerReady ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              ) : isPlaying ? (
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

      {/* Full video player / Fallback Audio player */}
      <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg bg-slate-900">
        <style>{`
          @keyframes soundwave {
            0%, 100% {
              transform: scaleY(0.3);
            }
            50% {
              transform: scaleY(1);
            }
          }
          .animate-soundwave {
            animation: soundwave 1.2s ease-in-out infinite alternate;
            transform-origin: bottom;
          }
        `}</style>

        {hasVideoError ? (
          <div className="relative w-full h-full flex flex-col justify-end p-4 bg-gradient-to-br from-slate-955 via-slate-900 to-indigo-950 text-white overflow-hidden select-none">
            {/* Background unblurred thumbnail */}
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center opacity-85 transition-opacity duration-500 pointer-events-none"
              style={{ backgroundImage: `url("${thumbnailUrl}")` }}
            />
            {/* Dark gradient overlay for control contrast */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-black/10 pointer-events-none"
            />
            
            {/* Hidden Audio Element / Loading Indicator */}
            {audioUrl ? (
              <audio
                ref={audioElRef}
                src={audioUrl}
                preload="auto"
                onPlay={handleAudioPlay}
                onPause={handleAudioPause}
                onEnded={handleAudioEnded}
                onTimeUpdate={handleAudioTimeUpdate}
                onLoadedMetadata={handleAudioLoadedMetadata}
                className="hidden"
              />
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center flex-1 my-1">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  <span className="text-[10px] sm:text-xs text-white/40 font-medium">
                    Loading audio fallback...
                  </span>
                </div>
              </div>
            )}

            {/* Bottom - Controls and Seek bar */}
            <div className="relative z-10 w-full flex flex-col gap-2 mt-auto">
              {/* Progress Slider */}
              <div className="flex items-center w-full">
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
                  aria-label="Audio progress"
                />
              </div>

              {/* Time display & play/pause buttons */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] sm:text-xs text-white/60">
                  {formatTime(currentTime)}
                </span>
                
                {/* Play/Pause round button */}
                <button
                  onClick={isPlaying ? onPause : onPlay}
                  disabled={!isPlayerReady}
                  className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-all duration-300 ${
                    !isPlayerReady
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:scale-105 active:scale-95 hover:bg-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                  }`}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {!isPlayerReady ? (
                    <div className="h-4 w-4 sm:h-5 sm:w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                  ) : isPlaying ? (
                    <svg className="h-5 w-5 sm:h-7 sm:w-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 sm:h-7 sm:w-7 translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <span className="text-[10px] sm:text-xs text-white/60">
                  {formatTime(duration)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
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
                onError={() => setHasVideoError(true)}
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
          </>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo optimization
  const prevTime = prevProps.currentTime ?? 0;
  const nextTime = nextProps.currentTime ?? 0;

  return prevProps.videoId === nextProps.videoId &&
         prevProps.audioUrl === nextProps.audioUrl &&
         prevProps.isPlaying === nextProps.isPlaying &&
         prevProps.playbackRate === nextProps.playbackRate &&
         prevProps.muted === nextProps.muted &&
         Math.abs(prevTime - nextTime) < 0.1 &&
         prevProps.duration === nextProps.duration;
});

// Set display name for React DevTools
CollapsibleVideoPlayer.displayName = 'CollapsibleVideoPlayer';

export default CollapsibleVideoPlayer;
