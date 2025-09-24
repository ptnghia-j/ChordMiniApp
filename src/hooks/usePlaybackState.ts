import { useState, useRef, useCallback, useEffect } from 'react';
import { YouTubePlayer } from '@/types/youtube';

// Types for playback state management
interface ClickInfo {
  visualIndex: number;
  timestamp: number;
  clickTime: number;
}

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

interface UsePlaybackStateProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  youtubePlayer: YouTubePlayer | null;
  setYoutubePlayer: (player: YouTubePlayer | null) => void;
  audioPlayerState: AudioPlayerState;
  setAudioPlayerState: (updater: (prev: AudioPlayerState) => AudioPlayerState) => void;
  setDuration: (duration: number) => void;
  isFollowModeEnabled: boolean;
  // Optional: allow this hook to manage auto-scroll internally; off by default to avoid conflicts
  enableAutoScroll?: boolean;
}

interface UsePlaybackStateReturn {
  // Beat tracking state
  currentBeatIndex: number;
  setCurrentBeatIndex: (index: number) => void;
  currentBeatIndexRef: React.MutableRefObject<number>;
  currentDownbeatIndex: number;
  setCurrentDownbeatIndex: (index: number) => void;
  
  // Click handling state
  lastClickInfo: ClickInfo | null;
  setLastClickInfo: (info: ClickInfo | null) => void;
  
  // Speed adjustment state
  globalSpeedAdjustment: number | null;
  setGlobalSpeedAdjustment: (adjustment: number | null) => void;
  
  // Audio player state accessors
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  
  // Audio player state setters
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  
  // Event handlers
  handleBeatClick: (beatIndex: number, timestamp: number) => void;
  handleYouTubeReady: (player: unknown) => void;
  handleYouTubePlay: () => void;
  handleYouTubePause: () => void;
  handleYouTubeProgress: (state: { played: number; playedSeconds: number }) => void;
  scrollToCurrentBeat: () => void;
}

/**
 * Custom hook for managing playback state including beat tracking, click handling, and audio synchronization
 * Extracted from lines 311-330, 1122-1191, 2515-2590 of original component
 */
