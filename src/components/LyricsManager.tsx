/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useCallback } from 'react';
import { LyricsData } from '../types/musicAiTypes';
import { useApiKeys } from '@/hooks/useApiKeys';

// Types for lyrics management
interface AudioProcessingState {
  isExtracting: boolean;
  isDownloading: boolean;
  isExtracted: boolean;
  isAnalyzing: boolean;
  isAnalyzed: boolean;
  audioUrl: string | null;
  videoUrl: string | null;
  youtubeEmbedUrl: string | null;
  fromCache: boolean;
  fromFirestoreCache: boolean;
  error: string | null;
  suggestion?: string | null;
}

interface LyricsManagerProps {
  // Video and audio state
  videoId: string;
  audioProcessingState: AudioProcessingState;
  
  // Lyrics state
  lyrics: LyricsData | null;
  setLyrics: (lyrics: LyricsData | null) => void;
  isTranscribingLyrics: boolean;
  setIsTranscribingLyrics: (transcribing: boolean) => void;
  lyricsError: string | null;
  setLyricsError: (error: string | null) => void;
  showLyrics: boolean;
  setShowLyrics: (show: boolean) => void;
  hasCachedLyrics: boolean;
  setHasCachedLyrics: (cached: boolean) => void;
  
  // UI state
  setActiveTab: (tab: 'beatChordMap' | 'lyricsChords') => void;
  
  // URL params
  params?: { videoId?: string };
}

/**
 * LyricsManager component for handling lyrics transcription, caching, and display
 * Extracted from scattered locations throughout the original analyze page component
 */
