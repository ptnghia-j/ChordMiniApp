import { useState, useCallback, useEffect } from 'react';
import { LyricsData } from '@/types/musicAiTypes';

// Types for UI layout management
interface YouTubePlayer {
  muted: boolean;
}

interface UseUILayoutProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  youtubePlayer: YouTubePlayer | null;
  preferredAudioSource: 'youtube' | 'extracted';
  setPreferredAudioSource: (source: 'youtube' | 'extracted') => void;
}

interface UseUILayoutReturn {
  // Video player state
  isVideoMinimized: boolean;
  setIsVideoMinimized: (minimized: boolean) => void;
  toggleVideoMinimization: () => void;
  
  // Follow mode state
  isFollowModeEnabled: boolean;
  setIsFollowModeEnabled: (enabled: boolean) => void;
  toggleFollowMode: () => void;
  
  // Notification state
  showExtractionNotification: boolean;
  setShowExtractionNotification: (show: boolean) => void;
  
  // Lyrics state
  lyrics: LyricsData | null;
  setLyrics: (lyrics: LyricsData | null) => void;
  isTranscribingLyrics: boolean;
  setIsTranscribingLyrics: (transcribing: boolean) => void;
  lyricsError: string | null;
  setLyricsError: (error: string | null) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  showLyrics: boolean;
  setShowLyrics: (show: boolean) => void;
  hasCachedLyrics: boolean;
  setHasCachedLyrics: (cached: boolean) => void;
  
  // Tab state
  activeTab: 'beatChordMap' | 'lyricsChords';
  setActiveTab: (tab: 'beatChordMap' | 'lyricsChords') => void;
  
  // Panel state
  isChatbotOpen: boolean;
  setIsChatbotOpen: (open: boolean) => void;
  isLyricsPanelOpen: boolean;
  setIsLyricsPanelOpen: (open: boolean) => void;
  translatedLyrics: {[language: string]: {
    originalLyrics: string;
    translatedLyrics: string;
    sourceLanguage: string;
    targetLanguage: string;
  }};
  
  // UI control functions
  toggleAudioSource: () => void;
  toggleChatbot: () => void;
  toggleLyricsPanel: () => void;
  isChatbotAvailable: () => boolean;
}

/**
 * Custom hook for managing UI layout state including video player, panels, tabs, and lyrics
 * Extracted from lines 331-360, 563-840 of original component
 */
export const useUILayout = ({
  audioRef,
  youtubePlayer,
  preferredAudioSource,
  setPreferredAudioSource
}: UseUILayoutProps): UseUILayoutReturn => {

  // Video player state (lines 331-334)
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const [showExtractionNotification, setShowExtractionNotification] = useState(false);

  // Lyrics transcription state (lines 336-342)
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [isTranscribingLyrics, setIsTranscribingLyrics] = useState<boolean>(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(16);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [hasCachedLyrics, setHasCachedLyrics] = useState<boolean>(false);

  // Tab state (lines 344-345)
  const [activeTab, setActiveTab] = useState<'beatChordMap' | 'lyricsChords'>('beatChordMap');

  // Chatbot state (lines 347-354)
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [translatedLyrics] = useState<{[language: string]: {
    originalLyrics: string;
    translatedLyrics: string;
    sourceLanguage: string;
    targetLanguage: string;
  }}>({});

  // Lyrics panel state (lines 356-357)
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState(false);

  // Auto-minimize video when panels are open
  useEffect(() => {
    const shouldMinimize = isChatbotOpen || isLyricsPanelOpen;
    setIsVideoMinimized(shouldMinimize);
  }, [isChatbotOpen, isLyricsPanelOpen]);

  // Video control functions (lines 563-570)
  const toggleVideoMinimization = useCallback(() => {
    setIsVideoMinimized(prev => !prev);
  }, []);

  // Function to toggle follow mode
  const toggleFollowMode = useCallback(() => {
    setIsFollowModeEnabled(prev => !prev);
  }, []);

  // Function to toggle preferred audio source (lines 572-592)
  const toggleAudioSource = useCallback(() => {
    setPreferredAudioSource(preferredAudioSource === 'youtube' ? 'extracted' : 'youtube');

    // Mute/unmute appropriate audio source
    if (preferredAudioSource === 'youtube' && youtubePlayer) {
      // If switching to extracted, mute YouTube
      youtubePlayer.muted = true;
      if (audioRef.current) {
        audioRef.current.muted = false;
      }
    } else {
      // If switching to YouTube, mute extracted audio
      if (youtubePlayer) {
        youtubePlayer.muted = false;
      }
      if (audioRef.current) {
        audioRef.current.muted = true;
      }
    }
  }, [preferredAudioSource, setPreferredAudioSource, youtubePlayer, audioRef]);

  // Panel management (lines 817-832): Chatbot and lyrics panel coordination
  const toggleChatbot = useCallback(() => {
    if (!isChatbotOpen && isLyricsPanelOpen) {
      // Close lyrics panel when opening chatbot
      setIsLyricsPanelOpen(false);
    }
    setIsChatbotOpen(!isChatbotOpen);
  }, [isChatbotOpen, isLyricsPanelOpen]);

  // Function to handle lyrics panel toggle
  const toggleLyricsPanel = useCallback(() => {
    if (!isLyricsPanelOpen && isChatbotOpen) {
      // Close chatbot when opening lyrics panel
      setIsChatbotOpen(false);
    }
    setIsLyricsPanelOpen(!isLyricsPanelOpen);
  }, [isLyricsPanelOpen, isChatbotOpen]);

  // Chatbot availability check (lines 834-839): Conditional chatbot display
  const isChatbotAvailable = useCallback(() => {
    // For now, always show the chatbot on analyze pages for testing
    // console.log('Chatbot always available for testing on analyze pages');
    return true;
  }, []);

  return {
    // Video player state
    isVideoMinimized,
    setIsVideoMinimized,
    toggleVideoMinimization,
    
    // Follow mode state
    isFollowModeEnabled,
    setIsFollowModeEnabled,
    toggleFollowMode,
    
    // Notification state
    showExtractionNotification,
    setShowExtractionNotification,
    
    // Lyrics state
    lyrics,
    setLyrics,
    isTranscribingLyrics,
    setIsTranscribingLyrics,
    lyricsError,
    setLyricsError,
    fontSize,
    setFontSize,
    showLyrics,
    setShowLyrics,
    hasCachedLyrics,
    setHasCachedLyrics,
    
    // Tab state
    activeTab,
    setActiveTab,
    
    // Panel state
    isChatbotOpen,
    setIsChatbotOpen,
    isLyricsPanelOpen,
    setIsLyricsPanelOpen,
    translatedLyrics,
    
    // UI control functions
    toggleAudioSource,
    toggleChatbot,
    toggleLyricsPanel,
    isChatbotAvailable,
  };
};
