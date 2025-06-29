/**
 * Retry Utilities for ChordMini
 * 
 * Provides robust retry mechanisms for handling CDN cache issues,
 * network failures, and other transient errors in audio processing.
 */

import { createSafeTimeoutSignal } from './environmentUtils';

export interface RetryStrategy {
  name: string;
  headers: Record<string, string>;
  delay?: number; // milliseconds
  urlModifier?: (url: string) => string;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, strategy: RetryStrategy, error?: Error) => void;
  onSuccess?: (attempt: number, strategy: RetryStrategy, response: Response) => void;
}

export interface RetryResult {
  success: boolean;
  response?: Response;
  buffer?: ArrayBuffer;
  attempt: number;
  strategy: RetryStrategy;
  error?: Error;
  allErrors: Error[];
}

/**
 * Predefined retry strategies for different scenarios
 */
export const RETRY_STRATEGIES: RetryStrategy[] = [
  {
    name: 'Standard Request',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'audio/mpeg, audio/*, */*',
    }
  },
  {
    name: 'Cache-Busting Headers',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ChordMini-CacheBuster/1.0)',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'If-None-Match': '*',
      'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
    },
    delay: 1000
  },
  {
    name: 'Alternative User-Agent',
    headers: {
      'User-Agent': 'curl/7.68.0',
      'Cache-Control': 'no-cache',
      'Accept': 'audio/mpeg, audio/*, */*',
    },
    delay: 2000
  },
  {
    name: 'Minimal Headers',
    headers: {
      'User-Agent': 'ChordMini/1.0',
    },
    delay: 3000
  },
  {
    name: 'URL Cache-Busting',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ChordMini-URLBuster/1.0)',
      'Cache-Control': 'no-cache',
    },
    urlModifier: (url: string) => {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}cb=${Date.now()}&v=${Math.random().toString(36).substring(7)}`;
    },
    delay: 4000
  }
];

/**
 * Retry a fetch request with multiple strategies
 */
export async function retryFetch(
  url: string,
  options: RetryOptions = {}
): Promise<RetryResult> {
  const {
    maxAttempts = RETRY_STRATEGIES.length,
    baseDelay = 1000,
    timeoutMs = 120000, // 2 minute default timeout for audio downloads
    onRetry,
    onSuccess
  } = options;

  const allErrors: Error[] = [];
  
  for (let attempt = 0; attempt < maxAttempts && attempt < RETRY_STRATEGIES.length; attempt++) {
    const strategy = RETRY_STRATEGIES[attempt];
    
    try {
      // Apply delay for retry attempts
      if (attempt > 0) {
        const delay = strategy.delay || (baseDelay * attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Modify URL if strategy requires it
      const requestUrl = strategy.urlModifier ? strategy.urlModifier(url) : url;
      
      onRetry?.(attempt + 1, strategy);

      const response = await fetch(requestUrl, {
        headers: strategy.headers,
        signal: createSafeTimeoutSignal(timeoutMs),
      });

      if (response.ok) {
        // Check if response has content
        const contentLength = response.headers.get('content-length');
        const hasContent = !contentLength || parseInt(contentLength, 10) > 0;

        if (hasContent) {
          // Try to read the buffer to verify it's not empty
          const buffer = await response.arrayBuffer();
          
          if (buffer.byteLength > 0) {
            onSuccess?.(attempt + 1, strategy, response);
            return {
              success: true,
              response,
              buffer,
              attempt: attempt + 1,
              strategy,
              allErrors
            };
          } else {
            throw new Error(`Empty response body (0 bytes)`);
          }
        } else {
          throw new Error(`Response indicates empty content (Content-Length: ${contentLength})`);
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const retryError = error instanceof Error ? error : new Error(String(error));
      allErrors.push(retryError);
      
      console.warn(`❌ Retry attempt ${attempt + 1} failed (${strategy.name}):`, retryError.message);
      
      // If this is the last attempt, we'll return the failure
      if (attempt === maxAttempts - 1 || attempt === RETRY_STRATEGIES.length - 1) {
        return {
          success: false,
          attempt: attempt + 1,
          strategy,
          error: retryError,
          allErrors
        };
      }
    }
  }

  // This should never be reached, but just in case
  return {
    success: false,
    attempt: maxAttempts,
    strategy: RETRY_STRATEGIES[RETRY_STRATEGIES.length - 1],
    error: new Error('All retry attempts exhausted'),
    allErrors
  };
}

/**
 * Specialized retry function for audio downloads
 */
export async function retryAudioDownload(
  url: string,
  options: RetryOptions = {}
): Promise<RetryResult> {
  console.log(`🔄 Starting audio download with retry strategies for: ${url}`);
  
  const result = await retryFetch(url, {
    ...options,
    onRetry: (attempt, strategy, error) => {
      // console.log(`🔄 Audio download attempt ${attempt}: ${strategy.name}${error ? ` (previous error: ${error.message})` : ''}`);
      options.onRetry?.(attempt, strategy, error);
    },
    onSuccess: (attempt, strategy, response) => {
      // const contentLength = response.headers.get('content-length');
      // const size = contentLength ? `${(parseInt(contentLength, 10) / 1024 / 1024).toFixed(2)}MB` : 'unknown size';
      // console.log(`✅ Audio download successful on attempt ${attempt} (${strategy.name}): ${size}`);
      options.onSuccess?.(attempt, strategy, response);
    }
  });

  if (!result.success) {
    console.error(`❌ Audio download failed after ${result.attempt} attempts:`, result.allErrors.map(e => e.message));
  }

  return result;
}
