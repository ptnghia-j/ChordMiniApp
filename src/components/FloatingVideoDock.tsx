'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress } from 'react-icons/fa';
import { HiOutlineArrowPath, HiArrowPath } from 'react-icons/hi2';
import { Tooltip } from '@heroui/react';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { useChordPlayback } from '@/hooks/useChordPlayback';

// Dynamic imports for heavy components
const MetronomeControls = dynamic(() => import('@/components/MetronomeControls'), {
  loading: () => <div className="h-8 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ChordSimplificationToggle = dynamic(() => import('@/components/ChordSimplificationToggle'), {
  loading: () => <div className="h-8 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

import ChordPlaybackToggle from '@/components/ChordPlaybackToggle';

const RomanNumeralToggle = dynamic(() => import('@/components/RomanNumeralToggle'), {
  loading: () => <div className="h-8 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const CollapsibleVideoPlayer = dynamic(() => import('@/components/CollapsibleVideoPlayer'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
      <div className="text-white">Loading player...</div>
    </div>
  )
});

interface FloatingVideoDockProps {
  // Layout positioning
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  isVideoMinimized: boolean;

  // Toggle states and handlers
  isFollowModeEnabled: boolean;
  showRomanNumerals: boolean;
  simplifyChords: boolean;
  analysisResults: AnalysisResult | null; // for opacity gating

  // Chord playback props
  currentBeatIndex: number;
  chords: string[];
  beats: (number | null)[];

  // Handlers
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;
  setShowRomanNumerals: (value: boolean) => void;
  setSimplifyChords: (value: boolean) => void;
  toggleMetronomeWithSync: () => Promise<boolean>;

  // Video player props
  videoId: string;
  isPlaying: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  onReady: (player: unknown) => void;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (state: { playedSeconds: number; played: number; loadedSeconds: number; loaded: number }) => void;
  onSeek: (time: number) => void;

  // URLs
  youtubeEmbedUrl?: string;
  videoUrl?: string;

  // YouTube player for volume control
  youtubePlayer?: {
    seekTo: (time: number, type?: 'seconds' | 'fraction') => void;
    playVideo: () => void;
    pauseVideo: () => void;
    setPlaybackRate: (rate: number) => void;
    getCurrentTime: () => number;
    muted: boolean;
    // Volume control methods (may not be available on all YouTube player implementations)
    setVolume?: (volume: number) => void;
    getVolume?: () => number;
    mute?: () => void;
    unMute?: () => void;
    isMuted?: () => boolean;
  } | null;

  // UI options
  showTopToggles?: boolean;

  // Positioning mode
  positionMode?: 'fixed' | 'sticky';

  // Countdown gating (optional)
  isCountdownEnabled?: boolean;
  isCountingDown?: boolean;
  countdownDisplay?: string;
  onRequestCountdown?: () => Promise<void> | void;
}

const FloatingVideoDock: React.FC<FloatingVideoDockProps> = ({
  isChatbotOpen,
  isLyricsPanelOpen,
  isVideoMinimized,
  isFollowModeEnabled,
  showRomanNumerals,
  simplifyChords,
  analysisResults,
  currentBeatIndex,
  chords,
  beats,
  toggleVideoMinimization,
  toggleFollowMode,
  setShowRomanNumerals,
  setSimplifyChords,
  toggleMetronomeWithSync,
  videoId,
  isPlaying,
  playbackRate,
  currentTime,
  duration,
  onReady,
  onPlay,
  onPause,
  onProgress,
  onSeek,
  youtubeEmbedUrl,
  videoUrl,
  youtubePlayer,
  showTopToggles = true,
  positionMode = 'fixed',
  isCountdownEnabled = false,
  isCountingDown = false,
  countdownDisplay,
  onRequestCountdown
}) => {
  // Chord playback hook - keep active regardless of top toggles so UtilityBar can still control playback
  const chordPlayback = useChordPlayback({
    currentBeatIndex,
    chords,
    beats,
    isPlaying,
    currentTime
  });

  // Don't render if no video URLs are available
  if (!youtubeEmbedUrl && !videoUrl) {
    return null;
  }

  return (
    <div
      className={`${positionMode === 'sticky' ? 'sticky' : 'fixed'} z-50 transition-all duration-300 shadow-xl ${
        isChatbotOpen || isLyricsPanelOpen
          ? 'right-[420px]' // Move video further right when chatbot or lyrics panel is open to avoid overlap
          : 'right-4'
      } ${
        isVideoMinimized ? 'w-1/4 md:w-1/5' : 'w-2/3 md:w-1/3'
      }`}
      style={{
        bottom: positionMode === 'sticky' ? undefined : '88px',
        top: positionMode === 'sticky' ? '8px' : undefined,
        maxWidth: isVideoMinimized ? '250px' : '500px',
        pointerEvents: 'auto',
        zIndex: 55 // Ensure this is below the control buttons (z-60) but above other content
      }}
    >
      {/* Improved responsive toggle button container */}
      {showTopToggles && (
        <div
          className="absolute -top-12 left-0 z-60 flex overflow-x-auto hide-scrollbar items-center gap-2.5 p-2 bg-white dark:bg-content-bg bg-opacity-50 dark:bg-opacity-60 backdrop-blur-sm rounded-lg shadow-md transition-colors duration-300"
          style={{
            right: '48px', // Leave space for minimize/maximize button (40px width + 8px margin)
            maxWidth: 'calc(100vw - 100px)' // Prevent overflow on small screens
          }}
        >
          <Tooltip
            content={isFollowModeEnabled ? "Disable auto-scroll" : "Enable auto-scroll"}
            placement="top"
            delay={500}
            closeDelay={100}
            classNames={{
              base: "max-w-xs",
              content: "bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg"
            }}
          >
            <button
              onClick={toggleFollowMode}
              className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
                isFollowModeEnabled
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              {/* Icon */}
              {isFollowModeEnabled ? (
                <HiArrowPath className="h-4 w-4" />
              ) : (
                <HiOutlineArrowPath className="h-4 w-4" />
              )}
            </button>
          </Tooltip>

          {/* Roman numeral toggle - reserve space to prevent layout shift */}
          <div style={{ opacity: analysisResults ? 1 : 0, pointerEvents: analysisResults ? 'auto' : 'none' }}>
            <RomanNumeralToggle
              isEnabled={showRomanNumerals}
              onClick={() => setShowRomanNumerals(!showRomanNumerals)}
            />
          </div>

          {/* Chord playback toggle - reserve space to prevent layout shift */}
          <div style={{ opacity: analysisResults ? 1 : 0, pointerEvents: analysisResults ? 'auto' : 'none' }}>
            <ChordPlaybackToggle
              isEnabled={chordPlayback.isEnabled}
              onClick={chordPlayback.togglePlayback}
              pianoVolume={chordPlayback.pianoVolume}
              guitarVolume={chordPlayback.guitarVolume}
              onPianoVolumeChange={chordPlayback.setPianoVolume}
              onGuitarVolumeChange={chordPlayback.setGuitarVolume}
              youtubePlayer={youtubePlayer}
            />
          </div>

          {/* Chord simplification toggle - reserve space to prevent layout shift */}
          <div style={{ opacity: analysisResults ? 1 : 0, pointerEvents: analysisResults ? 'auto' : 'none' }}>
            <ChordSimplificationToggle
              isEnabled={simplifyChords}
              onClick={() => setSimplifyChords(!simplifyChords)}
            />
          </div>

          {/* Metronome controls - reserve space to prevent layout shift */}
          <div style={{ opacity: analysisResults ? 1 : 0, pointerEvents: analysisResults ? 'auto' : 'none' }}>
            <MetronomeControls
              onToggleWithSync={toggleMetronomeWithSync}
            />
          </div>
        </div>
      )}

      
      <div className="relative">
        {/* Minimize/Maximize button */}
        <button
          onClick={toggleVideoMinimization}
          className="absolute -top-8 right-0 bg-gray-800 text-white p-1 rounded-t-md z-10 w-10 h-6 flex items-center justify-center hover:bg-gray-700 transition-colors"
          title={isVideoMinimized ? "Expand video player" : "Minimize video player"}
        >
          {isVideoMinimized ? (
            <FaExpand className="h-3 w-3" />
          ) : (
            <FaCompress className="h-3 w-3" />
          )}
        </button>

        {/* Countdown overlay */}
        {isCountdownEnabled && isCountingDown && (
          <div className="absolute inset-0 z-60 flex items-center justify-center bg-black/40 text-white text-4xl font-bold select-none pointer-events-none">
            {countdownDisplay || ''}
          </div>
        )}

        {/* Video player with mobile collapsible functionality */}
        {(youtubeEmbedUrl || videoUrl) && (
          <div className="relative">
            {/* Click-catcher to trigger countdown before play */}
            {isCountdownEnabled && !isCountingDown && (
              <button
                type="button"
                onClick={async (e) => {
                  // If not playing, request countdown then delegate to onPlay
                  if (!isPlaying && onRequestCountdown) {
                    e.preventDefault();
                    e.stopPropagation();
                    await onRequestCountdown();
                  }
                }}
                className="absolute inset-0 z-50 bg-transparent"
                aria-label="Start with countdown"
              />
            )}

            <CollapsibleVideoPlayer
              videoId={videoId}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              currentTime={currentTime}
              duration={duration}
              onReady={onReady}
              onPlay={onPlay}
              onPause={onPause}
              onProgress={onProgress}
              onSeek={onSeek}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default FloatingVideoDock;
export { FloatingVideoDock };
