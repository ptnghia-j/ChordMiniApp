/**
 * Environment Detection Utility for ChordMini
 *
 * Simplified URL-based strategy detection:
 * - Localhost Development: Use yt-dlp when both NEXT_PUBLIC_BASE_URL and NEXT_PUBLIC_PYTHON_API_URL contain "localhost"
 * - Production: Use yt2mp3magic for all other environments
 * - Automatic fallback between strategies for reliability
 */

export type AudioProcessingStrategy = 'ytdlp' | 'yt-mp3-go' | 'ytdown-io';

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

  // Determine strategy based on manual override or URL detection
  // Priority: manual override > ytdown-io (production) > ytdlp (localhost) > yt-mp3-go (fallback)
  let strategy: AudioProcessingStrategy;

  // Check for manual strategy override
  const manualStrategy = process.env.NEXT_PUBLIC_AUDIO_STRATEGY;
  // Allow forcing ytdown.io in dev without changing manual override
  const devForceYtdown = process.env.NEXT_PUBLIC_DEV_USE_YTDOWN_IO === 'true';

  if (manualStrategy && manualStrategy !== 'auto' &&
      ['ytdlp', 'yt-mp3-go', 'ytdown-io'].includes(manualStrategy)) {
    strategy = manualStrategy as AudioProcessingStrategy;
    console.log(`🔧 Using manual audio strategy override: ${strategy}`);
  } else if (isLocalhost) {
    // For local development, allow switching to ytdown.io for debugging upload/403 issues
    strategy = devForceYtdown ? 'ytdown-io' : 'ytdlp';
  } else {
    // Use ytdown.io for production (more reliable than downr.org, no 403 errors)
    strategy = 'ytdown-io';
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
