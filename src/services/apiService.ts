/**
 * Enhanced API service with rate limiting support
 */

import {
  fetchWithRetry,
  isRateLimitError,
  getRateLimitMessage,
  ClientRateLimiter
} from '@/utils/rateLimiting';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
}

export interface ApiRequestOptions {
  timeout?: number;
  retries?: boolean;
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}

class ApiService {
  private baseUrl: string;
  private clientLimiter: ClientRateLimiter;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL ||
                   'https://chordmini-backend-12071603127.us-central1.run.app';

    // Client-side rate limiter: 8 requests per minute (slightly under server limit)
    this.clientLimiter = new ClientRateLimiter(8, 60000);
  }

  /**
   * Make an API request with rate limiting support
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestInit & ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      timeout = 30000,
      retries = true,
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      ...fetchOptions
    } = options;

    const url = `${this.baseUrl}${endpoint}`;
    const clientKey = `${fetchOptions.method || 'GET'}:${endpoint}`;

    try {
      // Check client-side rate limit
      if (!this.clientLimiter.isAllowed(clientKey)) {
        const retryAfter = this.clientLimiter.getRetryAfter(clientKey);
        return {
          success: false,
          error: `Client rate limit exceeded. Please wait ${retryAfter} seconds.`,
          rateLimited: true,
          retryAfter
        };
      }

      // Add timeout to fetch options
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const requestOptions: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          // Only set Content-Type for non-FormData requests
          ...(!(fetchOptions.body instanceof FormData) && { 'Content-Type': 'application/json' }),
          ...fetchOptions.headers,
        },
      };

      let response: Response;

      if (retries) {
        response = await fetchWithRetry(url, requestOptions, {
          maxAttempts,
          baseDelay,
          maxDelay
        });
      } else {
        response = await fetch(url, requestOptions);
      }

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        return {
          success: false,
          error: 'Rate limit exceeded',
          rateLimited: true,
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined
        };
      }

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type');

      try {
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const textData = await response.text();
          // Try to parse as JSON if it looks like JSON
          if (textData.trim().startsWith('{') || textData.trim().startsWith('[')) {
            try {
              data = JSON.parse(textData) as T;
            } catch {
              data = textData as unknown as T;
            }
          } else {
            data = textData as unknown as T;
          }
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Invalid response format from API');
      }

      if (!response.ok) {
        return {
          success: false,
          error: typeof data === 'object' && data && 'error' in data
            ? (data as { error: string }).error
            : `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data
      };

    } catch (error) {
      // Handle rate limit errors
      if (isRateLimitError(error)) {
        return {
          success: false,
          error: getRateLimitMessage(error),
          rateLimited: true,
          retryAfter: error.rateLimitInfo?.retryAfter
        };
      }

      // Handle other errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timeout - the operation took too long to complete. This may be due to a large file or server processing time.'
          };
        }

        if (error.message.includes('fetch')) {
          return {
            success: false,
            error: 'Network error - unable to connect to the server. Please check your internet connection and try again.'
          };
        }

        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: false,
        error: 'Unknown error occurred'
      };
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * POST request with form data (for file uploads)
   */
  async postFormData<T = unknown>(
    endpoint: string,
    formData: FormData,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type for FormData, let browser set it with boundary
      },
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<ApiResponse> {
    return this.get('/', { timeout: 10000, retries: false });
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<ApiResponse> {
    return this.get('/api/model-info', { timeout: 15000 });
  }

  /**
   * Detect beats in audio
   */
  async detectBeats(
    audioFile: File,
    options?: { detector?: string; force?: boolean }
  ): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('file', audioFile);
    
    if (options?.detector) {
      formData.append('detector', options.detector);
    }
    
    if (options?.force) {
      formData.append('force', 'true');
    }

    return this.postFormData('/api/detect-beats', formData, {
      timeout: 300000, // 5 minutes for processing (Google Cloud Run timeout is 600s)
      maxAttempts: 1, // No retries for heavy operations to avoid double processing
    });
  }

  /**
   * Recognize chords in audio
   */
  async recognizeChords(
    audioFile: File,
    options?: { model?: string; chordDict?: string }
  ): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('file', audioFile);
    
    if (options?.chordDict) {
      formData.append('chord_dict', options.chordDict);
    }

    const endpoint = options?.model === 'btc-sl' ? '/api/recognize-chords-btc-sl' :
                    options?.model === 'btc-pl' ? '/api/recognize-chords-btc-pl' :
                    '/api/recognize-chords';

    return this.postFormData(endpoint, formData, {
      timeout: 400000, // 6.5 minutes for processing (Google Cloud Run timeout is 600s)
      maxAttempts: 1, // No retries for heavy operations to avoid double processing
    });
  }

  /**
   * Get lyrics from Genius
   */
  async getGeniusLyrics(artist: string, title: string): Promise<ApiResponse> {
    return this.post('/api/genius-lyrics', { artist, title }, {
      timeout: 30000,
    });
  }

  /**
   * Get synchronized lyrics from LRClib
   */
  async getLrcLibLyrics(
    artist: string, 
    title: string, 
    duration?: number
  ): Promise<ApiResponse> {
    const data: { artist: string; title: string; duration?: number } = { artist, title };
    if (duration) {
      data.duration = duration;
    }

    return this.post('/api/lrclib-lyrics', data, {
      timeout: 30000,
    });
  }

  /**
   * Clear client-side rate limiting for a specific endpoint
   */
  clearRateLimit(endpoint?: string): void {
    this.clientLimiter.clear(endpoint);
  }

  /**
   * Get the base URL being used
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
