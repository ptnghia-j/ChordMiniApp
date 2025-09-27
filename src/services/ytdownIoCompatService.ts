/**
 * YTDown.io Compatibility Service
 * 
 * This service provides ytdown.io integration with a compatibility
 * layer for existing audio extraction workflows.
 */

import { YtdownIoAudioService, YtdownIoResult } from './ytdownIoAudioService';

// Interface matching downr.org response format
export interface DownrCompatAudioFormat {
  formatId: number;
  label: string;
  type: 'audio';
  ext: string;
  url: string;
  bitrate: number;
  audioQuality: string;
  audioSampleRate: string;
  mimeType: string;
  duration: number;
  quality: string;
  extension: string;
}

export interface DownrCompatResponse {
  title: string;
  duration: number;
  medias: DownrCompatAudioFormat[];
}

export interface DownrCompatExtractionResult {
  success: boolean;
  title?: string;
  duration?: number;
  selectedFormat?: DownrCompatAudioFormat;
  allFormats?: DownrCompatAudioFormat[];
  audioUrl?: string;
  directDownloadUrl?: string; // Direct URL for client-side download (Vercel-optimized)
  audioBuffer?: ArrayBuffer;
  error?: string;
  extractionTime: number;
  downloadTime?: number;
}

export class YtdownIoCompatService {
  private ytdownService: YtdownIoAudioService;

  constructor() {
    this.ytdownService = new YtdownIoAudioService();
  }

  /**
   * Extract audio metadata (compatible with downr.org API)
   */
  async extractAudio(youtubeUrl: string): Promise<DownrCompatExtractionResult> {
    const startTime = performance.now();

    try {
      console.log(`[YtdownIoCompat] Starting extraction: ${youtubeUrl}`);

      // Extract using ytdown.io
      const result = await this.ytdownService.extractAudio(youtubeUrl, '128K');

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'ytdown.io extraction failed',
          extractionTime: performance.now() - startTime
        };
      }

      // Convert ytdown.io response to downr.org compatible format
      const compatFormats = this.convertToDownrFormat(result);
      
      // Select best format (prefer M4A 128K)
      const bestFormat = this.selectBestAudioFormat(compatFormats);

      const extractionTime = performance.now() - startTime;

      // Get direct download URL for Vercel optimization
      let directDownloadUrl: string | undefined;
      try {
        directDownloadUrl = await this.getDirectDownloadUrl(bestFormat.url);
        console.log(`🔗 [YtdownIoCompat] Direct download URL obtained`);
      } catch (error) {
        console.warn(`⚠️ [YtdownIoCompat] Could not get direct URL: ${error}`);
        // Continue without direct URL - fallback to original URL
      }

