/**
 * Centralized Backend Configuration Utility
 *
 * This utility provides a single source of truth for backend URL configuration
 * across the entire ChordMiniApp application.
 *
 * RUNTIME CONFIG SUPPORT:
 * - Server-side code (API routes, SSR): Use getBackendUrl() (sync, uses process.env)
 * - Client-side code (React components): Use getBackendUrlAsync() for runtime config
 */

import { loadPublicConfig } from '@/config/publicConfig';

/**
 * Get the Python backend URL from environment variables (sync, for server-side)
 *
 * Environment Strategy:
 * - Development: Uses localhost:5001 (requires local Python backend, avoiding macOS AirTunes port 5000)
 * - Production: Uses Google Cloud Run endpoint (set in Vercel environment variables)
 *
 * NOTE: This function uses process.env and is suitable for server-side code (API routes, SSR).
 * For client-side code, use getBackendUrlAsync() to get runtime configuration.
 *
 * @returns The backend URL to use for API calls
 */
export function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
}

/**
 * Get the Python backend URL with runtime configuration (async, for client-side)
 *
 * Use this function in client-side code (React components, browser services)
 * to get the backend URL that is configured at Docker container runtime.
 *
 * @returns Promise resolving to the backend URL
 */
export async function getBackendUrlAsync(): Promise<string> {
  // Server-side: use process.env directly
  if (typeof window === 'undefined') {
    return getBackendUrl();
  }

  // Client-side: load runtime config
  const config = await loadPublicConfig();
  return config.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:5001';
}

/**
 * Check if we're using the local development backend
 * 
 * @returns True if using localhost backend
 */
export function isLocalBackend(): boolean {
  const backendUrl = getBackendUrl();
  return backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
}

/**
 * Check if we're using a production backend
 * 
 * @returns True if using production backend (Google Cloud Run)
 */
export function isProductionBackend(): boolean {
  return !isLocalBackend();
}

/**
 * Get the full URL for a backend API endpoint
 * 
 * @param endpoint - The API endpoint path (e.g., '/api/detect-beats')
 * @returns Full URL for the backend endpoint
 */
export function getBackendApiUrl(endpoint: string): string {
  const baseUrl = getBackendUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
}

/**
 * Backend configuration object for easy access (sync, for server-side)
 *
 * NOTE: This object uses process.env and is suitable for server-side code.
 * For client-side code, use getBackendConfigAsync() to get runtime configuration.
 */
export const backendConfig = {
  /**
   * Get the backend URL
   */
  url: getBackendUrl(),

  /**
   * Check if using local backend
   */
  isLocal: isLocalBackend(),

  /**
   * Check if using production backend
   */
  isProduction: isProductionBackend(),

  /**
   * Get full API endpoint URL
   */
  getApiUrl: getBackendApiUrl,

  /**
   * Common API endpoints
   */
  endpoints: {
    detectBeats: '/api/detect-beats',
    recognizeChords: '/api/recognize-chords',
    recognizeChordsBlob: '/api/recognize-chords-blob',
    recognizeChordsBtcPl: '/api/recognize-chords-btc-pl',
    recognizeChordsBtcSl: '/api/recognize-chords-btc-sl',
    modelInfo: '/api/model-info',
    docs: '/api/docs',
    youtubeInfo: '/api/youtube/info',
    geniusLyrics: '/api/genius-lyrics',
    extractAndAnalyze: '/api/extract-and-analyze',
  } as const
};

/**
 * Get backend configuration with runtime values (async, for client-side)
 *
 * Use this function in client-side code to get backend configuration
 * that is set at Docker container runtime.
 *
 * @returns Promise resolving to backend configuration object
 */
export async function getBackendConfigAsync() {
  const url = await getBackendUrlAsync();
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

  return {
    url,
    isLocal,
    isProduction: !isLocal,
    getApiUrl: (endpoint: string) => {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${url}${cleanEndpoint}`;
    },
    endpoints: backendConfig.endpoints,
  };
}

/**
 * Validate backend configuration
 * 
 * @returns Object with validation results
 */
export function validateBackendConfig() {
  const url = getBackendUrl();
  const isValid = url && (url.startsWith('http://') || url.startsWith('https://'));
  
  return {
    isValid,
    url,
    isLocal: isLocalBackend(),
    isProduction: isProductionBackend(),
    environmentVariable: process.env.NEXT_PUBLIC_PYTHON_API_URL || 'not set',
    fallbackUsed: !process.env.NEXT_PUBLIC_PYTHON_API_URL
  };
}

/**
 * Log backend configuration (for debugging)
 * Only logs in development environment
 */
export function logBackendConfig(): void {
  if (process.env.NODE_ENV === 'development') {
    const config = validateBackendConfig();
    console.log('🔧 Backend Configuration:', {
      url: config.url,
      isLocal: config.isLocal,
      isProduction: config.isProduction,
      environmentVariable: config.environmentVariable,
      fallbackUsed: config.fallbackUsed
    });
  }
}

export default backendConfig;
