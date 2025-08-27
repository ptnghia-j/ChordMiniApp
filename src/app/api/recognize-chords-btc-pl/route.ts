import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to recognize chords in an audio file using the BTC Pseudo-Label model
 * This proxies the request to the Python backend
 */

// Configure Vercel function timeout (up to 800 seconds for Pro plan)
// BTC chord recognition is heavy ML processing that can take several minutes
export const maxDuration = 800; // 13+ minutes for ML processing
export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();

    // Optional: lightweight file debug (server-safe)
    const file = formData.get('file') as File | null;
    if (file) {
      console.log(`BTC-PL request: file name=${file.name || 'unknown'}, size=${(file as File).size ?? 'n/a'}B`);
    }

    // Ensure detector is set for unified backend endpoint
    if (!formData.get('detector')) formData.set('detector', 'btc-pl');

    // Forward the request to the Python backend unified endpoint
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
    const response = await fetch(`${backendUrl}/api/recognize-chords`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BTC PL chord recognition failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Parse the response
    const data = await response.json();

    // Return the response
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error recognizing chords with BTC PL:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle timeout errors specifically
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return NextResponse.json(
        {
          success: false,
          error: 'BTC-PL chord recognition processing timeout',
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
        error: error instanceof Error ? error.message : 'Unknown error recognizing chords with BTC PL',
      },
      { status: 500 }
    );
  }
}
