import { NextRequest, NextResponse } from 'next/server';

// YouTube video ID validation regex
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * YouTube Video Info API Route - Proxy to Python Backend
 *
 * This route proxies YouTube video info requests to the Python backend
 * which handles yt-dlp functionality in a serverless-compatible environment.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    // Enhanced input validation
    if (!videoId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing videoId parameter',
          suggestion: 'Please provide a valid YouTube video ID'
        },
        { status: 400 }
      );
    }

    // Validate video ID format
    if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid YouTube video ID format',
          suggestion: 'Please provide a valid 11-character YouTube video ID (e.g., dQw4w9WgXcQ)'
        },
        { status: 400 }
      );
    }

    console.log(`Fetching video info for: ${videoId}`);

    // Forward the request to the Python backend
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-1207160312.us-central1.run.app';

    console.log(`Proxying YouTube info request to backend: ${backendUrl}/api/extract-audio`);

    const response = await fetch(`${backendUrl}/api/extract-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        getInfoOnly: true
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend info request failed: ${response.status} ${response.statusText} - ${errorText}`);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch video info',
          details: `Backend error: ${response.status} ${response.statusText}`
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`Backend info request successful: "${data.title}"`);

    if (!data.success) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || 'Failed to fetch video info',
          details: data.details
        },
        { status: 500 }
      );
    }

    // Return the video info in the expected format
    return NextResponse.json({
      success: true,
      title: data.title || `YouTube Video ${videoId}`,
      duration: data.duration || 0,
      uploader: data.uploader || 'Unknown',
      description: data.description || '',
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`
    });



  } catch (error: unknown) {
    console.error('Error proxying YouTube info request:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch video info',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

// Also support POST method for consistency
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId } = body;

    // Create a new URL with the videoId as a query parameter
    const url = new URL(request.url);
    url.searchParams.set('videoId', videoId);

    // Create a new request with the modified URL
    const newRequest = new NextRequest(url, {
      method: 'GET',
      headers: request.headers
    });

    // Call the GET handler
    return GET(newRequest);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body',
        suggestion: 'Please provide a valid JSON body with videoId field'
      },
      { status: 400 }
    );
  }
}
