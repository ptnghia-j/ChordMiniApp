/**
 * Backend Processing Service
 *
 * Handles communication with Google Cloud Run backend for audio processing
 * using direct URLs from ytdown.io or Firebase Storage URLs.
 */

import { getAudioDurationFromUrl } from '@/utils/audioDurationUtils';

export interface BackendProcessingOptions {
  audioUrl: string;
  videoId: string;
  detector?: string;
  processingType: 'beats' | 'chords';
  audioDuration?: number; // Optional pre-calculated duration
}

export interface BackendProcessingResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  processingTime?: number;
  urlType: 'direct' | 'firebase' | 'complete_file' | 'unknown';
}

/**
 * Calculate dynamic timeout based on audio duration
 * Uses 75% of audio duration + base processing time
 */
function calculateProcessingTimeout(audioDuration: number): number {
  // Base timeout for model loading and setup (30 seconds)
  const baseTimeout = 30000;

  // 75% of audio duration for processing (in milliseconds)
  const processingTime = Math.ceil(audioDuration * 0.75 * 1000);

  // Minimum timeout of 2 minutes, maximum of 15 minutes
  const minTimeout = 120000; // 2 minutes
  const maxTimeout = 900000; // 15 minutes

  const calculatedTimeout = baseTimeout + processingTime;
  const finalTimeout = Math.max(minTimeout, Math.min(maxTimeout, calculatedTimeout));

  console.log(`⏱️ Timeout calculation: duration=${audioDuration}s, calculated=${calculatedTimeout}ms, final=${finalTimeout}ms`);

  return finalTimeout;
}

/**
 * Process audio using Google Cloud Run backend with complete file or URL
 */
export async function processAudioWithBackend(
  options: BackendProcessingOptions
): Promise<BackendProcessingResult> {
  const { audioUrl, videoId, detector = 'auto', processingType, audioDuration } = options;
  const startTime = Date.now();

  console.log(`🎵 Starting ${processingType} processing for ${videoId}`);
  console.log(`   Detector: ${detector}`);

  try {
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';

    // Get audio duration for timeout calculation
    let duration = audioDuration;
    if (!duration) {
      try {
        console.log(`⏱️ Getting audio duration for timeout calculation...`);
        duration = await getAudioDurationFromUrl(audioUrl);
        console.log(`⏱️ Audio duration: ${duration} seconds`);
      } catch (error) {
        console.warn(`⚠️ Failed to get audio duration, using default: ${error}`);
        duration = 180; // 3 minutes default
      }
    }

    // Calculate dynamic timeout based on audio duration
    const timeoutMs = calculateProcessingTimeout(duration);

    // Check if we have a cached complete audio file
    const { getCachedAudioFile } = await import('./parallelPipelineService');
    const cachedAudioFile = getCachedAudioFile(videoId);

    if (cachedAudioFile) {
      console.log(`🚀 Using cached complete audio file for immediate processing`);
      console.log(`   File size: ${(cachedAudioFile.size / 1024 / 1024).toFixed(2)}MB`);

      // Use file upload endpoint for complete file
      const endpoint = processingType === 'beats'
        ? `${backendUrl}/api/detect-beats`
        : `${backendUrl}/api/recognize-chords`;

      // Prepare form data with complete file
      const formData = new FormData();
      formData.append('audio_file', cachedAudioFile, `${videoId}.m4a`);
      formData.append('detector', detector);

      console.log(`📡 Sending complete file to: ${endpoint} (timeout: ${timeoutMs}ms)`);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(timeoutMs) // Dynamic timeout based on audio duration
      });

      if (!response.ok) {
        throw new Error(`Backend file upload failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      if (data.success) {
        console.log(`✅ ${processingType} processing completed with complete file for ${videoId}`);
        console.log(`   Processing time: ${processingTime}ms`);

        // Update statistics
        updateStats({
          success: true,
          data,
          processingTime,
          urlType: 'complete_file'
        });

        return {
          success: true,
          data,
          processingTime,
          urlType: 'complete_file'
        };
      } else {
        throw new Error(data.error || `${processingType} processing failed`);
      }

    } else {
      // Fallback to URL-based processing
      console.log(`🔄 No cached file available, using URL-based processing`);

      // Determine URL type
      const urlType = audioUrl.includes('firebasestorage.googleapis.com') ? 'firebase' : 'direct';
      console.log(`   URL type: ${urlType}`);

      // Use the appropriate endpoint based on processing type
      const endpoint = processingType === 'beats'
        ? `${backendUrl}/api/detect-beats-firebase`
        : `${backendUrl}/api/recognize-chords-firebase`;

      // Prepare form data (backend expects form-encoded data)
      const formData = new FormData();
      formData.append('firebase_url', audioUrl); // Backend parameter name
      formData.append('detector', detector);

      console.log(`📡 Sending URL request to: ${endpoint} (timeout: ${timeoutMs}ms)`);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(timeoutMs) // Dynamic timeout based on audio duration
      });

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      if (data.success) {
        console.log(`✅ ${processingType} processing completed with URL for ${videoId}`);
        console.log(`   Processing time: ${processingTime}ms`);
        console.log(`   URL type: ${urlType}`);

        // Update statistics
        updateStats({
          success: true,
          data,
          processingTime,
          urlType
        });

        return {
          success: true,
          data,
          processingTime,
          urlType
        };
      } else {
        throw new Error(data.error || `${processingType} processing failed`);
      }
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ ${processingType} processing failed for ${videoId}:`, error);

    const result = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processing error',
      processingTime,
      urlType: 'unknown' as const
    };

    // Update statistics
    updateStats(result);

    return result;
  }
}

