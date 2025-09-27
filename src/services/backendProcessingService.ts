/**
 * Backend Processing Service
 * 
 * Handles communication with Google Cloud Run backend for audio processing
 * using direct URLs from ytdown.io or Firebase Storage URLs.
 */

export interface BackendProcessingOptions {
  audioUrl: string;
  videoId: string;
  detector?: string;
  processingType: 'beats' | 'chords';
}

export interface BackendProcessingResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  processingTime?: number;
  urlType: 'direct' | 'firebase' | 'complete_file' | 'unknown';
}

/**
 * Process audio using Google Cloud Run backend with complete file or URL
 */
export async function processAudioWithBackend(
  options: BackendProcessingOptions
): Promise<BackendProcessingResult> {
  const { audioUrl, videoId, detector = 'auto', processingType } = options;
  const startTime = Date.now();

  console.log(`🎵 Starting ${processingType} processing for ${videoId}`);
  console.log(`   Detector: ${detector}`);

  try {
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';

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

      console.log(`📡 Sending complete file to: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120000) // 2 minutes timeout
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

      console.log(`📡 Sending URL request to: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120000) // 2 minutes timeout
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
  detector: string = 'beat-transformer'
): Promise<BackendProcessingResult> {
  return processAudioWithBackend({
    audioUrl,
    videoId,
    detector,
    processingType: 'beats'
  });
}

/**
 * Process chords with direct URL or Firebase URL
 */
export async function processChords(
  audioUrl: string,
  videoId: string,
  detector: string = 'btc-pl'
): Promise<BackendProcessingResult> {
  return processAudioWithBackend({
    audioUrl,
    videoId,
    detector,
    processingType: 'chords'
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
