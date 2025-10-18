import { useCallback } from 'react';
import { YouTubePlayer } from '@/types/youtube';

export interface AudioInteractionsDependencies {
  // Audio refs and players
  audioRef: React.RefObject<HTMLAudioElement | null>;
  youtubePlayer: YouTubePlayer | null;
  
  // State setters for audio control
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  
  // Beat navigation state
  currentBeatIndexRef: React.MutableRefObject<number>;
  setCurrentBeatIndex: (index: number) => void;
  setLastClickInfo: (info: { visualIndex: number; timestamp: number; clickTime: number }) => void;
  
  // UI state toggles
  showCorrectedChords: boolean;
  setShowCorrectedChords: (show: boolean) => void;
}

export interface AudioInteractions {
  handleBeatClick: (beatIndex: number, timestamp: number) => void;
  toggleEnharmonicCorrection: () => void;
  handleLoadedMetadata: () => void;
  handleTimeUpdate: () => void;
}

/**
 * Custom hook for audio interaction functions
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useAudioInteractions = (deps: AudioInteractionsDependencies): AudioInteractions => {
  const {
    youtubePlayer,
    setCurrentTime,
    currentBeatIndexRef,
    setCurrentBeatIndex,
    setLastClickInfo,
    showCorrectedChords,
    setShowCorrectedChords,
  } = deps;

  // Handle beat cell clicks for navigation
  const handleBeatClick = useCallback((beatIndex: number, timestamp: number) => {
    // Seek YouTube player (primary audio source)
    if (youtubePlayer && youtubePlayer.seekTo) {
      youtubePlayer.seekTo(timestamp, 'seconds');
      setCurrentTime(timestamp);
    }

    // FIXED: Direct state update without override mechanism
    // Set the beat index immediately and record click info for smart animation
    currentBeatIndexRef.current = beatIndex;
    setCurrentBeatIndex(beatIndex);

    // Record click info for smart animation positioning
    setLastClickInfo({
      visualIndex: beatIndex,
      timestamp: timestamp,
      clickTime: Date.now()
    });

    // console.log(`🎯 BEAT CLICK: Set currentBeatIndex=${beatIndex}, timestamp=${timestamp.toFixed(3)}s`);
  }, [youtubePlayer, setCurrentTime, currentBeatIndexRef, setCurrentBeatIndex, setLastClickInfo]);

  // Function to toggle enharmonic correction display
  const toggleEnharmonicCorrection = useCallback(() => {
    setShowCorrectedChords(!showCorrectedChords);
  }, [showCorrectedChords, setShowCorrectedChords]);

  // Placeholder handlers for compatibility (YouTube handles timing directly)
  const handleLoadedMetadata = useCallback(() => {
    // YouTube player handles metadata loading
  }, []);

  const handleTimeUpdate = useCallback(() => {
    // YouTube player handles time updates via progress events
  }, []);

  // No audio element event listeners needed - YouTube player handles all events

  return {
    handleBeatClick,
    toggleEnharmonicCorrection,
    handleLoadedMetadata,
    handleTimeUpdate,
  };
};
