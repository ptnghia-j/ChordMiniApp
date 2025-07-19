/**
 * Environment-Aware Audio Processing Service
 *
 * Simplified URL-based strategy selection:
 * - Localhost Development: Uses yt-dlp for local development flexibility
 * - Production: Uses YT2MP3 Magic for reliable audio extraction
 * - Automatic fallback between strategies for maximum reliability
 */

import { detectEnvironment, getAudioProcessingStrategy, logEnvironmentConfig } from '@/utils/environmentDetection';
import { yt2mp3MagicService } from './yt2mp3MagicService';
import { QuickTubeFilenameGenerator } from './quickTubeFilenameGenerator';
import { ytDlpService } from './ytDlpService';
// PRESERVED FOR REFERENCE: import { ytMp3GoService } from './ytMp3GoService';

export interface AudioProcessingResult {
  success: boolean;
  audioUrl?: string;
  filename?: string;
  title?: string;
  duration?: number;
  strategy?: 'yt2mp3magic' | 'ytdlp';
  error?: string;
}

export interface VideoSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  channelTitle: string;
}

class EnvironmentAwareAudioService {
  private filenameGenerator: QuickTubeFilenameGenerator;
  private initialized = false;

  constructor() {
    this.filenameGenerator = new QuickTubeFilenameGenerator();
  }

  /**
   * Initialize the service and log environment configuration
   */
  private initialize(): void {
    if (!this.initialized) {
      logEnvironmentConfig();
      this.initialized = true;
    }
  }

  /**
   * Get audio URL for a YouTube video using environment-appropriate strategy
   */
  async getAudioUrl(videoUrl: string, videoId?: string, title?: string): Promise<AudioProcessingResult> {
    this.initialize();
    
    const strategy = getAudioProcessingStrategy();
    console.log(`🔧 Using ${strategy} strategy for audio processing`);

    try {
      if (strategy === 'yt2mp3magic') {
        return await this.getAudioUrlWithYt2mp3Magic(videoUrl, videoId, title);
      } else if (strategy === 'ytdlp') {
        return await this.getAudioUrlWithYtDlp(videoUrl, videoId, title);
      } else {
        // PRESERVED FOR REFERENCE - other strategies
        // } else if (strategy === 'ytmp3go') {
        //   return await this.getAudioUrlWithYtMp3Go(videoUrl, videoId, title);
        // } else {
        //   return await this.getAudioUrlWithQuickTube(videoUrl, videoId, title);
        // }

        // Fallback to YT2MP3 Magic for unknown strategies
        console.log(`⚠️ Unknown strategy ${strategy}, falling back to YT2MP3 Magic`);
        return await this.getAudioUrlWithYt2mp3Magic(videoUrl, videoId, title);
      }
    } catch (error) {
      console.error(`❌ Audio processing failed with ${strategy}:`, error);

      // Try YT2MP3 Magic as fallback for all strategies
      const fallbackStrategy = 'yt2mp3magic';
      console.log(`🔄 Attempting fallback to ${fallbackStrategy}...`);

      try {
        if (fallbackStrategy === 'yt2mp3magic') {
          return await this.getAudioUrlWithYt2mp3Magic(videoUrl, videoId, title);
        } else if (fallbackStrategy === 'ytdlp') {
          return await this.getAudioUrlWithYtDlp(videoUrl, videoId, title);
        } else {
          // PRESERVED FOR REFERENCE - QuickTube fallback
          // return await this.getAudioUrlWithQuickTube(videoUrl, videoId, title);

          // Default to YT2MP3 Magic for unknown fallback strategies
          return await this.getAudioUrlWithYt2mp3Magic(videoUrl, videoId, title);
        }
      } catch (fallbackError) {
        console.error(`❌ Fallback strategy also failed:`, fallbackError);
        return {
          success: false,
          error: `Both ${strategy} and ${fallbackStrategy} strategies failed`,
          strategy
        };
      }
    }
  }