/**
 * Process beats with direct URL or Firebase URL
 */
export async function processBeats(
  audioUrl: string,
  videoId: string,
  detector: string = 'beat-transformer',
  audioDuration?: number
): Promise<BackendProcessingResult> {
  return processAudioWithBackend({
    audioUrl,
    videoId,
    detector,
    processingType: 'beats',
    audioDuration
  });
}

/**
 * Process chords with direct URL or Firebase URL
 */
export async function processChords(
  audioUrl: string,
  videoId: string,
  detector: string = 'btc-pl',
  audioDuration?: number
): Promise<BackendProcessingResult> {
  return processAudioWithBackend({
    audioUrl,
    videoId,
    detector,
    processingType: 'chords',
    audioDuration
  });
}

/**
 * Test if backend can process a specific URL
 */
export async function testBackendUrl(audioUrl: string): Promise<boolean> {
  try {
    // Use a simple HEAD request to test URL accessibility
    const response = await fetch(audioUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    return response.ok;
  } catch (error) {
    console.warn(`URL test failed for ${audioUrl}:`, error);
    return false;
  }
}

/**
 * Get processing statistics for monitoring
 */
export interface ProcessingStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageProcessingTime: number;
  directUrlRequests: number;
  firebaseUrlRequests: number;
  completeFileRequests: number;
}

const processingStats: ProcessingStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageProcessingTime: 0,
  directUrlRequests: 0,
  firebaseUrlRequests: 0,
  completeFileRequests: 0
};

/**
 * Update processing statistics
 */
export function updateStats(result: BackendProcessingResult): void {
  processingStats.totalRequests++;

  if (result.success) {
    processingStats.successfulRequests++;
  } else {
    processingStats.failedRequests++;
  }

  if (result.processingTime) {
    const totalTime = processingStats.averageProcessingTime * (processingStats.totalRequests - 1);
    processingStats.averageProcessingTime = (totalTime + result.processingTime) / processingStats.totalRequests;
  }

  if (result.urlType === 'direct') {
    processingStats.directUrlRequests++;
  } else if (result.urlType === 'firebase') {
    processingStats.firebaseUrlRequests++;
  } else if (result.urlType === 'complete_file') {
    processingStats.completeFileRequests++;
  }
}

/**
 * Get current processing statistics
 */
export function getProcessingStats(): ProcessingStats {
  return { ...processingStats };
}

/**
 * Reset processing statistics
 */
export function resetProcessingStats(): void {
  processingStats.totalRequests = 0;
  processingStats.successfulRequests = 0;
  processingStats.failedRequests = 0;
  processingStats.averageProcessingTime = 0;
  processingStats.directUrlRequests = 0;
  processingStats.firebaseUrlRequests = 0;
  processingStats.completeFileRequests = 0;
}
