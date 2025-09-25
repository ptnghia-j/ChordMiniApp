/**
 * Simple Fallback Audio Service
 * 
 * A lightweight fallback service for when downr.org fails.
 * Uses multiple public YouTube to MP3 APIs as fallbacks.
 */

export interface FallbackResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
  videoId: string;
  title?: string;
  duration?: number;
  service?: string;
}

export class SimpleFallbackService {
  private static instance: SimpleFallbackService;
  
  // List of fallback services to try
  private readonly FALLBACK_SERVICES = [
    {
      name: 'ytmp3.nu',
      endpoint: 'https://ytmp3.nu/api/convert',
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      formatRequest: (videoId: string) => ({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        format: 'mp3'
      }),
      parseResponse: (data: Record<string, unknown>) => ({
        audioUrl: (data.download_url as string) || (data.url as string),
        title: data.title as string,
        duration: data.duration as number
      })
    },
    {
      name: 'y2mate.com',
      endpoint: 'https://www.y2mate.com/mates/analyzeV2/ajax',
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      formatRequest: (videoId: string) => new URLSearchParams({
        k_query: `https://www.youtube.com/watch?v=${videoId}`,
        k_page: 'home',
        hl: 'en',
        q_auto: '0'
      }).toString(),
      parseResponse: (data: Record<string, unknown>) => {
        const links = data.links as Record<string, Record<string, { dlink: string }>> | undefined;
        const mp3Links = links?.mp3;
        const bestQuality = mp3Links?.['128'] || mp3Links?.['320'] || mp3Links?.['64'];
        return {
          audioUrl: bestQuality?.dlink,
          title: data.title as string,
          duration: data.t as number
        };
      }
    }
  ];

  static getInstance(): SimpleFallbackService {
    if (!SimpleFallbackService.instance) {
      SimpleFallbackService.instance = new SimpleFallbackService();
    }
    return SimpleFallbackService.instance;
  }

  /**
   * Extract audio using fallback services
   */
  async extractAudio(videoId: string, title?: string, duration?: number): Promise<FallbackResult> {
    console.log(`🔄 Trying fallback services for ${videoId}`);
    
    for (const service of this.FALLBACK_SERVICES) {
      try {
        console.log(`🧪 Trying ${service.name}...`);
        
        const result = await this.tryService(service, videoId, title, duration);
        
        if (result.success) {
          console.log(`✅ ${service.name} succeeded`);
          return { ...result, service: service.name };
        } else {
          console.log(`❌ ${service.name} failed: ${result.error}`);
        }
        
      } catch (error) {
        console.log(`❌ ${service.name} error:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    return {
      success: false,
      error: 'All fallback services failed',
      videoId,
      title,
      duration
    };
  }

  /**
   * Try a specific service
   */
  private async tryService(
    service: typeof this.FALLBACK_SERVICES[0], 
    videoId: string, 
    title?: string, 
    duration?: number
  ): Promise<FallbackResult> {
    try {
      const requestBody = service.formatRequest(videoId);
      
      const response = await fetch(service.endpoint, {
        method: service.method,
        headers: service.headers,
        body: typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const parsed = service.parseResponse(data);
      
      if (!parsed.audioUrl) {
        throw new Error('No audio URL in response');
      }
      
      return {
        success: true,
        audioUrl: parsed.audioUrl,
        title: parsed.title || title,
        duration: parsed.duration || duration,
        videoId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        title,
        duration
      };
    }
  }

  /**
   * Check if any fallback services are available
   */
  async checkServiceHealth(): Promise<{ available: boolean; workingServices: string[]; errors: Record<string, string> }> {
    const workingServices: string[] = [];
    const errors: Record<string, string> = {};
    
    // Test with a known working video ID
    const testVideoId = 'dQw4w9WgXcQ'; // Rick Roll
    
    for (const service of this.FALLBACK_SERVICES) {
      try {
        const result = await this.tryService(service, testVideoId);
        if (result.success) {
          workingServices.push(service.name);
        } else {
          errors[service.name] = result.error || 'Unknown error';
        }
      } catch (error) {
        errors[service.name] = error instanceof Error ? error.message : 'Unknown error';
      }
    }
    
    return {
      available: workingServices.length > 0,
      workingServices,
      errors
    };
  }

  /**
   * Get service status for debugging
   */
  getServiceInfo() {
    return {
      totalServices: this.FALLBACK_SERVICES.length,
      services: this.FALLBACK_SERVICES.map(s => ({
        name: s.name,
        endpoint: s.endpoint,
        method: s.method
      }))
    };
  }
}

// Export singleton instance
export const simpleFallbackService = SimpleFallbackService.getInstance();
