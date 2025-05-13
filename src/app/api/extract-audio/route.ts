import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configure paths
const TEMP_DIR = path.join(process.cwd(), 'temp');
const PUBLIC_AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');
const CONFIG_DIR = path.join(process.cwd(), 'temp', 'config');
const COOKIE_FILE_PATH = path.join(process.cwd(), 'temp', 'cookies', 'youtube_cookies.txt');

// Error type with stderr property
interface ExtractionError {
  stderr?: string;
  message?: string;
  [key: string]: any;
}

// Ensure directories exist
async function ensureDirectoriesExist() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_AUDIO_DIR, { recursive: true });
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create directories:', error);
  }
}

// Create a temporary config file for yt-dlp
async function createYtDlpConfig() {
  const configPath = path.join(CONFIG_DIR, 'ytdlp-config.txt');
  const config = `
# Use IPv4 by default
--force-ipv4

# Don't verify SSL certificates
--no-check-certificates

# Use HTTP/1.1 for compatibility
--downloader-args "ffmpeg:-http_persistent false"

# Enable geo-bypassing
--geo-bypass

# Set a reasonable maximum file size
--max-filesize 100M

# Use a high retries count
--retries 10

# Do not download videos that I don't want
--match-filter "!is_live & !live"

# Set a random sleep interval between retries
--sleep-interval 1
--max-sleep-interval 5

# Use extractor arguments
--extractor-args "youtube:player_client=web"
`;

  try {
    await fs.writeFile(configPath, config);
    return configPath;
  } catch (error) {
    console.error('Error creating yt-dlp config:', error);
    return null;
  }
}

// Check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

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

export async function POST(request: NextRequest) {
  try {
    await ensureDirectoriesExist();
    
    // Parse request body
    const data = await request.json();
    const { videoId } = data;
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }
    
    // Generate unique filename to avoid collisions
    const uniqueId = uuidv4().substring(0, 8);
    const outputFilename = `${videoId}_${uniqueId}.mp3`;
    const outputPath = path.join(PUBLIC_AUDIO_DIR, outputFilename);
    
    // Create config file
    const configPath = await createYtDlpConfig();
    const configOption = configPath ? `--config-locations "${configPath}"` : '';
    
    // YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    let success = false;
    let lastError: ExtractionError | null = null;
    
    // First try with cookie file if it exists
    const cookieFileExists = await fileExists(COOKIE_FILE_PATH);
    
    if (cookieFileExists) {
      try {
        const ytDlpCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k --cookies "${COOKIE_FILE_PATH}" ${configOption} -o "${outputPath}" "${youtubeUrl}"`;
        
        console.log('Attempting extraction with cookie file');
        
        // Execute yt-dlp command
        const { stdout, stderr } = await execPromise(ytDlpCommand);
        
        console.log('yt-dlp stdout:', stdout);
        
        if (stderr && !stderr.includes('Deleting original file')) {
          console.warn('yt-dlp stderr:', stderr);
        }
        
        // Check if file exists after download
        if (await fileExists(outputPath)) {
          success = true;
          console.log('Successfully extracted with cookie file');
        } else {
          throw new Error('File was not created');
        }
      } catch (err) {
        console.error('Failed with cookie file:', err);
        lastError = err as ExtractionError;
      }
    } else {
      console.log('Cookie file not found, falling back to browser cookies');
    }
    
    // If cookie file didn't work, try browser cookies
    if (!success) {
      // Try multiple browsers in order of preference
      const browserOptions = [
        '--cookies-from-browser chrome', 
        '--cookies-from-browser firefox',
        '--cookies-from-browser safari',
        '--cookies-from-browser edge',
        '--cookies-from-browser opera',
        '--cookies-from-browser brave'
      ];
      
      // Try each browser's cookies until one works
      for (const browserOption of browserOptions) {
        if (success) break;
        
        try {
          const ytDlpCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k ${browserOption} ${configOption} -o "${outputPath}" "${youtubeUrl}"`;
          
          console.log(`Attempting extraction with: ${browserOption}`);
          
          // Execute yt-dlp command
          const { stdout, stderr } = await execPromise(ytDlpCommand);
          
          console.log('yt-dlp stdout:', stdout);
          
          if (stderr && !stderr.includes('Deleting original file')) {
            console.warn('yt-dlp stderr:', stderr);
            throw new Error(stderr);
          }
          
          // Check if file exists after download
          await fs.access(outputPath);
          success = true;
          
          console.log(`Successfully extracted with: ${browserOption}`);
          break;
        } catch (err) {
          console.error(`Failed with ${browserOption}:`, err);
          lastError = err as ExtractionError;
        }
      }
    }
    
    // If we successfully downloaded the file
    if (success) {
      // Return success with audio file path
      return NextResponse.json({
        success: true,
        audioUrl: `/audio/${outputFilename}`,
        message: 'Audio extracted successfully'
      });
    }
    
    // If all browser cookie attempts failed, try with additional options as last resort
    try {
      // Try with more aggressive options
      const userAgentOption = '--user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"';
      const ytDlpCommand = `yt-dlp -x --audio-format mp3 --audio-quality 128k ${userAgentOption} ${configOption} --add-header "Accept:text/html" --add-header "Accept-Language:en-US,en;q=0.9" --add-header "Origin:https://www.youtube.com" --add-header "Referer:https://www.youtube.com/" -o "${outputPath}" "${youtubeUrl}"`;
      
      console.log('Attempting extraction with additional headers as fallback');
      
      const { stdout, stderr } = await execPromise(ytDlpCommand);
      
      console.log('yt-dlp stdout:', stdout);
      if (stderr && !stderr.includes('Deleting original file')) {
        console.warn('yt-dlp stderr:', stderr);
      }
      
      // Check if file exists after download
      await fs.access(outputPath);
      
      // Return success with audio file path
      return NextResponse.json({
        success: true,
        audioUrl: `/audio/${outputFilename}`,
        message: 'Audio extracted successfully with fallback method'
      });
    } catch (finalError) {
      console.error('All extraction methods failed. Final error:', finalError);
      
      // Last resort - try with the simplest option just to extract any audio
      try {
        const simpleCommand = `yt-dlp -x --audio-format mp3 --audio-quality 96k --format "bestaudio/best" ${configOption} -o "${outputPath}" "${youtubeUrl}"`;
        
        console.log('Last resort attempt with simplest options');
        
        const { stdout, stderr } = await execPromise(simpleCommand);
        
        console.log('yt-dlp stdout:', stdout);
        if (stderr) console.warn('yt-dlp stderr:', stderr);
        
        await fs.access(outputPath);
        
        return NextResponse.json({
          success: true,
          audioUrl: `/audio/${outputFilename}`,
          message: 'Audio extracted successfully with basic method'
        });
      } catch (lastResortError) {
        console.error('Even last resort extraction failed:', lastResortError);
        
        const errorDetails = lastError?.stderr || 
                         (finalError as ExtractionError)?.stderr || 
                         (finalError as Error)?.message || 
                         String(finalError) || 
                         'Unknown error';
        
        return NextResponse.json(
          { 
            error: 'Failed to extract audio - all methods failed',
            details: errorDetails
          },
          { status: 500 }
        );
      }
    }
    
  } catch (error: any) {
    console.error('Error extracting audio:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to extract audio', 
        details: error.stderr || error.message || String(error) 
      },
      { status: 500 }
    );
  }
}

// Increase the timeout for this route handler to allow for longer processing
export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb'
    },
  },
}; 