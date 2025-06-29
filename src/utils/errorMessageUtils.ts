/**
 * Error Message Utilities
 * 
 * This file contains utility functions for converting technical error messages
 * into user-friendly messages with actionable suggestions.
 */

export interface UserFriendlyError {
  title: string;
  message: string;
  suggestion: string;
  showTryAnotherButton: boolean;
  isQuickTubeError: boolean;
}

/**
 * Convert technical error messages to user-friendly messages
 * @param error The original error message
 * @returns User-friendly error object
 */
export function createUserFriendlyError(error: string): UserFriendlyError {
  const errorLower = error.toLowerCase();

  // QuickTube service unavailable
  if (errorLower.includes('quicktube service is currently unavailable') ||
      errorLower.includes('quicktube service appears to be overloaded') ||
      errorLower.includes('unable to connect to quicktube')) {
    return {
      title: 'Video Processing Unavailable',
      message: 'Unable to extract audio from this video. The video processing service is temporarily unavailable.',
      suggestion: 'Please try searching for another version of this song or use a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Video not available or restricted
  if (errorLower.includes('video is not available') ||
      errorLower.includes('video is restricted') ||
      errorLower.includes('invalid or unsupported youtube link') ||
      errorLower.includes('youtube video is not available')) {
    return {
      title: 'Video Not Available',
      message: 'Unable to extract audio from this video. The video may be restricted, private, or unavailable.',
      suggestion: 'Please try searching for another version of this song or use a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // YouTube Shorts
  if (errorLower.includes('youtube short') ||
      errorLower.includes('shorts')) {
    return {
      title: 'YouTube Shorts Not Supported',
      message: 'YouTube Shorts cannot be processed due to their special format.',
      suggestion: 'Please try searching for a regular YouTube video of this song instead.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Timeout errors
  if (errorLower.includes('timeout') ||
      errorLower.includes('timed out') ||
      errorLower.includes('processing timeout')) {
    return {
      title: 'Processing Timeout',
      message: 'Unable to extract audio from this video. The video may be too long or the service is busy.',
      suggestion: 'Please try searching for a shorter version of this song or use a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Video too long
  if (errorLower.includes('too long') ||
      errorLower.includes('file is too large') ||
      errorLower.includes('duration limit')) {
    return {
      title: 'Video Too Long',
      message: 'Unable to extract audio from this video. The video is too long to process.',
      suggestion: 'Please try searching for a shorter version of this song (under 10 minutes).',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Network/connection errors
  if (errorLower.includes('network error') ||
      errorLower.includes('connection') ||
      errorLower.includes('failed to fetch')) {
    return {
      title: 'Connection Error',
      message: 'Unable to extract audio from this video due to a network issue.',
      suggestion: 'Please check your internet connection and try again, or search for a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Browser compatibility issues
  if (errorLower.includes('browser compatibility') ||
      errorLower.includes('abortsignal') ||
      errorLower.includes('string did not match the expected pattern')) {
    return {
      title: 'Browser Compatibility Issue',
      message: 'Unable to extract audio from this video due to a browser compatibility issue.',
      suggestion: 'Please refresh the page and try again, or try using a different browser.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Vercel/deployment specific errors
  if (errorLower.includes('vercel') ||
      errorLower.includes('deployment') ||
      errorLower.includes('serverless function')) {
    return {
      title: 'Service Temporarily Unavailable',
      message: 'Unable to extract audio from this video. Our service is experiencing temporary issues.',
      suggestion: 'Please try again in a few minutes, or search for a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Cookie/authentication errors
  if (errorLower.includes('cookies database') ||
      errorLower.includes('authentication') ||
      errorLower.includes('youtube restrictions')) {
    return {
      title: 'Video Access Restricted',
      message: 'Unable to extract audio from this video due to YouTube restrictions.',
      suggestion: 'Please try searching for another version of this song or use a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Generic QuickTube errors
  if (errorLower.includes('quicktube') ||
      errorLower.includes('extraction failed') ||
      errorLower.includes('download failed')) {
    return {
      title: 'Video Processing Failed',
      message: 'Unable to extract audio from this video. The video processing failed.',
      suggestion: 'Please try searching for another version of this song or use a different video.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Backend service unavailable errors
  if (errorLower.includes('backend service temporarily unavailable') ||
      errorLower.includes('backend service is temporarily unavailable') ||
      errorLower.includes('timeouterror') ||
      errorLower.includes('the operation was aborted due to timeout')) {
    return {
      title: 'Service Temporarily Unavailable',
      message: 'The analysis service is currently experiencing high load or is starting up.',
      suggestion: 'Please wait a few minutes and try again, or use the "Upload Audio File" option for immediate processing.',
      showTryAnotherButton: false,
      isQuickTubeError: false
    };
  }

  // Audio processing errors (not QuickTube related)
  if (errorLower.includes('audio processing') ||
      errorLower.includes('beat detection') ||
      errorLower.includes('chord recognition')) {
    return {
      title: 'Audio Analysis Failed',
      message: 'The audio was extracted successfully, but analysis failed.',
      suggestion: 'Please try again with different analysis settings, or try a different audio file.',
      showTryAnotherButton: false,
      isQuickTubeError: false
    };
  }

  // File format errors
  if (errorLower.includes('format') ||
      errorLower.includes('codec') ||
      errorLower.includes('unsupported')) {
    return {
      title: 'Unsupported Format',
      message: 'Unable to process this video due to an unsupported format.',
      suggestion: 'Please try searching for a different version of this song.',
      showTryAnotherButton: true,
      isQuickTubeError: true
    };
  }

  // Default fallback for unknown errors
  return {
    title: 'Processing Failed',
    message: 'Unable to extract audio from this video.',
    suggestion: 'Please try searching for another version of this song or use a different video.',
    showTryAnotherButton: true,
    isQuickTubeError: true
  };
}

/**
 * Check if an error is related to QuickTube/video extraction
 * @param error The error message
 * @returns True if it's a QuickTube error
 */
export function isQuickTubeError(error: string): boolean {
  const errorLower = error.toLowerCase();
  
  const quickTubeKeywords = [
    'quicktube',
    'extraction failed',
    'video is not available',
    'youtube',
    'download failed',
    'video processing',
    'audio extraction'
  ];

  return quickTubeKeywords.some(keyword => errorLower.includes(keyword));
}

/**
 * Get troubleshooting steps based on error type
 * @param error The error message
 * @returns Array of troubleshooting steps
 */
export function getTroubleshootingSteps(error: string): string[] {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('youtube short')) {
    return [
      'This appears to be a YouTube Short which cannot be processed',
      'YouTube Shorts use a different format that our system cannot extract',
      'Please try a regular YouTube video instead'
    ];
  }

  if (errorLower.includes('timeout') || errorLower.includes('too long')) {
    return [
      'Try searching for a shorter version of the song (under 5 minutes)',
      'Look for official music videos rather than live performances',
      'Try again during off-peak hours when the service is less busy'
    ];
  }

  if (errorLower.includes('restricted') || errorLower.includes('not available')) {
    return [
      'The video may be geo-restricted or private',
      'Try searching for the official music video',
      'Look for versions uploaded by verified artists or labels'
    ];
  }

  if (errorLower.includes('network') || errorLower.includes('connection')) {
    return [
      'Check your internet connection',
      'Try refreshing the page',
      'Disable any VPN or proxy if you\'re using one'
    ];
  }

  // Default troubleshooting steps
  return [
    'Try searching for a different version of the song',
    'Look for official music videos or verified uploads',
    'Try again in a few minutes if the service is busy',
    'Consider using the "Upload Audio File" option instead'
  ];
}
