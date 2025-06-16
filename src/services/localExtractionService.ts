import { executeYtDlp, isYtDlpAvailable } from '@/utils/ytdlp-utils';
import { uploadAudioFile, saveAudioFileMetadata } from '@/services/firebaseStorageService';
import { localCacheService } from '@/services/localCacheService';
import fs from 'fs/promises';
import path from 'path';

/**
 * Local Audio Extraction Service for Development
 * 
 * This service handles YouTube audio extraction using local yt-dlp
 * for development environments to reduce costs and improve speed.
 */

export interface LocalExtractionResult {
  success: boolean;
  audioUrl: string;
  title?: string;
  duration?: number;
  fromCache?: boolean;
  error?: string;
}

export class LocalExtractionService {
  private static instance: LocalExtractionService;
  
  public static getInstance(): LocalExtractionService {
    if (!LocalExtractionService.instance) {
      LocalExtractionService.instance = new LocalExtractionService();
    }
    return LocalExtractionService.instance;
  }

  /**
   * Check if local extraction is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await isYtDlpAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Extract audio from YouTube video using local yt-dlp
   */
  async extractAudio(videoId: string, getInfoOnly: boolean = false): Promise<LocalExtractionResult> {
    try {
      console.log(`Local extraction: Processing ${videoId}, getInfoOnly=${getInfoOnly}`);

      // Check if yt-dlp is available
      if (!await this.isAvailable()) {
        throw new Error('yt-dlp is not available for local extraction');
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (getInfoOnly) {
        // Get video info only
        return await this.getVideoInfo(youtubeUrl, videoId);
      } else {
        // Extract audio
        return await this.extractAudioFile(youtubeUrl, videoId);
      }

    } catch (error) {
      console.error('Local extraction failed:', error);
      return {
        success: false,
        audioUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get video information using yt-dlp
   */
  private async getVideoInfo(youtubeUrl: string, videoId: string): Promise<LocalExtractionResult> {
    try {
      console.log(`Getting video info for: ${youtubeUrl}`);

      const { stdout } = await executeYtDlp(
        `--dump-single-json --no-warnings --no-check-certificate "${youtubeUrl}"`,
        30000
      );

      if (!stdout || stdout.trim() === '') {
        throw new Error('Empty response from yt-dlp');
      }

      const videoInfo = JSON.parse(stdout);

      if (!videoInfo || typeof videoInfo !== 'object') {
        throw new Error('Invalid video info structure received');
      }

      // Validate video
      if (videoInfo.is_live) {
        throw new Error('Live streams are not supported');
      }

      if (videoInfo.duration && videoInfo.duration > 3600) {
        throw new Error('Video is too long for processing (max 1 hour)');
      }

      const title = videoInfo.title || videoInfo.fulltitle || `YouTube Video ${videoId}`;
      const duration = videoInfo.duration || 0;

      console.log(`Successfully got video info: "${title}" (${duration}s)`);

      return {
        success: true,
        audioUrl: '', // Not needed for info-only
        title,
        duration
      };

    } catch (error) {
      console.error('Failed to get video info:', error);
      throw error;
    }
  }

  /**
   * Extract audio file using yt-dlp
   */
  private async extractAudioFile(youtubeUrl: string, videoId: string): Promise<LocalExtractionResult> {
    try {
      console.log(`Extracting audio for: ${youtubeUrl}`);

      // Create temp directory for downloads
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      // Use a simpler approach - first get info, then download
      console.log('Step 1: Getting video info...');
      const infoResult = await this.getVideoInfo(youtubeUrl, videoId);

      if (!infoResult.success) {
        throw new Error(infoResult.error || 'Failed to get video info');
      }

      const title = infoResult.title || `YouTube Video ${videoId}`;
      const duration = infoResult.duration || 0;

      console.log('Step 2: Downloading and extracting audio...');

      // Use a more reliable extraction approach
      const outputTemplate = path.join(tempDir, `${videoId}`);

      try {
        // Try direct audio extraction with fallback
        await executeYtDlp(
          `--extract-audio --audio-format mp3 --audio-quality 192K --output "${outputTemplate}.%(ext)s" --no-playlist "${youtubeUrl}"`,
          120000 // 2 minutes timeout
        );
      } catch (extractError) {
        console.warn('Direct extraction failed, trying alternative method:', extractError);

        // Fallback: download video first, then extract audio
        await executeYtDlp(
          `--format "best[height<=720]" --output "${outputTemplate}.%(ext)s" --no-playlist "${youtubeUrl}"`,
          120000
        );

        // Find the downloaded video file
        const tempFiles = await fs.readdir(tempDir);
        const videoFile = tempFiles.find(file => file.startsWith(videoId) && !file.endsWith('.mp3'));

        if (videoFile) {
          const videoPath = path.join(tempDir, videoFile);
          const audioPath = path.join(tempDir, `${videoId}.mp3`);

          // Extract audio from video using ffmpeg (if available) or yt-dlp
          try {
            await executeYtDlp(
              `--extract-audio --audio-format mp3 --audio-quality 192K --output "${audioPath}" "${videoPath}"`,
              60000
            );
          } catch {
            // If that fails, just rename if it's already an audio file
            if (videoFile.includes('audio') || videoFile.endsWith('.m4a') || videoFile.endsWith('.webm')) {
              await fs.rename(videoPath, audioPath);
            } else {
              throw new Error('Could not extract audio from downloaded file');
            }
          }

          // Clean up video file
          try {
            await fs.unlink(videoPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      // Find the extracted audio file
      const audioFile = path.join(tempDir, `${videoId}.mp3`);

      try {
        await fs.access(audioFile);
        console.log(`Audio file created successfully: ${audioFile}`);
      } catch {
        // Try to find any audio file with the video ID
        const tempFiles = await fs.readdir(tempDir);
        const audioFiles = tempFiles.filter(file =>
          file.startsWith(videoId) && (file.endsWith('.mp3') || file.endsWith('.m4a') || file.endsWith('.webm'))
        );

        if (audioFiles.length > 0) {
          const foundFile = path.join(tempDir, audioFiles[0]);
          if (!foundFile.endsWith('.mp3')) {
            // Rename to .mp3
            await fs.rename(foundFile, audioFile);
          }
        } else {
          throw new Error(`Audio file was not created. Expected: ${audioFile}`);
        }
      }

      // Read the audio file
      const audioBuffer = await fs.readFile(audioFile);
      console.log(`Read audio file: ${audioBuffer.byteLength} bytes`);

      // For local development, serve directly from temp directory
      const localUrl = `/api/temp/${videoId}.mp3`;

      console.log(`Using local URL for development: ${localUrl}`);

      // Add to local cache
      try {
        await localCacheService.addToCache(videoId, localUrl, audioFile, {
          title,
          duration,
          fileSize: audioBuffer.byteLength
        });
        console.log('Successfully added to local cache');
      } catch (cacheError) {
        console.warn('Failed to add to local cache (continuing anyway):', cacheError);
      }

      // Try to save metadata to Firebase (but don't fail if it doesn't work)
      try {
        await saveAudioFileMetadata({
          videoId,
          audioUrl: localUrl,
          storagePath: `local/${videoId}.mp3`,
          fileSize: audioBuffer.byteLength,
          duration
        });
        console.log('Successfully saved metadata to Firestore');
      } catch (metadataError) {
        console.warn('Failed to save metadata to Firestore (continuing anyway):', metadataError);
      }

      // Don't clean up temp file since we're serving it directly
      console.log(`Successfully extracted audio for ${videoId}, serving from temp directory`);

      return {
        success: true,
        audioUrl: localUrl,
        title,
        duration,
        fromCache: false
      };

    } catch (error) {
      console.error('Failed to extract audio file:', error);
      throw error;
    }
  }
}

export const localExtractionService = LocalExtractionService.getInstance();
