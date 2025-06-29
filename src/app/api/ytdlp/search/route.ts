/**
 * yt-dlp YouTube Search API (Development Only)
 * 
 * This endpoint provides YouTube search functionality using yt-dlp for local development.
 * It's only available in development environment and provides search results
 * compatible with the existing search interface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

// Only allow in development environment
const isDevelopment = process.env.NODE_ENV === 'development';

interface YtDlpSearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  view_count: number;
  upload_date: string;
  thumbnail: string;
  webpage_url: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  // Block in production
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'yt-dlp endpoints are only available in development environment' 
      },
      { status: 403 }
    );
  }

  try {
    const { query, limit = 10 } = await request.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Search query is required' },
        { status: 400 }
      );
    }

    // // console.log(`🔍 Searching YouTube with yt-dlp: "${query}" (limit: ${limit})`);

    // Search using yt-dlp
    const searchResults = await searchWithYtDlp(query.trim(), Math.min(limit, 20));

    if (searchResults.success) {
      console.log(`✅ yt-dlp search found ${searchResults.results?.length || 0} results`);
    }

    return NextResponse.json(searchResults);

  } catch (error) {
    console.error('❌ yt-dlp search error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Search failed' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Block in production
  if (!isDevelopment) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'yt-dlp endpoints are only available in development environment' 
      },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 10;

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    // // console.log(`🔍 Searching YouTube with yt-dlp: "${query}" (limit: ${limit})`);

    // Search using yt-dlp
    const searchResults = await searchWithYtDlp(query, limit);

    if (searchResults.success) {
      console.log(`✅ yt-dlp search found ${searchResults.results?.length || 0} results`);
    }

    return NextResponse.json(searchResults);

  } catch (error) {
    console.error('❌ yt-dlp search error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Search failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * Search YouTube using yt-dlp
 */
async function searchWithYtDlp(query: string, limit: number): Promise<{
  success: boolean;
  results?: Array<{
    id: string;
    title: string;
    channelTitle: string;
    duration: string;
    viewCount: number;
    publishedAt: string;
    thumbnail: string;
    url: string;
  }>;
  total?: number;
  query?: string;
  source?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    try {
      // Use yt-dlp to search YouTube
      // Format: ytsearch{limit}:{query} to get specific number of results
      const searchQuery = `ytsearch${limit}:${query}`;
      
      const ytdlp = spawn('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        searchQuery
      ]);

      let stdout = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ yt-dlp search failed with code ${code}:`, stderr);
          resolve({
            success: false,
            error: `yt-dlp search failed: ${stderr || 'Unknown error'}`
          });
          return;
        }

        try {
          // Parse JSON lines output
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          const results = lines.map(line => {
            try {
              const data = JSON.parse(line) as YtDlpSearchResult;
              
              // Format duration
              const formatDuration = (seconds: number): string => {
                if (!seconds || seconds <= 0) return 'N/A';
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
              };

              // Format view count
              const formatViewCount = (count: number): number => {
                return count || 0;
              };

              // Format upload date
              const formatUploadDate = (dateStr: string): string => {
                if (!dateStr) return '';
                // yt-dlp returns dates in YYYYMMDD format
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                return `${year}-${month}-${day}T00:00:00Z`;
              };

              // Generate fallback thumbnail URL if none provided
              const getThumbnailUrl = (thumbnail: string | undefined, videoId: string): string => {
                if (thumbnail && thumbnail.trim() !== '') {
                  return thumbnail;
                }
                // Use YouTube's default thumbnail as fallback
                return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
              };

              return {
                id: data.id,
                title: data.title || 'Unknown Title',
                channelTitle: data.uploader || 'Unknown Channel',
                duration: formatDuration(data.duration),
                viewCount: formatViewCount(data.view_count),
                publishedAt: formatUploadDate(data.upload_date),
                thumbnail: getThumbnailUrl(data.thumbnail, data.id),
                url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`
              };
            } catch (parseError) {
              console.warn('Failed to parse yt-dlp result line:', parseError);
              return null;
            }
          }).filter(result => result !== null);

          resolve({
            success: true,
            results: results as Array<{
              id: string;
              title: string;
              channelTitle: string;
              duration: string;
              viewCount: number;
              publishedAt: string;
              thumbnail: string;
              url: string;
            }>,
            total: results.length,
            query,
            source: 'yt-dlp'
          });

        } catch (parseError) {
          console.error('❌ Failed to parse yt-dlp search output:', parseError);
          resolve({
            success: false,
            error: `Failed to parse search results: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
          });
        }
      });

      ytdlp.on('error', (error) => {
        console.error('❌ yt-dlp process error:', error);
        resolve({
          success: false,
          error: `yt-dlp process error: ${error.message}`
        });
      });

      // Set a timeout for the search
      setTimeout(() => {
        ytdlp.kill();
        resolve({
          success: false,
          error: 'Search timeout after 30 seconds'
        });
      }, 30000);

    } catch (error) {
      console.error('❌ yt-dlp search setup error:', error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Search setup failed'
      });
    }
  });
}
