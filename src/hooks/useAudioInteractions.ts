import { useCallback, useEffect } from 'react';
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
    audioRef,
    youtubePlayer,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    currentBeatIndexRef,
    setCurrentBeatIndex,
    setLastClickInfo,
    showCorrectedChords,
    setShowCorrectedChords,
  } = deps;

  // Handle beat cell clicks for navigation
  const handleBeatClick = useCallback((beatIndex: number, timestamp: number) => {
    // Seek audio element
    if (audioRef.current) {
      audioRef.current.currentTime = timestamp;
      setCurrentTime(timestamp);
    }

    // Seek YouTube player if available
    if (youtubePlayer && youtubePlayer.seekTo) {
      youtubePlayer.seekTo(timestamp, 'seconds');
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
  }, [audioRef, youtubePlayer, setCurrentTime, currentBeatIndexRef, setCurrentBeatIndex, setLastClickInfo]);

  // Function to toggle enharmonic correction display
  const toggleEnharmonicCorrection = useCallback(() => {
    setShowCorrectedChords(!showCorrectedChords);
  }, [showCorrectedChords, setShowCorrectedChords]);

  // Audio event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, [audioRef, setDuration]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [audioRef, setCurrentTime]);

  // Set up audio element event listeners
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handlePlay = () => {
      // console.log(`🎵 AUDIO PLAY EVENT: Setting isPlaying=true`);
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      // console.log(`⏸️ AUDIO PAUSE EVENT: Setting isPlaying=false`);
      setIsPlaying(false);
    };

    const handleTimeUpdateInternal = () => {
      if (audioElement) {
        setCurrentTime(audioElement.currentTime);
      }
    };

    const handleLoadedMetadataInternal = () => {
      if (audioElement) {
        setDuration(audioElement.duration);
      }
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadataInternal);
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('timeupdate', handleTimeUpdateInternal);

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadataInternal);
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('timeupdate', handleTimeUpdateInternal);
      }
    };
  }, [audioRef, setCurrentTime, setDuration, setIsPlaying]);

  return {
    handleBeatClick,
    toggleEnharmonicCorrection,
    handleLoadedMetadata,
    handleTimeUpdate,
  };
};
