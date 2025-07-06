import { NextRequest, NextResponse } from 'next/server';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';

/**
 * API route to recognize chords in an audio file
 * This proxies the request to the Python backend
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// Chord recognition is heavy ML processing that can take several minutes
export const maxDuration = 800; // 13+ minutes for ML processing
export async function POST(request: NextRequest) {
  try {
    // Get the backend URL
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000';

    console.log(`🎵 Processing chord recognition request`);

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

        const model = formData.get('model') as string || 'chord-cnn-lstm';

        // Use Vercel Blob upload for large files
        const blobResult = await vercelBlobUploadService.recognizeChordsBlobUpload(file, model);

        if (blobResult.success) {
          console.log(`✅ Vercel Blob chord recognition completed successfully`);
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
      console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with chord recognition analysis`);
    } catch (durationError) {
      console.warn(`⚠️ Could not detect audio duration for debugging: ${durationError}`);
    }

    // Create a safe timeout signal that works across environments
    const timeoutValue = 800000; // 13+ minutes timeout to match backend and vercel.json
    // // console.log(`🔍 API route timeout value: ${timeoutValue} (type: ${typeof timeoutValue}, isInteger: ${Number.isInteger(timeoutValue)})`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Forward the request to the backend with extended timeout
    const response = await fetch(`${backendUrl}/api/recognize-chords`, {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type - let the browser set it with boundary for FormData
      },
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);

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
          error: 'Chord recognition failed',
          details: `Backend error: ${response.status} ${response.statusText}`,
          suggestion: 'The audio file may be too large or in an unsupported format. Please try a shorter audio clip or different format.'
        },
        { status: response.status }
      );
    }

    // Get the response data
    const result = await response.json();
    console.log(`✅ Chord recognition successful`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recognizing chords:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle timeout errors specifically
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Chord recognition processing timeout',
          details: 'The ML processing took longer than the 13-minute limit. This is an internal processing timeout, not an external service issue.',
          suggestion: 'Try using a shorter audio clip (under 5 minutes) or consider splitting longer tracks into smaller segments for analysis.',
          timeoutLimit: '13+ minutes (800 seconds)',
          processingType: 'Internal ML Processing'
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error recognizing chords',
      },
      { status: 500 }
    );
  }
}
