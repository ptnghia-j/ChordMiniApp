/**
 * yt-dlp Service for Development Environment
 * 
 * This service provides yt-dlp integration for local development, using the same
 * precise filename generation algorithm we perfected for QuickTube compatibility.
 * 
 * Features:
 * - Uses our QuickTube-compatible filename generation
 * - Provides reliable local development experience
 * - Maintains backward compatibility with existing workflows
 * - Supports the same video formats and quality as QuickTube
 */

import { QuickTubeFilenameGenerator } from './quickTubeFilenameGenerator';

export interface YtDlpDownloadResult {
  success: boolean;
  audioUrl?: string;
  filename?: string;
  title?: string;
  duration?: number;
  fileSize?: number;
  localPath?: string;
  error?: string;
}

export interface YtDlpExtractResult {
  success: boolean;
  title?: string;
  duration?: number;
  formats?: Array<{
    format_id: string;
    ext: string;
    quality: string;
    filesize?: number;
  }>;
  error?: string;
}

class YtDlpService {
  private filenameGenerator: QuickTubeFilenameGenerator;
  private readonly baseUrl: string;

  constructor() {
    this.filenameGenerator = new QuickTubeFilenameGenerator();
    this.baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Extract video information using yt-dlp (development only)
   */
  async extractVideoInfo(videoUrl: string): Promise<YtDlpExtractResult> {
    try {
      console.log(`🔍 Extracting video info with yt-dlp: ${videoUrl}`);

      const response = await fetch(`${this.baseUrl}/api/ytdlp/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      });

      if (!response.ok) {
        throw new Error(`yt-dlp extraction failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Video info extracted: ${result.title} (${result.duration}s)`);
      }

      return result;

    } catch (error) {
      console.error('❌ yt-dlp video info extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Download audio using yt-dlp with QuickTube-compatible filename
   */
  async downloadAudio(videoUrl: string, videoId?: string): Promise<YtDlpDownloadResult> {
    try {
      console.log(`🔄 Downloading audio with yt-dlp: ${videoUrl}`);

      // First extract video info to get title and video ID
      const videoInfo = await this.extractVideoInfo(videoUrl);
      
      if (!videoInfo.success || !videoInfo.title) {
        throw new Error('Failed to extract video information');
      }

      // Extract video ID from URL if not provided
      const extractedVideoId = videoId || this.extractVideoIdFromUrl(videoUrl);
      
      if (!extractedVideoId) {
        throw new Error('Could not extract video ID from URL');
      }

      // Generate QuickTube-compatible filename
      const expectedFilename = this.filenameGenerator.generateFilename(videoInfo.title, extractedVideoId)[0].filename;
      
      console.log(`🔧 Generated expected filename: ${expectedFilename}`);

      // Download audio with specific filename
      const response = await fetch(`${this.baseUrl}/api/ytdlp/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: videoUrl,
          filename: expectedFilename,
          format: 'mp3'
        }),
      });

      if (!response.ok) {
        throw new Error(`yt-dlp download failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Audio downloaded: ${result.filename}`);
        console.log(`📁 Audio URL: ${result.audioUrl}`);
      }

      return {
        ...result,
        filename: expectedFilename // Ensure we return the expected filename
      };

    } catch (error) {
      console.error('❌ yt-dlp audio download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
   * Get audio URL for a video (using yt-dlp in development)
   */
  async getAudioUrl(videoUrl: string, videoId?: string): Promise<string | null> {
    const result = await this.downloadAudio(videoUrl, videoId);
    return result.success ? result.audioUrl || null : null;
  }

  /**
   * Check if yt-dlp service is available (development environment check)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ytdlp/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      return response.ok;
    } catch (error) {
      console.warn('⚠️ yt-dlp service not available:', error);
      return false;
    }
  }

  /**
   * Test the yt-dlp service with a known video
   */
  async testService(): Promise<boolean> {
    try {
      console.log('🧪 Testing yt-dlp service...');
      
      // Test with a short, known video
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll (short video)
      const result = await this.extractVideoInfo(testUrl);
      
      if (result.success) {
        console.log('✅ yt-dlp service test passed');
        return true;
      } else {
        console.warn('⚠️ yt-dlp service test failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ yt-dlp service test error:', error);
      return false;
    }
  }

  /**
   * Get service status and configuration
   */
  getServiceInfo() {
    return {
      service: 'yt-dlp',
      environment: 'development',
      baseUrl: this.baseUrl,
      filenameCompatibility: 'QuickTube-compatible',
      features: [
        'Video info extraction',
        'Audio download',
        'Precise filename generation',
        'Local development support'
      ]
    };
  }
}

export const ytDlpService = new YtDlpService();
