import { NextRequest, NextResponse } from 'next/server';
import { executeYtDlp, isYtDlpAvailable } from '@/utils/ytdlp-utils';

/**
 * YouTube Search API Route with Local Fallback
 *
 * This route proxies YouTube search requests to the Python backend
 * with local yt-dlp fallback when backend is unavailable.
 */

/**
 * Determine if we should use local search or backend
 */
function shouldUseLocalSearch(): boolean {
  // Only use local search for true local development
  const isLocalDevelopment = process.env.NODE_ENV === 'development' &&
                            process.env.VERCEL === undefined &&
                            process.env.VERCEL_ENV === undefined;

  console.log(`Environment check: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}, VERCEL_ENV=${process.env.VERCEL_ENV}, shouldUseLocal=${isLocalDevelopment}`);

  return isLocalDevelopment;
}

/**
 * Perform local YouTube search using yt-dlp
 */
async function performLocalSearch(query: string): Promise<Record<string, unknown>> {
  try {
    console.log(`Performing local YouTube search for: "${query}"`);

    // Check if yt-dlp is available
    if (!await isYtDlpAvailable()) {
      throw new Error('yt-dlp is not available for local search');
    }

    // Use yt-dlp to search YouTube
    const searchQuery = `ytsearch10:${query}`;
    const { stdout } = await executeYtDlp(
      `--dump-single-json --no-warnings --flat-playlist "${searchQuery}"`,
      30000 // 30 seconds timeout
    );

    if (!stdout || stdout.trim() === '') {
      throw new Error('Empty response from yt-dlp search');
    }

    const searchResults = JSON.parse(stdout);

    if (!searchResults || !searchResults.entries) {
      throw new Error('Invalid search results structure');
    }

    // Transform yt-dlp results to match expected format
    const results = searchResults.entries.map((entry: Record<string, unknown>) => ({
      id: entry.id,
      title: entry.title || 'Unknown Title',
      description: entry.description || '',
      thumbnail: entry.thumbnail || `https://img.youtube.com/vi/${entry.id}/mqdefault.jpg`,
      duration: entry.duration || 0,
      viewCount: entry.view_count || 0,
      uploader: entry.uploader || entry.channel || 'Unknown',
      uploadDate: entry.upload_date || '',
      url: `https://www.youtube.com/watch?v=${entry.id}`
    }));

    console.log(`Local search successful: ${results.length} results`);

    return {
      success: true,
      results,
      total: results.length,
      query,
      source: 'local'
    };

  } catch (error) {
    console.error('Local search failed:', error);
    throw error;
  }
}

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

    // Determine search method
    if (shouldUseLocalSearch()) {
      // Use local search for development
      console.log('Using local search for development');

      try {
        const result = await performLocalSearch(query);
        return NextResponse.json(result);
      } catch (localError) {
        console.error('Local search failed, falling back to backend:', localError);
        // Fall through to backend search
      }
    }

    // Use backend search (production or local fallback)
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'https://chordmini-backend-12071603127.us-central1.run.app';

    console.log(`Proxying YouTube search to backend: ${backendUrl}/api/search-youtube`);
    console.log(`Search query:`, query);

    try {
      // Create an AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(`${backendUrl}/api/search-youtube`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Backend search failed: ${response.status} ${response.statusText} - ${errorText}`);
        console.error(`Backend URL used: ${backendUrl}`);
        console.error(`Full response headers:`, Object.fromEntries(response.headers.entries()));

        // If backend fails with 500, try local search as fallback (only in development)
        if (response.status === 500 && process.env.NODE_ENV === 'development') {
          console.log('Backend failed with 500, attempting local search fallback...');

          try {
            const localResult = await performLocalSearch(query);
            return NextResponse.json(localResult);
          } catch (fallbackError) {
            console.warn('Local search fallback also failed:', fallbackError);
          }
        }

        return NextResponse.json(
          {
            error: 'Failed to search YouTube',
            details: `Backend error: ${response.status} ${response.statusText} - ${errorText}`,
            suggestion: response.status === 500 ?
              'YouTube search is temporarily unavailable. Please try again later.' :
              'Please check your search query and try again.',
            backendUrl: backendUrl // Include backend URL for debugging
          },
          { status: response.status }
        );
      }

      const result = await response.json();
      console.log(`Backend search successful: ${result.results?.length || 0} results`);

      return NextResponse.json(result);
    } catch (fetchError) {
      console.error('Network error during backend search:', fetchError);

      // Check if it's a timeout error
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      const errorMessage = isTimeout ? 'Request timeout (30s)' :
                          (fetchError instanceof Error ? fetchError.message : String(fetchError));

      // Try local search as fallback for network errors (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('Network error, attempting local search fallback...');
        try {
          const localResult = await performLocalSearch(query);
          return NextResponse.json(localResult);
        } catch (fallbackError) {
          console.warn('Local search fallback also failed:', fallbackError);
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to search YouTube',
          details: `Network error: ${errorMessage}`,
          suggestion: isTimeout ?
            'The search request timed out. Please try again with a shorter query.' :
            'Please check your internet connection and try again.',
          backendUrl: backendUrl,
          isTimeout: isTimeout
        },
        { status: 500 }
      );
    }

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
