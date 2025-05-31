import { useState, useCallback } from 'react';
import { AudioProcessingService, AudioProcessingState, ErrorWithSuggestion } from '@/services/audioProcessingService';
import { AnalysisResult } from '@/services/chordRecognitionService';

export const useAudioProcessing = (videoId: string) => {
  const [state, setState] = useState<AudioProcessingState>(() => 
    AudioProcessingService.getInstance().createInitialState()
  );
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>('');

  const service = AudioProcessingService.getInstance();

  const extractAudio = useCallback(async (forceRedownload: boolean = false) => {
    setState(prev => service.updateStateForDownloadStart(prev));

    try {
      const { audioUrl, fromCache } = await service.extractAudioFromYouTube(videoId, forceRedownload);
      setState(prev => service.updateStateForDownloadSuccess(prev, audioUrl, fromCache));
      return { audioUrl, fromCache };
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
    chordDetector: string
  ) => {
    setState(prev => service.updateStateForAnalysisStart(prev));

    try {
      const results = await service.analyzeAudioFile(audioUrl, videoId, beatDetector, chordDetector);
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
  }, [videoId, service]);

  const loadVideoInfo = useCallback(async () => {
    try {
      const { title } = await service.getVideoInfo(videoId);
      setVideoTitle(title);
    } catch (error) {
      console.error('Failed to load video info:', error);
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
