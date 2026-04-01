/**
 * URL Validation Utilities
 * 
 * Utilities for validating URL accessibility to prevent 403 errors
 * in the audio processing pipeline.
 */

import { createSafeTimeoutSignal } from './environmentUtils';

export interface UrlValidationResult {
  isAccessible: boolean;
  statusCode?: number;
  error?: string;
  responseTime?: number;
}

const DEFAULT_ALLOWED_AUDIO_DOMAINS = [
  'quicktube.app',
  'dl.quicktube.app',
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'lukavukanovic.xyz',
  'ytdown.io',
  'ytcontent.net',
  'archive.org',
  'us.archive.org',
] as const;

export interface SafeAudioSourceValidationOptions {
  allowDevelopmentLocalhost?: boolean;
  allowedDomains?: readonly string[];
}

function isHostnameAllowed(hostname: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function isDevelopmentLocalhost(url: URL): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }

  return ['localhost', '127.0.0.1'].includes(url.hostname);
}

/**
 * Parse and validate an audio source URL before any server-side fetch.
 */
export function parseAndValidateAudioSourceUrl(
  url: string,
  options: SafeAudioSourceValidationOptions = {}
): URL {
  const {
    allowDevelopmentLocalhost = false,
    allowedDomains = DEFAULT_ALLOWED_AUDIO_DOMAINS,
  } = options;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }
  const isLocalhost = allowDevelopmentLocalhost && isDevelopmentLocalhost(parsedUrl);
  const isHttp = parsedUrl.protocol === 'http:';
  const isHttps = parsedUrl.protocol === 'https:';

  if (!isHttps && !(isLocalhost && isHttp)) {
    throw new Error('Only HTTPS URLs are allowed');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URL credentials are not allowed');
  }

  if (!isLocalhost && !isHostnameAllowed(parsedUrl.hostname, allowedDomains)) {
    throw new Error('URL domain not allowed');
  }

  if (!isLocalhost && parsedUrl.port && !['80', '443'].includes(parsedUrl.port)) {
    throw new Error('URL port not allowed');
  }

  return parsedUrl;
}

/**
 * Validate that a URL is accessible with a HEAD request
 * @param url The URL to validate
 * @param timeoutMs Timeout in milliseconds (default: 10000)
 * @param retries Number of retry attempts (default: 3)
 * @returns Promise with validation result
 */
export async function validateUrlAccessibility(
  url: string,
  timeoutMs: number = 10000,
  retries: number = 3
): Promise<UrlValidationResult> {
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔍 Validating URL accessibility (attempt ${attempt}/${retries}): ${url.substring(0, 100)}...`);
      
      const abortSignal = createSafeTimeoutSignal(timeoutMs);
      
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
        signal: abortSignal,
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        console.log(`✅ URL accessible (${response.status}) in ${responseTime}ms`);
        return {
          isAccessible: true,
          statusCode: response.status,
          responseTime
        };
      } else {
        console.log(`⚠️ URL returned ${response.status} ${response.statusText} (attempt ${attempt}/${retries})`);
        
        // If it's the last attempt, return the result
        if (attempt === retries) {
          return {
            isAccessible: false,
            statusCode: response.status,
            error: `${response.status} ${response.statusText}`,
            responseTime
          };
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`❌ URL validation error (attempt ${attempt}/${retries}):`, error);
      
      // If it's the last attempt, return the error
      if (attempt === retries) {
        return {
          isAccessible: false,
          error: error instanceof Error ? error.message : String(error),
          responseTime
        };
      }
      
      // Wait before retry
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but just in case
  return {
    isAccessible: false,
    error: 'All validation attempts failed',
    responseTime: Date.now() - startTime
  };
}

/**
 * Validate Firebase Storage URL accessibility with Firebase-specific logic
 * @param firebaseUrl Firebase Storage URL to validate
 * @param timeoutMs Timeout in milliseconds (default: 15000)
 * @param maxRetries Maximum retry attempts (default: 5)
 * @returns Promise with validation result
 */
export async function validateFirebaseStorageUrl(
  firebaseUrl: string,
  timeoutMs: number = 15000,
  maxRetries: number = 5
): Promise<UrlValidationResult> {
  console.log(`🔥 Validating Firebase Storage URL: ${firebaseUrl.substring(0, 100)}...`);
  
  // Firebase Storage URLs might take longer to become available
  // Use longer timeout and more retries
  return validateUrlAccessibility(firebaseUrl, timeoutMs, maxRetries);
}

/**
 * Wait for a URL to become accessible with polling
 * @param url The URL to wait for
 * @param maxWaitMs Maximum time to wait in milliseconds (default: 30000)
 * @param pollIntervalMs Polling interval in milliseconds (default: 2000)
 * @returns Promise that resolves when URL becomes accessible or times out
 */
export async function waitForUrlAccessibility(
  url: string,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 2000
): Promise<UrlValidationResult> {
  const startTime = Date.now();
  const endTime = startTime + maxWaitMs;
  
  console.log(`⏳ Waiting for URL to become accessible (max ${maxWaitMs}ms): ${url.substring(0, 100)}...`);
  
  while (Date.now() < endTime) {
    const result = await validateUrlAccessibility(url, 5000, 1); // Single attempt with 5s timeout
    
    if (result.isAccessible) {
      const totalWaitTime = Date.now() - startTime;
      console.log(`✅ URL became accessible after ${totalWaitTime}ms`);
      return {
        ...result,
        responseTime: totalWaitTime
      };
    }
    
    // Check if we have time for another poll
    const remainingTime = endTime - Date.now();
    if (remainingTime < pollIntervalMs) {
      break;
    }
    
    console.log(`⏳ URL not ready, waiting ${pollIntervalMs}ms before next check...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  const totalWaitTime = Date.now() - startTime;
  console.log(`❌ URL did not become accessible within ${totalWaitTime}ms`);
  
  return {
    isAccessible: false,
    error: `URL did not become accessible within ${maxWaitMs}ms`,
    responseTime: totalWaitTime
  };
}

/**
 * Check if a URL is a Firebase Storage URL
 * @param url The URL to check
 * @returns True if it's a Firebase Storage URL
 */
export function isFirebaseStorageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return isHostnameAllowed(parsedUrl.hostname, [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
    ]);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a direct/external URL (not Firebase Storage)
 * @param url The URL to check
 * @returns True if it's a direct/external URL
 */
export function isDirectUrl(url: string): boolean {
  return !isFirebaseStorageUrl(url);
}
