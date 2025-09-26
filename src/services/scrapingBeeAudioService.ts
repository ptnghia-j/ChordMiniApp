/**
 * ScrapingBee Audio Service
 * 
 * Uses ScrapingBee's residential proxy network to download audio files
 * from Google Video URLs, bypassing datacenter IP restrictions.
 */

export interface ScrapingBeeResult {
  success: boolean;
  audioBuffer?: ArrayBuffer;
  error?: string;
  statusCode?: number;
  finalUrl?: string;
  contentType?: string;
}

export class ScrapingBeeAudioService {
  private apiKey: string;
  private baseUrl = 'https://app.scrapingbee.com/api/v1/';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SCRAPINGBEE_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('ScrapingBee API key is required. Set SCRAPINGBEE_API_KEY environment variable or pass it to constructor.');
    }
  }

  /**
   * Download audio from Google Video URL using ScrapingBee's residential proxies
   */
  async downloadAudio(googleVideoUrl: string): Promise<ScrapingBeeResult> {
    console.log(`🐝 ScrapingBee: Starting download for ${googleVideoUrl.substring(0, 100)}...`);
    
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        url: googleVideoUrl,
        premium_proxy: 'true',        // Use residential proxies (essential for Google Video)
        country_code: 'US',           // US residential IPs
        render_js: 'false',           // Don't render JavaScript (faster for audio)
        block_resources: 'true',      // Block images/CSS/fonts (faster)
        custom_google: 'false',       // Don't use Google cache
        timeout: '30000',             // 30 second timeout
        session_id: Date.now().toString(), // Session persistence for redirects
        forward_headers: 'true'       // Forward response headers
      });

      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
          'User-Agent': 'ChordMiniApp/1.0 (Audio Extraction Service)',
          'Cache-Control': 'no-cache'
        }
      });

      const responseTime = Date.now() - startTime;
      console.log(`📡 ScrapingBee Response: ${response.status} ${response.statusText} (${responseTime}ms)`);
      
      // Log response headers for debugging
      const headers = Object.fromEntries(response.headers.entries());
      console.log(`📋 Response Headers:`, {
        'content-type': headers['content-type'],
        'content-length': headers['content-length'],
        'spb-status': headers['spb-status'], // ScrapingBee status
        'spb-original-status': headers['spb-original-status'], // Original server status
        'spb-cost': headers['spb-cost'] // API cost
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ ScrapingBee HTTP Error: ${response.status} ${response.statusText}`);
        console.error(`❌ Error Response:`, errorText.substring(0, 500));
        
        return {
          success: false,
          error: `ScrapingBee failed: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`,
          statusCode: response.status
        };
      }

      // Check ScrapingBee specific headers
      const originalStatus = headers['spb-original-status'];
      if (originalStatus && originalStatus !== '200') {
        console.warn(`⚠️ Original server returned: ${originalStatus}`);
      }

      // Validate content type
      const contentType = headers['content-type'] || '';
      console.log(`📥 Content-Type: ${contentType}`);

      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        const textContent = await response.text();
        console.error(`❌ Received non-audio content:`, textContent.substring(0, 300));
        
        return {
          success: false,
          error: `Received ${contentType} instead of audio content. Response: ${textContent.substring(0, 200)}...`,
          contentType
        };
      }

      // Download audio buffer
      console.log(`📥 Downloading audio buffer...`);
      const audioBuffer = await response.arrayBuffer();
      const fileSizeMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
      
      console.log(`📊 Audio Buffer Stats:`);
      console.log(`   Size: ${fileSizeMB}MB (${audioBuffer.byteLength} bytes)`);
      console.log(`   Content-Type: ${contentType}`);
      console.log(`   Download Time: ${responseTime}ms`);

      // Validate audio file size
      if (audioBuffer.byteLength < 1000) {
        console.error(`❌ Audio file too small: ${audioBuffer.byteLength} bytes`);
        return {
          success: false,
          error: `Audio file too small (${audioBuffer.byteLength} bytes), likely an error response`,
          contentType
        };
      }

      // Check for minimum expected audio file size (at least 100KB for any real audio)
      if (audioBuffer.byteLength < 100 * 1024) {
        console.warn(`⚠️ Audio file seems small: ${fileSizeMB}MB - might be an error page`);
      }

      console.log(`✅ ScrapingBee Success: Downloaded ${fileSizeMB}MB audio file`);
      
      return {
        success: true,
        audioBuffer,
        contentType,
        finalUrl: googleVideoUrl
      };

    } catch (error) {
      console.error(`❌ ScrapingBee Error:`, error);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timeout - ScrapingBee took too long to respond'
          };
        }
        
        if (error.message.includes('fetch')) {
          return {
            success: false,
            error: `Network error connecting to ScrapingBee: ${error.message}`
          };
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown ScrapingBee error'
      };
    }
  }

  /**
   * Check if ScrapingBee service is available and API key is valid
   */
  async checkServiceHealth(): Promise<{ available: boolean; error?: string; credits?: number }> {
    console.log(`🔍 Checking ScrapingBee service health...`);
    
    try {
      // Test with a simple HTTP endpoint
      const testUrl = 'https://httpbin.org/status/200';
      const params = new URLSearchParams({
        api_key: this.apiKey,
        url: testUrl,
        premium_proxy: 'false', // Use regular proxy for health check
        timeout: '10000'
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      const headers = Object.fromEntries(response.headers.entries());
      
      console.log(`📡 Health Check Response: ${response.status}`);
      console.log(`📋 ScrapingBee Headers:`, {
        'spb-status': headers['spb-status'],
        'spb-cost': headers['spb-cost'],
        'spb-credits-remaining': headers['spb-credits-remaining']
      });

      if (response.ok) {
        const creditsRemaining = headers['spb-credits-remaining'];
        console.log(`✅ ScrapingBee service is healthy`);
        console.log(`💳 Credits remaining: ${creditsRemaining || 'Unknown'}`);
        
        return { 
          available: true, 
          credits: creditsRemaining ? parseInt(creditsRemaining) : undefined
        };
      } else {
        const errorText = await response.text();
        console.error(`❌ ScrapingBee health check failed: ${response.status}`);
        
        return { 
          available: false, 
          error: `Health check failed: ${response.status} ${response.statusText}. ${errorText}` 
        };
      }
    } catch (error) {
      console.error(`❌ ScrapingBee health check error:`, error);
      return { 
        available: false, 
        error: error instanceof Error ? error.message : 'Unknown health check error' 
      };
    }
  }

  /**
   * Check if a URL is a Google Video URL that should use ScrapingBee
   */
  isGoogleVideoUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('googlevideo.com') || 
             urlObj.hostname.includes('googleusercontent.com');
    } catch {
      return false;
    }
  }

  /**
   * Get service information
   */
  getServiceInfo(): { name: string; baseUrl: string; hasApiKey: boolean } {
    return {
      name: 'ScrapingBee',
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey
    };
  }
}

// Export singleton instance with your API key
export const scrapingBeeService = new ScrapingBeeAudioService('O8FMI06HQO5N22VG18ENWSE4QCQDEQ15FK120S4W44EB6BUFUJPU0JPZ2A5HT50ATJ0PQKBFERKLMYYP');
