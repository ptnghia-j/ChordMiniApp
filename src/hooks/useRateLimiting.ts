/**
 * React hook for handling rate limiting in components
 */

import { useState, useCallback, useRef } from 'react';
import { apiService, type ApiResponse } from '@/services/apiService';

export interface RateLimitState {
  isRateLimited: boolean;
  retryAfter?: number;
  message?: string;
}

export interface UseRateLimitingOptions {
  showToast?: boolean;
  autoRetry?: boolean;
  maxAutoRetries?: number;
}

export function useRateLimiting(options: UseRateLimitingOptions = {}) {
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isRateLimited: false,
  });
  
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoRetryCountRef = useRef(0);

  const {
    showToast = true,
    autoRetry = false,
    maxAutoRetries = 3,
  } = options;

  /**
   * Handle rate limit response
   */
  const handleRateLimit = useCallback((response: ApiResponse) => {
    if (response.rateLimited) {
      const message = response.error || 'Rate limit exceeded';
      
      setRateLimitState({
        isRateLimited: true,
        retryAfter: response.retryAfter,
        message,
      });

      // Show toast notification if enabled
      if (showToast && typeof window !== 'undefined') {
        // You can integrate with your toast system here
        console.warn('Rate Limited:', message);
      }

      // Set up auto-retry if enabled
      if (autoRetry && response.retryAfter && autoRetryCountRef.current < maxAutoRetries) {
        retryTimeoutRef.current = setTimeout(() => {
          autoRetryCountRef.current++;
          setRateLimitState(prev => ({ ...prev, isRateLimited: false }));
        }, response.retryAfter * 1000);
      }

      return true;
    }

    return false;
  }, [showToast, autoRetry, maxAutoRetries]);

  /**
   * Clear rate limit state
   */
  const clearRateLimit = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    autoRetryCountRef.current = 0;
    setRateLimitState({ isRateLimited: false });
  }, []);

  /**
   * Enhanced API call wrapper with rate limiting handling
   */
  const apiCall = useCallback(async <T = unknown>(
    apiFunction: () => Promise<ApiResponse<T>>
  ): Promise<ApiResponse<T>> => {
    try {
      const response = await apiFunction();
      
      // Handle rate limiting
      if (handleRateLimit(response)) {
        return response;
      }

      // Clear rate limit state on successful request
      if (rateLimitState.isRateLimited) {
        clearRateLimit();
      }

      return response;
    } catch (error) {
      // Handle unexpected errors
      console.error('API call failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [handleRateLimit, rateLimitState.isRateLimited, clearRateLimit]);

  /**
   * Specific API methods with rate limiting
   */
  const api = {
    healthCheck: useCallback(() => 
      apiCall(() => apiService.healthCheck()), [apiCall]
    ),

    getModelInfo: useCallback(() => 
      apiCall(() => apiService.getModelInfo()), [apiCall]
    ),

    detectBeats: useCallback((file: File, options?: { detector?: string; force?: boolean }) =>
      apiCall(() => apiService.detectBeats(file, options)), [apiCall]
    ),

    recognizeChords: useCallback((file: File, options?: { model?: string; chordDict?: string }) =>
      apiCall(() => apiService.recognizeChords(file, options)), [apiCall]
    ),

    getGeniusLyrics: useCallback((artist: string, title: string) =>
      apiCall(() => apiService.getGeniusLyrics(artist, title)), [apiCall]
    ),

    getLrcLibLyrics: useCallback((artist: string, title: string, duration?: number) =>
      apiCall(() => apiService.getLrcLibLyrics(artist, title, duration)), [apiCall]
    ),
  };

  return {
    rateLimitState,
    clearRateLimit,
    api,
    apiCall,
  };
}

/**
 * Hook specifically for status page monitoring
 */
export function useStatusMonitoring() {
  const [isChecking, setIsChecking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const { rateLimitState, api } = useRateLimiting({
    showToast: false, // Don't show toasts for status checks
    autoRetry: false, // Don't auto-retry status checks
  });

  const checkEndpoint = useCallback(async (endpoint: string) => {
    const startTime = Date.now();
    
    try {
      let response: ApiResponse;
      
      if (endpoint === '/' || endpoint === '/api/model-info') {
        // GET endpoints
        response = endpoint === '/' 
          ? await api.healthCheck()
          : await api.getModelInfo();
      } else if (endpoint === '/api/genius-lyrics') {
        // POST endpoint with JSON body
        response = await api.getGeniusLyrics('test', 'test');
      } else {
        // File upload endpoints - test directly against backend
        const baseUrl = 'https://chordmini-backend-full-12071603127.us-central1.run.app';
        const testResponse = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
          },
        });

        const responseText = await testResponse.text();
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = { error: responseText };
        }

        response = {
          success: testResponse.ok,
          error: responseData.error || `HTTP ${testResponse.status}`,
          data: responseData,
          rateLimited: false
        };
      }

      const responseTime = Date.now() - startTime;
      
      // Determine status based on endpoint type and expected responses
      let status: 'online' | 'offline';
      if (endpoint === '/api/detect-beats' || endpoint === '/api/recognize-chords') {
        // These endpoints should return 400 (Bad Request) when no file is provided
        status = (!response.success && response.error?.includes('file')) ? 'online' : 'offline';
      } else if (endpoint === '/api/genius-lyrics') {
        // Genius endpoint returns 500 when API key is not configured, but endpoint is responsive
        // Also check for service availability errors and API key issues
        const isApiKeyIssue = response.error?.includes('API key') ||
                             response.error?.includes('not configured') ||
                             response.error?.includes('GENIUS_API_KEY') ||
                             response.error?.includes('expired') ||
                             response.error?.includes('revoked') ||
                             response.error?.includes('malformed') ||
                             response.error?.includes('invalid') ||
                             response.error?.includes('Unauthorized');

        const isServiceIssue = response.error?.includes('service is not available') ||
                              response.error?.includes('lyricsgenius library');

        // If it's an API key issue or service issue, the endpoint is still "online" but misconfigured
        status = (!response.success && (isApiKeyIssue || isServiceIssue)) ? 'online' :
                 response.success ? 'online' : 'offline';
      } else {
        // Other endpoints should return success
        status = response.success ? 'online' : 'offline';
      }
      
      return {
        endpoint,
        status,
        responseTime,
        lastChecked: new Date().toLocaleTimeString(),
        error: status === 'offline' ? response.error : undefined,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        endpoint,
        status: 'offline' as const,
        responseTime,
        lastChecked: new Date().toLocaleTimeString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }, [api]);

  const checkAllEndpoints = useCallback(async () => {
    if (isChecking) return [];
    
    setIsChecking(true);
    setLastUpdate(new Date().toLocaleTimeString());
    
    try {
      const endpointsToCheck = [
        '/',
        '/api/model-info',
        '/api/detect-beats',
        '/api/recognize-chords',
        '/api/genius-lyrics'
      ];
      
      const promises = endpointsToCheck.map(endpoint => checkEndpoint(endpoint));
      const results = await Promise.all(promises);
      
      return results;
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, checkEndpoint]);

  return {
    isChecking,
    lastUpdate,
    rateLimitState,
    checkAllEndpoints,
  };
}
