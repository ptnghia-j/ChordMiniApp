/* eslint-disable @typescript-eslint/no-explicit-any */
// Audio processing utilities extracted from analyze page component

import { audioContextManager } from '@/services/audio/audioContextManager';

/**


 * Audio format validation and error handling utilities
 */
export const validateAudioFormat = (audioUrl: string): boolean => {
  if (!audioUrl) return false;

  // Check for common audio file extensions
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
  const hasValidExtension = audioExtensions.some(ext =>
    audioUrl.toLowerCase().includes(ext)
  );

  return hasValidExtension || audioUrl.includes('blob:') || audioUrl.includes('data:audio');
};

/**
 * Sample rate conversion and audio processing utilities
 */
export const getRecommendedSampleRate = (): number => {
  // Beat-Transformer model requires exactly 44100Hz
  return 44100;
};

/**
 * Duration formatting and time calculations
 */
export const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Parse duration string to seconds
 */
export const parseDurationToSeconds = (durationString: string): number => {
  if (!durationString) return 0;

  // Handle formats like "3:45", "1:23:45", or just "180" (seconds)
  const parts = durationString.split(':').map(part => parseInt(part, 10));

  if (parts.length === 1) {
    // Just seconds
    return parts[0] || 0;
  } else if (parts.length === 2) {
    // Minutes:seconds
    return (parts[0] * 60) + (parts[1] || 0);
  } else if (parts.length === 3) {
    // Hours:minutes:seconds
    return (parts[0] * 3600) + (parts[1] * 60) + (parts[2] || 0);
  }

  return 0;
};

/**
 * Audio metadata extraction from search results
 * Extracted from lines 993-1006 of original component
 */
export const extractAudioMetadata = (searchResult: any) => {
  return {
    id: searchResult.id || '',
    title: searchResult.title || searchResult.snippet?.title || '',
    duration: searchResult.duration || searchResult.contentDetails?.duration || '',
    channelTitle: searchResult.channelTitle || searchResult.snippet?.channelTitle || '',
    thumbnail: searchResult.thumbnail ||
               searchResult.snippet?.thumbnails?.medium?.url ||
               searchResult.snippet?.thumbnails?.default?.url || ''
  };
};

/**
 * Progress tracking utilities
 * Extracted from lines 972-976 of original component
 */
export const createProgressTracker = (
  updateCallback: (updater: (prev: number) => number) => void,
  intervalMs: number = 300,
  maxProgress: number = 90
) => {
  const interval = setInterval(() => {
    updateCallback((prev: number) => Math.min(prev + 2, maxProgress));
  }, intervalMs);

  return () => clearInterval(interval);
};

/**
 * Audio error classification utilities
 */
export const classifyAudioError = (error: string): {
  type: 'restriction' | 'network' | 'format' | 'quota' | 'unknown';
  suggestion: string;
} => {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('youtube short')) {
    return {
      type: 'format',
      suggestion: 'YouTube Shorts cannot be processed. Please try a regular YouTube video.'
    };
  }

  if (errorLower.includes('restricted') || errorLower.includes('unavailable')) {
    return {
      type: 'restriction',
      suggestion: 'This video may be restricted or unavailable for download. Try a different video.'
    };
  }

  if (errorLower.includes('network') || errorLower.includes('timeout')) {
    return {
      type: 'network',
      suggestion: 'Check your internet connection and try again.'
    };
  }

  if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
    return {
      type: 'quota',
      suggestion: 'Service temporarily unavailable. Please try again in a few minutes.'
    };
  }

  return {
    type: 'unknown',
    suggestion: 'An unexpected error occurred. Please try again or contact support.'
  };
};

/**
 * Audio processing state validation
 */
export const validateAudioProcessingState = (state: any): boolean => {
  return state &&
         typeof state === 'object' &&
         typeof state.isExtracted === 'boolean' &&
         typeof state.isAnalyzed === 'boolean' &&
         (state.audioUrl === null || typeof state.audioUrl === 'string');
};

/**
 * Audio URL validation and sanitization
 */
export const sanitizeAudioUrl = (url: string): string => {
  if (!url) return '';

  // Remove any potential XSS attempts
  const sanitized = url.replace(/[<>'"]/g, '');

  // Validate URL format
  try {
    new URL(sanitized);
    return sanitized;
  } catch {
    // If not a valid URL, check if it's a blob or data URL
    if (sanitized.startsWith('blob:') || sanitized.startsWith('data:')) {
      return sanitized;
    }
    return '';
  }
};

/**
 * Calculate audio processing time estimate
 */
export const estimateProcessingTime = (durationSeconds: number): string => {
  // Rough estimate: processing takes about 1.5x the audio duration
  const estimatedSeconds = Math.ceil(durationSeconds * 1.5);

  if (estimatedSeconds < 60) {
    return `${estimatedSeconds} seconds`;
  } else if (estimatedSeconds < 300) {
    const minutes = Math.ceil(estimatedSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return 'several minutes';
  }
};

/**
 * Audio quality assessment
 */
export const assessAudioQuality = (audioUrl: string, duration: number): {
  quality: 'high' | 'medium' | 'low' | 'unknown';
  recommendations: string[];
} => {
  const recommendations: string[] = [];

  // Check duration
  if (duration < 30) {
    recommendations.push('Audio is very short - results may be limited');
  } else if (duration > 600) {
    recommendations.push('Long audio may take several minutes to process');
  }

  // Check URL type for quality hints
  if (audioUrl.includes('blob:')) {
    return {
      quality: 'medium',
      recommendations: [...recommendations, 'Using extracted audio - quality depends on source']
    };
  }

  if (audioUrl.includes('youtube')) {
    return {
      quality: 'medium',
      recommendations: [...recommendations, 'YouTube audio quality varies by video']
    };
  }

  return {
    quality: 'unknown',
    recommendations
  };
};

/**
 * Audio buffer utilities for Web Audio API
 */
export const createAudioBuffer = async (audioUrl: string, ctx?: AudioContext): Promise<AudioBuffer | null> => {
  try {
    const audioContext = ctx ?? audioContextManager.getContext();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (error) {
    console.error('Failed to create audio buffer:', error);
    return null;
  }
};

/**
 * Check browser audio support
 */
export const checkAudioSupport = (): {
  webAudio: boolean;
  mediaRecorder: boolean;
  audioElement: boolean;
} => {
  return {
    webAudio: !!(window.AudioContext || (window as any).webkitAudioContext),
    mediaRecorder: !!window.MediaRecorder,
    audioElement: !!document.createElement('audio').canPlayType
  };
};
