/**
 * Downr.org Audio Service
 * Integrates with downr.org API for YouTube audio extraction
 */

export interface DownrAudioFormat {
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

export interface DownrResponse {
  title: string;
  duration: number;
  medias: DownrAudioFormat[];
}

export interface DownrExtractionResult {
  success: boolean;
  title?: string;
  duration?: number;
  selectedFormat?: DownrAudioFormat;
  allFormats?: DownrAudioFormat[];
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  error?: string;
  extractionTime: number;
  downloadTime?: number;
}

export class DownrAudioService {
  private readonly API_ENDPOINT = 'https://downr.org/.netlify/functions/download';
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly DOWNLOAD_TIMEOUT = 60000; // 60 seconds

  /**
   * Extract audio URL from YouTube video
   */
  async extractAudioUrl(youtubeUrl: string): Promise<DownrExtractionResult> {
    const startTime = performance.now();
    
    try {
      console.log(`🎵 Extracting audio from: ${youtubeUrl}`);
      
      // Validate YouTube URL
      if (!this.isValidYouTubeUrl(youtubeUrl)) {
        throw new Error('Invalid YouTube URL format');
      }
      
      // Make request to downr.org API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);
      
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          format: 'audio'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`downr.org API failed: ${response.status} ${response.statusText}`);
      }
      
      const data: DownrResponse = await response.json();
      
      if (!data.medias || !Array.isArray(data.medias)) {
        throw new Error('No media found in response');
      }
      
      // Filter audio formats
      const audioFormats = data.medias.filter(media => media.type === 'audio');
      
      if (audioFormats.length === 0) {
        throw new Error('No audio formats found');
      }
      
      // Select best format (prefer M4A with highest bitrate)
      const bestFormat = this.selectBestAudioFormat(audioFormats);
      
      const extractionTime = performance.now() - startTime;
      
      console.log(`✅ Audio extraction successful`);
      console.log(`   Title: ${data.title}`);
      console.log(`   Duration: ${data.duration}s`);
      console.log(`   Selected format: ${bestFormat.ext} - ${Math.round(bestFormat.bitrate/1000)}kbps`);
      console.log(`   Available formats: ${audioFormats.length}`);
      console.log(`   Extraction time: ${extractionTime.toFixed(2)}ms`);
      
