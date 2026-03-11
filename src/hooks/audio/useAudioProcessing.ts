import { useState, useCallback } from 'react';
import {
  AnalyzeAudioFileOptions,
  AudioProcessingService,
  AudioProcessingState,
  ErrorWithSuggestion,
} from '@/services/audio/audioProcessingService';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';

interface UseAudioProcessingOptions {
  initialState?: AudioProcessingState | null;
  initialAnalysisResults?: AnalysisResult | null;
  initialVideoTitle?: string | null;
}

export const useAudioProcessing = (videoId: string, options: UseAudioProcessingOptions = {}) => {
  const {
    initialState = null,
    initialAnalysisResults = null,
    initialVideoTitle = null,
  } = options;

  const [state, setState] = useState<AudioProcessingState>(() => 
    initialState ?? AudioProcessingService.getInstance().createInitialState()
  );
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(initialAnalysisResults);
  const [videoTitle, setVideoTitle] = useState<string>(initialVideoTitle ?? '');

  const service = AudioProcessingService.getInstance();

  const extractAudio = useCallback(async (forceRedownload: boolean = false, originalTitle?: string) => {
    setState(prev => service.updateStateForDownloadStart(prev));

    try {
      const { audioUrl, fromCache, isStreamUrl, streamExpiresAt, title, duration } = await service.extractAudioFromYouTube(videoId, forceRedownload, true, originalTitle);
      setState(prev => service.updateStateForDownloadSuccess(prev, audioUrl, fromCache, isStreamUrl, streamExpiresAt));

      // Prefer original title from search results, fallback to extracted title
      const finalTitle = originalTitle || title;
      if (finalTitle) {
        setVideoTitle(finalTitle);
      }

      return { audioUrl, fromCache, isStreamUrl, streamExpiresAt, title: finalTitle, duration };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      let suggestion: string | undefined;

      if (error instanceof Error && 'suggestion' in error) {
        suggestion = (error as ErrorWithSuggestion).suggestion;
      }

      setState(prev => service.updateStateForDownloadError(prev, errorMessage, suggestion));
      throw error;
    }
  }, [videoId, service]);

  const analyzeAudio = useCallback(async (
    audioUrl: string,
    beatDetector: string,
    chordDetector: string,
    options?: AnalyzeAudioFileOptions
  ) => {
    // console.log('🚨 DEBUG: analyzeAudio called in useAudioProcessing!');
    // console.log('🚨 DEBUG: Call stack:', new Error().stack);
    // console.log('🚨 DEBUG: Parameters:', { audioUrl, beatDetector, chordDetector });

    setState(prev => service.updateStateForAnalysisStart(prev));

    try {
      const results = await service.analyzeAudioFile(
        audioUrl,
        videoId,
        beatDetector,
        chordDetector,
        videoTitle,
        options
      );
      const fromFirestoreCache = false; // This would be determined by the service

      setState(prev => service.updateStateForAnalysisSuccess(prev, fromFirestoreCache));
      setAnalysisResults(results);
      return results;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      let suggestion: string | undefined;

      if (error instanceof Error && 'suggestion' in error) {
        suggestion = (error as ErrorWithSuggestion).suggestion;
      }

      setState(prev => service.updateStateForAnalysisError(prev, errorMessage, suggestion));
      throw error;
    }
  }, [videoId, videoTitle, service]);

  const loadVideoInfo = useCallback(async () => {
    try {
      const { title } = await service.getVideoInfo(videoId);
      setVideoTitle(title);
    } catch {
      // Log video info loading error for monitoring
      setVideoTitle('Unknown Title');
    }
  }, [videoId, service]);

  const resetState = useCallback(() => {
    setState(service.createInitialState());
    setAnalysisResults(null);
    setVideoTitle('');
  }, [service]);

  return {
    state,
    analysisResults,
    videoTitle,
    extractAudio,
    analyzeAudio,
    loadVideoInfo,
    resetState,
    setState,
    setAnalysisResults,
    setVideoTitle
  };
};
