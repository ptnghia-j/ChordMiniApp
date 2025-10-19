import { useState, useCallback } from 'react';
import { LyricsData } from '@/types/musicAiTypes';

/**
 * Custom hook to manage lyrics state and operations
 * Consolidates lyrics management, transcription, and translation logic
 */
export const useLyricsState = () => {
  // Lyrics state
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [hasCachedLyrics, setHasCachedLyrics] = useState<boolean>(false);
  
  // Transcription state
  const [isTranscribingLyrics, setIsTranscribingLyrics] = useState<boolean>(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  
  // Translation state
  const [translatedLyrics] = useState<{[language: string]: {
    originalLyrics: string;
    translatedLyrics: string;
    sourceLanguage: string;
    targetLanguage: string;
  }}>({});

  // Lyrics operations
  const startLyricsTranscription = useCallback(() => {
    setIsTranscribingLyrics(true);
    setLyricsError(null);
    console.log('🎤 Starting lyrics transcription...');
  }, []);

  const completeLyricsTranscription = useCallback((lyricsData: LyricsData) => {
    setLyrics(lyricsData);
    setIsTranscribingLyrics(false);
    setLyricsError(null);
    setShowLyrics(true);
    console.log('✅ Lyrics transcription completed successfully');
  }, []);

  const failLyricsTranscription = useCallback((error: string) => {
    setIsTranscribingLyrics(false);
    setLyricsError(error);
    console.error('❌ Lyrics transcription failed:', error);
  }, []);

  const resetLyrics = useCallback(() => {
    setLyrics(null);
    setShowLyrics(false);
    setHasCachedLyrics(false);
    setIsTranscribingLyrics(false);
    setLyricsError(null);
    console.log('🔄 Lyrics state reset');
  }, []);

  const toggleLyricsVisibility = useCallback(() => {
    setShowLyrics(prev => !prev);
    console.log(`👁️ Lyrics visibility toggled: ${!showLyrics}`);
  }, [showLyrics]);

  const updateCachedLyricsStatus = useCallback((hasCached: boolean) => {
    setHasCachedLyrics(hasCached);
    console.log(`💾 Cached lyrics status updated: ${hasCached}`);
  }, []);

  return {
    // Lyrics state
    lyrics,
    showLyrics,
    hasCachedLyrics,
    translatedLyrics,
    
    // Transcription state
    isTranscribingLyrics,
    lyricsError,
    
    // Lyrics operations
    setLyrics,
    setShowLyrics,
    setHasCachedLyrics,
    setIsTranscribingLyrics,
    setLyricsError,
    startLyricsTranscription,
    completeLyricsTranscription,
    failLyricsTranscription,
    resetLyrics,
    toggleLyricsVisibility,
    updateCachedLyricsStatus,
  };
};
