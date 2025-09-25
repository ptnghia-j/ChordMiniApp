/**
 * Audio Processing Comparison Hook
 * Provides easy integration for comparing Appwrite vs downr.org + Opus→MP3 conversion approaches
 */

import { useState, useCallback, useRef } from 'react';
import { audioProcessingMiddleware, type ProcessingResult } from '@/services/audioProcessingMiddleware';
import { performanceTracker } from '@/services/performanceTracker';

export interface UseAudioProcessingComparisonOptions {
  enablePerformanceTracking?: boolean;
  onProgress?: (method: 'appwrite' | 'downr', step: string, progress: number) => void;
  onStepComplete?: (method: 'appwrite' | 'downr', step: string, duration: number) => void;
  onError?: (method: 'appwrite' | 'downr', error: string) => void;
}

export interface ComparisonState {
  isRunning: boolean;
  currentTest: 'none' | 'appwrite' | 'downr' | 'both';
  appwriteResult: ProcessingResult | null;
  downrResult: ProcessingResult | null;
  appwriteProgress: { step: string; progress: number };
  downrProgress: { step: string; progress: number };
  comparison: Record<string, unknown> | null;
  error: string | null;
}

export function useAudioProcessingComparison(options: UseAudioProcessingComparisonOptions = {}) {
  const {
    enablePerformanceTracking = true,
    onProgress,
    onStepComplete,
    onError
  } = options;

  const [state, setState] = useState<ComparisonState>({
    isRunning: false,
    currentTest: 'none',
    appwriteResult: null,
    downrResult: null,
    appwriteProgress: { step: '', progress: 0 },
    downrProgress: { step: '', progress: 0 },
    comparison: null,
    error: null
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const updateProgress = useCallback((method: 'appwrite' | 'downr', step: string, progress: number) => {
    setState(prev => ({
      ...prev,
      [`${method}Progress`]: { step, progress }
    }));
    onProgress?.(method, step, progress);
  }, [onProgress]);

  const handleStepComplete = useCallback((method: 'appwrite' | 'downr', step: string, duration: number) => {
    onStepComplete?.(method, step, duration);
  }, [onStepComplete]);

  const handleError = useCallback((method: 'appwrite' | 'downr', error: string) => {
    setState(prev => ({ ...prev, error: `${method}: ${error}` }));
    onError?.(method, error);
  }, [onError]);

  /**
   * Run Appwrite test (simulated for now)
   */
  const runAppwriteTest = useCallback(async (audioFile?: File): Promise<ProcessingResult | null> => {
    if (state.isRunning) return null;

    setState(prev => ({ ...prev, currentTest: 'appwrite', appwriteResult: null, error: null }));

    try {
      // For demo purposes, create a dummy audio file if none provided
      const testFile = audioFile || new File([''], 'test.mp3', { type: 'audio/mpeg' });
      
      const result = await audioProcessingMiddleware.processAudioFile(testFile, {
        enablePerformanceTracking,
        onProgress: (step, progress) => updateProgress('appwrite', step, progress),
        onStepComplete: (step, duration) => handleStepComplete('appwrite', step, duration)
      });

      setState(prev => ({ ...prev, appwriteResult: result }));
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      handleError('appwrite', errorMessage);
      return null;
    }
  }, [state.isRunning, enablePerformanceTracking, updateProgress, handleStepComplete, handleError]);

  /**
   * Run downr.org test
   */
  const runDownrTest = useCallback(async (youtubeUrl: string): Promise<ProcessingResult | null> => {
    if (state.isRunning) return null;

    setState(prev => ({ ...prev, currentTest: 'downr', downrResult: null, error: null }));

    try {
      const result = await audioProcessingMiddleware.processYouTubeVideo(youtubeUrl, {
        enablePerformanceTracking,
        onProgress: (step, progress) => updateProgress('downr', step, progress),
        onStepComplete: (step, duration) => handleStepComplete('downr', step, duration)
      });

      setState(prev => ({ ...prev, downrResult: result }));
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      handleError('downr', errorMessage);
      return null;
    }
  }, [state.isRunning, enablePerformanceTracking, updateProgress, handleStepComplete, handleError]);

  /**
   * Run both tests sequentially
   */
  const runBothTests = useCallback(async (youtubeUrl: string, audioFile?: File): Promise<{
    appwriteResult: ProcessingResult | null;
    downrResult: ProcessingResult | null;
    comparison: Record<string, unknown> | null;
  }> => {
    setState(prev => ({ 
      ...prev, 
      isRunning: true, 
      currentTest: 'both',
      appwriteResult: null,
      downrResult: null,
      comparison: null,
      error: null
    }));

    try {
      // Run tests sequentially for fair comparison
      const appwriteResult = await runAppwriteTest(audioFile);
      const downrResult = await runDownrTest(youtubeUrl);
      
      // Generate comparison if both succeeded
      let comparison: Record<string, unknown> | null = null;
      if (appwriteResult?.sessionId && downrResult?.sessionId) {
        comparison = performanceTracker.compareSessions(
          appwriteResult.sessionId,
          downrResult.sessionId
        );
        setState(prev => ({ ...prev, comparison }));
      }

      return { appwriteResult, downrResult, comparison };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      return { appwriteResult: null, downrResult: null, comparison: null };
    } finally {
      setState(prev => ({ ...prev, isRunning: false, currentTest: 'none' }));
    }
  }, [runAppwriteTest, runDownrTest]);

  /**
   * Cancel current processing
   */
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState(prev => ({
      ...prev,
      isRunning: false,
      currentTest: 'none',
      error: 'Processing cancelled by user'
    }));
  }, []);

  /**
   * Clear all results
   */
  const clearResults = useCallback(() => {
    setState({
      isRunning: false,
      currentTest: 'none',
      appwriteResult: null,
      downrResult: null,
      appwriteProgress: { step: '', progress: 0 },
      downrProgress: { step: '', progress: 0 },
      comparison: null,
      error: null
    });
    performanceTracker.clearSessions();
  }, []);

  /**
   * Export performance data
   */
  const exportResults = useCallback(() => {
    const data = performanceTracker.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-processing-comparison-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Get performance summary
   */
  const getPerformanceSummary = useCallback(() => {
    const { appwriteResult, downrResult, comparison } = state;
    
    if (!appwriteResult || !downrResult) {
      return null;
    }

    const appwriteTime = appwriteResult.timings?.total || 0;
    const downrTime = downrResult.timings?.total || 0;
    const winner = appwriteTime < downrTime ? 'appwrite' : 'downr';
    const timeDifference = Math.abs(appwriteTime - downrTime);
    const percentageDifference = ((timeDifference / Math.max(appwriteTime, downrTime)) * 100);

    return {
      winner,
      appwriteTime,
      downrTime,
      timeDifference,
      percentageDifference,
      appwriteSuccess: appwriteResult.success,
      downrSuccess: downrResult.success,
      appwriteChords: appwriteResult.chords?.length || 0,
      downrChords: downrResult.chords?.length || 0,
      appwriteBeats: appwriteResult.beats?.beats?.length || 0,
      downrBeats: downrResult.beats?.beats?.length || 0,
      comparison: comparison?.comparison
    };
  }, [state]);

  /**
   * Preload FFmpeg for better performance
   */
  const preloadFFmpeg = useCallback(async () => {
    try {
      await audioProcessingMiddleware.preloadFFmpeg();
      return true;
    } catch (error) {
      console.error('Failed to preload FFmpeg:', error);
      return false;
    }
  }, []);

  /**
   * Check service health
   */
  const checkServiceHealth = useCallback(async () => {
    return await audioProcessingMiddleware.checkServiceHealth();
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    runAppwriteTest,
    runDownrTest,
    runBothTests,
    cancelProcessing,
    clearResults,
    exportResults,
    
    // Utilities
    preloadFFmpeg,
    checkServiceHealth,
    getPerformanceSummary,
    
    // Computed values
    hasResults: !!(state.appwriteResult || state.downrResult),
    hasComparison: !!state.comparison,
    isAppwriteRunning: state.currentTest === 'appwrite' || state.currentTest === 'both',
    isDownrRunning: state.currentTest === 'downr' || state.currentTest === 'both',
    
    // Performance metrics
    performanceSummary: getPerformanceSummary()
  };
}
