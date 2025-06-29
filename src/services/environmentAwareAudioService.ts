/**
 * Environment-Aware Audio Processing Service
 * 
 * This service automatically switches between QuickTube (production) and yt-dlp (development)
 * based on the current environment, while maintaining the same interface and filename
 * generation algorithm for both approaches.
 */

import { detectEnvironment, getAudioProcessingStrategy, logEnvironmentConfig } from '@/utils/environmentDetection';
import { QuickTubeFilenameGenerator } from './quickTubeFilenameGenerator';
import { ytDlpService } from './ytDlpService';

export interface AudioProcessingResult {
  success: boolean;
  audioUrl?: string;
  filename?: string;
  title?: string;
  duration?: number;
  strategy?: 'quicktube' | 'ytdlp' | 'auto';
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
      if (strategy === 'ytdlp') {
        return await this.getAudioUrlWithYtDlp(videoUrl, videoId, title);
      } else {
        return await this.getAudioUrlWithQuickTube(videoUrl, videoId, title);
      }
    } catch (error) {
      console.error(`❌ Audio processing failed with ${strategy}:`, error);
      
      // Try fallback strategy if available
      const fallbackStrategy = strategy === 'quicktube' ? 'ytdlp' : 'quicktube';
      console.log(`🔄 Attempting fallback to ${fallbackStrategy}...`);
      
      try {
        if (fallbackStrategy === 'ytdlp') {
          return await this.getAudioUrlWithYtDlp(videoUrl, videoId, title);
        } else {
          return await this.getAudioUrlWithQuickTube(videoUrl, videoId, title);
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
   * Get audio URL using QuickTube (production strategy)
   */
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
        // Test QuickTube with a known video
        const testResult = await this.getAudioUrlWithQuickTube(
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