      return {
        success: true,
        title: data.title,
        duration: data.duration,
        selectedFormat: bestFormat,
        allFormats: audioFormats,
        audioUrl: bestFormat.url,
        extractionTime
      };
      
    } catch (error) {
      const extractionTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
      
      console.error('❌ Audio extraction failed:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        extractionTime
      };
    }
  }

  /**
   * Download audio file from URL
   */
  async downloadAudio(audioUrl: string): Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string; downloadTime: number }> {
    const startTime = performance.now();
    
    try {
      console.log(`📥 Downloading audio from URL...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.DOWNLOAD_TIMEOUT);
      
      const response = await fetch(audioUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      const downloadTime = performance.now() - startTime;
      
      console.log(`✅ Audio download completed`);
      console.log(`   Size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Download time: ${downloadTime.toFixed(2)}ms`);
      
      return {
        success: true,
        buffer,
        downloadTime
      };
      
    } catch (error) {
      const downloadTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown download error';
      
      console.error('❌ Audio download failed:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        downloadTime
      };
    }
  }

  /**
   * Extract and download audio in one step
   */
  async extractAndDownloadAudio(youtubeUrl: string): Promise<DownrExtractionResult> {
    const extractionResult = await this.extractAudioUrl(youtubeUrl);
    
    if (!extractionResult.success || !extractionResult.audioUrl) {
      return extractionResult;
    }
    
    const downloadResult = await this.downloadAudio(extractionResult.audioUrl);
    
    return {
      ...extractionResult,
      success: downloadResult.success,
      audioBuffer: downloadResult.buffer,
      downloadTime: downloadResult.downloadTime,
      error: downloadResult.error || extractionResult.error
    };
  }

  /**
   * Select the best audio format from available options
   * Prioritizes Opus for accurate timing and good quality
   */
  private selectBestAudioFormat(formats: DownrAudioFormat[]): DownrAudioFormat {
    // Preference order:
    // 1. Opus format (best timing accuracy, avoids M4A duration issues)
    // 2. WebM format (good alternative)
    // 3. MP3 format (widely compatible)
    // 4. M4A format (last resort due to timing issues)

    const formatPriority = ['opus', 'webm', 'mp3', 'm4a'];

    // Try to find formats in priority order
    for (const preferredExt of formatPriority) {
      const matchingFormats = formats.filter(f => f.ext === preferredExt);
      if (matchingFormats.length > 0) {
        console.log(`🎵 Selected ${preferredExt.toUpperCase()} format for accurate timing`);

        // Among matching formats, select the best quality/bitrate
        return matchingFormats.reduce((best, current) => {
          // Prefer higher bitrate
          if (current.bitrate > best.bitrate) {
            return current;
          }

          // If same bitrate, prefer better quality
          if (current.bitrate === best.bitrate) {
            const qualityOrder = ['AUDIO_QUALITY_HIGH', 'AUDIO_QUALITY_MEDIUM', 'AUDIO_QUALITY_LOW', 'AUDIO_QUALITY_ULTRALOW'];
            const currentQualityIndex = qualityOrder.indexOf(current.audioQuality);
            const bestQualityIndex = qualityOrder.indexOf(best.audioQuality);

            if (currentQualityIndex < bestQualityIndex) {
              return current;
            }
          }

          return best;
        });
      }
    }

    // Fallback: select highest bitrate format if no preferred format found
    console.log('⚠️ No preferred format found, selecting highest bitrate');
    return formats.reduce((best, current) =>
      current.bitrate > best.bitrate ? current : best
    );
  }

  /**
   * Validate YouTube URL format
   */
  private isValidYouTubeUrl(url: string): boolean {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)[a-zA-Z0-9_-]{11}/;
    return youtubeRegex.test(url);
  }

  /**
   * Extract video ID from YouTube URL
   */
  extractVideoId(youtubeUrl: string): string | null {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/;
    const match = youtubeUrl.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Get format information for display
   */
  getFormatInfo(format: DownrAudioFormat): {
    displayName: string;
    qualityDescription: string;
    sizeEstimate: string;
  } {
    const bitrateKbps = Math.round(format.bitrate / 1000);
    const qualityMap: Record<string, string> = {
      'AUDIO_QUALITY_HIGH': 'High Quality',
      'AUDIO_QUALITY_MEDIUM': 'Medium Quality',
      'AUDIO_QUALITY_LOW': 'Low Quality',
      'AUDIO_QUALITY_ULTRALOW': 'Ultra Low Quality'
    };
    
    return {
      displayName: `${format.ext.toUpperCase()} (${bitrateKbps}kbps)`,
      qualityDescription: qualityMap[format.audioQuality] || 'Unknown Quality',
      sizeEstimate: this.estimateFileSize(format.bitrate, format.duration)
    };
  }

  /**
   * Estimate file size based on bitrate and duration
   */
  private estimateFileSize(bitrate: number, duration: number): string {
    const sizeBytes = (bitrate * duration) / 8; // Convert bits to bytes
    const sizeMB = sizeBytes / 1024 / 1024;
    
    if (sizeMB < 1) {
      return `${(sizeMB * 1024).toFixed(0)}KB`;
    } else {
      return `${sizeMB.toFixed(1)}MB`;
    }
  }

  /**
   * Check if downr.org service is available
   */
  async checkServiceHealth(): Promise<{ available: boolean; responseTime?: number; error?: string }> {
    const startTime = performance.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Roll for testing
          format: 'audio'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const responseTime = performance.now() - startTime;
      
      return {
        available: response.ok,
        responseTime
      };
      
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        available: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Global instance
export const downrAudioService = new DownrAudioService();