export const usePlaybackState = ({
  audioRef,
  youtubePlayer,
  setYoutubePlayer,
  audioPlayerState,
  setAudioPlayerState,
  setDuration,
  isFollowModeEnabled,
  enableAutoScroll = false,
}: UsePlaybackStateProps): UsePlaybackStateReturn => {

  // Current state for playback (lines 319-329)
  const [currentBeatIndexState, setCurrentBeatIndexState] = useState(-1);
  const currentBeatIndexRef = useRef(-1);
  const [currentDownbeatIndexState, setCurrentDownbeatIndexState] = useState(-1);

  // Track recent user clicks for smart animation positioning
  const [lastClickInfo, setLastClickInfo] = useState<ClickInfo | null>(null);
  const [globalSpeedAdjustmentState, setGlobalSpeedAdjustmentState] = useState<number | null>(null); // Store calculated speed adjustment

  // Create stable setter functions with useCallback to prevent infinite loops
  const setCurrentBeatIndex = useCallback((index: number) => {
    setCurrentBeatIndexState(index);
  }, []);

  const setCurrentDownbeatIndex = useCallback((index: number) => {
    setCurrentDownbeatIndexState(index);
  }, []);

  const setGlobalSpeedAdjustment = useCallback((adjustment: number | null) => {
    setGlobalSpeedAdjustmentState(adjustment);
  }, []);

  // Extract state from audio player hook (lines 262-263)
  const { isPlaying, currentTime, duration, playbackRate } = audioPlayerState;

  // Use the state values for return
  const currentBeatIndex = currentBeatIndexState;
  const currentDownbeatIndex = currentDownbeatIndexState;
  const globalSpeedAdjustment = globalSpeedAdjustmentState;

  // Create setters for individual state properties (lines 265-272)
  const setIsPlaying = useCallback((playing: boolean) => {
    setAudioPlayerState(prev => ({ ...prev, isPlaying: playing }));
  }, [setAudioPlayerState]);

  const setCurrentTime = useCallback((time: number) => {
    setAudioPlayerState(prev => ({ ...prev, currentTime: time }));
  }, [setAudioPlayerState]);

  // Beat click navigation: YouTube-only seeking with click tracking
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
  }, [youtubePlayer, setCurrentTime, setCurrentBeatIndex]);

  // YouTube player event handlers (lines 1150-1191): Comprehensive player integration
  const handleYouTubeReady = useCallback((player: unknown) => {
    // console.log('YouTube player ready');

    // ReactPlayer doesn't directly expose the YouTube player instance
    // Instead, it provides a ref to the player object which has its own API
    // Type assertion to our YouTubePlayer interface
    setYoutubePlayer(player as YouTubePlayer);

    // We can't directly call YouTube player methods here
    // ReactPlayer handles playback rate through its props
  }, [setYoutubePlayer]);

  const handleYouTubePlay = useCallback(() => {
    // Update state when YouTube starts playing
    setIsPlaying(true);
  }, [setIsPlaying]);

  const handleYouTubePause = useCallback(() => {
    // Update state when YouTube pauses
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleYouTubeProgress = useCallback((state: { played: number; playedSeconds: number }) => {
    // Update current time from YouTube player progress
    setCurrentTime(state.playedSeconds);
  }, [setCurrentTime]);

  // Auto-scroll implementation (lines 2561-2576): Smooth scrolling to current beat
  const scrollToCurrentBeat = useCallback(() => {
    if (!isFollowModeEnabled || currentBeatIndex === -1) return;

    const beatElement = document.getElementById(`chord-${currentBeatIndex}`);
    if (beatElement) {
      beatElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentBeatIndex, isFollowModeEnabled]);

  // Auto-scroll when current beat changes (optional)
  useEffect(() => {
    if (enableAutoScroll) {
      scrollToCurrentBeat();
    }
  }, [currentBeatIndex, scrollToCurrentBeat, enableAutoScroll]);

  // Set up audio element event listeners (lines 2515-2553): Complete audio event handling
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleLoadedMetadata = () => {
      if (audioElement) {
        setDuration(audioElement.duration);
      }
    };

    const handlePlay = () => {
      // console.log(`🎵 AUDIO PLAY EVENT: Setting isPlaying=true`);
      setIsPlaying(true);
    };
    const handlePause = () => {
      // console.log(`⏸️ AUDIO PAUSE EVENT: Setting isPlaying=false`);
      setIsPlaying(false);
    };
    const handleTimeUpdate = () => {
      if (audioElement) {
        setCurrentTime(audioElement.currentTime);
      }
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.removeEventListener('play', handlePlay);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [audioRef, setCurrentTime, setDuration, setIsPlaying]);

  // Audio source management: Ensure YouTube is unmuted and extracted audio is muted
  useEffect(() => {
    if (youtubePlayer) {
      youtubePlayer.muted = false;
    }
    if (audioRef.current) {
      audioRef.current.muted = true;
    }
  }, [youtubePlayer, audioRef]);

  return {
    // Beat tracking state
    currentBeatIndex,
    setCurrentBeatIndex,
    currentBeatIndexRef,
    currentDownbeatIndex,
    setCurrentDownbeatIndex,
    
    // Click handling state
    lastClickInfo,
    setLastClickInfo,
    
    // Speed adjustment state
    globalSpeedAdjustment,
    setGlobalSpeedAdjustment,
    
    // Audio player state accessors
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    
    // Audio player state setters
    setIsPlaying,
    setCurrentTime,
    
    // Event handlers
    handleBeatClick,
    handleYouTubeReady,
    handleYouTubePlay,
    handleYouTubePause,
    handleYouTubeProgress,
    scrollToCurrentBeat,
  };
};
