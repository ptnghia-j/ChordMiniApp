/* eslint-disable @typescript-eslint/no-explicit-any */
// Helper utilities extracted from analyze page component

/**
 * Build song context for chatbot integration
 * Extracted from lines 790-814 of original component
 */
export const buildSongContext = (
  videoId: string,
  titleFromSearch: string | null,
  analysisResults: any,
  keySignature: string | null,
  chordCorrections: Record<string, string> | null,
  showCorrectedChords: boolean
): string => {
  let context = `Song: ${titleFromSearch || 'Unknown'} (Video ID: ${videoId})\n`;
  
  if (keySignature) {
    context += `Key: ${keySignature}\n`;
  }
  
  if (analysisResults?.beatDetectionResult?.bpm) {
    context += `BPM: ${analysisResults.beatDetectionResult.bpm}\n`;
  }
  
  if (analysisResults?.beatDetectionResult?.time_signature) {
    context += `Time Signature: ${analysisResults.beatDetectionResult.time_signature}/4\n`;
  }
  
  if (analysisResults?.synchronizedChords && analysisResults.synchronizedChords.length > 0) {
    const chords = analysisResults.synchronizedChords.map((item: any) => {
      let chord = item.chord;
      if (showCorrectedChords && chordCorrections && chordCorrections[chord]) {
        chord = chordCorrections[chord];
      }
      return chord;
    });
    
    const uniqueChords = Array.from(new Set(chords));
    context += `Chords: ${uniqueChords.join(', ')}\n`;
  }
  
  return context;
};

/**
 * Toggle enharmonic correction display
 * Extracted from lines 2556-2558 of original component
 */
export const toggleEnharmonicCorrection = (
  currentState: boolean,
  setShowCorrectedChords: (show: boolean) => void
): void => {
  setShowCorrectedChords(!currentState);
};

/**
 * Navigation helper for trying another video
 * Extracted from lines 257-260 of original component
 */
export const handleTryAnotherVideo = (): void => {
  window.location.href = '/';
};

/**
 * Model validation functions
 */
export const validateBeatDetector = (detector: string): boolean => {
  return ['auto', 'madmom', 'beat-transformer'].includes(detector);
};

export const validateChordDetector = (detector: string): boolean => {
  return ['chord-cnn-lstm', 'btc-sl', 'btc-pl'].includes(detector);
};

/**
 * localStorage utilities for model persistence
 */
export const saveModelPreference = (key: string, value: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
};

export const loadModelPreference = (key: string, defaultValue: string): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(key);
    return saved || defaultValue;
  }
  return defaultValue;
};

export const clearModelPreferences = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('chordmini_beat_detector');
    localStorage.removeItem('chordmini_chord_detector');
  }
};

/**
 * Error classification utilities for user-friendly messages
 */
export const generateUserFriendlyErrorMessage = (error: string): {
  message: string;
  suggestion: string;
  severity: 'error' | 'warning' | 'info';
} => {
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('youtube short')) {
    return {
      message: 'YouTube Shorts are not supported',
      suggestion: 'Please try a regular YouTube video instead',
      severity: 'error'
    };
  }
  
  if (errorLower.includes('restricted') || errorLower.includes('unavailable')) {
    return {
      message: 'Video is restricted or unavailable',
      suggestion: 'This video may be private, age-restricted, or unavailable in your region. Try a different video.',
      severity: 'error'
    };
  }
  
  if (errorLower.includes('network') || errorLower.includes('timeout')) {
    return {
      message: 'Network connection issue',
      suggestion: 'Check your internet connection and try again',
      severity: 'warning'
    };
  }
  
  if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
    return {
      message: 'Service temporarily unavailable',
      suggestion: 'Too many requests. Please wait a few minutes and try again.',
      severity: 'warning'
    };
  }
  
  if (errorLower.includes('audio') && errorLower.includes('not found')) {
    return {
      message: 'Audio extraction failed',
      suggestion: 'This video may not have audio or the audio format is not supported',
      severity: 'error'
    };
  }
  
  return {
    message: 'An unexpected error occurred',
    suggestion: 'Please try again or contact support if the problem persists',
    severity: 'error'
  };
};

/**
 * URL validation and sanitization
 */
export const validateVideoId = (videoId: string): boolean => {
  // YouTube video ID format validation
  const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  return youtubeIdPattern.test(videoId);
};

export const extractVideoIdFromUrl = (url: string): string | null => {
  // Extract video ID from various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
};

/**
 * Performance monitoring utilities
 */
export const createPerformanceTimer = (label: string) => {
  const startTime = performance.now();
  
  return {
    end: () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
      return duration;
    },
    lap: (lapLabel: string) => {
      const lapTime = performance.now();
      const duration = lapTime - startTime;
      console.log(`⏱️ ${label} - ${lapLabel}: ${duration.toFixed(2)}ms`);
      return duration;
    }
  };
};

/**
 * Debounce utility for performance optimization
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle utility for performance optimization
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Deep clone utility for state management
 */
export const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Generate unique ID for components
 */
export const generateUniqueId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Check if device is mobile
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const result = document.execCommand('copy');
      textArea.remove();
      return result;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};

/**
 * Format number with commas
 */
export const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * Capitalize first letter of string
 */
export const capitalize = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};
