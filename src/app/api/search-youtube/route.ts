import { NextRequest, NextResponse } from 'next/server';
import { GetListByKeyword } from 'youtube-search-api';
import { detectEnvironment } from '@/utils/environmentDetection';
import { normalizeThumbnailUrl, pickPreferredChannelTitle } from '@/utils/youtubeMetadata';

/**
 * Environment-Aware YouTube Search API Route
 *
 * This route provides YouTube search functionality using:
 * - yt-dlp for localhost/development (more reliable, no API key needed)
 * - youtube-search-api for Vercel/production (serverless compatible)
 */

/**
 * Environment-aware search function
 */
async function performEnvironmentAwareSearch(query: string, limit: number = 10): Promise<Record<string, unknown>> {
  const env = detectEnvironment();

  console.log(`🔧 Using ${env.strategy} strategy for search`);

  if (env.strategy === 'ytdlp' && env.isDevelopment) {
    // Use yt-dlp for localhost/development
    return await performYtDlpSearch(query, limit);
  } else {
    // Use youtube-search-api for production/Vercel
    return await performYouTubeSearch(query, limit);
  }
}

/**
 * Perform YouTube search using yt-dlp (development only)
 */
async function performYtDlpSearch(query: string, limit: number = 10): Promise<Record<string, unknown>> {
  try {
    console.log(`Performing yt-dlp search for: "${query}"`);

    // Call the yt-dlp search endpoint
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ytdlp/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      throw new Error(`yt-dlp search failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'yt-dlp search failed');
    }

    // Transform yt-dlp results to match youtube-search-api format
    const transformedResults = result.results?.map((item: {
      id: string;
      title: string;
      channelTitle: string;
      duration: string;
      viewCount: number;
      publishedAt: string;
      thumbnail: string;
      url: string;
    }) => ({
      id: item.id,
      title: item.title,
      channelTitle: pickPreferredChannelTitle(item.channelTitle),
      channel: pickPreferredChannelTitle(item.channelTitle) || 'Unknown Channel',

      viewCount: item.viewCount,
      view_count: item.viewCount, // Add view_count for frontend compatibility
      publishedAt: item.publishedAt,
      upload_date: item.publishedAt, // Add upload_date for frontend compatibility
      thumbnail: normalizeThumbnailUrl(item.id, item.thumbnail, 'mqdefault'),
      url: item.url,
      isLive: false
    })) || [];

    return {
      success: true,
      results: transformedResults,
      total: transformedResults.length,
      query,
      source: 'yt-dlp'
    };

  } catch (error) {
    console.error('yt-dlp search failed:', error);
    // Fallback to youtube-search-api
    console.log('🔄 Falling back to youtube-search-api...');
    return await performYouTubeSearch(query, limit);
  }
}

/**
 * Perform YouTube search using youtube-search-api
 */
async function performYouTubeSearch(query: string, limit: number = 10): Promise<Record<string, unknown>> {
  try {
    console.log(`Performing YouTube search for: "${query}"`);

    // Use youtube-search-api for search
    const searchResults = await GetListByKeyword(query, false, limit, [{type: 'video'}]);

    if (!searchResults || !searchResults.items) {
      throw new Error('No search results found');
    }

    const extractThumbnail = (item: Record<string, unknown>, videoId: string): string => {
      const thumbnailCandidates = [
        item.thumbnail,
        (item.thumbnail as { url?: string } | undefined)?.url,
        ((item.thumbnail as { thumbnails?: Array<{ url?: string }> } | undefined)?.thumbnails || [])
          .map((entry) => entry?.url)
          .find((url) => typeof url === 'string' && url.trim().length > 0),
        ((item.thumbnail_thumbnails as Array<{ url?: string }> | undefined) || [])
          .map((entry) => entry?.url)
          .find((url) => typeof url === 'string' && url.trim().length > 0),
      ];

      return normalizeThumbnailUrl(
        videoId,
        thumbnailCandidates.find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined,
        'mqdefault'
      );
    };

    // Transform youtube-search-api results to match expected format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = searchResults.items.map((item: any) => {
      const channelName = pickPreferredChannelTitle(
        item.channelTitle,
        item.channelName,
        item.channel?.name,
        item.channel?.title,
        item.ownerText?.runs?.[0]?.text,
        item.longBylineText?.runs?.[0]?.text,
        item.shortBylineText?.runs?.[0]?.text,
        item.uploader,
        item.uploaderName
      );

      return {
        id: item.id,
        title: item.title || 'Unknown Title',
        description: item.description || '',
        thumbnail: extractThumbnail(item, item.id),
        uploader: channelName || 'Unknown Channel',
        channelTitle: channelName || 'Unknown Channel',
        channel: channelName || 'Unknown Channel',
        uploadDate: item.publishedTimeText || '',
        upload_date: item.publishedTimeText || '', // Add upload_date for frontend compatibility
        url: `https://www.youtube.com/watch?v=${item.id}`
      };
    });

    console.log(`YouTube search successful: ${results.length} results`);

    return {
      success: true,
      results,
      total: results.length,
      query,
      source: 'youtube-search-api'
    };

  } catch (error) {
    console.error('YouTube search failed:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 10; // Cap at 20 results

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    console.log(`YouTube search request: "${query}" (limit: ${limit})`);

    // Use environment-aware search method
    const result = await performEnvironmentAwareSearch(query, limit);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in YouTube search endpoint:', error);
    return NextResponse.json({
      error: 'YouTube search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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

    console.log(`YouTube search request (POST): "${query}"`);

    // Use environment-aware search method
    const result = await performEnvironmentAwareSearch(query, 10);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in YouTube search endpoint (POST):', error);
    return NextResponse.json({
      error: 'YouTube search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
