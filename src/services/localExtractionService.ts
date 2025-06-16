import { executeYtDlp, isYtDlpAvailable } from '@/utils/ytdlp-utils';
import { uploadAudioFile, saveAudioFileMetadata } from '@/services/firebaseStorageService';
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

      const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);

      // Extract audio using yt-dlp
      const { stdout } = await executeYtDlp(
        `--extract-audio --audio-format mp3 --audio-quality 192K --output "${outputTemplate}" --print-json "${youtubeUrl}"`,
        120000 // 2 minutes timeout
      );

      // Parse the JSON output to get file info
      const lines = stdout.trim().split('\n');
      const jsonLine = lines.find(line => line.startsWith('{'));
      
      if (!jsonLine) {
        throw new Error('No JSON output from yt-dlp');
      }

      const videoInfo = JSON.parse(jsonLine);
      const title = videoInfo.title || `YouTube Video ${videoId}`;
      const duration = videoInfo.duration || 0;

      // Find the extracted audio file
      const audioFile = path.join(tempDir, `${videoId}.mp3`);
      
      try {
        await fs.access(audioFile);
      } catch {
        throw new Error('Audio file was not created');
      }

      // Read the audio file
      const audioBuffer = await fs.readFile(audioFile);
      
      // Upload to Firebase Storage for caching
      const uploadResult = await uploadAudioFile(videoId, audioBuffer);
      
      if (!uploadResult) {
        // Fallback: serve from local temp directory
        const localUrl = `/temp/${videoId}.mp3`;
        
        // Save metadata for caching
        await saveAudioFileMetadata({
          videoId,
          audioUrl: localUrl,
          storagePath: `local/${videoId}.mp3`,
          fileSize: audioBuffer.byteLength,
          duration
        });

        return {
          success: true,
          audioUrl: localUrl,
          title,
          duration,
          fromCache: false
        };
      }

      // Save metadata with Firebase URLs
      await saveAudioFileMetadata({
        videoId,
        audioUrl: uploadResult.audioUrl,
        videoUrl: uploadResult.videoUrl,
        storagePath: uploadResult.storagePath,
        videoStoragePath: uploadResult.videoStoragePath,
        fileSize: audioBuffer.byteLength,
        duration
      });

      // Clean up temp file
      try {
        await fs.unlink(audioFile);
      } catch (cleanupError) {
        console.warn('Failed to clean up temp file:', cleanupError);
      }

      console.log(`Successfully extracted and uploaded audio for ${videoId}`);

      return {
        success: true,
        audioUrl: uploadResult.audioUrl,
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
