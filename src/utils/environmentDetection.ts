/**
 * Environment Detection Utility for ChordMini
 *
 * Determines the appropriate audio processing strategy based on the environment:
 * - Vercel Production: Use yt-mp3-go (better Unicode support, more reliable)
 * - Local Development: Use yt-dlp for local development flexibility
 * - Fallback: Use QuickTube for other environments
 */

export type AudioProcessingStrategy = 'quicktube' | 'ytdlp' | 'ytmp3go' | 'auto';

export interface EnvironmentConfig {
  strategy: AudioProcessingStrategy;
  isProduction: boolean;
  isDevelopment: boolean;
  isVercel: boolean;
  baseUrl: string;
}

/**
 * Detect the current environment and return appropriate configuration
 */
export function detectEnvironment(): EnvironmentConfig {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';
  
  // Get environment variables
  const nodeEnv = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = process.env.VERCEL_URL;
  
  // Determine if we're on Vercel
  const isVercel = !!(vercelEnv || vercelUrl || process.env.VERCEL);
  
  // Determine if we're in production
  const isProduction = nodeEnv === 'production' || isVercel;
  
  // Determine if we're in development
  const isDevelopment = nodeEnv === 'development' || (!isProduction && !isVercel);
  
  // Get base URL
  let baseUrl = '';
  if (isBrowser) {
    baseUrl = window.location.origin;
  } else if (vercelUrl) {
    baseUrl = `https://${vercelUrl}`;
  } else if (process.env.NEXT_PUBLIC_BASE_URL) {
    baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  } else {
    baseUrl = 'http://localhost:3000';
  }
  
  // Determine strategy based on environment
  let strategy: AudioProcessingStrategy;

  // Special handling for localhost development (override NODE_ENV if needed)
  const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

  if (isVercel && isProduction) {
    // Vercel Production: Use yt-mp3-go for better Unicode support and reliability
    strategy = 'ytmp3go';
  } else if (isLocalhost || nodeEnv === 'development') {
    // Local Development: Use yt-dlp for local development flexibility
    strategy = 'ytdlp';
  } else if (isProduction && !isVercel) {
    // Non-Vercel Production: Use QuickTube as fallback
    strategy = 'quicktube';
  } else {
    // Default fallback to QuickTube
    strategy = 'quicktube';
  }
  
  // Allow manual override via environment variable (but not for 'auto')
  const manualStrategy = process.env.NEXT_PUBLIC_AUDIO_STRATEGY as AudioProcessingStrategy;
  if (manualStrategy && manualStrategy !== 'auto' &&
      (manualStrategy === 'quicktube' || manualStrategy === 'ytdlp' || manualStrategy === 'ytmp3go')) {
    strategy = manualStrategy;
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
 * Check if we should use QuickTube integration
 */
export function shouldUseQuickTube(): boolean {
  return getAudioProcessingStrategy() === 'quicktube';
}

/**
 * Check if we should use yt-dlp integration
 */
export function shouldUseYtDlp(): boolean {
  return getAudioProcessingStrategy() === 'ytdlp';
}

/**
 * Check if we should use yt-mp3-go integration
 */
export function shouldUseYtMp3Go(): boolean {
  return getAudioProcessingStrategy() === 'ytmp3go';
}

/**
 * Get environment-specific configuration for audio processing
 */
export function getAudioProcessingConfig() {
  const env = detectEnvironment();
  
  return {
    strategy: env.strategy,
    endpoints: {
      quicktube: {
        baseUrl: 'https://quicktube.app',
        downloadPath: '/dl/',
        searchEnabled: true
      },
      ytdlp: {
        baseUrl: env.baseUrl,
        downloadPath: '/api/ytdlp/download',
        extractPath: '/api/ytdlp/extract',
        searchEnabled: true
      },
      ytmp3go: {
        baseUrl: 'https://lukavukanovic.xyz',
        apiPath: '/yt-downloader',
        downloadPath: '/download',
        eventsPath: '/events',
        filesPath: '/downloads',
        searchEnabled: false
      }
    },
    features: {
      filenameGeneration: env.strategy !== 'ytmp3go', // yt-mp3-go handles filenames natively
      caching: env.isProduction, // Enable caching in production
      fallback: env.isProduction ? (env.isVercel ? 'ytmp3go' : 'quicktube') : 'ytdlp' // Fallback strategy
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
