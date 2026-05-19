/**
 * Environment Detection Utility for ChordMini
 *
 * Simplified URL-based strategy detection:
 * - Localhost Development: Use yt-dlp when the frontend origin contains "localhost"
 * - Production: Use browser-side yt-dlp for all other environments
 * - Automatic fallback between strategies for reliability
 *
 * Runtime selection currently uses process/env and browser origin checks.
 */

export type AudioProcessingStrategy = 'ytdlp' | 'yt-mp3-go' | 'browser-ytdlp';

export interface EnvironmentConfig {
  strategy: AudioProcessingStrategy;
  isProduction: boolean;
  isDevelopment: boolean;
  isVercel: boolean;
  baseUrl: string;
}

/**
 * Detect the current environment and return appropriate configuration (sync, for server-side)
 * Uses URL-based detection for simplified strategy selection
 *
 * NOTE: This function uses process.env and browser origin checks.
 */
export function detectEnvironment(): EnvironmentConfig {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';

  // Get environment variables for URL-based detection
  const nodeEnv = process.env.NODE_ENV;
  const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const effectiveBaseUrl = isBrowser ? window.location.origin : envBaseUrl;

  // URL-based environment detection
  const isLocalhost = effectiveBaseUrl.includes('localhost') || effectiveBaseUrl.includes('127.0.0.1');

  // Determine environment based on URL detection
  const isDevelopment = isLocalhost || nodeEnv === 'development';
  const isProduction = !isDevelopment;
  const isVercel = isProduction && !isLocalhost; // Simplified Vercel detection

  // Get base URL for response
  let baseUrl = '';
  if (isBrowser) {
    baseUrl = window.location.origin;
  } else if (envBaseUrl) {
    baseUrl = envBaseUrl;
  } else {
    baseUrl = isDevelopment ? 'http://localhost:3000' : 'https://chordmini.com';
  }

  // Determine strategy based on manual override or URL detection
  // Priority: manual override > browser-ytdlp (production) > ytdlp (localhost)
  let strategy: AudioProcessingStrategy;

  // Check for manual strategy override
  const manualStrategy = process.env.NEXT_PUBLIC_AUDIO_STRATEGY;

  if (manualStrategy && manualStrategy !== 'auto' &&
      ['ytdlp', 'yt-mp3-go', 'browser-ytdlp'].includes(manualStrategy)) {
    strategy = manualStrategy as AudioProcessingStrategy;
    console.log(`🔧 Using manual audio strategy override: ${strategy}`);
  } else if (isLocalhost) {
    // For local development, use yt-dlp (most reliable for localhost)
    strategy = 'ytdlp';
  } else {
    // In production, run extraction in the user's browser and only validate/promote server-side.
    strategy = 'browser-ytdlp';
  }

  return {
    strategy,
    isProduction,
    isDevelopment,
    isVercel,
    baseUrl
  };
}
