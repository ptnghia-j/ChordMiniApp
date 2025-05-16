import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  initCache,
  isVideoInCache,
  addToCache,
  CacheEntry
} from '@/services/cacheService';

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

// Helper function to find existing audio files for a video ID
async function findExistingAudioFile(videoId: string): Promise<string | null> {
  try {
    const files = await fs.readdir(PUBLIC_AUDIO_DIR);
    const audioFile = files.find(file => file.startsWith(`${videoId}_`) && file.endsWith('.mp3'));
    return audioFile ? path.join(PUBLIC_AUDIO_DIR, audioFile) : null;
  } catch {
    return null;
  }
}

// Helper function to find existing video files for a video ID
async function findExistingVideoFile(videoId: string): Promise<string | null> {
  try {
    const files = await fs.readdir(PUBLIC_AUDIO_DIR);
    const videoFile = files.find(file => file.startsWith(`${videoId}_`) && file.endsWith('.mp4'));
    return videoFile ? path.join(PUBLIC_AUDIO_DIR, videoFile) : null;
  } catch {
    return null;
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
    await initCache();

    // Parse request body
    const data = await request.json();
    const { videoId, forceRefresh = false } = data;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    // Create a direct YouTube embed URL that doesn't require downloading the video
    const youtubeEmbedUrl = `https://www.youtube.com/embed/${videoId}`;

    // Check if video is already in cache
    if (!forceRefresh) {
      const cachedEntry = await isVideoInCache(videoId);
      if (cachedEntry) {
        console.log(`Found cached entry for video ${videoId}`);
        return NextResponse.json({
          success: true,
          audioUrl: cachedEntry.audioUrl,
          videoUrl: cachedEntry.videoUrl,
          youtubeEmbedUrl: cachedEntry.youtubeEmbedUrl,
          fromCache: true,
          message: 'Retrieved from cache'
        });
      }

      // Even if not in cache index, check if files exist on disk
      const existingAudioPath = await findExistingAudioFile(videoId);
      const existingVideoPath = await findExistingVideoFile(videoId);

      if (existingAudioPath) {
        console.log(`Found existing audio file for ${videoId}`);

        // Get relative paths for response
        const audioUrl = `/audio/${path.basename(existingAudioPath)}`;
        const videoUrl = existingVideoPath ? `/audio/${path.basename(existingVideoPath)}` : null;

        // Add to cache for future use
        const cacheEntry: CacheEntry = {
          videoId,
          audioUrl,
          videoUrl,
          youtubeEmbedUrl,
          processedAt: Date.now()
        };

        await addToCache(cacheEntry);

        return NextResponse.json({
          success: true,
          audioUrl,
          videoUrl,
          youtubeEmbedUrl,
          fromCache: true,
          message: 'Found existing files'
        });
      }
    }

    console.log(`No cache entry found for ${videoId} or refresh forced, proceeding with extraction`);

    // Generate unique filename to avoid collisions
    const uniqueId = uuidv4().substring(0, 8);
    const outputFilename = `${videoId}_${uniqueId}.mp3`;
    const outputPath = path.join(PUBLIC_AUDIO_DIR, outputFilename);

    // Also create a path for the video file
    const videoFilename = `${videoId}_${uniqueId}.mp4`;
    const videoPath = path.join(PUBLIC_AUDIO_DIR, videoFilename);

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
        // First download the video file
        const videoCommand = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --cookies "${COOKIE_FILE_PATH}" ${configOption} -o "${videoPath}" "${youtubeUrl}"`;

        console.log('Attempting video download with cookie file');

        // Execute yt-dlp command for video
        const videoResult = await execPromise(videoCommand);

        console.log('Video download stdout:', videoResult.stdout);

        if (videoResult.stderr && !videoResult.stderr.includes('Deleting original file')) {
          console.warn('Video download stderr:', videoResult.stderr);
        }

        // Now extract audio
        const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k --cookies "${COOKIE_FILE_PATH}" ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

        console.log('Attempting audio extraction with cookie file');

        // Execute yt-dlp command for audio
        const { stdout, stderr } = await execPromise(audioCommand);

        console.log('Audio extraction stdout:', stdout);

        if (stderr && !stderr.includes('Deleting original file')) {
          console.warn('Audio extraction stderr:', stderr);
        }

        // Check if files exist after download
        const audioExists = await fileExists(outputPath);
        const videoExists = await fileExists(videoPath);

        if (audioExists && videoExists) {
          success = true;
          console.log('Successfully downloaded video and extracted audio with cookie file');
        } else if (audioExists) {
          success = true;
          console.log('Successfully extracted audio but video download failed');
        } else {
          throw new Error('Audio file was not created');
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
          // First download the video file
          const videoCommand = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ${browserOption} ${configOption} -o "${videoPath}" "${youtubeUrl}"`;

          console.log(`Attempting video download with: ${browserOption}`);

          // Execute yt-dlp command for video
          const videoResult = await execPromise(videoCommand);

          console.log('Video download stdout:', videoResult.stdout);

          if (videoResult.stderr && !videoResult.stderr.includes('Deleting original file')) {
            console.warn('Video download stderr:', videoResult.stderr);
          }

          // Now extract audio
          const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k ${browserOption} ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

          console.log(`Attempting audio extraction with: ${browserOption}`);

          // Execute yt-dlp command for audio
          const { stdout, stderr } = await execPromise(audioCommand);

          console.log('Audio extraction stdout:', stdout);

          if (stderr && !stderr.includes('Deleting original file')) {
            console.warn('Audio extraction stderr:', stderr);
          }

          // Check if files exist after download
          const audioExists = await fileExists(outputPath);
          const videoExists = await fileExists(videoPath);

          if (audioExists) {
            success = true;
            if (videoExists) {
              console.log(`Successfully downloaded video and extracted audio with: ${browserOption}`);
            } else {
              console.log(`Successfully extracted audio but video download failed with: ${browserOption}`);
            }
            break;
          } else {
            throw new Error('Audio file was not created');
          }
        } catch (err) {
          console.error(`Failed with ${browserOption}:`, err);
          lastError = err as ExtractionError;
        }
      }
    }

    // If we successfully downloaded the file
    if (success) {
      // Check if video file exists
      const videoExists = await fileExists(videoPath);

      // Prepare response data
      const responseData = {
        success: true,
        audioUrl: `/audio/${outputFilename}`,
        videoUrl: videoExists ? `/audio/${videoFilename}` : null,
        youtubeEmbedUrl,
        message: videoExists
          ? 'Video and audio extracted successfully'
          : 'Audio extracted successfully'
      };

      // Add to cache
      const cacheEntry: CacheEntry = {
        videoId,
        audioUrl: `/audio/${outputFilename}`,
        videoUrl: videoExists ? `/audio/${videoFilename}` : null,
        youtubeEmbedUrl,
        processedAt: Date.now()
      };

      await addToCache(cacheEntry);
      console.log(`Added video ${videoId} to cache`);

      // Return success response
      return NextResponse.json(responseData);
    }

    // If all browser cookie attempts failed, try with additional options as last resort
    try {
      // Try with more aggressive options
      const userAgentOption = '--user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"';

      // First try to download the video
      const videoCommand = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ${userAgentOption} ${configOption} --add-header "Accept:text/html" --add-header "Accept-Language:en-US,en;q=0.9" --add-header "Origin:https://www.youtube.com" --add-header "Referer:https://www.youtube.com/" -o "${videoPath}" "${youtubeUrl}"`;

      console.log('Attempting video download with additional headers as fallback');

      const videoResult = await execPromise(videoCommand);

      console.log('Video download stdout:', videoResult.stdout);
      if (videoResult.stderr && !videoResult.stderr.includes('Deleting original file')) {
        console.warn('Video download stderr:', videoResult.stderr);
      }

      // Now extract audio
      const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 128k ${userAgentOption} ${configOption} --add-header "Accept:text/html" --add-header "Accept-Language:en-US,en;q=0.9" --add-header "Origin:https://www.youtube.com" --add-header "Referer:https://www.youtube.com/" -o "${outputPath}" "${youtubeUrl}"`;

      console.log('Attempting audio extraction with additional headers as fallback');

      const { stdout, stderr } = await execPromise(audioCommand);

      console.log('Audio extraction stdout:', stdout);
      if (stderr && !stderr.includes('Deleting original file')) {
        console.warn('Audio extraction stderr:', stderr);
      }

      // Check if files exist after download
      const audioExists = await fileExists(outputPath);
      const videoExists = await fileExists(videoPath);

      // Prepare response data
      const responseData = {
        success: true,
        audioUrl: `/audio/${outputFilename}`,
        videoUrl: videoExists ? `/audio/${videoFilename}` : null,
        youtubeEmbedUrl,
        message: videoExists
          ? 'Video and audio extracted successfully with fallback method'
          : 'Audio extracted successfully with fallback method'
      };

      // Add to cache
      const cacheEntry: CacheEntry = {
        videoId,
        audioUrl: `/audio/${outputFilename}`,
        videoUrl: videoExists ? `/audio/${videoFilename}` : null,
        youtubeEmbedUrl,
        processedAt: Date.now()
      };

      await addToCache(cacheEntry);
      console.log(`Added video ${videoId} to cache (fallback method)`);

      // Return success response
      return NextResponse.json(responseData);
    } catch (finalError) {
      console.error('All extraction methods failed. Final error:', finalError);

      // Last resort - try with the simplest option just to extract any audio
      try {
        // Try to get at least the video
        const videoCommand = `yt-dlp -f "best[ext=mp4]/best" ${configOption} -o "${videoPath}" "${youtubeUrl}"`;

        console.log('Last resort attempt for video download');

        const videoResult = await execPromise(videoCommand);

        console.log('Video download stdout:', videoResult.stdout);
        if (videoResult.stderr) console.warn('Video download stderr:', videoResult.stderr);

        // Now try for audio
        const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 96k --format "bestaudio/best" ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

        console.log('Last resort attempt for audio extraction');

        const { stdout, stderr } = await execPromise(audioCommand);

        console.log('Audio extraction stdout:', stdout);
        if (stderr) console.warn('Audio extraction stderr:', stderr);

        // Check what we got
        const audioExists = await fileExists(outputPath);
        const videoExists = await fileExists(videoPath);

        if (!audioExists && !videoExists) {
          throw new Error('Failed to extract both audio and video');
        }

        // Prepare response data
        const responseData = {
          success: true,
          audioUrl: audioExists ? `/audio/${outputFilename}` : null,
          videoUrl: videoExists ? `/audio/${videoFilename}` : null,
          youtubeEmbedUrl,
          message: audioExists && videoExists
            ? 'Video and audio extracted successfully with basic method'
            : audioExists
              ? 'Only audio extracted successfully with basic method'
              : 'Only video extracted successfully with basic method'
        };

        // Only add to cache if we have audio
        if (audioExists) {
          // Add to cache
          const cacheEntry: CacheEntry = {
            videoId,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: videoExists ? `/audio/${videoFilename}` : null,
            youtubeEmbedUrl,
            processedAt: Date.now()
          };

          await addToCache(cacheEntry);
          console.log(`Added video ${videoId} to cache (last resort method)`);
        }

        // Return success response
        return NextResponse.json(responseData);
      } catch (lastResortError) {
        console.error('Even last resort extraction failed:', lastResortError);

        const errorDetails = lastError?.stderr ||
                         (finalError as ExtractionError)?.stderr ||
                         (finalError as Error)?.message ||
                         String(finalError) ||
                         'Unknown error';

        return NextResponse.json(
          {
            error: 'Failed to extract audio and video - all methods failed',
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
        error: 'Failed to extract audio and video',
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