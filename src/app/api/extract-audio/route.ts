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
import { getAudioFileMetadata, saveAudioFileMetadata, uploadAudioFile } from '@/services/firebaseStorageService';

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

// Helper function to check if audio file exists in Firebase Storage
async function findAudioInFirebase(videoId: string): Promise<{
  audioUrl: string;
  videoUrl?: string | null;
} | null> {
  try {
    // Check if the audio file exists in Firebase
    const audioFileData = await getAudioFileMetadata(videoId);

    if (audioFileData) {
      console.log(`Found audio file in Firebase Storage for video ID: ${videoId}`);

      // Verify the URL is still valid if it's a remote URL
      if (audioFileData.audioUrl.startsWith('https://')) {
        try {
          // Make a HEAD request to check if the URL is still valid
          const response = await fetch(audioFileData.audioUrl, { method: 'HEAD' });
          if (!response.ok) {
            console.log(`Firebase Storage URL is no longer valid: ${audioFileData.audioUrl}`);
            return null;
          }
        } catch (fetchError) {
          console.error('Error verifying Firebase Storage URL:', fetchError);
          return null;
        }
      } else {
        // For local URLs, check if the file exists
        const localPath = audioFileData.audioUrl.startsWith('/')
          ? path.join(process.cwd(), 'public', audioFileData.audioUrl)
          : path.join(process.cwd(), 'public', '/', audioFileData.audioUrl);

        const exists = await fileExists(localPath);
        if (!exists) {
          console.log(`Local file does not exist: ${localPath}`);
          return null;
        }
      }

      return {
        audioUrl: audioFileData.audioUrl,
        videoUrl: audioFileData.videoUrl || null
      };
    }

    return null;
  } catch (error) {
    console.error('Error checking Firebase Storage:', error);
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
    const { videoId, forceRefresh = false, getInfoOnly = false } = data;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    // If only video info is requested, use yt-dlp to get metadata without downloading
    if (getInfoOnly) {
      try {
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const infoCommand = `yt-dlp --dump-single-json --no-warnings "${youtubeUrl}"`;

        const { stdout } = await execPromise(infoCommand);
        const videoInfo = JSON.parse(stdout);

        return NextResponse.json({
          success: true,
          title: videoInfo.title || `YouTube Video ${videoId}`,
          duration: videoInfo.duration || 0,
          uploader: videoInfo.uploader || 'Unknown',
          description: videoInfo.description || '',
          videoId: videoId
        });
      } catch (error) {
        console.error('Error getting video info:', error);
        return NextResponse.json({
          success: false,
          error: 'Failed to get video information'
        }, { status: 500 });
      }
    }

    // Create a direct YouTube embed URL using privacy-enhanced mode to reduce tracking and CORS errors
    const youtubeEmbedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;

    // Check if video is already in cache
    if (!forceRefresh) {
      // First check Firebase Storage
      const firebaseAudio = await findAudioInFirebase(videoId);

      if (firebaseAudio) {
        console.log(`Found audio in Firebase Storage for ${videoId}`);

        // Extract the filename from the URL
        const audioUrlParts = firebaseAudio.audioUrl.split('/');
        const audioFilename = audioUrlParts[audioUrlParts.length - 1];
        const localAudioPath = path.join(PUBLIC_AUDIO_DIR, audioFilename);

        // Check if the file exists locally
        const localAudioExists = await fileExists(localAudioPath);

        if (!localAudioExists) {
          console.log(`Audio file ${audioFilename} not found locally, creating a placeholder file`);

          // Create an empty file to ensure the path exists
          try {
            // Create a placeholder file with a small size
            await fs.writeFile(localAudioPath, 'placeholder');
            console.log(`Created placeholder file at ${localAudioPath}`);
          } catch (error) {
            console.error(`Error creating placeholder file: ${error}`);
          }
        }

        return NextResponse.json({
          success: true,
          audioUrl: firebaseAudio.audioUrl,
          videoUrl: firebaseAudio.videoUrl,
          youtubeEmbedUrl,
          fromCache: true,
          fromFirebase: true,
          message: 'Found in Firebase Storage'
        });
      }

      // Then check local cache
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
    const timestamp = Date.now();
    const outputFilename = `${videoId}_${timestamp}.mp3`;
    const outputPath = path.join(PUBLIC_AUDIO_DIR, outputFilename);

    // Also create a path for the video file
    const videoFilename = `${videoId}_${timestamp}.mp4`;
    const videoPath = path.join(PUBLIC_AUDIO_DIR, videoFilename);

    // Ensure the audio directory exists
    await ensureDirectoriesExist();

    // Create config file
    const configPath = await createYtDlpConfig();
    const configOption = configPath ? `--config-locations "${configPath}"` : '';

    // YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    let success = false;
    let lastError: ExtractionError | null = null;

    // Start with the most reliable method first - player version approach
    // This has been shown to work most consistently based on logs
    try {
      console.log('Attempting extraction with specific player version (Android)');
      const playerVersionCommand = `yt-dlp --extractor-args "youtube:player_client=android" --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors ${configOption} -x --audio-format mp3 --audio-quality 128k -o "${outputPath}" "${youtubeUrl}"`;

      const playerVersionResult = await execPromise(playerVersionCommand);
      console.log('Player version approach stdout:', playerVersionResult.stdout);

      // Check if the file was created
      const audioExists = await fileExists(outputPath);

      if (audioExists) {
        success = true;
        console.log('Successfully extracted audio with player version approach');

        // Return success response
        const responseData = {
          success: true,
          audioUrl: `/audio/${outputFilename}`,
          videoUrl: null,
          youtubeEmbedUrl,
          fromCache: false,
          message: 'Extracted with player version approach'
        };

        // Add to cache
        const cacheEntry: CacheEntry = {
          videoId,
          audioUrl: `/audio/${outputFilename}`,
          videoUrl: null,
          youtubeEmbedUrl,
          processedAt: Date.now()
        };

        await addToCache(cacheEntry);
        console.log(`Added video ${videoId} to cache (player version method)`);

        return NextResponse.json(responseData);
      }
    } catch (playerVersionError) {
      console.error('Player version approach failed:', playerVersionError);
      lastError = playerVersionError as ExtractionError;
    }

    // If Android player approach failed, try iOS player approach
    if (!success) {
      try {
        console.log('Attempting extraction with iOS player client');
        const iosCommand = `yt-dlp --extractor-args "youtube:player_client=ios" --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors ${configOption} -x --audio-format mp3 --audio-quality 128k -o "${outputPath}" "${youtubeUrl}"`;

        const iosResult = await execPromise(iosCommand);
        console.log('iOS player client extraction stdout:', iosResult.stdout);

        // Check if the file was created
        const audioExists = await fileExists(outputPath);

        if (audioExists) {
          success = true;
          console.log('Successfully extracted audio with iOS player client');

          // Return success response
          const responseData = {
            success: true,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: null,
            youtubeEmbedUrl,
            fromCache: false,
            message: 'Extracted with iOS player client'
          };

          // Add to cache
          const cacheEntry: CacheEntry = {
            videoId,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: null,
            youtubeEmbedUrl,
            processedAt: Date.now()
          };

          await addToCache(cacheEntry);
          console.log(`Added video ${videoId} to cache (iOS player client method)`);

          return NextResponse.json(responseData);
        }
      } catch (iosError) {
        console.error('iOS player client extraction failed:', iosError);
        lastError = iosError as ExtractionError;
      }
    }

    // If player approaches failed, try with cookie file if it exists
    const cookieFileExists = await fileExists(COOKIE_FILE_PATH);

    if (!success && cookieFileExists) {
      try {
        // Try direct audio extraction with cookie file (skip video download to save time)
        const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k --cookies "${COOKIE_FILE_PATH}" ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

        console.log('Attempting audio extraction with cookie file');

        // Execute yt-dlp command for audio
        const { stdout, stderr } = await execPromise(audioCommand);

        console.log('Audio extraction stdout:', stdout);

        if (stderr && !stderr.includes('Deleting original file')) {
          console.warn('Audio extraction stderr:', stderr);
        }

        // Check if the file was created
        const audioExists = await fileExists(outputPath);

        if (audioExists) {
          success = true;
          console.log('Successfully extracted audio with cookie file');

          // Return success response
          const responseData = {
            success: true,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: null,
            youtubeEmbedUrl,
            fromCache: false,
            message: 'Extracted with cookie file'
          };

          // Add to cache
          const cacheEntry: CacheEntry = {
            videoId,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: null,
            youtubeEmbedUrl,
            processedAt: Date.now()
          };

          await addToCache(cacheEntry);
          console.log(`Added video ${videoId} to cache (cookie file method)`);

          return NextResponse.json(responseData);
        }
      } catch (error) {
        console.error('Failed with cookie file:', error);
        lastError = error as ExtractionError;
      }
    }

    // If all above approaches failed, try with Chrome browser cookies only (most common)
    if (!success) {
      try {
        // Try direct audio extraction with Chrome cookies (skip video download to save time)
        const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k --cookies-from-browser chrome ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

        console.log('Attempting audio extraction with Chrome cookies');

        // Execute yt-dlp command for audio
        const { stdout, stderr } = await execPromise(audioCommand);

        console.log('Audio extraction stdout:', stdout);

        if (stderr && !stderr.includes('Deleting original file')) {
          console.warn('Audio extraction stderr:', stderr);
        }

        // Check if the file was created
        const audioExists = await fileExists(outputPath);

        if (audioExists) {
          success = true;
          console.log('Successfully extracted audio with Chrome cookies');

          // Return success response
          const responseData = {
            success: true,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: null,
            youtubeEmbedUrl,
            fromCache: false,
            message: 'Extracted with Chrome cookies'
          };

          // Add to cache
          const cacheEntry: CacheEntry = {
            videoId,
            audioUrl: `/audio/${outputFilename}`,
            videoUrl: null,
            youtubeEmbedUrl,
            processedAt: Date.now()
          };

          await addToCache(cacheEntry);
          console.log(`Added video ${videoId} to cache (Chrome cookies method)`);

          return NextResponse.json(responseData);
        }
      } catch (error) {
        console.error('Failed with Chrome cookies:', error);
        lastError = error as ExtractionError;
      }
    }

    // If we successfully downloaded the file
    if (success) {
      // Check if video file exists
      const videoExists = await fileExists(videoPath);

      // Read the files for uploading to Firebase Storage
      const audioFileBuffer = await fs.readFile(outputPath);
      let videoFileBuffer: Buffer | null = null;

      if (videoExists) {
        videoFileBuffer = await fs.readFile(videoPath);
      }

      // Upload to Firebase Storage
      let firebaseUrls = null;
      try {
        firebaseUrls = await uploadAudioFile(
          videoId,
          audioFileBuffer,
          videoFileBuffer || undefined
        );

        if (firebaseUrls) {
          console.log('Successfully uploaded files to Firebase Storage');

          // Save metadata to Firestore
          await saveAudioFileMetadata({
            videoId,
            audioUrl: firebaseUrls.audioUrl,
            videoUrl: firebaseUrls.videoUrl,
            storagePath: firebaseUrls.storagePath,
            videoStoragePath: firebaseUrls.videoStoragePath,
            fileSize: audioFileBuffer.length,
            videoFileSize: videoFileBuffer ? videoFileBuffer.length : undefined
          });

          // Prepare response data with Firebase URLs
          const responseData = {
            success: true,
            audioUrl: firebaseUrls.audioUrl,
            videoUrl: firebaseUrls.videoUrl || null,
            youtubeEmbedUrl,
            fromFirebase: true,
            message: videoExists
              ? 'Video and audio extracted and uploaded to Firebase Storage successfully'
              : 'Audio extracted and uploaded to Firebase Storage successfully'
          };

          return NextResponse.json(responseData);
        }
      } catch (error) {
        console.error('Error uploading to Firebase Storage:', error);
        // Continue with local file approach if Firebase upload fails
      }

      // Fallback to local files if Firebase upload fails
      // Prepare response data
      const responseData = {
        success: true,
        audioUrl: `/audio/${outputFilename}`,
        videoUrl: videoExists ? `/audio/${videoFilename}` : null,
        youtubeEmbedUrl,
        message: videoExists
          ? 'Video and audio extracted successfully (local storage)'
          : 'Audio extracted successfully (local storage)'
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

      // Try with format 140 directly (we already tried player version approach earlier)
      console.log('Attempting with format 140 directly');

      // First try with specific format IDs that are commonly available
      // Format 140 is usually available for most videos (m4a audio)
      const formatAudioCommand = `yt-dlp -f 140 --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors ${configOption} -o "${outputPath.replace('.mp3', '.m4a')}" "${youtubeUrl}"`;

      console.log('Attempting audio download with format 140 (m4a audio)');

      try {
        const formatResult = await execPromise(formatAudioCommand);
        console.log('Format 140 download stdout:', formatResult.stdout);

        // Check if the file was created
        const m4aPath = outputPath.replace('.mp3', '.m4a');
        const m4aExists = await fileExists(m4aPath);

        if (m4aExists) {
          // Convert m4a to mp3
          const convertCommand = `ffmpeg -i "${m4aPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}" -y`;
          await execPromise(convertCommand);
          console.log('Converted m4a to mp3');

          // Check if the mp3 file was created
          const audioExists = await fileExists(outputPath);

          if (audioExists) {
            success = true;
            console.log('Successfully extracted audio with format 140 approach');

            // Return success response
            const responseData = {
              success: true,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              fromCache: false,
              message: 'Extracted with format 140 approach'
            };

            // Add to cache
            const cacheEntry: CacheEntry = {
              videoId,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              processedAt: Date.now()
            };

            await addToCache(cacheEntry);
            console.log(`Added video ${videoId} to cache (format 140 method)`);

            return NextResponse.json(responseData);
          }
        }
      } catch (formatError) {
        console.error('Format 140 extraction failed:', formatError);
      }

      // If format 140 failed, try a simpler approach without browser cookies
      const simpleVideoCommand = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-check-certificate --geo-bypass ${configOption} -o "${videoPath}" "${youtubeUrl}"`;

      console.log('Attempting video download with simple approach (no browser cookies)');

      try {
        const simpleVideoResult = await execPromise(simpleVideoCommand);
        console.log('Simple video download stdout:', simpleVideoResult.stdout);

        if (simpleVideoResult.stderr && !simpleVideoResult.stderr.includes('Deleting original file')) {
          console.warn('Simple video download stderr:', simpleVideoResult.stderr);
        }

        // If video download succeeded, try audio extraction with the same approach
        const simpleAudioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 320k --no-check-certificate --geo-bypass ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

        console.log('Attempting audio extraction with simple approach (no browser cookies)');

        const simpleAudioResult = await execPromise(simpleAudioCommand);
        console.log('Simple audio extraction stdout:', simpleAudioResult.stdout);

        if (simpleAudioResult.stderr && !simpleAudioResult.stderr.includes('Deleting original file')) {
          console.warn('Simple audio extraction stderr:', simpleAudioResult.stderr);
        }

        // Check if the files were created
        const audioExists = await fileExists(outputPath);
        const videoExists = await fileExists(videoPath);

        if (audioExists) {
          success = true;
          console.log('Successfully extracted audio with simple approach');
          // No need for break here as we're not in a loop
        }
      } catch (simpleError) {
        console.error('Simple approach failed:', simpleError);
      }

      // If simple approach failed, try with more headers
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

      // Read the files for uploading to Firebase Storage
      let audioFileBuffer: Buffer | null = null;
      let videoFileBuffer: Buffer | null = null;

      if (audioExists) {
        audioFileBuffer = await fs.readFile(outputPath);
      }

      if (videoExists) {
        videoFileBuffer = await fs.readFile(videoPath);
      }

      // Upload to Firebase Storage if we have audio
      if (audioFileBuffer) {
        let firebaseUrls = null;
        try {
          firebaseUrls = await uploadAudioFile(
            videoId,
            audioFileBuffer,
            videoFileBuffer || undefined
          );

          if (firebaseUrls) {
            console.log('Successfully uploaded files to Firebase Storage (fallback method)');

            // Save metadata to Firestore
            await saveAudioFileMetadata({
              videoId,
              audioUrl: firebaseUrls.audioUrl,
              videoUrl: firebaseUrls.videoUrl,
              storagePath: firebaseUrls.storagePath,
              videoStoragePath: firebaseUrls.videoStoragePath,
              fileSize: audioFileBuffer.length,
              videoFileSize: videoFileBuffer ? videoFileBuffer.length : undefined
            });

            // Prepare response data with Firebase URLs
            const responseData = {
              success: true,
              audioUrl: firebaseUrls.audioUrl,
              videoUrl: firebaseUrls.videoUrl || null,
              youtubeEmbedUrl,
              fromFirebase: true,
              message: videoExists
                ? 'Video and audio extracted and uploaded to Firebase Storage successfully (fallback method)'
                : 'Audio extracted and uploaded to Firebase Storage successfully (fallback method)'
            };

            return NextResponse.json(responseData);
          }
        } catch (error) {
          console.error('Error uploading to Firebase Storage (fallback method):', error);
          // Continue with local file approach if Firebase upload fails
        }
      }

      // Fallback to local files if Firebase upload fails or no audio
      // Prepare response data
      const responseData = {
        success: true,
        audioUrl: `/audio/${outputFilename}`,
        videoUrl: videoExists ? `/audio/${videoFilename}` : null,
        youtubeEmbedUrl,
        message: videoExists
          ? 'Video and audio extracted successfully with fallback method (local storage)'
          : 'Audio extracted successfully with fallback method (local storage)'
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
        // Check if we need to list formats first (for YouTube Shorts or special content)
        if (lastError && lastError.stderr &&
            (lastError.stderr.includes('Only images are available for download') ||
             lastError.stderr.includes('Requested format is not available'))) {

          console.log('Special content detected (possibly YouTube Short). Trying alternative approaches...');

          // First, try with a different YouTube URL format (shorts URL)
          const shortsUrl = `https://www.youtube.com/shorts/${videoId}`;
          console.log('Attempting to use shorts URL format:', shortsUrl);

          try {
            // Try with shorts URL and format 22 (usually available for shorts)
            const shortsCommand = `yt-dlp -f 22/18/17 --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${videoPath}" "${shortsUrl}"`;

            const shortsResult = await execPromise(shortsCommand);
            console.log('Shorts URL extraction stdout:', shortsResult.stdout);

            // Check if the file was created
            const videoExists = await fileExists(videoPath);

            if (videoExists) {
              // Extract audio from the downloaded video
              const audioCommand = `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}" -y`;

              await execPromise(audioCommand);
              console.log('Extracted audio from shorts video using ffmpeg');

              // Check if the audio file was created
              const audioExists = await fileExists(outputPath);

              if (audioExists) {
                console.log('Successfully extracted audio from YouTube Short');

                // Return success response
                const responseData = {
                  success: true,
                  audioUrl: `/audio/${outputFilename}`,
                  videoUrl: `/audio/${videoFilename}`,
                  youtubeEmbedUrl,
                  fromCache: false,
                  message: 'Extracted audio from YouTube Short'
                };

                // Add to cache
                const cacheEntry: CacheEntry = {
                  videoId,
                  audioUrl: `/audio/${outputFilename}`,
                  videoUrl: `/audio/${videoFilename}`,
                  youtubeEmbedUrl,
                  processedAt: Date.now()
                };

                await addToCache(cacheEntry);
                console.log(`Added video ${videoId} to cache (YouTube Short method)`);

                return NextResponse.json(responseData);
              }
            }
          } catch (shortsError) {
            console.error('Shorts URL extraction failed:', shortsError);
          }

          // If shorts URL failed, try listing formats from the original URL
          console.log('Shorts URL failed, listing available formats...');
          const listFormatsCommand = `yt-dlp --list-formats --no-check-certificate --geo-bypass ${configOption} "${youtubeUrl}"`;
          try {
            const { stdout: formatsOutput } = await execPromise(listFormatsCommand, 10000);
            console.log('Available formats:', formatsOutput);

            // Parse the formats output to find available format IDs
            const formatLines = formatsOutput.split('\n');
            const audioFormatIds: string[] = [];
            const videoFormatIds: string[] = [];

            // Look for audio and video formats
            for (const line of formatLines) {
              // Skip header lines and empty lines
              if (!line.trim() || line.includes('---') || line.includes('format code')) {
                continue;
              }

              // Extract format ID and type
              const formatMatch = line.match(/^(\d+)\s+/);
              if (formatMatch) {
                const formatId = formatMatch[1];

                if (line.includes('audio only')) {
                  audioFormatIds.push(formatId);
                } else if (line.includes('video only') || line.includes('video+audio')) {
                  videoFormatIds.push(formatId);
                }
              }
            }

            console.log('Found audio formats:', audioFormatIds);
            console.log('Found video formats:', videoFormatIds);

            // Try different approaches based on available formats

            // 1. First try with audio only if available
            if (audioFormatIds.length > 0) {
              // Sort audio formats by ID (higher is usually better quality)
              audioFormatIds.sort((a, b) => parseInt(b) - parseInt(a));
              const bestAudioFormat = audioFormatIds[0];

              console.log(`Attempting extraction with best audio format: ${bestAudioFormat}`);
              const audioFormatCommand = `yt-dlp -f ${bestAudioFormat} -x --audio-format mp3 --audio-quality 128k --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

              try {
                const audioFormatResult = await execPromise(audioFormatCommand);
                console.log('Audio format extraction stdout:', audioFormatResult.stdout);

                // Check if the audio file was created
                const audioExists = await fileExists(outputPath);

                if (audioExists) {
                  console.log(`Successfully extracted audio using format ${bestAudioFormat}`);

                  // Return success response
                  const responseData = {
                    success: true,
                    audioUrl: `/audio/${outputFilename}`,
                    videoUrl: null,
                    youtubeEmbedUrl,
                    fromCache: false,
                    message: `Extracted audio using format ${bestAudioFormat}`
                  };

                  // Add to cache
                  const cacheEntry: CacheEntry = {
                    videoId,
                    audioUrl: `/audio/${outputFilename}`,
                    videoUrl: null,
                    youtubeEmbedUrl,
                    processedAt: Date.now()
                  };

                  await addToCache(cacheEntry);
                  console.log(`Added video ${videoId} to cache (format ${bestAudioFormat} method)`);

                  return NextResponse.json(responseData);
                }
              } catch (audioFormatError) {
                console.error(`Format ${bestAudioFormat} extraction failed:`, audioFormatError);
              }
            }

            // 2. Try with video format if available (extract audio from video)
            if (videoFormatIds.length > 0) {
              // Sort video formats by ID (higher is usually better quality)
              videoFormatIds.sort((a, b) => parseInt(b) - parseInt(a));

              // Try with a few different video formats, starting from the middle of the list
              // (highest quality formats might be too large or restricted)
              const midIndex = Math.floor(videoFormatIds.length / 2);
              const formatsToTry = [
                videoFormatIds[midIndex],
                videoFormatIds[0],
                videoFormatIds[videoFormatIds.length - 1]
              ].filter(Boolean);

              for (const formatId of formatsToTry) {
                console.log(`Attempting extraction with video format: ${formatId}`);
                const videoFormatCommand = `yt-dlp -f ${formatId} -x --audio-format mp3 --audio-quality 128k --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

                try {
                  const videoFormatResult = await execPromise(videoFormatCommand);
                  console.log(`Format ${formatId} extraction stdout:`, videoFormatResult.stdout);

                  // Check if the audio file was created
                  const audioExists = await fileExists(outputPath);

                  if (audioExists) {
                    console.log(`Successfully extracted audio using video format ${formatId}`);

                    // Return success response
                    const responseData = {
                      success: true,
                      audioUrl: `/audio/${outputFilename}`,
                      videoUrl: null,
                      youtubeEmbedUrl,
                      fromCache: false,
                      message: `Extracted audio from video format ${formatId}`
                    };

                    // Add to cache
                    const cacheEntry: CacheEntry = {
                      videoId,
                      audioUrl: `/audio/${outputFilename}`,
                      videoUrl: null,
                      youtubeEmbedUrl,
                      processedAt: Date.now()
                    };

                    await addToCache(cacheEntry);
                    console.log(`Added video ${videoId} to cache (video format ${formatId} method)`);

                    return NextResponse.json(responseData);
                  }
                } catch (videoFormatError) {
                  console.error(`Format ${formatId} extraction failed:`, videoFormatError);
                }
              }
            }

            // 3. If specific formats failed, try with generic bestaudio as fallback
            console.log('Attempting audio-only extraction with bestaudio selector');
            const audioOnlyCommand = `yt-dlp -f "bestaudio" -x --audio-format mp3 --audio-quality 128k --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

            try {
              const audioOnlyResult = await execPromise(audioOnlyCommand);
              console.log('Audio-only extraction stdout:', audioOnlyResult.stdout);

              // Check if the audio file was created
              const audioExists = await fileExists(outputPath);

              if (audioExists) {
                console.log('Successfully extracted audio with bestaudio selector');

                // Return success response
                const responseData = {
                  success: true,
                  audioUrl: `/audio/${outputFilename}`,
                  videoUrl: null,
                  youtubeEmbedUrl,
                  fromCache: false,
                  message: 'Extracted audio with bestaudio selector'
                };

                // Add to cache
                const cacheEntry: CacheEntry = {
                  videoId,
                  audioUrl: `/audio/${outputFilename}`,
                  videoUrl: null,
                  youtubeEmbedUrl,
                  processedAt: Date.now()
                };

                await addToCache(cacheEntry);
                console.log(`Added video ${videoId} to cache (bestaudio method)`);

                return NextResponse.json(responseData);
              }
            } catch (audioOnlyError) {
              console.error('Audio-only extraction failed:', audioOnlyError);
            }
          } catch (listFormatsError) {
            console.error('Failed to list formats:', listFormatsError);
          }
        }

        // Try to get at least the video with the most basic options
        const videoCommand = `yt-dlp -f "best[ext=mp4]/best" --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${videoPath}" "${youtubeUrl}"`;

        console.log('Last resort attempt for video download');

        const videoResult = await execPromise(videoCommand);

        console.log('Video download stdout:', videoResult.stdout);
        if (videoResult.stderr) console.warn('Video download stderr:', videoResult.stderr);

        // Now try for audio with the most basic options
        const audioCommand = `yt-dlp -x --audio-format mp3 --audio-quality 96k --format "bestaudio/best" --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

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

        // Read the files for uploading to Firebase Storage
        let audioFileBuffer: Buffer | null = null;
        let videoFileBuffer: Buffer | null = null;

        if (audioExists) {
          audioFileBuffer = await fs.readFile(outputPath);
        }

        if (videoExists) {
          videoFileBuffer = await fs.readFile(videoPath);
        }

        // Upload to Firebase Storage if we have audio
        if (audioFileBuffer) {
          let firebaseUrls = null;
          try {
            firebaseUrls = await uploadAudioFile(
              videoId,
              audioFileBuffer,
              videoFileBuffer || undefined
            );

            if (firebaseUrls) {
              console.log('Successfully uploaded files to Firebase Storage (last resort method)');

              // Save metadata to Firestore
              await saveAudioFileMetadata({
                videoId,
                audioUrl: firebaseUrls.audioUrl,
                videoUrl: firebaseUrls.videoUrl,
                storagePath: firebaseUrls.storagePath,
                videoStoragePath: firebaseUrls.videoStoragePath,
                fileSize: audioFileBuffer.length,
                videoFileSize: videoFileBuffer ? videoFileBuffer.length : undefined
              });

              // Prepare response data with Firebase URLs
              const responseData = {
                success: true,
                audioUrl: firebaseUrls.audioUrl,
                videoUrl: firebaseUrls.videoUrl || null,
                youtubeEmbedUrl,
                fromFirebase: true,
                message: videoExists
                  ? 'Video and audio extracted and uploaded to Firebase Storage successfully (last resort method)'
                  : 'Audio extracted and uploaded to Firebase Storage successfully (last resort method)'
              };

              return NextResponse.json(responseData);
            }
          } catch (error) {
            console.error('Error uploading to Firebase Storage (last resort method):', error);
            // Continue with local file approach if Firebase upload fails
          }
        }

        // Fallback to local files if Firebase upload fails or no audio
        // Prepare response data
        const responseData = {
          success: true,
          audioUrl: audioExists ? `/audio/${outputFilename}` : null,
          videoUrl: videoExists ? `/audio/${videoFilename}` : null,
          youtubeEmbedUrl,
          message: audioExists && videoExists
            ? 'Video and audio extracted successfully with basic method (local storage)'
            : audioExists
              ? 'Only audio extracted successfully with basic method (local storage)'
              : 'Only video extracted successfully with basic method (local storage)'
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

        // Try YouTube Shorts specific approach
        try {
          console.log('Attempting YouTube Shorts specific approach');

          // For YouTube Shorts, try with format 18 (360p) which is often available
          const shortsCommand = `yt-dlp -f 18 -x --audio-format mp3 --audio-quality 128k --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${outputPath}" "${youtubeUrl}"`;

          const shortsResult = await execPromise(shortsCommand);
          console.log('YouTube Shorts extraction stdout:', shortsResult.stdout);

          // Check if the file was created
          const audioExists = await fileExists(outputPath);

          if (audioExists) {
            console.log('Successfully extracted audio with YouTube Shorts approach');

            // Return success response
            const responseData = {
              success: true,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              fromCache: false,
              message: 'Extracted with YouTube Shorts approach'
            };

            // Add to cache
            const cacheEntry: CacheEntry = {
              videoId,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              processedAt: Date.now()
            };

            await addToCache(cacheEntry);
            console.log(`Added video ${videoId} to cache (YouTube Shorts method)`);

            return NextResponse.json(responseData);
          }
        } catch (shortsError) {
          console.error('YouTube Shorts extraction failed:', shortsError);
        }

        // Try with format 140 (m4a audio only) which is often available for all videos
        try {
          console.log('Attempting extraction with format 140 (m4a audio only)');

          const m4aCommand = `yt-dlp -f 140 --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${outputPath.replace('.mp3', '.m4a')}" "${youtubeUrl}"`;

          const m4aResult = await execPromise(m4aCommand);
          console.log('Format 140 extraction stdout:', m4aResult.stdout);

          // Convert m4a to mp3
          const m4aPath = outputPath.replace('.mp3', '.m4a');
          const convertCommand = `ffmpeg -i "${m4aPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}" -y`;

          await execPromise(convertCommand);
          console.log('Converted m4a to mp3');

          // Check if the file was created
          const audioExists = await fileExists(outputPath);

          if (audioExists) {
            console.log('Successfully extracted audio with format 140 approach');

            // Return success response
            const responseData = {
              success: true,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              fromCache: false,
              message: 'Extracted with format 140 approach'
            };

            // Add to cache
            const cacheEntry: CacheEntry = {
              videoId,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              processedAt: Date.now()
            };

            await addToCache(cacheEntry);
            console.log(`Added video ${videoId} to cache (format 140 method)`);

            return NextResponse.json(responseData);
          }
        } catch (m4aError) {
          console.error('Format 140 extraction failed:', m4aError);
        }

        // Try with a different YouTube URL format as a last resort
        try {
          console.log('Attempting extraction with alternative YouTube URL format');

          // Try with invidious API format
          const invidiousUrl = `https://invidious.snopyta.org/watch?v=${videoId}`;
          console.log('Attempting to use invidious URL format:', invidiousUrl);

          // Try with format 18 (360p) which is often available
          const invidiousCommand = `yt-dlp -f 18/17/22 --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -o "${videoPath}" "${invidiousUrl}"`;

          const invidiousResult = await execPromise(invidiousCommand);
          console.log('Invidious URL extraction stdout:', invidiousResult.stdout);

          // Check if the file was created
          const videoExists = await fileExists(videoPath);

          if (videoExists) {
            // Extract audio from the downloaded video
            const audioCommand = `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}" -y`;

            await execPromise(audioCommand);
            console.log('Extracted audio from invidious video using ffmpeg');

            // Check if the audio file was created
            const audioExists = await fileExists(outputPath);

            if (audioExists) {
              console.log('Successfully extracted audio with invidious approach');

              // Return success response
              const responseData = {
                success: true,
                audioUrl: `/audio/${outputFilename}`,
                videoUrl: `/audio/${videoFilename}`,
                youtubeEmbedUrl,
                fromCache: false,
                message: 'Extracted with invidious approach (last resort)'
              };

              // Add to cache
              const cacheEntry: CacheEntry = {
                videoId,
                audioUrl: `/audio/${outputFilename}`,
                videoUrl: `/audio/${videoFilename}`,
                youtubeEmbedUrl,
                processedAt: Date.now()
              };

              await addToCache(cacheEntry);
              console.log(`Added video ${videoId} to cache (invidious method)`);

              return NextResponse.json(responseData);
            }
          }
        } catch (invidiousError) {
          console.error('Invidious extraction failed:', invidiousError);
        }

        // Try with a different player client
        try {
          console.log('Attempting extraction with different player client');

          // Try with iOS player client
          const iosCommand = `yt-dlp --extractor-args "youtube:player_client=ios" --no-check-certificate --geo-bypass --force-ipv4 --ignore-errors --no-warnings ${configOption} -x --audio-format mp3 --audio-quality 128k -o "${outputPath}" "${youtubeUrl}"`;

          const iosResult = await execPromise(iosCommand);
          console.log('iOS player client extraction stdout:', iosResult.stdout);

          // Check if the file was created
          const audioExists = await fileExists(outputPath);

          if (audioExists) {
            console.log('Successfully extracted audio with iOS player client');

            // Return success response
            const responseData = {
              success: true,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              fromCache: false,
              message: 'Extracted with iOS player client (last resort)'
            };

            // Add to cache
            const cacheEntry: CacheEntry = {
              videoId,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              processedAt: Date.now()
            };

            await addToCache(cacheEntry);
            console.log(`Added video ${videoId} to cache (iOS player client method)`);

            return NextResponse.json(responseData);
          }
        } catch (iosError) {
          console.error('iOS player client extraction failed:', iosError);
        }

        // Absolute last resort - try youtube-dl instead of yt-dlp
        try {
          console.log('Attempting extraction with youtube-dl as absolute last resort');

          // Try to get audio directly with youtube-dl
          const ytdlCommand = `youtube-dl -x --audio-format mp3 --audio-quality 96k --no-check-certificate --no-warnings -o "${outputPath}" "${youtubeUrl}"`;

          const ytdlResult = await execPromise(ytdlCommand);
          console.log('youtube-dl extraction stdout:', ytdlResult.stdout);
          if (ytdlResult.stderr) console.warn('youtube-dl extraction stderr:', ytdlResult.stderr);

          // Check if the file was created
          const audioExists = await fileExists(outputPath);

          if (audioExists) {
            console.log('Successfully extracted audio with youtube-dl');

            // Return success response
            const responseData = {
              success: true,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              fromCache: false,
              message: 'Extracted with youtube-dl (last resort)'
            };

            // Add to cache
            const cacheEntry: CacheEntry = {
              videoId,
              audioUrl: `/audio/${outputFilename}`,
              videoUrl: null,
              youtubeEmbedUrl,
              processedAt: Date.now()
            };

            await addToCache(cacheEntry);
            console.log(`Added video ${videoId} to cache (youtube-dl method)`);

            return NextResponse.json(responseData);
          }
        } catch (ytdlError) {
          console.error('youtube-dl extraction failed:', ytdlError);
        }

        const errorDetails = lastError?.stderr ||
                         (finalError as ExtractionError)?.stderr ||
                         (finalError as Error)?.message ||
                         String(finalError) ||
                         'Unknown error';

        // Filter out confusing error messages and provide more helpful ones
        let cleanErrorDetails = errorDetails;
        let suggestion = 'Please try a different video or try again later. You can also try uploading an audio file directly.';

        if (typeof errorDetails === 'string') {
          // Check for specific error patterns
          if (errorDetails.includes('could not find brave cookies database') ||
              errorDetails.includes('could not find chrome cookies database') ||
              errorDetails.includes('could not find firefox cookies database') ||
              errorDetails.includes('could not find opera cookies database') ||
              errorDetails.includes('could not find edge cookies database') ||
              errorDetails.includes('could not find safari cookies database') ||
              errorDetails.includes('Operation not permitted') ||
              errorDetails.includes('cookies database')) {
            cleanErrorDetails = 'YouTube extraction failed. This may be due to YouTube restrictions or network issues.';
            suggestion = 'This is likely a temporary issue. Please try a different video or try again later.';
          }
          else if (errorDetails.includes('Only images are available for download') ||
                  errorDetails.includes('Requested format is not available')) {
            cleanErrorDetails = 'This appears to be a YouTube Short or special content that cannot be processed.';
            suggestion = 'YouTube Shorts often cannot be processed. Please try a regular YouTube video instead, or upload an audio file directly.';
          }
          else if (errorDetails.includes('nsig extraction failed')) {
            cleanErrorDetails = 'YouTube extraction failed due to signature decryption issues.';
            suggestion = 'This is likely due to recent YouTube changes. Please try a different video or try again later.';
          }
          else if (errorDetails.includes('This video is not available')) {
            cleanErrorDetails = 'This video is not available for extraction.';
            suggestion = 'The video may be private, region-restricted, or removed. Please try a different video.';
          }
        }

        return NextResponse.json(
          {
            error: 'Failed to extract audio from YouTube',
            details: cleanErrorDetails,
            suggestion: suggestion
          },
          { status: 500 }
        );
      }
    }

  } catch (error: any) {
    console.error('Error extracting audio:', error);

    // Filter out confusing error messages and provide more helpful ones
    let errorMessage = error.stderr || error.message || String(error);
    let suggestion = 'Please try a different video or try again later. You can also try uploading an audio file directly.';

    if (typeof errorMessage === 'string') {
      // Check for specific error patterns
      if (errorMessage.includes('could not find brave cookies database') ||
          errorMessage.includes('could not find chrome cookies database') ||
          errorMessage.includes('could not find firefox cookies database') ||
          errorMessage.includes('could not find opera cookies database') ||
          errorMessage.includes('could not find edge cookies database') ||
          errorMessage.includes('could not find safari cookies database') ||
          errorMessage.includes('Operation not permitted') ||
          errorMessage.includes('cookies database')) {
        errorMessage = 'YouTube extraction failed. This may be due to YouTube restrictions or network issues.';
        suggestion = 'This is likely a temporary issue. Please try a different video or try again later.';
      }
      else if (errorMessage.includes('Only images are available for download') ||
              errorMessage.includes('Requested format is not available')) {
        errorMessage = 'This appears to be a YouTube Short or special content that cannot be processed.';
        suggestion = 'YouTube Shorts often cannot be processed. Please try a regular YouTube video instead, or upload an audio file directly.';
      }
      else if (errorMessage.includes('nsig extraction failed')) {
        errorMessage = 'YouTube extraction failed due to signature decryption issues.';
        suggestion = 'This is likely due to recent YouTube changes. Please try a different video or try again later.';
      }
      else if (errorMessage.includes('This video is not available')) {
        errorMessage = 'This video is not available for extraction.';
        suggestion = 'The video may be private, region-restricted, or removed. Please try a different video.';
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to extract audio from YouTube',
        details: errorMessage,
        suggestion: suggestion
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