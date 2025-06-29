/**
 * QuickTube Error Handler
 * 
 * Provides user-friendly error messages and suggestions for QuickTube-related issues
 */

export interface QuickTubeErrorInfo {
  userMessage: string;
  technicalDetails: string;
  suggestions: string[];
  retryable: boolean;
}

export class QuickTubeErrorHandler {
  
  /**
   * Handle empty file errors (422 status)
   */
  static handleEmptyFileError(videoId: string, url: string): QuickTubeErrorInfo {
    return {
      userMessage: "The audio file appears to be empty or corrupted. This is usually a temporary issue.",
      technicalDetails: `Empty file received from QuickTube for video ${videoId}: ${url}`,
      suggestions: [
        "Wait 2-3 minutes and try again (the file may still be processing)",
        "Try refreshing the page and searching for the video again",
        "If the issue persists, try a different video or use the file upload feature",
        "Check if the YouTube video is still available and not region-restricted"
      ],
      retryable: true
    };
  }

  /**
   * Handle timeout errors
   */
  static handleTimeoutError(videoId: string, duration: number): QuickTubeErrorInfo {
    return {
      userMessage: "Audio extraction is taking longer than expected. This can happen with longer videos or during high server load.",
      technicalDetails: `QuickTube extraction timeout after ${duration}s for video ${videoId}`,
      suggestions: [
        "Try again in a few minutes when server load may be lower",
        "For videos longer than 10 minutes, consider using the file upload feature instead",
        "Check if the video has any special characteristics (live stream, very long duration, etc.)",
        "Try a shorter video to test if the service is working"
      ],
      retryable: true
    };
  }

  /**
   * Handle CDN cache issues
   */
  static handleCdnCacheError(videoId: string): QuickTubeErrorInfo {
    return {
      userMessage: "There seems to be a temporary issue with the content delivery network. The file exists but may not be accessible from your location.",
      technicalDetails: `CDN cache inconsistency detected for video ${videoId}`,
      suggestions: [
        "Wait 5-10 minutes for the CDN cache to refresh",
        "Try again from a different network or location if possible",
        "Clear your browser cache and try again",
        "Use the file upload feature as an alternative"
      ],
      retryable: true
    };
  }

  /**
   * Handle service unavailable errors
   */
  static handleServiceUnavailableError(): QuickTubeErrorInfo {
    return {
      userMessage: "The QuickTube service is temporarily unavailable. This is usually resolved quickly.",
      technicalDetails: "QuickTube service returned non-200 status or is unreachable",
      suggestions: [
        "Try again in 5-10 minutes",
        "Check the QuickTube service status at quicktube.app",
        "Use the file upload feature as an alternative",
        "Try a different video to see if the issue is video-specific"
      ],
      retryable: true
    };
  }

  /**
   * Handle general extraction errors
   */
  static handleGeneralError(error: string, videoId: string): QuickTubeErrorInfo {
    return {
      userMessage: "Audio extraction failed due to an unexpected error. This is usually temporary.",
      technicalDetails: `General QuickTube error for video ${videoId}: ${error}`,
      suggestions: [
        "Try again in a few minutes",
        "Check if the YouTube video is still available",
        "Try a different video to test if the service is working",
        "Use the file upload feature if you have the audio file locally"
      ],
      retryable: true
    };
  }

  /**
   * Get error info based on error type and context
   */
  static getErrorInfo(errorType: 'empty_file' | 'timeout' | 'cdn_cache' | 'service_unavailable' | 'general', context: {
    videoId: string;
    url?: string;
    duration?: number;
    error?: string;
  }): QuickTubeErrorInfo {
    switch (errorType) {
      case 'empty_file':
        return this.handleEmptyFileError(context.videoId, context.url || '');
      case 'timeout':
        return this.handleTimeoutError(context.videoId, context.duration || 0);
      case 'cdn_cache':
        return this.handleCdnCacheError(context.videoId);
      case 'service_unavailable':
        return this.handleServiceUnavailableError();
      case 'general':
      default:
        return this.handleGeneralError(context.error || 'Unknown error', context.videoId);
    }
  }

  /**
   * Format error for user display
   */
  static formatErrorForUser(errorInfo: QuickTubeErrorInfo): string {
    let message = errorInfo.userMessage + '\n\n';
    message += 'Suggestions:\n';
    errorInfo.suggestions.forEach((suggestion, index) => {
      message += `${index + 1}. ${suggestion}\n`;
    });
    return message;
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(errorType: string): boolean {
    // Most QuickTube errors are retryable since they're often temporary
    return ['empty_file', 'timeout', 'cdn_cache', 'service_unavailable'].includes(errorType);
  }
}
