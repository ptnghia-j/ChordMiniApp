/**
 * Google Video URL Handler
 * 
 * Handles the complex redirect chain and authentication required
 * for accessing Google Video URLs from Vercel serverless functions.
 */

export interface GoogleVideoResult {
  success: boolean;
  audioBuffer?: ArrayBuffer;
  error?: string;
  finalUrl?: string;
  redirectCount?: number;
}

export class GoogleVideoHandler {
  private static instance: GoogleVideoHandler;
  private readonly MAX_REDIRECTS = 5;
  private readonly TIMEOUT = 30000; // 30 seconds

  static getInstance(): GoogleVideoHandler {
    if (!GoogleVideoHandler.instance) {
      GoogleVideoHandler.instance = new GoogleVideoHandler();
    }
    return GoogleVideoHandler.instance;
  }

  /**
   * Download audio from Google Video URL with proper redirect handling
   */
  async downloadAudio(googleVideoUrl: string): Promise<GoogleVideoResult> {
    console.log(`🎵 Attempting Google Video download: ${googleVideoUrl.substring(0, 100)}...`);
    
    try {
      const result = await this.followRedirectsAndDownload(googleVideoUrl, 0);
      
      if (result.success && result.audioBuffer) {
        console.log(`✅ Google Video download successful`);
        console.log(`   Final URL: ${result.finalUrl?.substring(0, 100)}...`);
        console.log(`   Redirects: ${result.redirectCount}`);
        console.log(`   Size: ${(result.audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Google Video download failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Follow redirects and download the final audio file
   */
  private async followRedirectsAndDownload(
    url: string, 
    redirectCount: number
  ): Promise<GoogleVideoResult> {
    
    if (redirectCount >= this.MAX_REDIRECTS) {
      throw new Error(`Too many redirects (${redirectCount})`);
    }

    console.log(`🔄 Following redirect ${redirectCount + 1}: ${url.substring(0, 100)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'audio',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
        },
        signal: controller.signal,
        redirect: 'manual' // Handle redirects manually
      });

      clearTimeout(timeoutId);

      console.log(`📡 Response: ${response.status} ${response.statusText}`);
      console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect response without location header`);
        }

        // Resolve relative URLs
        const nextUrl = new URL(location, url).toString();
        console.log(`🔄 Redirecting to: ${nextUrl.substring(0, 100)}...`);
        
        return await this.followRedirectsAndDownload(nextUrl, redirectCount + 1);
      }

      // Handle success
      if (response.status === 200) {
        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length');
        
        console.log(`📥 Downloading audio file...`);
        console.log(`   Content-Type: ${contentType}`);
        console.log(`   Content-Length: ${contentLength || 'Unknown'}`);

        // Verify it's actually audio content
        if (!contentType.includes('audio') && !contentType.includes('video') && !contentType.includes('octet-stream')) {
          // Try to read a small portion to check if it's HTML (error page)
          const textContent = await response.clone().text();
          if (textContent.includes('<html') || textContent.includes('<!DOCTYPE')) {
            throw new Error(`Received HTML error page instead of audio file. Content-Type: ${contentType}`);
          }
        }

        const audioBuffer = await response.arrayBuffer();
        
        // Verify we got actual audio data
        if (audioBuffer.byteLength < 1000) {
          throw new Error(`Audio file too small (${audioBuffer.byteLength} bytes), likely an error response`);
        }

        return {
          success: true,
          audioBuffer,
          finalUrl: url,
          redirectCount
        };
      }

      // Handle errors
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText.substring(0, 200)}`);

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.TIMEOUT}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Test if a URL is a Google Video URL
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
   * Get service health status
   */
  async checkServiceHealth(): Promise<{ available: boolean; error?: string }> {
    // Test with a known working Google Video URL (if available)
    // For now, just return available since we can't test without a real URL
    return { available: true };
  }
}

// Export singleton instance
export const googleVideoHandler = GoogleVideoHandler.getInstance();