  /**
   * Get audio URL using YT2MP3 Magic (primary strategy)
   */
  private async getAudioUrlWithYt2mp3Magic(videoUrl: string, videoId?: string, title?: string): Promise<AudioProcessingResult> {
    try {
      // Extract video ID if not provided
      const extractedVideoId = videoId || this.extractVideoIdFromUrl(videoUrl);

      if (!extractedVideoId) {
        throw new Error('Could not extract video ID from URL');
      }

      // Use provided title or default
      const videoTitle = title || 'Unknown Title';

      console.log(`🎵 YT2MP3 Magic processing: ${extractedVideoId} ("${videoTitle}")`);

      // Extract audio using YT2MP3 Magic service
      const extractionResult = await yt2mp3MagicService.extractAudio(extractedVideoId, videoTitle);

      if (extractionResult.success && extractionResult.audioStream) {
        // For this service, we return the stream info
        // The actual Firebase upload would be handled by the calling service
        return {
          success: true,
          audioUrl: 'stream://yt2mp3magic', // Placeholder - actual upload handled elsewhere
          filename: extractionResult.filename,
          title: extractionResult.title || videoTitle,
          duration: extractionResult.duration,
          strategy: 'yt2mp3magic'
        };
      } else {
        throw new Error(extractionResult.error || 'YT2MP3 Magic extraction failed');
      }

    } catch (error) {
      console.error('❌ YT2MP3 Magic processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'YT2MP3 Magic processing failed',
        strategy: 'yt2mp3magic'
      };
    }
  }

  /**
   * PRESERVED FOR REFERENCE - Get audio URL using QuickTube (production strategy)
   * This method has been replaced by YT2MP3 Magic service
   */
  /*
  private async getAudioUrlWithQuickTube(videoUrl: string, videoId?: string, title?: string): Promise<AudioProcessingResult> {
    try {
      // Extract video ID if not provided
      const extractedVideoId = videoId || this.extractVideoIdFromUrl(videoUrl);
      
      if (!extractedVideoId) {
        throw new Error('Could not extract video ID from URL');
      }

      // If title is not provided, we'll need to get it from YouTube search
      if (!title) {
        // For QuickTube, we typically get title from search results
        // This is a simplified version - in practice, you'd integrate with your search service
        title = 'Unknown Title';
      }

      // Generate QuickTube-compatible filename
      const filenameResults = this.filenameGenerator.generateFilename(title, extractedVideoId);
      const expectedFilename = filenameResults[0].filename;
      const quickTubeUrl = filenameResults[0].downloadUrl;

      console.log(`🔧 QuickTube URL: ${quickTubeUrl}`);
      console.log(`📁 Expected filename: ${expectedFilename}`);

      // Verify the file exists at QuickTube
      const response = await fetch(quickTubeUrl, { method: 'HEAD' });
      
      if (response.ok) {
        return {
          success: true,
          audioUrl: quickTubeUrl,
          filename: expectedFilename,
          title,
          strategy: 'quicktube'
        };
      } else {
        throw new Error(`QuickTube file not found: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      console.error('❌ QuickTube processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'QuickTube processing failed',
        strategy: 'quicktube'
      };
    }
  }
  */

