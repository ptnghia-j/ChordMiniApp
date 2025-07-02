/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useCallback } from 'react';
import { LyricsData } from '../types/musicAiTypes';

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

  // Check for cached lyrics without auto-loading (lines 520-557)
  useEffect(() => {
    const checkCachedLyrics = async () => {
      if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
        try {
          const response = await fetch('/api/transcribe-lyrics', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: params?.videoId || videoId,
              audioUrl: null, // We don't have audio URL yet, but API should check cache first
              forceRefresh: false,
              checkCacheOnly: true // New flag to only check cache without processing
            }),
          });

          const data = await response.json();
          // console.log('Cache check lyrics response:', data);

          if (response.ok && data.success && data.lyrics) {
            if (data.lyrics.lines && Array.isArray(data.lyrics.lines) && data.lyrics.lines.length > 0) {
              console.log(`Found ${data.lyrics.lines.length} lines of cached lyrics (not auto-loading)`);
              // Set cached lyrics state to update UI
              setHasCachedLyrics(true);
              // Don't auto-load, just update UI state that cached lyrics are available
              // User will need to click "AI Transcribe" to load them
            }
          }
        } catch {
          // console.log('No cached lyrics found or error checking');
        }
      }
    };

    // Delay slightly to let the component mount fully
    const timer = setTimeout(checkCachedLyrics, 1000);
    return () => clearTimeout(timer);
  }, [videoId, params?.videoId, lyrics, setHasCachedLyrics]); // Re-run when videoId changes or lyrics state changes

  // Function to transcribe lyrics using Music.AI (word-level transcription) (lines 841-942)
  const transcribeLyricsWithAI = useCallback(async () => {
    if (!audioProcessingState.audioUrl) {
      setLyricsError('Audio not available for AI transcription. Please extract audio first.');
      return;
    }

    setIsTranscribingLyrics(true);
    setLyricsError(null);

    try {
      console.log('🎤 Starting Music.AI word-level transcription...');

      // First check for cached Music.AI transcription
      const cacheResponse = await fetch('/api/transcribe-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          checkCacheOnly: true
        }),
      });

      if (cacheResponse.ok) {
        const cacheData = await cacheResponse.json();
        if (cacheData.success && cacheData.lyrics && cacheData.lyrics.lines && cacheData.lyrics.lines.length > 0) {
          console.log(`✅ Found cached Music.AI transcription: ${cacheData.lyrics.lines.length} lines`);
          setLyrics(cacheData.lyrics);
          setShowLyrics(true);
          setHasCachedLyrics(true);
          setActiveTab('lyricsChords');
          setIsTranscribingLyrics(false);
          return;
        }
      }

      // No cache found, perform Music.AI transcription
      console.log('🔄 No cached transcription found, calling Music.AI API...');
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
          checkCacheOnly: false
        }),
      });

      if (transcriptionResponse.ok) {
        const transcriptionData = await transcriptionResponse.json();
        if (transcriptionData.success && transcriptionData.lyrics && transcriptionData.lyrics.lines && transcriptionData.lyrics.lines.length > 0) {
          console.log(`✅ Music.AI transcription successful: ${transcriptionData.lyrics.lines.length} lines with word-level timing`);
          setLyrics(transcriptionData.lyrics);
          setShowLyrics(true);
          setHasCachedLyrics(true); // Now we have cached results
          setActiveTab('lyricsChords');
          setLyricsError(null);
        } else {
          const errorMsg = transcriptionData.error || transcriptionData.details || 'No lyrics detected in audio';
          console.warn('⚠️ Music.AI transcription returned no lyrics:', transcriptionData);
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
        console.error('❌ Music.AI transcription API error:', transcriptionResponse.status, errorData);
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
    setIsTranscribingLyrics,
    setLyricsError,
    setLyrics,
    setShowLyrics,
    setHasCachedLyrics,
    setActiveTab
  ]);

  // This component manages lyrics state but doesn't render anything
  return null;
};

// Export the transcription function as a standalone utility
export const useLyricsManager = (props: LyricsManagerProps) => {
  return { transcribeLyricsWithAI: async () => {} }; // Placeholder implementation
};
