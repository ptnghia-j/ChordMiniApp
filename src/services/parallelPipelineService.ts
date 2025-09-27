/**
 * Parallel Pipeline Service
 * 
 * Optimizes the audio processing pipeline by running Google Cloud Run
 * computation in parallel with Firebase Storage upload, using ytdown.io
 * direct URLs to eliminate the upload bottleneck.
 */

export interface ParallelPipelineOptions {
  videoId: string;
  title: string;
  directUrl: string;
  contentType?: string;
}

export interface ParallelPipelineResult {
  success: boolean;
  firebaseUrl?: string;
  directUrl: string;
  uploadTime?: number;
  error?: string;
  hasCompleteFile?: boolean;
}

/**
 * Start improved parallel pipeline: Complete file processing + Firebase upload
 *
 * Downloads the complete audio file, then starts both Google Cloud Run processing
 * and Firebase upload in parallel. This ensures Google Cloud Run gets a complete
 * file while Firebase upload happens simultaneously.
 */
export async function startParallelPipeline(
  options: ParallelPipelineOptions
): Promise<ParallelPipelineResult> {
  const { videoId, title, directUrl, contentType = 'audio/mp4' } = options;

  console.log(`🚀 Starting improved parallel pipeline for ${videoId}`);
  console.log(`   Direct URL: ${directUrl}`);

  try {
    // Step 1: Download the complete audio file
    console.log(`📥 Downloading complete audio file for parallel processing...`);
    const audioBlob = await downloadCompleteAudioFile(directUrl);
    console.log(`✅ Complete audio file downloaded: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);

    // Step 2: Start both processes in parallel
    console.log(`🚀 Starting parallel processing: Google Cloud Run + Firebase upload`);

    // Start Firebase upload in background (non-blocking)
    uploadBlobToFirebaseInBackground(audioBlob, {
      videoId,
      title,
      contentType
    }).catch(error => {
      console.error(`Background upload error for ${videoId}:`, error);
    });

    // Store the audio blob for immediate Google Cloud Run processing
    audioFileCache.set(videoId, {
      blob: audioBlob,
      timestamp: Date.now(),
      contentType
    });

    console.log(`✅ Parallel pipeline ready - complete audio file available for immediate processing`);

    return {
      success: true,
      directUrl, // Keep for compatibility
      firebaseUrl: undefined, // Will be available later
      uploadTime: undefined,
      hasCompleteFile: true // New flag indicating complete file is ready
    };

  } catch (error) {
    console.error(`❌ Failed to download complete audio file for ${videoId}:`, error);

    // Fallback to direct URL approach
    console.log(`🔄 Falling back to direct URL approach`);
    uploadToFirebaseInBackground(directUrl, {
      videoId,
      title,
      contentType
    }).catch(uploadError => {
      console.error(`Background upload error for ${videoId}:`, uploadError);
    });

    return {
      success: true,
      directUrl,
      firebaseUrl: undefined,
      uploadTime: undefined,
      hasCompleteFile: false
    };
  }
}

/**
 * Upload to Firebase Storage in background without blocking
 */
async function uploadToFirebaseInBackground(
  directUrl: string,
  options: { videoId: string; title: string; contentType: string }
): Promise<void> {
  try {
    console.log(`📤 Background Firebase upload started for ${options.videoId}`);
    
    const { uploadAudioFromUrlWithRetry } = await import('./streamingFirebaseUpload');
    const uploadResult = await uploadAudioFromUrlWithRetry(directUrl, options);
    
    if (uploadResult.success && uploadResult.audioUrl) {
      console.log(`✅ Background Firebase upload completed for ${options.videoId}`);
      console.log(`   Firebase URL: ${uploadResult.audioUrl}`);
      
      // Store the Firebase URL for later retrieval if needed
      backgroundUploadResults.set(options.videoId, {
        success: true,
        firebaseUrl: uploadResult.audioUrl,
        uploadTime: Date.now()
      });
    } else {
      throw new Error(uploadResult.error || 'Upload failed');
    }
  } catch (error) {
    console.warn(`⚠️ Background Firebase upload failed for ${options.videoId}:`, error);
    backgroundUploadResults.set(options.videoId, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error',
      uploadTime: Date.now()
    });
  }
}

/**
 * Storage for background upload results
 */
const backgroundUploadResults = new Map<string, {
  success: boolean;
  firebaseUrl?: string;
  error?: string;
  uploadTime: number;
}>();

/**
 * Cache for complete audio files ready for Google Cloud Run processing
 */
const audioFileCache = new Map<string, {
  blob: Blob;
  timestamp: number;
  contentType: string;
}>();

/**
 * Download complete audio file from ytdown.io URL
 */
async function downloadCompleteAudioFile(directUrl: string): Promise<Blob> {
  const response = await fetch(directUrl, {
    signal: AbortSignal.timeout(30000) // 30 second timeout
  });

  if (!response.ok) {
    throw new Error(`Failed to download audio file: ${response.status} ${response.statusText}`);
  }

  return await response.blob();
}

/**
 * Upload blob to Firebase Storage in background
 */
async function uploadBlobToFirebaseInBackground(
  audioBlob: Blob,
  options: { videoId: string; title: string; contentType: string }
): Promise<void> {
  try {
    console.log(`📤 Background Firebase blob upload started for ${options.videoId}`);

    const { uploadAudioBlobWithRetry } = await import('./streamingFirebaseUpload');
    const uploadResult = await uploadAudioBlobWithRetry(audioBlob, options);

    if (uploadResult.success && uploadResult.audioUrl) {
      console.log(`✅ Background Firebase blob upload completed for ${options.videoId}`);
      console.log(`   Firebase URL: ${uploadResult.audioUrl}`);

      backgroundUploadResults.set(options.videoId, {
        success: true,
        firebaseUrl: uploadResult.audioUrl,
        uploadTime: Date.now()
      });
    } else {
      throw new Error(uploadResult.error || 'Blob upload failed');
    }
  } catch (error) {
    console.warn(`⚠️ Background Firebase blob upload failed for ${options.videoId}:`, error);
    backgroundUploadResults.set(options.videoId, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown blob upload error',
      uploadTime: Date.now()
    });
  }
}

/**
 * Get Firebase URL if background upload completed
 */
export function getFirebaseUrlIfReady(videoId: string): string | null {
  const result = backgroundUploadResults.get(videoId);
  if (result && result.success && result.firebaseUrl) {
    return result.firebaseUrl;
  }
  return null;
}

/**
 * Wait for Firebase upload to complete (with timeout)
 */
export async function waitForFirebaseUpload(
  videoId: string,
  timeoutMs: number = 60000
): Promise<string | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = backgroundUploadResults.get(videoId);
    
    if (result) {
      if (result.success && result.firebaseUrl) {
        return result.firebaseUrl;
      } else if (!result.success) {
        console.warn(`Firebase upload failed for ${videoId}: ${result.error}`);
        return null;
      }
    }
    
    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.warn(`Firebase upload timeout for ${videoId} after ${timeoutMs}ms`);
  return null;
}

/**
 * Get cached audio file for immediate Google Cloud Run processing
 */
export function getCachedAudioFile(videoId: string): Blob | null {
  const cached = audioFileCache.get(videoId);
  if (cached) {
    // Check if cache is still fresh (within 10 minutes)
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - cached.timestamp < maxAge) {
      return cached.blob;
    } else {
      // Clean up expired cache
      audioFileCache.delete(videoId);
    }
  }
  return null;
}

/**
 * Clean up old background upload results and audio file cache (call periodically)
 */
export function cleanupBackgroundResults(maxAgeMs: number = 300000): void {
  const now = Date.now();

  // Clean up upload results
  for (const [videoId, result] of backgroundUploadResults.entries()) {
    if (now - result.uploadTime > maxAgeMs) {
      backgroundUploadResults.delete(videoId);
    }
  }

  // Clean up audio file cache (shorter TTL)
  const audioMaxAge = 10 * 60 * 1000; // 10 minutes
  for (const [videoId, cached] of audioFileCache.entries()) {
    if (now - cached.timestamp > audioMaxAge) {
      audioFileCache.delete(videoId);
    }
  }
}

/**
 * Check if ytdown.io URL can be used directly with Google Cloud Run
 * 
 * Based on analysis: Google Cloud Run backend accepts any HTTP URL
 * via the "firebase" endpoints (they use requests.get() internally)
 */
export function canUseDirectUrlWithBackend(url: string): boolean {
  // ytdown.io URLs are HTTP URLs that work with Google Cloud Run
  return url.includes('ytcontent.net') || url.includes('ytdown');
}

/**
 * Get the appropriate backend endpoint for direct URL processing
 */
export function getBackendEndpointForDirectUrl(processingType: 'beats' | 'chords'): string {
  const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
  
  // Use the "firebase" endpoints which accept any HTTP URL
  switch (processingType) {
    case 'beats':
      return `${backendUrl}/api/detect-beats-firebase`;
    case 'chords':
      return `${backendUrl}/api/recognize-chords-firebase`;
    default:
      throw new Error(`Unknown processing type: ${processingType}`);
  }
}
