'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { FaExpand, FaCompress } from 'react-icons/fa';
import { HiOutlineArrowPath, HiArrowPath } from 'react-icons/hi2';
import { Tooltip } from '@heroui/react';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { useChordPlayback } from '@/hooks/chord-playback/useChordPlayback';
import { useShowRomanNumerals, useToggleRomanNumerals } from '@/stores/uiStore';

// Dynamic imports for heavy components
const MetronomeControls = dynamic(() => import('@/components/chord-playback/MetronomeControls'), {
  loading: () => <div className="h-8 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const ChordSimplificationToggle = dynamic(() => import('@/components/analysis/ChordSimplificationToggle'), {
  loading: () => <div className="h-8 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

import ChordPlaybackToggle from '@/components/chord-playback/ChordPlaybackToggle';
import { useSimplifySelector } from '@/contexts/selectors'; // Now uses Zustand internally

const RomanNumeralToggle = dynamic(() => import('@/components/analysis/RomanNumeralToggle'), {
  loading: () => <div className="h-8 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const CollapsibleVideoPlayer = dynamic(() => import('@/components/analysis/CollapsibleVideoPlayer'), {
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
  analysisResults: AnalysisResult | null; // for opacity gating

  // Chord playback props
  currentBeatIndex: number;
  chords: string[];
  beats: (number | null)[];

  // Handlers
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;
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
  onEnded?: () => void;

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
  positionMode?: 'fixed' | 'sticky' | 'relative';

  // Countdown gating (optional)
  isCountdownEnabled?: boolean;
  isCountingDown?: boolean;
  countdownDisplay?: string;
  onRequestCountdown?: () => Promise<boolean> | boolean;
}

const FloatingVideoDock: React.FC<FloatingVideoDockProps> = ({
  isChatbotOpen,
  isLyricsPanelOpen,
  isVideoMinimized,
  isFollowModeEnabled,
  analysisResults,
  currentBeatIndex,
  chords,
  beats,
  toggleVideoMinimization,
  toggleFollowMode,
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
  onEnded,
  youtubeEmbedUrl,
  videoUrl,
  youtubePlayer,
  showTopToggles = true,
  positionMode = 'fixed',
  isCountdownEnabled = false,
  isCountingDown = false,
  countdownDisplay
}) => {
  // Roman numerals from Zustand store
  const showRomanNumerals = useShowRomanNumerals();
  const toggleRomanNumerals = useToggleRomanNumerals();

  // Chord playback hook - keep active regardless of top toggles so UtilityBar can still control playback
  // Simplify selector from UIContext
  const { simplifyChords, toggleSimplifyChords } = useSimplifySelector();

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

  // FIXED: Support relative positioning for responsive layout
  const getContainerStyles = () => {
    if (positionMode === 'relative') {
      return {
        position: 'relative' as const,
        width: '100%',
        maxWidth: isVideoMinimized ? '250px' : '500px',
        minWidth: isVideoMinimized ? '200px' : '300px',
        pointerEvents: 'auto' as const,
        zIndex: 'auto'
      };
    }

    const position = positionMode === 'sticky' ? 'sticky' : 'fixed';
    return {
      position: position as 'sticky' | 'fixed',
      bottom: positionMode === 'sticky' ? undefined : '88px',
      top: positionMode === 'sticky' ? '8px' : undefined,
      right: isChatbotOpen || isLyricsPanelOpen ? '420px' : '4px',
      maxWidth: isVideoMinimized ? '250px' : '500px',
      minWidth: isVideoMinimized ? '200px' : '300px',
      pointerEvents: 'auto' as const,
      zIndex: 55
    };
  };

  const containerStyles = getContainerStyles();

  return (
    <div
      className={`z-50 transition-all duration-300 shadow-xl ${
        positionMode === 'relative'
          ? 'w-full'
          : `${isVideoMinimized ? 'w-1/4 md:w-1/5' : 'w-2/3 md:w-1/3'}`
      }`}
      style={containerStyles}
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
              onClick={toggleRomanNumerals}
            />
          </div>

          {/* Chord playback toggle - reserve space to prevent layout shift */}
          <div style={{ opacity: analysisResults ? 1 : 0, pointerEvents: analysisResults ? 'auto' : 'none' }}>
            <ChordPlaybackToggle
              isEnabled={chordPlayback.isEnabled}
              onClick={chordPlayback.togglePlayback}
              pianoVolume={chordPlayback.pianoVolume}
              guitarVolume={chordPlayback.guitarVolume}
              violinVolume={chordPlayback.violinVolume}
              fluteVolume={chordPlayback.fluteVolume}
              onPianoVolumeChange={chordPlayback.setPianoVolume}
              onGuitarVolumeChange={chordPlayback.setGuitarVolume}
              onViolinVolumeChange={chordPlayback.setViolinVolume}
              onFluteVolumeChange={chordPlayback.setFluteVolume}
              youtubePlayer={youtubePlayer}
            />
          </div>

          {/* Chord simplification toggle - reserve space to prevent layout shift */}
          <div style={{ opacity: analysisResults ? 1 : 0, pointerEvents: analysisResults ? 'auto' : 'none' }}>
            <ChordSimplificationToggle
              isEnabled={simplifyChords}
              onClick={toggleSimplifyChords}
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
              onEnded={onEnded}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default FloatingVideoDock;
export { FloatingVideoDock };
