import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getCachedSearch, addToSearchCache, cleanExpiredSearchCache } from '@/services/searchCacheService';

// Execute shell command as promise with timeout
function execPromise(command: string, timeoutMs: number = 10000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const process = exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });

    // Set timeout to kill the process if it takes too long
    const timeoutId = setTimeout(() => {
      if (process.pid) {
        // Kill the process if it's still running
        try {
          process.kill();
        } catch (e) {
          console.error('Failed to kill process:', e);
        }
      }
      reject({ error: new Error('Command execution timed out'), stderr: `Timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    // Clear timeout if process completes before timeout
    process.on('close', () => clearTimeout(timeoutId));
  });
}

// Define the structure of a YouTube search result item
interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration_string?: string;
  view_count?: number;
  upload_date?: string;
  webpage_url?: string;
}

// Helper function to parse yt-dlp JSON output into search results
function parseYtDlpOutput(stdout: string): YouTubeSearchResult[] {
  if (!stdout) return [];

  return stdout
    .trim()
    .split('\n')
    .map(line => {
      try {
        const result = JSON.parse(line);

        // Get thumbnail URL - simplified to avoid expensive sorting
        let thumbnailUrl = '';
        if (result.thumbnails && Array.isArray(result.thumbnails) && result.thumbnails.length > 0) {
          // Just take the first thumbnail that's hqdefault or mqdefault
          thumbnailUrl = result.thumbnails.find((t: any) =>
            t.url && (t.url.includes('hqdefault') || t.url.includes('mqdefault'))
          )?.url || result.thumbnails[0]?.url || '';
        } else if (result.thumbnail) {
          thumbnailUrl = result.thumbnail;
        }

        // Generate a default thumbnail URL if none is available
        if (!thumbnailUrl && result.id) {
          thumbnailUrl = `https://i.ytimg.com/vi/${result.id}/hqdefault.jpg`;
        }

        return {
          id: result.id,
          title: result.title,
          thumbnail: thumbnailUrl,
          channel: result.channel || result.uploader || '',
          duration_string: result.duration_string || '',
          view_count: result.view_count,
          upload_date: result.upload_date
        };
      } catch (e) {
        console.error('Failed to parse JSON line:', e);
        return null;
      }
    })
    .filter((item): item is YouTubeSearchResult => item !== null);
}

