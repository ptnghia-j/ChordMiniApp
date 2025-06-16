import { NextRequest, NextResponse } from 'next/server';

/**
 * Audio Extraction API Route - Proxy to Python Backend
 *
 * This route proxies audio extraction requests to the Python backend
 * which handles yt-dlp functionality in a serverless-compatible environment.
 */

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const { videoId } = data;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    // Forward the request to the Python backend
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-12071603127.us-central1.run.app';

    console.log(`Proxying audio extraction to backend: ${backendUrl}/api/extract-audio`);

    const response = await fetch(`${backendUrl}/api/extract-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend audio extraction failed: ${response.status} ${response.statusText} - ${errorText}`);

      return NextResponse.json(
        {
          error: 'Failed to extract audio from YouTube',
          details: `Backend error: ${response.status} ${response.statusText}`
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log(`Backend audio extraction successful`);

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error('Error proxying audio extraction:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: 'Failed to extract audio from YouTube',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
