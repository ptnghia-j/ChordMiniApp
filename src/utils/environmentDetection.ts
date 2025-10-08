/**
 * Environment Detection Utility for ChordMini
 *
 * Simplified URL-based strategy detection:
 * - Localhost Development: Use yt-dlp when both NEXT_PUBLIC_BASE_URL and NEXT_PUBLIC_PYTHON_API_URL contain "localhost"
 * - Production: Use yt2mp3magic for all other environments
 * - Automatic fallback between strategies for reliability
 *
 * RUNTIME CONFIG SUPPORT:
 * - Server-side code (API routes, SSR): Use detectEnvironment() (sync, uses process.env)
 * - Client-side code (React components): Use detectEnvironmentAsync() for runtime config
 */

import { loadPublicConfig } from '@/config/publicConfig';

export type AudioProcessingStrategy = 'ytdlp' | 'yt-mp3-go' | 'ytdown-io';

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
 * NOTE: This function uses process.env and is suitable for server-side code (API routes, SSR).
 * For client-side code, use detectEnvironmentAsync() to get runtime configuration.
 */
export function detectEnvironment(): EnvironmentConfig {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';

  // Get environment variables for URL-based detection
  const nodeEnv = process.env.NODE_ENV;
  const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const envPythonApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || '';

  // URL-based environment detection
  const isLocalhost = envBaseUrl.includes('localhost') && envPythonApiUrl.includes('localhost');

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
  // Priority: manual override > yt-mp3-go (production) > ytdlp (localhost)
  // NOTE: ytdown-io is deprecated due to Cloudflare bot protection (403 errors)
  let strategy: AudioProcessingStrategy;

  // Check for manual strategy override
  const manualStrategy = process.env.NEXT_PUBLIC_AUDIO_STRATEGY;

  if (manualStrategy && manualStrategy !== 'auto' &&
      ['ytdlp', 'yt-mp3-go', 'ytdown-io'].includes(manualStrategy)) {
    strategy = manualStrategy as AudioProcessingStrategy;
    console.log(`🔧 Using manual audio strategy override: ${strategy}`);
  } else if (isLocalhost) {
    // For local development, use yt-dlp (most reliable for localhost)
    strategy = 'ytdlp';
  } else {
    // Use yt-mp3-go for production (lukavukanovic.xyz service)
    // This replaces ytdown-io which is now blocked by Cloudflare
    strategy = 'yt-mp3-go';
  }

  return {
    strategy,
    isProduction,
    isDevelopment,
    isVercel,
    baseUrl
  };
}

/**
 * Detect the current environment with runtime configuration (async, for client-side)
 *
 * Use this function in client-side code to get environment configuration
 * that is set at Docker container runtime.
 *
 * @returns Promise resolving to environment configuration
 */
export async function detectEnvironmentAsync(): Promise<EnvironmentConfig> {
  // Server-side: use sync version
  if (typeof window === 'undefined') {
    return detectEnvironment();
  }

  // Client-side: load runtime config
  const config = await loadPublicConfig();

  // Get environment variables from runtime config
  const nodeEnv = config.NODE_ENV;
  const envBaseUrl = config.NEXT_PUBLIC_BASE_URL || '';
  const envPythonApiUrl = config.NEXT_PUBLIC_PYTHON_API_URL || '';

  // URL-based environment detection
  const isLocalhost = envBaseUrl.includes('localhost') && envPythonApiUrl.includes('localhost');

  // Determine environment based on URL detection
  const isDevelopment = isLocalhost || nodeEnv === 'development';
  const isProduction = !isDevelopment;
  const isVercel = isProduction && !isLocalhost;

  // Get base URL for response
  const baseUrl = window.location.origin;

  // Determine strategy based on manual override or URL detection
  // Priority: manual override > yt-mp3-go (production) > ytdlp (localhost)
  // NOTE: ytdown-io is deprecated due to Cloudflare bot protection (403 errors)
  let strategy: AudioProcessingStrategy;

  // Check for manual strategy override
  const manualStrategy = config.NEXT_PUBLIC_AUDIO_STRATEGY;

  if (manualStrategy && manualStrategy !== 'auto' &&
      ['ytdlp', 'yt-mp3-go', 'ytdown-io'].includes(manualStrategy)) {
    strategy = manualStrategy as AudioProcessingStrategy;
    console.log(`🔧 Using manual audio strategy override: ${strategy}`);
  } else if (isLocalhost) {
    // For local development, use yt-dlp (most reliable for localhost)
    strategy = 'ytdlp';
  } else {
    // Use yt-mp3-go for production (lukavukanovic.xyz service)
    // This replaces ytdown-io which is now blocked by Cloudflare
    strategy = 'yt-mp3-go';
  }

  return {
    strategy,
    isProduction,
    isDevelopment,
    isVercel,
    baseUrl
  };
}

/**
 * Get the current audio processing strategy
 */
export function getAudioProcessingStrategy(): AudioProcessingStrategy {
  return detectEnvironment().strategy;
}

/**
 * Check if we should use yt-dlp integration (localhost development)
 */
export function shouldUseYtDlp(): boolean {
  return getAudioProcessingStrategy() === 'ytdlp';
}



/**
 * Check if we should use yt-mp3-go integration (fallback)
 */
export function shouldUseYtMp3Go(): boolean {
  return getAudioProcessingStrategy() === 'yt-mp3-go';
}

/**
 * Check if we should use ytdown.io integration (preferred for production)
 */
export function shouldUseYtdownIo(): boolean {
  return getAudioProcessingStrategy() === 'ytdown-io';
}

/**
 * Get environment-specific configuration for audio processing
 */
export function getAudioProcessingConfig() {
  const env = detectEnvironment();
  
  return {
    strategy: env.strategy,
    endpoints: {

      ytMp3Go: {
        baseUrl: 'https://yt-mp3-go.onrender.com',
        convertPath: '/convert',
        searchEnabled: false
      },
      ytdlp: {
        baseUrl: env.baseUrl,
        downloadPath: '/api/ytdlp/download',
        extractPath: '/api/ytdlp/extract',
        searchEnabled: true
      }
    },
    features: {
      filenameGeneration: env.strategy === 'ytdlp', // Only yt-dlp requires filename generation
      caching: env.isProduction, // Enable caching in production
      fallback: env.strategy === 'ytdlp' ? 'yt-mp3-go' : 'ytdlp' // Automatic fallback between strategies
    }
  };
}

/**
 * Log current environment configuration (for debugging)
 */
export function logEnvironmentConfig(): void {
  // const config = detectEnvironment();

  // console.log('🔧 ChordMini Environment Configuration:');
  // console.log(`   Strategy: ${config.strategy}`);
  // console.log(`   Environment: ${config.isProduction ? 'Production' : 'Development'}`);
  // console.log(`   Platform: ${config.isVercel ? 'Vercel' : 'Local'}`);
  // console.log(`   Base URL: ${config.baseUrl}`);

  if (process.env.NEXT_PUBLIC_AUDIO_STRATEGY) {
    // console.log(`   Manual Override: ${process.env.NEXT_PUBLIC_AUDIO_STRATEGY}`);
  }
}
