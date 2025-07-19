/**
 * Environment Detection Utility for ChordMini
 *
 * Simplified URL-based strategy detection:
 * - Localhost Development: Use yt-dlp when both NEXT_PUBLIC_BASE_URL and NEXT_PUBLIC_PYTHON_API_URL contain "localhost"
 * - Production: Use yt2mp3magic for all other environments
 * - Automatic fallback between strategies for reliability
 */

export type AudioProcessingStrategy = 'yt2mp3magic' | 'ytdlp';

export interface EnvironmentConfig {
  strategy: AudioProcessingStrategy;
  isProduction: boolean;
  isDevelopment: boolean;
  isVercel: boolean;
  baseUrl: string;
}

/**
 * Detect the current environment and return appropriate configuration
 * Uses URL-based detection for simplified strategy selection
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

  // Determine strategy based on URL detection
  // Use ytdlp for localhost development, yt2mp3magic for production
  const strategy: AudioProcessingStrategy = isLocalhost ? 'ytdlp' : 'yt2mp3magic';
  
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
 * Check if we should use YT2MP3 Magic integration (production)
 */
export function shouldUseYt2mp3Magic(): boolean {
  return getAudioProcessingStrategy() === 'yt2mp3magic';
}

/**
 * Get environment-specific configuration for audio processing
 */
export function getAudioProcessingConfig() {
  const env = detectEnvironment();
  
  return {
    strategy: env.strategy,
    endpoints: {
      yt2mp3magic: {
        baseUrl: 'https://yt2mp3-magic.onrender.com',
        convertPath: '/convert-mp3',
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
      fallback: env.strategy === 'ytdlp' ? 'yt2mp3magic' : 'ytdlp' // Automatic fallback between strategies
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
