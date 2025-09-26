/**
 * SearchAPI.io Audio Service
 * Alternative to ScrapingBee for downloading Google Video URLs
 * Uses SearchAPI.io's Google Videos API with residential proxies
 */

export interface SearchApiResult {
  success: boolean;
  audioBuffer?: ArrayBuffer;
  error?: string;
  statusCode?: number;
  contentType?: string;
  finalUrl?: string;
  credits?: number;
}

export class SearchApiAudioService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.searchapi.io/api/v1/search';

  constructor() {
    this.apiKey = process.env.SEARCHAPI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ SearchAPI.io API key not found in environment variables');
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Check if URL is a Google Video URL that needs proxy access
   */
  isGoogleVideoUrl(url: string): boolean {
    return url.includes('googlevideo.com') || 
           url.includes('googleusercontent.com') ||
           url.includes('youtube.com/videoplayback');
  }

  /**
   * Health check for SearchAPI.io service
   */
  async healthCheck(): Promise<{ available: boolean; credits?: number }> {
    if (!this.isConfigured()) {
      return { available: false };
    }

    try {
      console.log('🔍 Checking SearchAPI.io service health...');
      
      // Test with a simple search to validate API key and get credits
      const params = new URLSearchParams({
        api_key: this.apiKey,
        engine: 'google_videos',
        q: 'test',
        num: '1'
      });

      const response = await fetch(`${this.baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ChordMiniApp/1.0'
        }
      });

      console.log(`📡 Health Check Response: ${response.status}`);
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.log('📋 Non-JSON Response:', responseText.substring(0, 200));
        return { available: response.ok };
      }

      // Check for credits in response
      const credits = data.search_metadata?.credits_used !== undefined ? 
        data.search_metadata.credits_used : undefined;

      console.log('📊 Health Check Result:', { 
        available: response.ok, 
        credits,
        status: response.status 
      });

      return { 
        available: response.ok, 
        credits 
      };

    } catch (error) {
      console.error('❌ SearchAPI.io health check failed:', error);
      return { available: false };
    }
  }

  /**
   * Download audio from Google Video URL using SearchAPI.io proxy
   */
  async downloadAudio(googleVideoUrl: string): Promise<SearchApiResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SearchAPI.io service not configured - missing API key'
      };
    }

    try {
      console.log(`🔍 SearchAPI.io: Starting download for ${googleVideoUrl.substring(0, 100)}...`);
      
      const startTime = Date.now();

      // Use SearchAPI.io to proxy the request
      const params = new URLSearchParams({
        api_key: this.apiKey,
        url: googleVideoUrl,
        output: 'json'
      });

      const response = await fetch(`https://www.searchapi.io/api/v1/proxy?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'audio/mpeg, audio/mp4, audio/*, */*',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        }
      });

      const downloadTime = Date.now() - startTime;
      console.log(`📡 SearchAPI.io Response: ${response.status} ${response.statusText} (${downloadTime}ms)`);

      // Log response headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.log('📋 Response Headers:', {
        'content-type': headers['content-type'],
        'content-length': headers['content-length'],
        'searchapi-status': headers['searchapi-status'],
        'searchapi-credits': headers['searchapi-credits']
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('❌ SearchAPI.io HTTP Error:', response.status, response.statusText);
        console.log('❌ Error Response:', errorText.substring(0, 500));
        
        return {
          success: false,
          error: `SearchAPI.io failed: ${response.status} ${response.statusText}. ${errorText}`,
          statusCode: response.status,
          contentType: headers['content-type']
        };
      }

      // Get the audio data
      const audioBuffer = await response.arrayBuffer();
      const contentType = headers['content-type'] || 'audio/mpeg';
      const credits = headers['searchapi-credits'] ? parseInt(headers['searchapi-credits']) : undefined;

      console.log('✅ SearchAPI.io download successful:', {
        size: `${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`,
        contentType,
        downloadTime: `${downloadTime}ms`,
        credits
      });

      // Validate that we got audio data
      if (audioBuffer.byteLength === 0) {
        return {
          success: false,
          error: 'SearchAPI.io returned empty response',
          statusCode: response.status,
          contentType
        };
      }

      // Basic validation for audio content
      if (!contentType.includes('audio') && !contentType.includes('video') && !contentType.includes('octet-stream')) {
        console.log('⚠️ Unexpected content type, but proceeding:', contentType);
      }

      return {
        success: true,
        audioBuffer,
        contentType,
        finalUrl: googleVideoUrl,
        credits
      };

    } catch (error) {
      console.error('❌ SearchAPI.io download error:', error);
      
      return {
        success: false,
        error: `SearchAPI.io request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export singleton instance
export const searchApiService = new SearchApiAudioService();
