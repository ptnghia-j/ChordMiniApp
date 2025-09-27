/**
 * YtdlCore Audio Service
 * 
 * Vercel-compatible YouTube audio extraction using ytdl-core
 * Designed to work in production serverless environment
 */

export interface YtdlCoreResult {
  success: boolean;
  data?: {
    videoId: string;
    title: string;
    duration: number;
    audioUrl: string;
    mimeType: string;
    audioQuality?: string;
    contentLength?: string;
  };
  error?: string;
  executionTime?: number;
}

export interface YtdlCoreConfig {
  baseUrl: string;
  timeout: number;
  quality: 'highest' | 'lowest' | 'highestaudio' | 'lowestaudio';
  retryAttempts: number;
  retryDelay: number;
}

export class YtdlCoreAudioService {
  private config: YtdlCoreConfig;

  constructor(config?: Partial<YtdlCoreConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
      timeout: config?.timeout || 30000, // 30 seconds
      quality: config?.quality || 'highestaudio',
      retryAttempts: config?.retryAttempts || 2,
      retryDelay: config?.retryDelay || 1000
    };
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.baseUrl;
  }

  /**
   * Check if a URL is a Google Video URL (for routing decisions)
   */
  isGoogleVideoUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('googlevideo.com');
    } catch {
      return false;
    }
  }

  /**
   * Extract audio URL from YouTube video using ytdl-core
   */
  async extractAudio(youtubeUrl: string): Promise<YtdlCoreResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🎵 YtdlCore: Extracting audio from ${youtubeUrl}`);

      // Validate YouTube URL
      if (!this.isValidYouTubeUrl(youtubeUrl)) {
        return {
          success: false,
          error: 'Invalid YouTube URL',
          executionTime: Date.now() - startTime
        };
      }

      // Extract with retry logic
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
        try {
          console.log(`🔄 YtdlCore: Attempt ${attempt}/${this.config.retryAttempts}`);
          
          const result = await this.performExtraction(youtubeUrl);
          
          if (result.success) {
            console.log(`✅ YtdlCore: Success on attempt ${attempt} (${Date.now() - startTime}ms)`);
            return {
              ...result,
              executionTime: Date.now() - startTime
            };
          }
          
          lastError = new Error(result.error || 'Unknown extraction error');
          
        } catch (attemptError: unknown) {
          lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
          console.log(`❌ YtdlCore: Attempt ${attempt} failed: ${lastError.message}`);
          
          // Wait before retry (except on last attempt)
          if (attempt < this.config.retryAttempts) {
            await this.delay(this.config.retryDelay);
          }
        }
      }

      // All attempts failed
      return {
        success: false,
        error: `All ${this.config.retryAttempts} attempts failed. Last error: ${lastError?.message}`,
        executionTime: Date.now() - startTime
      };

    } catch (error: unknown) {
      console.error('❌ YtdlCore: General error:', error);
      return {
        success: false,
        error: `YtdlCore service error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Perform the actual extraction via API call
   */
  private async performExtraction(youtubeUrl: string): Promise<YtdlCoreResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/ytdl-core/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          quality: this.config.quality
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown API error'
        };
      }

      // Extract the audio URL from the selected format
      const audioUrl = result.data?.selectedFormat?.url;
      if (!audioUrl) {
        return {
          success: false,
          error: 'No audio URL found in response'
        };
      }

      return {
        success: true,
        data: {
          videoId: result.data.videoId,
          title: result.data.title,
          duration: result.data.duration,
          audioUrl: audioUrl,
          mimeType: result.data.selectedFormat.mimeType,
          audioQuality: result.data.selectedFormat.audioQuality,
          contentLength: result.data.selectedFormat.contentLength
        }
      };

    } catch (error: unknown) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Test the service with a known video
   */
  async testService(): Promise<YtdlCoreResult> {
    const testUrl = 'https://www.youtube.com/watch?v=SlPhMPnQ58k'; // Maroon 5 - Memories
    console.log('🧪 YtdlCore: Testing service...');
    
    return await this.extractAudio(testUrl);
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    service: string;
    timestamp: string;
    config: Partial<YtdlCoreConfig>;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second health check

      const response = await fetch(`${this.config.baseUrl}/api/ytdl-core/extract`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      return {
        healthy: response.ok,
        service: 'YtdlCore Audio Service',
        timestamp: new Date().toISOString(),
        config: {
          baseUrl: this.config.baseUrl,
          timeout: this.config.timeout,
          quality: this.config.quality
        }
      };

    } catch (error: unknown) {
      return {
        healthy: false,
        service: 'YtdlCore Audio Service',
        timestamp: new Date().toISOString(),
        config: {
          baseUrl: this.config.baseUrl,
          timeout: this.config.timeout,
          quality: this.config.quality
        },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate YouTube URL
   */
  private isValidYouTubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return (
        hostname === 'www.youtube.com' ||
        hostname === 'youtube.com' ||
        hostname === 'youtu.be' ||
        hostname === 'm.youtube.com'
      );
    } catch {
      return false;
    }
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
