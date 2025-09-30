import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { audioMetadataService } from '@/services/audioMetadataService';
import { isFirebaseStorageUrl } from '@/utils/urlValidationUtils';

/**
 * Audio Duration Detection API Route
 * 
 * This route detects audio duration from URLs by using a lightweight approach
 * that avoids CORS issues and minimizes data transfer.
 */

// Configure Vercel function timeout
export const maxDuration = 180; // 3 minute for duration detection

export async function POST(request: NextRequest) {
  try {
    const { audioUrl, videoId } = await request.json();

    if (!audioUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing audioUrl parameter' },
        { status: 400 }
      );
    }

    console.log(`🎵 Detecting duration for: ${audioUrl}`);

    const isFirebaseUrl = isFirebaseStorageUrl(audioUrl);
    console.log(`🔎 audio-duration: videoId=${videoId || 'none'}, isFirebaseUrl=${isFirebaseUrl}`);

    // PRIORITY FIX: Check for cached complete audio file first (from parallel pipeline)
    if (videoId && isFirebaseUrl) {
      try {
        const { getCachedAudioFile, getCachedAudioMeta } = await import('@/services/parallelPipelineService');
        const meta = getCachedAudioMeta(videoId);
        console.log(`🔎 cache-meta:`, meta);
        const cachedFile = getCachedAudioFile(videoId);

        if (cachedFile) {
          console.log(`🚀 Using cached complete audio file for duration detection (${(cachedFile.size / 1024 / 1024).toFixed(2)}MB)`);

          // Extract duration from cached file using audio metadata service
          try {
            const metadata = await audioMetadataService.extractMetadataFromBlob(cachedFile);
            if (metadata && metadata.duration > 0) {
              console.log(`✅ Duration detected from cached file: ${metadata.duration} seconds`);
              return NextResponse.json({
                success: true,
                duration: metadata.duration,
                method: 'cached_file',
                format: metadata.format,
                bitrate: metadata.bitrate
              });
            }
          } catch (metadataError) {
            console.warn(`⚠️ Failed to extract metadata from cached file:`, metadataError);
          }
        } else {
          console.log(`⚠️ No cached file found for ${videoId}, proceeding with URL-based detection`);
        }
      } catch (cacheError) {
        console.warn(`⚠️ Cache lookup failed for ${videoId}:`, cacheError);
      }
    }

    // Validate URL to prevent SSRF attacks
    try {
      const url = new URL(audioUrl);
      
      // Only allow specific domains for security
      const allowedDomains = [
        'quicktube.app',
        'dl.quicktube.app',
        'storage.googleapis.com',
        'firebasestorage.googleapis.com',
        'lukavukanovic.xyz', // yt-mp3-go fallback service
        'ytdown.io', // ytdown primary domain
        'ytcontent.net' // ytdown CDN domain
      ];
      
      if (!allowedDomains.some(domain => url.hostname.endsWith(domain))) {
        return NextResponse.json(
          { success: false, error: 'URL domain not allowed' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Strategy 1: Try to get duration from HTTP headers (fastest)
    try {
      const duration = await getDurationFromHeaders(audioUrl);
      if (duration > 0) {
        console.log(`✅ Duration detected from headers: ${duration} seconds`);
        return NextResponse.json({
          success: true,
          duration,
          method: 'headers'
        });
      }
    } catch (headerError) {
      console.log(`⚠️ Header-based detection failed: ${headerError}`);
    }

    // Strategy 2: Use audio metadata service (most reliable)
    try {
      const metadata = await audioMetadataService.extractMetadataFromPartialDownload(audioUrl);
      if (metadata && metadata.duration > 0) {
        console.log(`✅ Duration detected from audio metadata: ${metadata.duration} seconds`);
        return NextResponse.json({
          success: true,
          duration: metadata.duration,
          method: 'audio_metadata',
          format: metadata.format,
          bitrate: metadata.bitrate
        });
      }
    } catch (metadataError) {
      console.log(`⚠️ Audio metadata detection failed: ${metadataError}`);
    }

    // Strategy 3: Estimate from file size (fallback)
    try {
      const duration = await estimateDurationFromFileSize(audioUrl);
      console.log(`⚠️ Using file size estimation: ${duration} seconds`);
      return NextResponse.json({
        success: true,
        duration,
        method: 'file_size_estimation',
        warning: 'Duration estimated from file size - may not be accurate'
      });
    } catch (estimationError) {
      console.error(`❌ File size estimation failed: ${estimationError}`);
    }

    // All methods failed
    return NextResponse.json(
      { 
        success: false, 
        error: 'Could not detect audio duration using any available method',
        fallbackDuration: 180 // Provide fallback for client
      },
      { status: 500 }
    );

  } catch (error: unknown) {
    console.error('❌ Audio duration detection error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to detect audio duration',
        details: errorMessage,
        fallbackDuration: 180 // Provide fallback for client
      },
      { status: 500 }
    );
  }
}

/**
 * Try to get duration from HTTP headers with Firebase Storage retry logic
 */
async function getDurationFromHeaders(audioUrl: string): Promise<number> {
  const isFirebaseUrl = isFirebaseStorageUrl(audioUrl);
  const maxRetries = isFirebaseUrl ? 3 : 1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeout = 10000 + (attempt - 1) * 5000; // Increase timeout with retries
      const abortSignal = createSafeTimeoutSignal(timeout);

      console.log(`🔍 Getting duration from headers (attempt ${attempt}/${maxRetries}): ${audioUrl.substring(0, 100)}...`);

      const response = await fetch(audioUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
        signal: abortSignal,
      });

      if (response.ok) {
        // Check for duration in headers (some services provide this)
        const durationHeader = response.headers.get('x-duration') ||
                               response.headers.get('content-duration') ||
                               response.headers.get('x-content-duration');

        if (durationHeader) {
          const duration = parseFloat(durationHeader);
          if (!isNaN(duration) && duration > 0) {
            return duration;
          }
        }

        throw new Error('No duration information in headers');
      }

      // Handle Firebase Storage 403 errors with retry
      if (isFirebaseUrl && response.status === 403 && attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`⚠️ Firebase Storage 403 error (attempt ${attempt}/${maxRetries}), waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      console.log(`⚠️ Header request attempt ${attempt} failed, retrying...`);
      const delay = 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('All header request attempts failed');
}



/**
 * Estimate duration from file size with Firebase Storage retry logic
 */
async function estimateDurationFromFileSize(audioUrl: string): Promise<number> {
  const isFirebaseUrl = isFirebaseStorageUrl(audioUrl);
  const maxRetries = isFirebaseUrl ? 3 : 1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeout = 10000 + (attempt - 1) * 5000;
      const abortSignal = createSafeTimeoutSignal(timeout);

      console.log(`📏 Estimating duration from file size (attempt ${attempt}/${maxRetries}): ${audioUrl.substring(0, 100)}...`);

      const response = await fetch(audioUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
        signal: abortSignal,
      });

      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        if (!contentLength) {
          throw new Error('No content-length header available');
        }

        const fileSizeBytes = parseInt(contentLength, 10);

        // Rough estimation: assume 128kbps MP3 encoding
        // 128 kbps = 16 KB/s, so duration = fileSize / 16000
        const estimatedDuration = fileSizeBytes / 16000;

        // Only clamp maximum to prevent unreasonable values, but don't enforce minimum
        // This allows detection of truncated/incomplete files
        const clampedDuration = Math.min(estimatedDuration, 1800); // Max 30 minutes

        // Log warning if file seems too small for a typical song
        if (fileSizeBytes < 1000000) { // Less than 1MB
          console.warn(`⚠️ File size unusually small: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB - may be truncated or incomplete`);
        }

        return clampedDuration;
      }

      // Handle Firebase Storage 403 errors with retry
      if (isFirebaseUrl && response.status === 403 && attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.log(`⚠️ Firebase Storage 403 error (attempt ${attempt}/${maxRetries}), waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      console.log(`⚠️ File size request attempt ${attempt} failed, retrying...`);
      const delay = 1000 * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('All file size request attempts failed');
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
