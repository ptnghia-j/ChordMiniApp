/**
 * Audio Duration Detection Utilities
 * 
 * This file contains utility functions for detecting audio duration from various sources,
 * including handling CORS restrictions for external URLs like QuickTube.
 */

/**
 * Get audio duration from a URL using a proxy to avoid CORS issues
 * @param audioUrl The URL of the audio file
 * @param videoId Optional video ID for cache lookup
 * @returns Promise that resolves to the duration in seconds
 */
export async function getAudioDurationFromUrl(audioUrl: string, videoId?: string): Promise<number> {
  try {
    // console.log(`🎵 Detecting duration for audio URL: ${audioUrl}`);

    // Use our dedicated duration detection API route
    const response = await fetch('/api/audio-duration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audioUrl, videoId }),
    });

    if (!response.ok) {
      throw new Error(`Duration detection failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Duration detection failed');
    }

    console.log(`✅ Audio duration detected: ${data.duration} seconds`);
    return data.duration;

  } catch (error) {
    console.error('❌ Failed to detect audio duration:', error);

    // Fallback: Try to estimate duration from file size (very rough estimate)
    try {
      const fallbackDuration = await estimateDurationFromFileSize(audioUrl, videoId);
      // console.log(`⚠️ Using fallback duration estimation: ${fallbackDuration} seconds`);
      return fallbackDuration;
    } catch (fallbackError) {
      console.error('❌ Fallback duration estimation also failed:', fallbackError);

      // Last resort: Return a reasonable default
      // console.log('⚠️ Using default duration of 180 seconds');
      return 180; // 3 minutes default
    }
  }
}

/**
 * Get audio duration from a File object using Web Audio API
 * @param audioFile The audio file
 * @returns Promise that resolves to the duration in seconds
 */
export async function getAudioDurationFromFile(audioFile: File): Promise<number> {
  try {
    console.log(`🎵 Detecting duration for uploaded file: ${audioFile.name}`);

    return new Promise((resolve, reject) => {
      const audio = new Audio();
      
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          console.log(`✅ File duration detected: ${audio.duration} seconds`);
          resolve(audio.duration);
        } else {
          reject(new Error('Invalid duration detected from file'));
        }
      });

      audio.addEventListener('error', (e) => {
        reject(new Error(`Failed to load audio file for duration detection: ${e}`));
      });

      // Create object URL for the file
      const objectUrl = URL.createObjectURL(audioFile);
      audio.src = objectUrl;

      // Clean up object URL after detection
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(objectUrl);
      });

      audio.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
      });
    });

  } catch (error) {
    console.error('❌ Failed to detect duration from file:', error);
    throw error;
  }
}

/**
 * Estimate audio duration from file size (very rough approximation)
 * This is used as a fallback when other methods fail
 * @param audioUrl The URL of the audio file
 * @returns Promise that resolves to estimated duration in seconds
 */
async function estimateDurationFromFileSize(audioUrl: string, videoId?: string): Promise<number> {
  try {
    // Use HEAD request to get file size without downloading the entire file
    // CRITICAL FIX: For QuickTube URLs, preserve square brackets during URL encoding
    let encodedUrl;
    if (audioUrl.includes('quicktube.app/dl/')) {
      // For QuickTube URLs, encode everything except square brackets
      encodedUrl = encodeURIComponent(audioUrl).replace(/%5B/g, '[').replace(/%5D/g, ']');
    } else {
      // For other URLs, use standard encoding
      encodedUrl = encodeURIComponent(audioUrl);
    }
    // Include videoId so proxy-audio can use cached file when applicable
    const headUrl = videoId ? `/api/proxy-audio?url=${encodedUrl}&videoId=${videoId}` : `/api/proxy-audio?url=${encodedUrl}`;
    const response = await fetch(headUrl, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`Failed to get file info: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      throw new Error('No content-length header available');
    }

    const fileSizeBytes = parseInt(contentLength, 10);

    // Very rough estimation: assume 128kbps MP3 encoding
    // 128 kbps = 16 KB/s, so duration = fileSize / 16000
    const estimatedDuration = fileSizeBytes / 16000;

    // Only clamp maximum to prevent unreasonable values, but don't enforce minimum
    // This allows detection of truncated/incomplete files
    const clampedDuration = Math.min(estimatedDuration, 1800); // Max 30 minutes

    // Log warning if file seems too small for a typical song
    if (fileSizeBytes < 1000000) { // Less than 1MB
      console.warn(`⚠️ File size unusually small: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB - may be truncated or incomplete`);
    }

    console.log(`📊 File size: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB, estimated duration: ${clampedDuration.toFixed(1)}s`);

    return clampedDuration;

  } catch (error) {
    console.error('❌ Failed to estimate duration from file size:', error);
    throw error;
  }
}

/**
 * Get audio duration with automatic method selection
 * @param audioInput Either a File object or URL string
 * @returns Promise that resolves to the duration in seconds
 */
export async function getAudioDuration(audioInput: File | string): Promise<number> {
  if (audioInput instanceof File) {
    return getAudioDurationFromFile(audioInput);
  } else {
    return getAudioDurationFromUrl(audioInput);
  }
}

/**
 * Format duration in seconds to MM:SS format
 * @param duration Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(duration: number): string {
  if (!duration || !isFinite(duration)) {
    return '0:00';
  }

  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Check if a duration value is valid
 * @param duration Duration in seconds
 * @returns True if the duration is valid
 */
export function isValidDuration(duration: number): boolean {
  return typeof duration === 'number' && 
         !isNaN(duration) && 
         isFinite(duration) && 
         duration > 0 && 
         duration < 7200; // Less than 2 hours
}
