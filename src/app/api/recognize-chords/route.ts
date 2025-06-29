import { NextRequest, NextResponse } from 'next/server';
import { getAudioDurationFromFile } from '@/utils/audioDurationUtils';

/**
 * API route to recognize chords in an audio file
 * This proxies the request to the Python backend
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// Chord recognition is heavy ML processing that can take several minutes
export const maxDuration = 800; // 13+ minutes for ML processing
export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();

    // Log audio duration for debugging before sending to backend ML service
    const file = formData.get('file') as File;
    if (file) {
      try {
        const duration = await getAudioDurationFromFile(file);
        console.log(`🎵 Audio duration detected: ${duration.toFixed(1)} seconds - proceeding with chord recognition analysis`);
      } catch (durationError) {
        console.warn(`⚠️ Could not detect audio duration for debugging: ${durationError}`);
      }
    }

    // Forward the request to the Python backend (full backend with ML services)
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-191567167632.us-central1.run.app';
    const response = await fetch(`${backendUrl}/api/recognize-chords`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Parse the response
    const data = await response.json();

    // Return the response
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error recognizing chords:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle timeout errors specifically
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Chord recognition processing timeout',
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
        error: error instanceof Error ? error.message : 'Unknown error recognizing chords',
      },
      { status: 500 }
    );
  }
}
