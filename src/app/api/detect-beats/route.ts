import { NextRequest, NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

/**
 * Beat Detection API Route
 *
 * This route proxies beat detection requests to the Python backend
 * with proper timeout handling for long-running ML operations.
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// Beat detection is heavy ML processing that can take several minutes
export const maxDuration = 600; // 10 minutes for ML processing
export async function POST(request: NextRequest) {
  try {
    // Get the backend URL
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-191567167632.us-central1.run.app';

    console.log(`🥁 Processing beat detection request`);

    // Get the form data from the request
    const formData = await request.formData();

    // Validate that we have a file
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Log file info
    const fileSizeMB = file.size / 1024 / 1024;
    console.log(`📁 Processing audio file: ${file.name} (${fileSizeMB.toFixed(2)}MB)`);

    // Check if file is too large for direct processing (Vercel 4.5MB limit)
    if (file.size > 4.0 * 1024 * 1024) {
      console.log(`🔄 File size ${fileSizeMB.toFixed(2)}MB > 4.0MB, attempting Vercel Blob upload`);

      try {
        // Import Vercel Blob service dynamically to avoid issues if not configured
        const { vercelBlobUploadService } = await import('@/services/vercelBlobUploadService');

        const detector = formData.get('detector') as string || 'beat-transformer';

        // Use Vercel Blob upload for large files
        const blobResult = await vercelBlobUploadService.detectBeatsBlobUpload(file, detector as 'auto' | 'madmom' | 'beat-transformer');

        if (blobResult.success) {
          console.log(`✅ Vercel Blob beat detection completed successfully`);
          // The blob result data is already the Python backend response, so we can return it directly
          return NextResponse.json(blobResult.data);
        } else {
          console.warn(`⚠️ Vercel Blob upload failed: ${blobResult.error}`);
          // Continue with direct processing and let it fail with proper error message
        }
      } catch (blobError) {
        console.warn(`⚠️ Vercel Blob upload error: ${blobError}`);
        // Continue with direct processing and let it fail with proper error message
      }
    }

    console.log(`🔄 Using direct processing for file: ${file.name}`);

    // Log audio duration for debugging before sending to backend ML service
    try {
      const duration = await getAudioDurationFromFile(file);
      console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with beat detection analysis`);
    } catch (durationError) {
      console.warn(`⚠️ Could not detect audio duration for debugging: ${durationError}`);
    }

    // Create a safe timeout signal that works across environments
    const timeoutValue = 600000; // 10 minutes timeout to match backend
    // // console.log(`🔍 API route timeout value: ${timeoutValue} (type: ${typeof timeoutValue}, isInteger: ${Number.isInteger(timeoutValue)})`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Forward the request to the backend with extended timeout
    const response = await fetch(`${backendUrl}/api/detect-beats`, {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type - let the browser set it with boundary for FormData
      },
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend beat detection failed: ${response.status} ${response.statusText} - ${errorText}`);

      // Check if this is a 413 error (payload too large)
      if (response.status === 413) {
        return NextResponse.json(
          {
            error: `File too large for processing`,
            details: `The audio file (${fileSizeMB.toFixed(2)}MB) exceeds the maximum size limit. Please try with a smaller file or ensure Vercel Blob is properly configured.`,
            status: 413,
            suggestion: 'Try using a shorter audio clip or compress the audio file.'
          },
          { status: 413 }
        );
      }

      return NextResponse.json(
        {
          error: 'Beat detection failed',
          details: `Backend error: ${response.status} ${response.statusText}`,
          suggestion: 'The audio file may be too large or in an unsupported format. Please try a shorter audio clip or different format.'
        },
        { status: response.status }
      );
    }

    // Get the response data
    const result = await response.json();
    console.log(`✅ Beat detection successful`);

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error('❌ Beat detection API error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle timeout errors specifically
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        {
          error: 'Beat detection processing timeout',
          details: 'The ML processing took longer than the 10-minute limit. This is an internal processing timeout, not an external service issue.',
          suggestion: 'Try using a shorter audio clip (under 5 minutes) or use the madmom detector which is faster but slightly less accurate. For very long tracks, consider splitting them into smaller segments.',
          timeoutLimit: '10 minutes (600 seconds)',
          processingType: 'Internal ML Processing'
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        error: 'Beat detection failed',
        details: errorMessage,
        suggestion: 'Please try again or contact support if the problem persists.'
      },
      { status: 500 }
    );
  }
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