// Optimized search function that uses the most efficient approach
async function searchYouTube(
  sanitizedQuery: string,
  timeoutMs: number = 15000 // Increased from 8000ms to 15000ms (15 seconds)
): Promise<{ success: boolean; results: YouTubeSearchResult[]; error?: any; fromCache?: boolean }> {
  try {
    // Check cache first
    const cachedResults = await getCachedSearch(sanitizedQuery);
    if (cachedResults) {
      console.log(`Using cached results for "${sanitizedQuery}"`);
      return {
        success: true,
        results: cachedResults.results,
        fromCache: true
      };
    }

    // Not in cache, perform the search
    console.log(`Searching YouTube for "${sanitizedQuery}"...`);

    // Use a single, optimized command with the most reliable options
    // Limit to 8 results for faster response
    const ytDlpSearchCommand = `yt-dlp "ytsearch8:${sanitizedQuery}" --dump-single-json --no-warnings --flat-playlist --restrict-filenames`;

    // Execute yt-dlp search command with a shorter timeout
    const { stdout, stderr } = await execPromise(ytDlpSearchCommand, timeoutMs);

    if (!stdout) {
      return { success: false, results: [], error: 'No results from search' };
    }

    try {
      // Parse the single JSON object
      const result = JSON.parse(stdout);

      // Check if it's a playlist with entries
      if (result.entries && Array.isArray(result.entries) && result.entries.length > 0) {
        // Convert the entries to our standard format
        const results = result.entries.map(entry => {
          // Simplified thumbnail selection
          let thumbnailUrl = '';
          if (entry.thumbnails && Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
            thumbnailUrl = entry.thumbnails[0]?.url || '';
          } else if (entry.thumbnail) {
            thumbnailUrl = entry.thumbnail;
          }

          // Generate a default thumbnail URL if none is available
          if (!thumbnailUrl && entry.id) {
            thumbnailUrl = `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
          }

          return {
            id: entry.id,
            title: entry.title,
            thumbnail: thumbnailUrl,
            channel: entry.channel || entry.uploader || '',
            duration_string: entry.duration_string || '',
            view_count: entry.view_count || 0,
            upload_date: entry.upload_date || ''
          };
        });

        console.log(`Found ${results.length} results for "${sanitizedQuery}"`);

        // Cache the results
        await addToSearchCache(sanitizedQuery, results);

        return { success: true, results };
      }
    } catch (parseErr) {
      console.error('Error parsing JSON from search:', parseErr);
    }

    // Fallback to line-by-line parsing if single JSON fails
    try {
      // Try with --dump-json instead of --dump-single-json
      const fallbackCommand = `yt-dlp "ytsearch8:${sanitizedQuery}" --dump-json --no-warnings --flat-playlist --restrict-filenames`;
      // Use the same timeout for the fallback command
      const { stdout: fallbackStdout } = await execPromise(fallbackCommand, timeoutMs);

      if (fallbackStdout) {
        const results = parseYtDlpOutput(fallbackStdout);

        if (results.length > 0) {
          console.log(`Found ${results.length} results with fallback method for "${sanitizedQuery}"`);

          // Cache the results
          await addToSearchCache(sanitizedQuery, results);

          return { success: true, results };
        }
      }
    } catch (fallbackErr) {
      console.error('Fallback search method failed:', fallbackErr);
    }

    return { success: false, results: [], error: 'Failed to parse results from search' };
  } catch (err) {
    console.error(`Error searching YouTube:`, err);
    return { success: false, results: [], error: err };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Clean expired cache entries in the background
    cleanExpiredSearchCache().catch(err => {
      console.error('Error cleaning expired search cache:', err);
    });

    // Parse request body
    const data = await request.json();
    const { query } = data;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or invalid search query parameter' },
        { status: 400 }
      );
    }

    // Sanitize query to prevent command injection
    const sanitizedQuery = query.replace(/[";&|`$()<>]/g, '');
    if (sanitizedQuery.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid search query after sanitization' },
        { status: 400 }
      );
    }

    // Set a timeout for the entire search operation
    const searchTimeoutMs = 20000; // 20 seconds max (increased from 10 seconds)

    // Create a timeout promise
    const timeoutPromise = new Promise<{ success: false, results: [], error: any }>((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          results: [],
          error: new Error('Search timeout exceeded')
        });
      }, searchTimeoutMs);
    });

    // Perform the search with our optimized function
    const searchPromise = searchYouTube(sanitizedQuery, 15000); // Increased from 8000ms to 15000ms (15 seconds)

    // Race the search promise and the timeout
    const { success, results, error: searchError, fromCache } = await Promise.race([
      searchPromise,
      timeoutPromise
    ]);

    if (!success || results.length === 0) {
      // Check if it's a timeout error
      const errorDetails = searchError ? (searchError.stderr || searchError.message || String(searchError)) : 'No results found';
      const isTimeout = errorDetails.includes('timeout') || errorDetails.includes('timed out');

      return NextResponse.json(
        {
          error: isTimeout
            ? 'Search timed out. Please try again. First searches may take longer to complete.'
            : 'Failed to search YouTube',
          details: errorDetails
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      results: results,
      fromCache: fromCache || false
    });

  } catch (error: any) {
    console.error('Error searching YouTube:', error);

    // Check if it's a timeout error
    const errorDetails = error.stderr || error.message || String(error);
    const isTimeout = errorDetails.includes('timeout') || errorDetails.includes('timed out');

    return NextResponse.json(
      {
        error: isTimeout
          ? 'Search timed out. Please try again. First searches may take longer to complete.'
          : 'Failed to search YouTube',
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