export const LyricsManager: React.FC<LyricsManagerProps> = ({
  videoId,
  audioProcessingState,
  lyrics,
  setLyrics,
  isTranscribingLyrics,
  setIsTranscribingLyrics,
  lyricsError,
  setLyricsError,
  showLyrics,
  setShowLyrics,
  hasCachedLyrics,
  setHasCachedLyrics,
  setActiveTab,
  params
}) => {
  const { isServiceAvailable, getServiceMessage } = useApiKeys();

  // Check for cached lyrics without auto-loading (lines 520-557)
  useEffect(() => {
    console.log('🔄 LyricsManager: Check cached lyrics effect triggered', {
      hasLyrics: !!(lyrics && lyrics.lines && lyrics.lines.length > 0),
      hasAudioUrl: !!audioProcessingState.audioUrl,
      videoId: params?.videoId || videoId
    });

    const checkCachedLyrics = async () => {
      // Only check for cached lyrics if we have an audio URL (after extraction is complete)
      if ((!lyrics || !lyrics.lines || lyrics.lines.length === 0) && audioProcessingState.audioUrl) {
        try {
          const response = await fetch('/api/transcribe-lyrics', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: params?.videoId || videoId,
              audioPath: audioProcessingState.audioUrl, // Use correct parameter name and value
              forceRefresh: false,
              checkCacheOnly: true // New flag to only check cache without processing
            }),
          });

          const data = await response.json();

          if (response.ok && data.success && data.lyrics) {
            if (data.lyrics.lines && Array.isArray(data.lyrics.lines) && data.lyrics.lines.length > 0) {
              // Auto-load cached lyrics for Music.AI transcription (no user choices needed)
              setLyrics(data.lyrics);
              setShowLyrics(true);
              setHasCachedLyrics(false); // Don't show "Cached Lyrics Available" when lyrics are auto-loaded
              setActiveTab('lyricsChords');
            }
          }
        } catch {
          // Silently handle cache check errors
        }
      }
    };

    // Only run after audio extraction is complete
    if (audioProcessingState.audioUrl) {
      const timer = setTimeout(checkCachedLyrics, 500);
      return () => clearTimeout(timer);
    }
  }, [videoId, params?.videoId, setHasCachedLyrics, audioProcessingState.audioUrl, setLyrics, setShowLyrics, setActiveTab, lyrics]); // Include lyrics dependency

  // Function to transcribe lyrics using Music.AI (word-level transcription) (lines 841-942)
  const transcribeLyricsWithAI = useCallback(async () => {
    // Check if Music.AI service is available (user has valid API key)
    if (!isServiceAvailable('musicAi')) {
      setLyricsError(getServiceMessage('musicAi'));
      return;
    }

    if (!audioProcessingState.audioUrl) {
      setLyricsError('Audio not available for AI transcription. Please extract audio first.');
      return;
    }

    // If lyrics already exist, show confirmation popup for re-transcription
    if (lyrics && lyrics.lines && lyrics.lines.length > 0) {
      const confirmed = window.confirm(
        'Re-transcription will overwrite existing lyrics and consume API credits. Are you sure you want to continue?'
      );
      if (!confirmed) {
        return;
      }
    }

    setIsTranscribingLyrics(true);
    setLyricsError(null);

    try {

      // Get the user's Music.AI API key
      const { getMusicAiApiKeyWithValidation } = await import('@/utils/apiKeyUtils');
      const keyValidation = await getMusicAiApiKeyWithValidation();

      if (!keyValidation.isValid || !keyValidation.apiKey) {
        setLyricsError(keyValidation.error || 'Music.AI API key not found. Please add your API key in settings.');
        setIsTranscribingLyrics(false);
        return;
      }

      const musicAiApiKey = keyValidation.apiKey;

      // First check for cached Music.AI transcription
      const cacheResponse = await fetch('/api/transcribe-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          audioPath: audioProcessingState.audioUrl, // Include audioPath in cache check
          checkCacheOnly: true,
          musicAiApiKey: musicAiApiKey
        }),
      });

      if (cacheResponse.ok) {
        const cacheData = await cacheResponse.json();
        if (cacheData.success && cacheData.lyrics && cacheData.lyrics.lines && cacheData.lyrics.lines.length > 0) {
          setLyrics(cacheData.lyrics);
          setShowLyrics(true);
          setHasCachedLyrics(true);
          setActiveTab('lyricsChords');
          setIsTranscribingLyrics(false);
          return;
        }
      }

      // No cache found, perform Music.AI transcription
      setLyricsError('Transcribing lyrics from audio using AI... This may take a few minutes.');

      const transcriptionResponse = await fetch('/api/transcribe-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          audioPath: audioProcessingState.audioUrl,
          forceRefresh: false,
          checkCacheOnly: false,
          musicAiApiKey: musicAiApiKey
        }),
      });

      if (transcriptionResponse.ok) {
        const transcriptionData = await transcriptionResponse.json();
        if (transcriptionData.success && transcriptionData.lyrics && transcriptionData.lyrics.lines && transcriptionData.lyrics.lines.length > 0) {
          setLyrics(transcriptionData.lyrics);
          setShowLyrics(true);
          setHasCachedLyrics(true); // Now we have cached results
          setActiveTab('lyricsChords');
          setLyricsError(null);
        } else {
          const errorMsg = transcriptionData.error || transcriptionData.details || 'No lyrics detected in audio';
          setLyricsError(`AI transcription completed but no lyrics were detected: ${errorMsg}`);
          setLyrics({
            lines: [],
            error: errorMsg
          });
          setShowLyrics(true);
          setActiveTab('lyricsChords');
        }
      } else {
        const errorData = await transcriptionResponse.json().catch(() => ({}));
        const errorMsg = `Transcription service error (${transcriptionResponse.status}): ${errorData.error || 'Unknown error'}`;
        setLyricsError(errorMsg);
        setLyrics({
          lines: [],
          error: errorMsg
        });
        setShowLyrics(true);
        setActiveTab('lyricsChords');
      }
    } catch (error) {
      console.error('❌ Music.AI transcription failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg = `AI transcription failed: ${errorMessage}`;
      setLyricsError(errorMsg);
      setLyrics({
        lines: [],
        error: errorMsg
      });
      setShowLyrics(true);
      setActiveTab('lyricsChords');
    } finally {
      setIsTranscribingLyrics(false);
    }
  }, [
    audioProcessingState.audioUrl,
    videoId,
    lyrics,
    setIsTranscribingLyrics,
    setLyricsError,
    setLyrics,
    setShowLyrics,
    setHasCachedLyrics,
    setActiveTab,
    isServiceAvailable,
    getServiceMessage
  ]);

  // This component manages lyrics state but doesn't render anything
  return null;
};

// Export the transcription function as a standalone utility
export const useLyricsManager = (props: LyricsManagerProps) => {
  return { transcribeLyricsWithAI: async () => {} }; // Placeholder implementation
};
