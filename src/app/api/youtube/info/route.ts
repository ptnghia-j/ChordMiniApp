import { NextRequest, NextResponse } from 'next/server';

// YouTube video ID validation regex
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * YouTube Video Info API Route - Proxy to Python Backend
 *
 * This route proxies YouTube video info requests to the Python backend
 * which handles QuickTube audio extraction in a serverless-compatible environment.
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

    // Try multiple methods for video info extraction
    let data = null;
    let lastError = null;

    // Method 1: Try Python backend first (if available)
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';

    try {
      console.log(`Trying Python backend: ${backendUrl}/api/extract-audio`);

      const response = await fetch(`${backendUrl}/api/extract-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        body: JSON.stringify({
          videoId,
          getInfoOnly: true,
          useEnhancedExtraction: true,
          retryCount: 0
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        data = await response.json();
        console.log(`✅ Python backend response: "${data.title}"`);

        // Check if we got meaningful metadata (not just a generic title)
        if (!data.title || data.title === `YouTube Video ${videoId}` || data.title.includes('Video info not available')) {
          console.log(`⚠️ Python backend returned generic metadata, trying fallback`);
          throw new Error('Generic metadata returned');
        }
      } else {
        throw new Error(`Backend error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Python backend failed: ${errorMessage}`);

      // Method 2: Fallback to basic YouTube metadata extraction
      try {
        console.log(`Trying fallback metadata extraction for: ${videoId}`);

        // Use YouTube's oEmbed API as fallback (no API key required)
        const oembedResponse = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          }
        );

        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          data = {
            success: true,
            title: oembedData.title || `YouTube Video ${videoId}`,
            uploader: oembedData.author_name || 'Unknown',
            duration: 0, // oEmbed doesn't provide duration
            description: '',
            thumbnail: oembedData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
          };
          console.log(`✅ oEmbed fallback successful: "${data.title}"`);
        } else {
          throw new Error(`oEmbed failed: ${oembedResponse.status}`);
        }
      } catch (oembedError) {
        const oembedErrorMessage = oembedError instanceof Error ? oembedError.message : String(oembedError);
        console.log(`⚠️ oEmbed fallback failed: ${oembedErrorMessage}`);

        // Method 3: Last resort - return basic info
        data = {
          success: true,
          title: `YouTube Video ${videoId}`,
          uploader: 'Unknown',
          duration: 0,
          description: '',
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
        };
        console.log(`🔄 Using basic fallback metadata`);
      }
    }

    // Handle the response based on which method succeeded
    if (!data || !data.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch video info from all sources',
          details: lastError ? (lastError instanceof Error ? lastError.message : String(lastError)) : 'All extraction methods failed',
          suggestion: 'The video may be restricted, private, or temporarily unavailable. Please try a different video.'
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
      thumbnail: data.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
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