      console.log(`✅ [YtdownIoCompat] Audio extraction successful`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Duration: ${result.duration}`);
      console.log(`   Selected format: ${bestFormat.ext} - ${bestFormat.bitrate}kbps`);
      console.log(`   Available formats: ${compatFormats.length}`);
      console.log(`   Extraction time: ${extractionTime.toFixed(2)}ms`);
      console.log(`   Direct URL available: ${directDownloadUrl ? 'Yes' : 'No'}`);

      return {
        success: true,
        title: result.title || 'Unknown Title',
        duration: this.parseDuration(result.duration || '0:00'),
        selectedFormat: bestFormat,
        allFormats: compatFormats,
        audioUrl: bestFormat.url,
        directDownloadUrl, // Vercel-optimized direct URL
        extractionTime
      };

    } catch (error) {
      const extractionTime = performance.now() - startTime;
      console.error('[YtdownIoCompat] Error:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        extractionTime
      };
    }
  }

  /**
   * Get direct download URL (Vercel-optimized - no file download in serverless)
   * Handles ytdown.io's two-step process: status check → return direct URL
   */
  async getDirectDownloadUrl(audioUrl: string): Promise<string> {
    const startTime = performance.now();

    try {
      console.log(`🔗 [YtdownIoCompat] Getting direct download URL from: ${audioUrl}`);

      // Step 1: Get the actual download URL from ytdown.io status endpoint
      const statusResponse = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
        }
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status} ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();

      if (!statusData.fileUrl) {
        throw new Error(`No download URL found in response: ${JSON.stringify(statusData)}`);
      }

      const processingTime = performance.now() - startTime;
      console.log(`✅ [YtdownIoCompat] Direct URL obtained successfully`);
      console.log(`   Direct download URL: ${statusData.fileUrl}`);
      console.log(`   Processing time: ${processingTime.toFixed(2)}ms`);

      return statusData.fileUrl;

    } catch (error) {
      console.error('[YtdownIoCompat] Failed to get direct URL:', error);
      throw error;
    }
  }

  /**
   * Download audio file from URL (compatible with downr.org API)
   * ⚠️ WARNING: This method downloads large files in serverless functions
   * Use getDirectDownloadUrl() for Vercel deployment to avoid timeouts
   */
  async downloadAudio(audioUrl: string): Promise<ArrayBuffer> {
    const startTime = performance.now();

    try {
      console.log(`📥 [YtdownIoCompat] Starting audio download from: ${audioUrl}`);
      console.log(`⚠️  [YtdownIoCompat] WARNING: Downloading large files in serverless may cause timeouts`);

      // Get the direct download URL first
      const directUrl = await this.getDirectDownloadUrl(audioUrl);

      // Download the actual audio file with timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for Vercel

      const downloadResponse = await fetch(directUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
        }
      });

      clearTimeout(timeoutId);

      if (!downloadResponse.ok) {
        throw new Error(`Download failed: ${downloadResponse.status} ${downloadResponse.statusText}`);
      }

      const audioBuffer = await downloadResponse.arrayBuffer();
      const downloadTime = performance.now() - startTime;

      console.log(`✅ [YtdownIoCompat] Audio download successful`);
      console.log(`   File size: ${(audioBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   Download time: ${downloadTime.toFixed(2)}ms`);

      return audioBuffer;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[YtdownIoCompat] Download timeout - file too large for serverless');
        throw new Error('Download timeout: File too large for serverless environment. Use direct URL instead.');
      }
      console.error('[YtdownIoCompat] Download failed:', error);
      throw error;
    }
  }

  /**
   * Convert ytdown.io response to downr.org compatible format
   */
  private convertToDownrFormat(ytdownResult: YtdownIoResult): DownrCompatAudioFormat[] {
    if (!ytdownResult.audioFormats) {
      return [];
    }

    return ytdownResult.audioFormats.map((format, index) => ({
      formatId: index + 1,
      label: `${format.extension} ${format.quality}`,
      type: 'audio' as const,
      ext: format.extension.toLowerCase(),
      url: format.downloadUrl,
      bitrate: this.qualityToBitrate(format.quality),
      audioQuality: format.quality,
      audioSampleRate: '44100',
      mimeType: format.extension === 'M4A' ? 'audio/mp4' : 'audio/mpeg',
      duration: this.parseDuration(ytdownResult.duration || '0:00'),
      quality: format.quality,
      extension: format.extension.toLowerCase()
    }));
  }

  /**
   * Select the best audio format from available options
   * Prioritizes M4A for quality, then falls back to other formats
   */
  private selectBestAudioFormat(formats: DownrCompatAudioFormat[]): DownrCompatAudioFormat {
    // Preference order: M4A 128K > M4A 48K > others
    const formatPriority = ['m4a', 'mp3', 'webm', 'opus'];

    // Try to find formats in priority order
    for (const preferredExt of formatPriority) {
      const matchingFormats = formats.filter(f => f.ext === preferredExt);
      if (matchingFormats.length > 0) {
        // Sort by bitrate (highest first)
        matchingFormats.sort((a, b) => b.bitrate - a.bitrate);
        console.log(`🎵 [YtdownIoCompat] Selected ${preferredExt.toUpperCase()} format`);
        return matchingFormats[0];
      }
    }

    // Fallback to first available format
    return formats[0];
  }

  /**
   * Convert quality string to bitrate number
   */
  private qualityToBitrate(quality: string): number {
    const match = quality.match(/(\d+)K/);
    return match ? parseInt(match[1]) : 128;
  }

  /**
   * Parse duration string (MM:SS) to seconds
   */
  private parseDuration(duration: string): number {
    const parts = duration.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return 0;
  }

  /**
   * Test if the service is working correctly
   */
  async testService(youtubeUrl: string): Promise<{
    success: boolean;
    extractionWorked: boolean;
    downloadWorked: boolean;
    formatCount: number;
    selectedFormat?: string;
    error?: string;
  }> {
    try {
      // Test extraction
      const extractResult = await this.extractAudio(youtubeUrl);
      
      if (!extractResult.success) {
        return {
          success: false,
          extractionWorked: false,
          downloadWorked: false,
          formatCount: 0,
          error: extractResult.error
        };
      }

      // Test download URL accessibility
      const downloadWorked = extractResult.selectedFormat ? 
        await this.ytdownService.testDownloadUrl(extractResult.selectedFormat.url) : false;

      return {
        success: extractResult.success && downloadWorked,
        extractionWorked: extractResult.success,
        downloadWorked,
        formatCount: extractResult.allFormats?.length || 0,
        selectedFormat: extractResult.selectedFormat ? 
          `${extractResult.selectedFormat.ext} ${extractResult.selectedFormat.quality}` : undefined
      };

    } catch (error) {
      return {
        success: false,
        extractionWorked: false,
        downloadWorked: false,
        formatCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    return {
      name: 'YTDown.io Compatibility Service',
      description: 'Drop-in replacement for downr.org using ytdown.io backend',
      features: [
        'Compatible with existing downr.org API contracts',
        'Reliable ytdown.io backend (no 403 errors)',
        'M4A format support with high quality',
        'Datacenter IP compatibility'
      ],
      formats: {
        supported: ['M4A 48K', 'M4A 128K'],
        preferred: 'M4A 128K',
        fallback: 'M4A 48K'
      }
    };
  }
}
