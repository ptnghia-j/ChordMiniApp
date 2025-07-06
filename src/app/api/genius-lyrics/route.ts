import { NextRequest, NextResponse } from 'next/server';

/**
 * Genius Lyrics API Proxy
 * 
 * This route acts as a proxy to the Python backend for Genius lyrics,
 * forwarding the Genius API key from Vercel environment variables.
 */

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json();

    // Validate required parameters
    const { artist, title, search_query } = body;

    if (!search_query && (!artist || !title)) {
      return NextResponse.json(
        {
          success: false,
          error: "Either 'search_query' or both 'artist' and 'title' must be provided"
        },
        { status: 400 }
      );
    }

    // Get Genius API key from Vercel environment with debugging
    const geniusApiKey = process.env.GENIUS_API_KEY;

    // Enhanced debugging for environment variable issues
    // console.log('🔍 Genius API Key check:', {
    //   keyExists: !!geniusApiKey,
    //   keyLength: geniusApiKey?.length || 0,
    //   envKeys: Object.keys(process.env).filter(key => key.includes('GENIUS')),
    //   nodeEnv: process.env.NODE_ENV
    // });

    if (!geniusApiKey) {
      console.error('❌ GENIUS_API_KEY not found in environment variables');
      return NextResponse.json(
        {
          success: false,
          error: "Genius API key not configured. Please set GENIUS_API_KEY environment variable."
        },
        { status: 500 }
      );
    }

    // Try the Python backend first
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5000';

    try {
      console.log('🔄 Trying Python backend for Genius lyrics...');
      const response = await fetch(`${backendUrl}/api/genius-lyrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Genius-API-Key': geniusApiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('✅ Genius lyrics retrieved from backend successfully');
          return NextResponse.json(data);
        }
      }

      console.warn('⚠️ Backend failed, falling back to direct Genius API');
    } catch (backendError) {
      console.warn('⚠️ Backend unavailable, falling back to direct Genius API:', backendError);
    }

    // Fallback to direct Genius API implementation
    console.log('🔄 Using direct Genius API fallback...');

    // Search for the song using Genius API directly
    const searchQuery = search_query || `${artist} ${title}`;
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(searchQuery)}`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${geniusApiKey}`,
        'User-Agent': 'ChordMini/1.0'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!searchResponse.ok) {
      throw new Error(`Genius search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    if (!searchData.response?.hits?.length) {
      return NextResponse.json({
        success: false,
        error: 'No songs found on Genius'
      });
    }

    // Get the first result
    const song = searchData.response.hits[0].result;

    // For now, return basic song info since we can't scrape lyrics directly
    // The Genius API doesn't provide lyrics content directly due to licensing
    return NextResponse.json({
      success: true,
      lyrics: `Lyrics found for "${song.title}" by ${song.primary_artist.name}\n\nNote: Due to licensing restrictions, full lyrics cannot be displayed.\nPlease visit: ${song.url}`,
      song_info: {
        title: song.title,
        artist: song.primary_artist.name,
        url: song.url,
        thumbnail: song.song_art_image_thumbnail_url
      },
      source: 'genius_api_fallback'
    });

  } catch (error) {
    console.error('Error in Genius lyrics proxy:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching lyrics',
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
