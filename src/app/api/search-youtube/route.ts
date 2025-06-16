import { NextRequest, NextResponse } from 'next/server';

/**
 * YouTube Search API Route - Proxy to Python Backend
 *
 * This route proxies YouTube search requests to the Python backend
 * which handles yt-dlp functionality in a serverless-compatible environment.
 */

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const data = await request.json();
    const { query } = data;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or invalid search query parameter' },
        { status: 400 }
      );
    }

    // Forward the request to the Python backend
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-full-12071603127.us-central1.run.app';

    console.log(`Proxying YouTube search to backend: ${backendUrl}/api/search-youtube`);

    const response = await fetch(`${backendUrl}/api/search-youtube`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend search failed: ${response.status} ${response.statusText} - ${errorText}`);

      return NextResponse.json(
        {
          error: 'Failed to search YouTube',
          details: `Backend error: ${response.status} ${response.statusText}`
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log(`Backend search successful: ${result.results?.length || 0} results`);

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error('Error proxying YouTube search:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: 'Failed to search YouTube',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
