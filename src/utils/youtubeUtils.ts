/**
 * YouTube Utility Functions
 * 
 * This file contains utility functions for working with YouTube URLs and embeds.
 */

/**
 * Converts a standard YouTube URL to a privacy-enhanced URL
 * This helps reduce tracking and CORS errors
 * 
 * @param url The YouTube URL to convert
 * @returns The privacy-enhanced YouTube URL
 */
export function convertToPrivacyEnhancedUrl(url: string): string {
  if (!url) return url;
  
  // Replace youtube.com with youtube-nocookie.com
  return url.replace('youtube.com', 'youtube-nocookie.com');
}

/**
 * Checks if a string is a YouTube URL
 * 
 * @param str The string to check
 * @returns True if the string is a YouTube URL
 */
export const isYouTubeUrl = (str: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return youtubeRegex.test(str);
};

/**
 * Extracts a video ID from a YouTube URL
 * 
 * @param url The YouTube URL
 * @returns The video ID or null if not found
 */
export const extractVideoId = (url: string): string | null => {
  // Handle youtu.be format
  if (url.includes('youtu.be')) {
    const id = url.split('/').pop();
    return id || null;
  }
  
  // Handle youtube.com format
  const urlParams = new URLSearchParams(url.split('?')[1]);
  return urlParams.get('v');
};
