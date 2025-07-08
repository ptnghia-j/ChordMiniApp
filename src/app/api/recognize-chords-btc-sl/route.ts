import { NextRequest, NextResponse } from 'next/server';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

/**
 * API route to recognize chords in an audio file using the BTC Supervised Learning model
 * This proxies the request to the Python backend
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// BTC chord recognition is heavy ML processing that can take several minutes
export const maxDuration = 600; // 10 minutes for ML processing
export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();

    // Log audio duration for debugging before sending to backend ML service
    const file = formData.get('file') as File;
    if (file) {
      try {
        const duration = await getAudioDurationFromFile(file);
        console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with BTC-SL chord recognition analysis`);
      } catch (durationError) {
        console.warn(`⚠️ Could not detect audio duration for debugging: ${durationError}`);
      }
    }

    // Forward the request to the Python backend
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    const response = await fetch(`${backendUrl}/api/recognize-chords-btc-sl`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BTC SL chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Parse the response
    const data = await response.json();

    // Return the response
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error recognizing chords with BTC SL:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle timeout errors specifically
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        {
          success: false,
          error: 'BTC-SL chord recognition processing timeout',
          details: 'The ML processing took longer than the 10-minute limit. This is an internal processing timeout, not an external service issue.',
          suggestion: 'Try using a shorter audio clip (under 5 minutes) or consider splitting longer tracks into smaller segments for analysis.',
          timeoutLimit: '10 minutes (600 seconds)',
          processingType: 'Internal ML Processing'
        },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error recognizing chords with BTC SL',
      },
      { status: 500 }
    );
  }
}
