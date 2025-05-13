import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Execute shell command as promise
function execPromise(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
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

    let results: YouTubeSearchResult[] = [];
    let success = false;
    let lastError: any = null;
    
    // First try with cookie file if it exists
    if (fs.existsSync(cookieFilePath)) {
      try {
        // Create yt-dlp command using the cookie file
        const ytDlpSearchCommand = `yt-dlp "ytsearch5:${sanitizedQuery}" --cookies "${cookieFilePath}" --dump-json --no-playlist --force-ipv4 --no-check-certificates`;

        console.log(`Searching YouTube with cookie file for "${sanitizedQuery}"...`);

        // Execute yt-dlp search command
        const { stdout, stderr } = await execPromise(ytDlpSearchCommand);

        if (stderr && !stderr.includes('Deleting original file') && !stderr.includes('Extracting cookies')) {
          console.warn('yt-dlp search stderr:', stderr);
        }

        if (stdout) {
          // Parse the JSON output - yt-dlp outputs one JSON object per line
          results = stdout
            .trim()
            .split('\n')
            .map(line => {
              try {
                const result = JSON.parse(line);
                return {
                  id: result.id,
                  title: result.title,
                  thumbnail: result.thumbnail,
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
            .filter(item => item !== null);
            
          if (results.length > 0) {
            console.log(`Successfully found ${results.length} results with cookie file`);
            success = true;
          }
        }
      } catch (err) {
        console.error(`Error using cookie file:`, err);
        lastError = err;
      }
    }
    
    // If cookie file didn't work, try browser cookies as fallback
    if (!success) {
      // Try multiple browsers in order of preference
      const browserOptions = [
        '--cookies-from-browser chrome', 
        '--cookies-from-browser firefox',
        '--cookies-from-browser safari',
        '--cookies-from-browser edge'
      ];
      
      // Try each browser's cookies until one works
      for (const browserOption of browserOptions) {
        try {
          // Create yt-dlp command for searching with browser cookies
          const ytDlpSearchCommand = `yt-dlp "ytsearch5:${sanitizedQuery}" ${browserOption} --dump-json --no-playlist --force-ipv4 --no-check-certificates`;

          console.log(`Searching YouTube with: ${browserOption} for "${sanitizedQuery}"...`);

          // Execute yt-dlp search command
          const { stdout, stderr } = await execPromise(ytDlpSearchCommand);

          if (stderr && !stderr.includes('Deleting original file') && !stderr.includes('Extracting cookies')) {
            console.warn('yt-dlp search stderr:', stderr);
          }

          if (!stdout) {
            console.log(`No results with ${browserOption}, trying next browser...`);
            continue;
          }

          // Parse the JSON output - yt-dlp outputs one JSON object per line
          results = stdout
            .trim()
            .split('\n')
            .map(line => {
              try {
                const result = JSON.parse(line);
                return {
                  id: result.id,
                  title: result.title,
                  thumbnail: result.thumbnail,
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
            .filter(item => item !== null);
            
          if (results.length > 0) {
            console.log(`Successfully found ${results.length} results with ${browserOption}`);
            success = true;
            break;
          }
        } catch (err) {
          console.error(`Error with ${browserOption}:`, err);
          lastError = err;
        }
      }
    }
    
    if (!success) {
      // Try with a user agent as last resort
      try {
        const userAgent = '--user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"';
        const ytDlpSearchCommand = `yt-dlp "ytsearch5:${sanitizedQuery}" ${userAgent} --add-header "Accept:text/html" --add-header "Accept-Language:en-US,en;q=0.9" --dump-json --no-playlist`;
        
        console.log('Trying search with user agent fallback...');
        
        const { stdout, stderr } = await execPromise(ytDlpSearchCommand);
        
        if (stdout) {
          results = stdout
            .trim()
            .split('\n')
            .map(line => {
              try {
                const result = JSON.parse(line);
                return {
                  id: result.id,
                  title: result.title,
                  thumbnail: result.thumbnail,
                  channel: result.channel || result.uploader || '',
                  duration_string: result.duration_string || '',
                  view_count: result.view_count,
                  upload_date: result.upload_date
                };
              } catch (e) {
                return null;
              }
            })
            .filter(item => item !== null);
            
          if (results.length > 0) {
            success = true;
          }
        }
      } catch (finalErr) {
        console.error('All search methods failed:', finalErr);
        lastError = lastError || finalErr;
      }
    }

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
