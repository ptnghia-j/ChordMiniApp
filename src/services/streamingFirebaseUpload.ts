/**
 * Streaming Firebase Upload Service
 * 
 * This service handles streaming upload of audio files directly from
 * external services to Firebase Storage without storing locally.
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';

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
  if (!storage) {
    console.warn('Firebase Storage not initialized, cannot upload audio stream');
    return {
      success: false,
      error: 'Firebase Storage not initialized'
    };
  }

  try {
    const { videoId, filename, title, contentType = 'audio/mpeg' } = options;

    console.log(`📤 Starting streaming upload for video ${videoId}`);
    console.log(`📁 Filename: ${filename}`);
    console.log(`📊 Content-Type: ${contentType}`);

    // Convert ReadableStream to Blob
    const audioBlob = await streamToBlob(audioStream, contentType);
    console.log(`📊 Converted stream to blob, size: ${formatFileSize(audioBlob.size)}`);

    // Create unique file name with YouTube ID in brackets to match storage rules
    const timestamp = Date.now();
    const sanitizedFilename = filename ? sanitizeFilename(filename) : `${videoId}.mp3`;
    const storageFilename = `audio_[${videoId}]_${timestamp}_${sanitizedFilename}`;
    const storagePath = `audio/${storageFilename}`;

    console.log(`📁 Storage path: ${storagePath}`);

    // Create storage reference
    const storageRef = ref(storage, storagePath);

    // Upload the blob
    console.log(`📤 Uploading to Firebase Storage...`);
    const snapshot = await uploadBytes(storageRef, audioBlob, {
      contentType,
      customMetadata: {
        videoId,
        originalFilename: filename || `${videoId}.mp3`,
        title: title || 'Unknown',
        uploadTimestamp: timestamp.toString(),
        source: 'yt2mp3-magic'
      }
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
 * Convert ReadableStream to Blob
 */
async function streamToBlob(stream: ReadableStream<Uint8Array>, contentType: string): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      if (value) {
        chunks.push(value);
        totalSize += value.length;
        
        // Log progress for large files
        if (totalSize % (1024 * 1024) === 0) { // Every MB
          console.log(`📥 Downloaded ${formatFileSize(totalSize)} so far...`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log(`📥 Stream download complete: ${formatFileSize(totalSize)}`);

  // Combine all chunks into a single Uint8Array
  const combinedArray = new Uint8Array(totalSize);
  let offset = 0;
  
  for (const chunk of chunks) {
    combinedArray.set(chunk, offset);
    offset += chunk.length;
  }

  // Create blob
  return new Blob([combinedArray], { type: contentType });
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
  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔗 URL upload attempt ${attempt}/${maxRetries} for video ${options.videoId}`);
    console.log(`   Source URL: ${audioUrl}`);

    try {
      // Fetch the audio file as a stream with timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for Vercel

      const response = await fetch(audioUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
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
        lastError = 'Upload timeout: File too large for serverless environment';
        console.error(`❌ URL upload timeout on attempt ${attempt}`);
      } else {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️ URL upload attempt ${attempt} failed: ${lastError}`);
      }
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
    error: `URL upload failed after ${maxRetries} attempts. Last error: ${lastError}`
  };
}
