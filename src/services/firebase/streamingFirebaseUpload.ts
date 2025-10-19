/**
 * Streaming Firebase Upload Service
 *
 * This service handles streaming upload of audio files directly from
 * external services to Firebase Storage without storing locally.
 */

import { ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot } from 'firebase/storage';
import { getStorageInstance } from '../../config/firebase';

// Request deduplication: prevent multiple concurrent uploads of the same video
const pendingUploads = new Map<string, Promise<StreamingUploadResult>>();

export interface StreamingUploadResult {
  success: boolean;
  audioUrl?: string;
  storagePath?: string;
  fileSize?: number;
  error?: string;
}

export interface StreamingUploadOptions {
  videoId: string;
  filename?: string;
  title?: string;
  contentType?: string;
}



/**
 * Upload audio stream directly to Firebase Storage
 */
export async function uploadAudioStream(
  audioStream: ReadableStream<Uint8Array>,
  options: StreamingUploadOptions
): Promise<StreamingUploadResult> {
  try {
    // Get Firebase Storage instance (ensures initialization)
    const storage = await getStorageInstance();

    if (!storage) {
      console.warn('Firebase Storage not initialized, cannot upload audio stream');
      return {
        success: false,
        error: 'Firebase Storage not initialized'
      };
    }

    const { videoId, filename, title, contentType = 'audio/mpeg' } = options;

    console.log(`📤 Starting streaming upload for video ${videoId}`);
    console.log(`📁 Filename: ${filename}`);
    console.log(`📊 Content-Type: ${contentType}`);

    // Create unique file name with YouTube ID in brackets to match storage rules
    const timestamp = Date.now();
    const sanitizedFilename = filename ? sanitizeFilename(filename) : `${videoId}.mp3`;
    const storageFilename = `audio_[${videoId}]_${timestamp}_${sanitizedFilename}`;
    const storagePath = `audio/${storageFilename}`;

    console.log(`📁 Storage path: ${storagePath}`);

    // Create storage reference
    const storageRef = ref(storage, storagePath);

    // Convert ReadableStream to Blob with progress tracking
    console.log(`🔄 Converting stream to blob...`);
    const audioBlob = await streamToBlob(audioStream, contentType);
    console.log(`📊 Converted stream to blob, size: ${formatFileSize(audioBlob.size)}`);

    // Use uploadBytesResumable for better reliability with large files
    console.log(`📤 Starting resumable upload to Firebase Storage...`);
    const uploadTask = uploadBytesResumable(storageRef, audioBlob, {
      contentType,
      customMetadata: {
        videoId,
        originalFilename: filename || `${videoId}.mp3`,
        title: title || 'Unknown',
        uploadTimestamp: timestamp.toString(),
        source: 'yt2mp3-magic'
      }
    });

    // Wait for upload completion with progress tracking
    const snapshot = await new Promise<UploadTaskSnapshot>((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (progress % 25 === 0 || progress === 100) { // Log every 25%
            console.log(`📊 Upload progress: ${progress.toFixed(1)}%`);
          }
        },
        (error) => {
          console.error(`❌ Upload error:`, error);
          reject(error);
        },
        () => {
          console.log(`✅ Upload completed successfully`);
          resolve(uploadTask.snapshot);
        }
      );
    });

    console.log(`✅ Upload successful, size: ${formatFileSize(snapshot.metadata.size)}`);

    // Get download URL
    const audioUrl = await getDownloadURL(snapshot.ref);
    console.log(`🔗 Generated download URL: ${audioUrl.substring(0, 100)}...`);

    return {
      success: true,
      audioUrl,
      storagePath,
      fileSize: snapshot.metadata.size,
      error: undefined
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Streaming upload failed: ${errorMessage}`);
    
    return {
      success: false,
      error: `Streaming upload failed: ${errorMessage}`
    };
  }
}

/**
 * Convert ReadableStream to Blob with optimized memory usage and timeout protection
 * Optimized for Vercel serverless environment constraints
 */
async function streamToBlob(stream: ReadableStream<Uint8Array>, contentType: string): Promise<Blob> {
  const reader = stream.getReader();
  let totalSize = 0;
  let lastLogTs = Date.now();
  const MAX_BYTES = 25 * 1024 * 1024; // 25MB limit for Vercel memory efficiency

  try {
    console.log(`🔄 Starting optimized stream->blob conversion...`);

    // First pass: collect chunks with minimal memory overhead
    const chunks: Uint8Array[] = [];
    while (true) {
      // Per-read timeout (20s) - reduced for faster failure detection
      const readPromise = reader.read();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          reject(new Error('Stream read timeout after 20s'));
        }, 20000);
      });
      const { done, value } = await Promise.race([readPromise, timeoutPromise]) as ReadableStreamReadResult<Uint8Array>;

      if (done) break;
      if (value) {
        chunks.push(value);
        totalSize += value.length;

        // Early termination for oversized files
        if (totalSize > MAX_BYTES) {
          throw new Error(`Stream too large: ${formatFileSize(totalSize)} exceeds ${formatFileSize(MAX_BYTES)} limit`);
        }

        // Reduced logging frequency
        const now = Date.now();
        if (now - lastLogTs > 10000) { // every 10s
          console.log(`📥 Downloaded ${formatFileSize(totalSize)}...`);
          lastLogTs = now;
        }
      }
    }

    console.log(`✅ Stream download complete: ${formatFileSize(totalSize)}`);

    // Optimized: Single allocation, direct chunk copying
    if (chunks.length === 1) {
      // Single chunk optimization - no copying needed
      return new Blob([new Uint8Array(chunks[0])], { type: contentType });
    }

    // Multiple chunks: single allocation and copy
    const combinedArray = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combinedArray.set(chunk, offset);
      offset += chunk.length;
    }

    // Clear chunks array to help GC
    chunks.length = 0;

    return new Blob([combinedArray], { type: contentType });

  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * Sanitize filename for safe storage
 */
function sanitizeFilename(filename: string): string {
  // Replace invalid characters with underscores
  return filename.replace(/[/\\?%*:|"<>]/g, '_');
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}







/**
 * Upload audio file with retry logic
 */
export async function uploadAudioStreamWithRetry(
  audioStream: ReadableStream<Uint8Array>,
  options: StreamingUploadOptions,
  maxRetries: number = 2
): Promise<StreamingUploadResult> {
  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`📤 Upload attempt ${attempt}/${maxRetries} for video ${options.videoId}`);
    
    try {
      const result = await uploadAudioStream(audioStream, options);
      
      if (result.success) {
        if (attempt > 1) {
          console.log(`✅ Upload succeeded on attempt ${attempt}`);
        }
        return result;
      } else {
        lastError = result.error || 'Unknown error';
        console.warn(`⚠️ Upload attempt ${attempt} failed: ${lastError}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️ Upload attempt ${attempt} failed: ${lastError}`);
    }

    // Wait before retry (except on last attempt)
    if (attempt < maxRetries) {
      const delay = attempt * 2000; // 2s, 4s, etc.
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: `Upload failed after ${maxRetries} attempts. Last error: ${lastError}`
  };
}

/**
 * Upload audio directly from URL to Firebase Storage (Vercel-optimized)
 * This avoids downloading large files in serverless functions
 */
export async function uploadAudioFromUrlWithRetry(
  audioUrl: string,
  options: StreamingUploadOptions,
  maxRetries: number = 2
): Promise<StreamingUploadResult> {
  const { videoId } = options;

  // Request deduplication: check if upload is already in progress
  if (pendingUploads.has(videoId)) {
    console.log(`🔄 Upload already in progress for ${videoId}, waiting for completion...`);
    return await pendingUploads.get(videoId)!;
  }

  // Create the upload promise and store it
  const uploadPromise = performUpload(audioUrl, options, maxRetries);
  pendingUploads.set(videoId, uploadPromise);

  try {
    const result = await uploadPromise;
    return result;
  } finally {
    // Clean up the pending upload
    pendingUploads.delete(videoId);
  }
}

async function performUpload(
  audioUrl: string,
  options: StreamingUploadOptions,
  maxRetries: number = 2
): Promise<StreamingUploadResult> {
  let lastError: string = '';
  const operationStart = Date.now();
  const OPERATION_BUDGET_MS = 120_000; // 2 minutes total budget for Vercel
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB limit for Vercel memory efficiency

  // Preflight check: Get file size and validate
  try {
    console.log(`🔍 Preflight check for ${audioUrl}`);
    const headResponse = await fetch(audioUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000) // 10s timeout for HEAD
    });

    const contentLength = headResponse.headers.get('content-length');
    if (contentLength) {
      const fileSize = parseInt(contentLength);
      console.log(`📏 File size: ${formatFileSize(fileSize)}`);

      if (fileSize > MAX_FILE_SIZE) {
        console.warn(`⚠️ File too large (${formatFileSize(fileSize)}), using direct URL`);
        return {
          success: false,
          error: `File too large: ${formatFileSize(fileSize)} exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`
        };
      }
    }
  } catch (preflightError) {
    console.warn(`⚠️ Preflight check failed, proceeding anyway:`, preflightError);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check operation budget
    if (Date.now() - operationStart > OPERATION_BUDGET_MS) {
      console.warn(`⏰ Operation budget exceeded (${OPERATION_BUDGET_MS}ms), aborting`);
      return {
        success: false,
        error: 'Operation timeout: exceeded time budget for Vercel environment'
      };
    }
    console.log(`🔗 URL upload attempt ${attempt}/${maxRetries} for video ${options.videoId}`);
    console.log(`   Source URL: ${audioUrl}`);

    try {
      // Fetch the audio file as a stream with adaptive timeout
      const controller = new AbortController();
      const remainingBudget = OPERATION_BUDGET_MS - (Date.now() - operationStart);
      const fetchTimeout = Math.min(60000, Math.max(30000, remainingBudget - 30000)); // Reserve 30s for upload

      const timeoutId = setTimeout(() => {
        console.log(`⏰ Aborting fetch after ${fetchTimeout}ms for attempt ${attempt} (budget: ${remainingBudget}ms)`);
        controller.abort();
      }, fetchTimeout);

      console.log(`🌐 Fetching audio stream (attempt ${attempt})...`);
      const response = await fetch(audioUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
          'Accept-Encoding': 'identity', // Prevent compression issues
          'Range': 'bytes=0-', // Request full range
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body available');
      }

      // Convert the response stream to the format expected by uploadAudioStream
      const audioStream = response.body;

      console.log(`📤 Streaming upload to Firebase Storage...`);
      const result = await uploadAudioStream(audioStream, options);

      if (result.success) {
        if (attempt > 1) {
          console.log(`✅ URL upload succeeded on attempt ${attempt}`);
        }
        return result;
      } else {
        lastError = result.error || 'Unknown error';
        console.warn(`⚠️ URL upload attempt ${attempt} failed: ${lastError}`);
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = 'Upload timeout: File too large or slow source';
        console.error(`❌ URL upload timeout on attempt ${attempt}`);
      } else {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️ URL upload attempt ${attempt} failed: ${lastError}`);
      }
    }

    // Budget-aware retry logic with exponential backoff
    if (attempt < maxRetries) {
      const remainingBudget = OPERATION_BUDGET_MS - (Date.now() - operationStart);

      // Skip retry if insufficient budget remaining
      if (remainingBudget < 20000) { // Need at least 20s for meaningful retry
        console.warn(`⏰ Insufficient budget remaining (${remainingBudget}ms), skipping retry`);
        break;
      }

      // Smarter delay based on error type and remaining budget
      let base = 1000; // Reduced base delay for faster retries
      if (lastError.toLowerCase().includes('timeout') || lastError.toLowerCase().includes('abort')) base = 2000;
      if (lastError.toLowerCase().includes('network') || lastError.toLowerCase().includes('socket')) base = 1500;
      const expo = Math.min(Math.pow(1.5, attempt - 1), 3); // Reduced exponential factor
      const jitter = Math.floor(Math.random() * 300); // Reduced jitter
      const delay = Math.min(Math.floor(base * expo) + jitter, Math.min(8000, remainingBudget / 4)); // Budget-aware cap

      console.log(`⏳ Waiting ${delay}ms before retry (attempt ${attempt + 1}/${maxRetries}, budget: ${remainingBudget}ms)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: `URL upload failed after ${maxRetries} attempts. Last error: ${lastError}`
  };
}

/**
 * Upload audio blob directly to Firebase Storage with retry logic
 */
export async function uploadAudioBlobWithRetry(
  audioBlob: Blob,
  options: StreamingUploadOptions,
  maxRetries: number = 2
): Promise<StreamingUploadResult> {
  const { videoId, title, contentType = 'audio/mp4' } = options;

  console.log(`📤 Starting blob upload for ${videoId} (${(audioBlob.size / 1024 / 1024).toFixed(2)}MB)`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Blob upload attempt ${attempt}/${maxRetries} for video ${videoId}`);

      const result = await uploadBlobToFirebase(audioBlob, {
        videoId,
        title: title || `YouTube Video ${videoId}`,
        contentType
      });

      if (result.success) {
        console.log(`✅ Blob upload successful on attempt ${attempt}`);
        return result;
      } else {
        throw new Error(result.error || 'Blob upload failed');
      }

    } catch (error) {
      console.warn(`⚠️ Blob upload attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Blob upload failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: 'Blob upload failed after all retry attempts'
  };
}

/**
 * Upload blob directly to Firebase Storage
 */
async function uploadBlobToFirebase(
  audioBlob: Blob,
  options: { videoId: string; title: string; contentType: string }
): Promise<StreamingUploadResult> {
  const { videoId, contentType } = options;

  try {
    // Get Firebase Storage instance (ensures initialization)
    const storage = await getStorageInstance();

    if (!storage) {
      throw new Error('Firebase Storage not initialized');
    }

    console.log(`📤 Starting Firebase Storage blob upload for ${videoId}`);
    console.log(`📊 Blob size: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`📊 Content-Type: ${contentType}`);

    // Generate storage path
    const timestamp = Date.now();
    const filename = `audio_[${videoId}]_${timestamp}_${videoId}.mp3`;
    const storagePath = `audio/${filename}`;

    console.log(`📁 Storage path: ${storagePath}`);

    // Create storage reference
    const storageRef = ref(storage, storagePath);

    // Start resumable upload
    console.log(`📤 Starting resumable upload to Firebase Storage...`);
    const uploadTask = uploadBytesResumable(storageRef, audioBlob, {
      contentType: contentType
    });

    // Monitor upload progress
    return new Promise<StreamingUploadResult>((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (progress % 25 === 0 || progress === 100) { // Log every 25%
            console.log(`📊 Upload progress: ${progress.toFixed(1)}%`);
          }
        },
        (error) => {
          console.error(`❌ Upload failed:`, error);
          reject(error);
        },
        async () => {
          try {
            console.log(`✅ Upload completed successfully`);
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log(`🔗 Generated download URL: ${downloadURL.substring(0, 100)}...`);

            resolve({
              success: true,
              audioUrl: downloadURL,
              fileSize: audioBlob.size,
              storagePath: storagePath
            });
          } catch (urlError) {
            console.error(`❌ Failed to get download URL:`, urlError);
            reject(urlError);
          }
        }
      );
    });

  } catch (error) {
    console.error(`❌ Firebase blob upload failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown blob upload error'
    };
  }
}
