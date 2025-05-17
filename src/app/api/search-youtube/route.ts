import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Execute shell command as promise with timeout
function execPromise(command: string, timeoutMs: number = 15000): Promise<{ stdout: string; stderr: string }> {
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

// Path to the cookie file
const cookieFilePath = path.join(process.cwd(), 'temp', 'cookies', 'youtube_cookies.txt');

// Helper function to parse yt-dlp JSON output into search results
function parseYtDlpOutput(stdout: string): YouTubeSearchResult[] {
  if (!stdout) return [];

  return stdout
    .trim()
    .split('\n')
    .map(line => {
      try {
        const result = JSON.parse(line);

        // Get the best thumbnail URL available
        let thumbnailUrl = '';
        if (result.thumbnails && Array.isArray(result.thumbnails) && result.thumbnails.length > 0) {
          // Sort thumbnails by preference: maxres, high, medium, default, any
          const sortedThumbnails = [...result.thumbnails].sort((a, b) => {
            const getPreferenceScore = (thumb: any) => {
              const url = thumb.url || '';
              if (url.includes('maxres')) return 4;
              if (url.includes('hqdefault')) return 3;
              if (url.includes('mqdefault')) return 2;
              if (url.includes('default')) return 1;
              return 0;
            };
            return getPreferenceScore(b) - getPreferenceScore(a);
          });
          thumbnailUrl = sortedThumbnails[0]?.url || '';
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

// Function to search YouTube using a specific method
async function searchWithMethod(
  sanitizedQuery: string,
  method: string,
  options: string = '',
  timeoutMs: number = 25000
): Promise<{ success: boolean; results: YouTubeSearchResult[]; error?: any }> {
  try {
    // Create yt-dlp command with simplified options for better reliability
    // We're using --no-warnings to reduce stderr output
    const ytDlpSearchCommand = `yt-dlp "ytsearch5:${sanitizedQuery}" ${options} --dump-json --no-playlist --no-warnings`;

    console.log(`Searching YouTube with ${method} for "${sanitizedQuery}"...`);

    // Execute yt-dlp search command with timeout
    const { stdout, stderr } = await execPromise(ytDlpSearchCommand, timeoutMs);

    if (stderr && !stderr.includes('Deleting original file') && !stderr.includes('Extracting cookies')) {
      console.warn(`${method} search stderr:`, stderr);
    }

    if (!stdout) {
      return { success: false, results: [], error: 'No results' };
    }

    // Parse the results
    const results = parseYtDlpOutput(stdout);

    if (results.length > 0) {
      console.log(`Successfully found ${results.length} results with ${method}`);
      return { success: true, results };
    } else {
      return { success: false, results: [], error: 'No results found' };
    }
  } catch (err) {
    console.error(`Error with ${method}:`, err);
    return { success: false, results: [], error: err };
  }
}

// Simplified search function that uses minimal options for better reliability
async function searchWithSimpleMethod(
  sanitizedQuery: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; results: YouTubeSearchResult[]; error?: any }> {
  try {
    // Create a very simple yt-dlp command with minimal options
    // Use --flat-playlist for faster results and --restrict-filenames to avoid encoding issues
    // Add --write-thumbnail to ensure we get thumbnail URLs
    const ytDlpSearchCommand = `yt-dlp "ytsearch5:${sanitizedQuery}" --dump-json --no-playlist --no-warnings --write-thumbnail --restrict-filenames`;

    console.log(`Searching YouTube with simple method for "${sanitizedQuery}"...`);

    // Execute yt-dlp search command with a longer timeout
    const { stdout, stderr } = await execPromise(ytDlpSearchCommand, timeoutMs);

    if (!stdout) {
      return { success: false, results: [], error: 'No results from simple search' };
    }

    // Parse the results with enhanced thumbnail handling
    try {
      const results = stdout
        .trim()
        .split('\n')
        .map(line => {
          try {
            const result = JSON.parse(line);

            // Get the best thumbnail URL available
            let thumbnailUrl = '';
            if (result.thumbnails && Array.isArray(result.thumbnails) && result.thumbnails.length > 0) {
              // Sort thumbnails by preference: maxres, high, medium, default, any
              const sortedThumbnails = [...result.thumbnails].sort((a, b) => {
                const getPreferenceScore = (url: string) => {
                  if (url.includes('maxres')) return 4;
                  if (url.includes('hqdefault')) return 3;
                  if (url.includes('mqdefault')) return 2;
                  if (url.includes('default')) return 1;
                  return 0;
                };
                return getPreferenceScore(b.url) - getPreferenceScore(a.url);
              });
              thumbnailUrl = sortedThumbnails[0]?.url || '';
            } else if (result.thumbnail) {
              thumbnailUrl = result.thumbnail;
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

      if (results.length > 0) {
        console.log(`Successfully found ${results.length} results with simple method`);
        return { success: true, results };
      } else {
        return { success: false, results: [], error: 'No results found with simple method' };
      }
    } catch (parseErr) {
      console.error('Error parsing results from simple method:', parseErr);
      return { success: false, results: [], error: parseErr };
    }
  } catch (err) {
    console.error(`Error with simple method:`, err);
    return { success: false, results: [], error: err };
  }
}

// Ultra-simple search function as a last resort
async function searchWithUltraSimpleMethod(
  sanitizedQuery: string,
  timeoutMs: number = 20000
): Promise<{ success: boolean; results: YouTubeSearchResult[]; error?: any }> {
  try {
    // Create an extremely simple yt-dlp command with absolute minimal options
    // Add --write-thumbnail to ensure we get thumbnail URLs
    const ytDlpSearchCommand = `yt-dlp "ytsearch5:${sanitizedQuery}" --dump-single-json --write-thumbnail --restrict-filenames`;

    console.log(`Searching YouTube with ultra-simple method for "${sanitizedQuery}"...`);

    // Execute yt-dlp search command with a shorter timeout
    const { stdout, stderr } = await execPromise(ytDlpSearchCommand, timeoutMs);

    if (!stdout) {
      return { success: false, results: [], error: 'No results from ultra-simple search' };
    }

    try {
      // Parse the single JSON object
      const result = JSON.parse(stdout);

      // Check if it's a playlist with entries
      if (result.entries && Array.isArray(result.entries) && result.entries.length > 0) {
        // Convert the entries to our standard format
        const results = result.entries.map(entry => {
          // Get the best thumbnail URL available
          let thumbnailUrl = '';
          if (entry.thumbnails && Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
            // Sort thumbnails by preference: maxres, high, medium, default, any
            const sortedThumbnails = [...entry.thumbnails].sort((a, b) => {
              const getPreferenceScore = (url: string) => {
                if (url.includes('maxres')) return 4;
                if (url.includes('hqdefault')) return 3;
                if (url.includes('mqdefault')) return 2;
                if (url.includes('default')) return 1;
                return 0;
              };
              return getPreferenceScore(b.url) - getPreferenceScore(a.url);
            });
            thumbnailUrl = sortedThumbnails[0]?.url || '';
          } else if (entry.thumbnail) {
            thumbnailUrl = entry.thumbnail;
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

        console.log(`Successfully found ${results.length} results with ultra-simple method`);
        return { success: true, results };
      }
    } catch (parseErr) {
      console.error('Error parsing JSON from ultra-simple search:', parseErr);
    }

    return { success: false, results: [], error: 'Failed to parse results from ultra-simple search' };
  } catch (err) {
    console.error(`Error with ultra-simple method:`, err);
    return { success: false, results: [], error: err };
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

    // Sanitize query to prevent command injection
    const sanitizedQuery = query.replace(/[";&|`$()<>]/g, '');
    if (sanitizedQuery.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid search query after sanitization' },
        { status: 400 }
      );
    }

    // Set up search methods to try in parallel
    const searchPromises = [];

    // 1. Try with ultra-simple method first (fastest and most reliable)
    const ultraSimpleSearchPromise = searchWithUltraSimpleMethod(sanitizedQuery, 20000);
    searchPromises.push(ultraSimpleSearchPromise);

    // 2. Try with simple method next
    const simpleSearchPromise = searchWithSimpleMethod(sanitizedQuery, 30000);
    searchPromises.push(simpleSearchPromise);

    // 3. Try with cookie file if it exists
    if (fs.existsSync(cookieFilePath)) {
      const cookieFilePromise = searchWithMethod(
        sanitizedQuery,
        'cookie file',
        `--cookies "${cookieFilePath}" --flat-playlist --restrict-filenames`,
        25000
      );
      searchPromises.push(cookieFilePromise);
    }

    // 4. Try with Chrome cookies only (most likely to work)
    const chromePromise = searchWithMethod(
      sanitizedQuery,
      'chrome cookies',
      `--cookies-from-browser chrome --flat-playlist --restrict-filenames`,
      20000
    );
    searchPromises.push(chromePromise);

    // 5. Try with user agent as fallback
    const userAgentPromise = searchWithMethod(
      sanitizedQuery,
      'user agent',
      '--user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --add-header "Accept:text/html" --add-header "Accept-Language:en-US,en;q=0.9" --flat-playlist --restrict-filenames',
      20000
    );
    searchPromises.push(userAgentPromise);

    // Use Promise.race to get the first successful result
    // We'll also set up a timeout promise to ensure we don't wait too long overall
    const timeoutPromise = new Promise<{ success: false, results: [], error: any }>((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          results: [],
          error: new Error('Overall search timeout exceeded')
        });
      }, 45000); // 45 second overall timeout
    });

    // Create a promise that resolves as soon as any search method succeeds
    const firstSuccessPromise = new Promise<{ success: boolean, results: YouTubeSearchResult[], error?: any }>(async (resolve) => {
      // Set up individual promise completion handlers
      for (let i = 0; i < searchPromises.length; i++) {
        // Use .then() to check each promise as it completes
        searchPromises[i].then(result => {
          if (result.success && result.results.length > 0) {
            resolve(result); // Resolve immediately on first success
          }
        }).catch(err => {
          // Just log the error and continue
          console.error(`Search method ${i} failed:`, err);
        });
      }

      // If we get here, wait for all promises to settle
      const results = await Promise.allSettled(searchPromises);

      // Check if any search method succeeded (this is a fallback)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          return resolve(result.value);
        }
      }

      // If we get here, all methods failed
      // Find the last error to return
      let lastError = null;
      for (const result of results) {
        if (result.status === 'rejected') {
          lastError = result.reason;
        } else if (result.value.error) {
          lastError = result.value.error;
        }
      }

      resolve({
        success: false,
        results: [],
        error: lastError || new Error('All search methods failed')
      });
    });

    // Race the first success promise and the timeout
    const raceResult = await Promise.race([
      firstSuccessPromise,
      timeoutPromise
    ]);

    // Extract results and success status
    const { success, results, error: lastError } = raceResult;

    if (!success || results.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to search YouTube',
          details: lastError ? (lastError.stderr || lastError.message || String(lastError)) : 'No results found'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      results: results,
    });

  } catch (error: any) {
    console.error('Error searching YouTube:', error);

    return NextResponse.json(
      {
        error: 'Failed to search YouTube',
        details: error.stderr || error.message || String(error)
      },
      { status: 500 }
    );
  }
}