  /**
   * Get audio URL using yt-dlp (development strategy)
   */
  private async getAudioUrlWithYtDlp(videoUrl: string, videoId?: string, title?: string): Promise<AudioProcessingResult> {
    try {
      // Check if yt-dlp service is available
      const isAvailable = await ytDlpService.isAvailable();
      
      if (!isAvailable) {
        throw new Error('yt-dlp service is not available. Please install yt-dlp for development.');
      }

      // Extract video ID if not provided
      const extractedVideoId = videoId || this.extractVideoIdFromUrl(videoUrl);
      
      if (!extractedVideoId) {
        throw new Error('Could not extract video ID from URL');
      }

      // Get video info if title is not provided
      let videoTitle = title;
      if (!videoTitle) {
        const videoInfo = await ytDlpService.extractVideoInfo(videoUrl);
        if (videoInfo.success && videoInfo.title) {
          videoTitle = videoInfo.title;
        } else {
          throw new Error('Could not extract video title');
        }
      }

      // Download audio using yt-dlp
      const downloadResult = await ytDlpService.downloadAudio(videoUrl, extractedVideoId);
      
      if (downloadResult.success) {
        return {
          success: true,
          audioUrl: downloadResult.audioUrl,
          filename: downloadResult.filename,
          title: videoTitle,
          duration: downloadResult.duration,
          strategy: 'ytdlp'
        };
      } else {
        throw new Error(downloadResult.error || 'yt-dlp download failed');
      }

    } catch (error) {
      console.error('❌ yt-dlp processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'yt-dlp processing failed',
        strategy: 'ytdlp'
      };
    }
  }

  /**
   * PRESERVED FOR REFERENCE - Get audio URL using yt-mp3-go (Vercel production strategy)
   * This method has been replaced by YT2MP3 Magic service
   */
  /*
  private async getAudioUrlWithYtMp3Go(videoUrl: string, videoId?: string, title?: string): Promise<AudioProcessingResult> {
    try {
      console.log(`🎵 Processing with yt-mp3-go: ${videoUrl}`);

      // Extract video ID if not provided
      const extractedVideoId = videoId || this.extractVideoIdFromUrl(videoUrl);
      if (!extractedVideoId) {
        throw new Error('Could not extract video ID from URL');
      }

      // Use yt-mp3-go service for extraction
      const extractionResult = await ytMp3GoService.extractAudio(extractedVideoId, title);

      if (extractionResult.success) {
        console.log(`✅ yt-mp3-go extraction successful: ${extractionResult.audioUrl}`);

        return {
          success: true,
          audioUrl: extractionResult.audioUrl,
          filename: extractionResult.filename,
          title: extractionResult.title || title,
          duration: extractionResult.duration,
          strategy: 'ytmp3go'
        };
      } else {
        throw new Error(extractionResult.error || 'yt-mp3-go extraction failed');
      }

    } catch (error) {
      console.error('❌ yt-mp3-go processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'yt-mp3-go processing failed',
        strategy: 'ytmp3go'
      };
    }
  }
  */

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoIdFromUrl(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get service status and configuration
   */
  async getServiceStatus() {
    this.initialize();
    
    const env = detectEnvironment();
    const strategy = getAudioProcessingStrategy();
    
    const serviceHealth = {
      quicktube: { available: true, note: 'Always available in production' },
      ytdlp: { available: false, note: 'Development only' }
    };

    // Check yt-dlp availability if in development
    if (env.isDevelopment) {
      const ytdlpAvailable = await ytDlpService.isAvailable();
      serviceHealth.ytdlp = {
        available: ytdlpAvailable,
        note: ytdlpAvailable ? 'Available for development' : 'Not installed or not in PATH'
      };
    }

    return {
      environment: env,
      currentStrategy: strategy,
      services: serviceHealth,
      features: {
        filenameGeneration: 'QuickTube-compatible for both strategies',
        fallback: 'Automatic fallback between strategies',
        caching: env.isProduction
      }
    };
  }

  /**
   * Test the current audio processing strategy
   */
  async testCurrentStrategy(): Promise<boolean> {
    const strategy = getAudioProcessingStrategy();
    
    try {
      if (strategy === 'ytdlp') {
        return await ytDlpService.testService();
      } else {
        // Test YT2MP3 Magic with a known video
        const testResult = await this.getAudioUrlWithYt2mp3Magic(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          'dQw4w9WgXcQ',
          'Rick Astley - Never Gonna Give You Up'
        );
        return testResult.success;
      }
    } catch (error) {
      console.error(`❌ Strategy test failed for ${strategy}:`, error);
      return false;
    }
  }
}

export const environmentAwareAudioService = new EnvironmentAwareAudioService();
