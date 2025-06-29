import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { audioMetadataService } from '@/services/audioMetadataService';

/**
 * Audio Duration Detection API Route
 * 
 * This route detects audio duration from URLs by using a lightweight approach
 * that avoids CORS issues and minimizes data transfer.
 */

// Configure Vercel function timeout
export const maxDuration = 60; // 1 minute for duration detection

export async function POST(request: NextRequest) {
  try {
    const { audioUrl } = await request.json();

    if (!audioUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing audioUrl parameter' },
        { status: 400 }
      );
    }

    console.log(`🎵 Detecting duration for: ${audioUrl}`);

    // Validate URL to prevent SSRF attacks
    try {
      const url = new URL(audioUrl);
      
      // Only allow specific domains for security
      const allowedDomains = [
        'quicktube.app',
        'dl.quicktube.app',
        'storage.googleapis.com',
        'firebasestorage.googleapis.com'
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
 * Try to get duration from HTTP headers (Content-Duration or similar)
 */
async function getDurationFromHeaders(audioUrl: string): Promise<number> {
  const abortSignal = createSafeTimeoutSignal(10000); // 10 second timeout

  const response = await fetch(audioUrl, {
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

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



/**
 * Estimate duration from file size (rough approximation)
 */
async function estimateDurationFromFileSize(audioUrl: string): Promise<number> {
  const abortSignal = createSafeTimeoutSignal(10000); // 10 second timeout

  const response = await fetch(audioUrl, {
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

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
