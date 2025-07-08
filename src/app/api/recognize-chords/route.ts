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
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';

    console.log(`🎵 Processing chord recognition request`);

    // Add environment detection debugging
    const { isLocalBackend } = await import('@/utils/backendConfig');
    const isLocalhost = isLocalBackend();
    console.log(`🌍 Environment: ${isLocalhost ? 'Localhost Development' : 'Production'} - Backend URL: ${backendUrl}`);

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

    // Add required parameters for Python backend if not present
    if (!formData.has('chord_dict')) {
      // Get model from form data to determine chord_dict
      const model = formData.get('model') as string || 'chord-cnn-lstm';

      if (model === 'btc-sl' || model === 'btc-pl') {
        formData.append('chord_dict', 'large_voca'); // BTC models use large_voca
      } else {
        formData.append('chord_dict', 'full'); // CNN-LSTM uses full
      }
      console.log(`📝 Added chord_dict parameter: ${formData.get('chord_dict')} for model: ${model}`);
    }

    // Log file info
    const fileSizeMB = file.size / 1024 / 1024;
    console.log(`📁 Processing audio file: ${file.name} (${fileSizeMB.toFixed(2)}MB)`);

    // Import Vercel Blob service to use environment-aware logic
    const { vercelBlobUploadService } = await import('@/services/vercelBlobUploadService');

    // Use environment-aware blob upload decision (same as beat detection)
    if (vercelBlobUploadService.shouldUseBlobUpload(file.size)) {
      console.log(`🔄 Environment-aware decision: Using Vercel Blob upload for ${fileSizeMB.toFixed(2)}MB file`);

      try {
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
    } else {
      // Either localhost development or small file in production
      if (isLocalhost) {
        console.log(`🏠 Localhost development - using direct Python backend for ${fileSizeMB.toFixed(2)}MB file`);
      } else {
        console.log(`🔄 Production small file (${fileSizeMB.toFixed(2)}MB <= 4.0MB) - using direct processing`);
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
    console.log(`🔍 API route timeout value: ${timeoutValue} (type: ${typeof timeoutValue}, isInteger: ${Number.isInteger(timeoutValue)})`);

    const abortSignal = createSafeTimeoutSignal(timeoutValue);

    // Log detailed request information
    const targetUrl = `${backendUrl}/api/recognize-chords`;
    console.log(`🚀 Forwarding chord recognition request to: ${targetUrl}`);
    console.log(`📁 FormData contents:`);
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`  - ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
      } else {
        console.log(`  - ${key}: ${value}`);
      }
    }

    // Forward the request to the backend with extended timeout
    console.log(`📡 Making fetch request to Python backend...`);
    const response = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type - let the browser set it with boundary for FormData
      },
      signal: abortSignal,
    });

    console.log(`📊 Python backend response: ${response.status} ${response.statusText}`);
    console.log(`📋 Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend chord recognition failed: ${response.status} ${response.statusText}`);
      console.error(`📄 Error response body: ${errorText}`);
      console.error(`🔍 Request details: ${targetUrl} with ${formData.get('file') ? 'file' : 'no file'} and model: ${formData.get('model')}`);

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

      // Check if this is a 403 error - likely port conflict or backend unavailable
      if (response.status === 403) {
        console.error(`❌ Chord recognition API returned 403 Forbidden`);
        console.error(`📄 Error response: ${errorText}`);
        console.error(`📋 Response headers:`, Object.fromEntries(response.headers.entries()));

        // Check if this is Apple AirTunes intercepting port 5000
        const serverHeader = response.headers.get('server');
        if (serverHeader && serverHeader.includes('AirTunes')) {
          console.error(`🍎 CRITICAL: Port 5000 is being intercepted by Apple AirTunes service!`);
          console.error(`💡 Solution: Change Python backend to use a different port (e.g., 5001, 8000)`);

          return NextResponse.json(
            {
              error: 'Port conflict with Apple AirTunes',
              details: 'Port 5000 is being used by Apple AirPlay/AirTunes service instead of our Python backend',
              solution: 'Change Python backend to use a different port (e.g., 5001, 8000) and update NEXT_PUBLIC_PYTHON_API_URL',
              debugInfo: {
                serverHeader,
                targetUrl,
                suggestion: 'Run Python backend on port 5001: python app.py --port 5001'
              }
            },
            { status: 503 }
          );
        }

        // For other 403 errors, return detailed debugging information
        return NextResponse.json(
          {
            error: 'Chord recognition failed',
            details: `Backend returned 403 Forbidden. This may indicate the Python backend is not running or accessible.`,
            suggestion: 'Ensure Python backend is running on the correct port and accessible',
            debugInfo: {
              backendUrl: targetUrl,
              errorResponse: errorText,
              formDataKeys: Array.from(formData.keys()),
              responseHeaders: Object.fromEntries(response.headers.entries())
            }
          },
          { status: 403 }
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
