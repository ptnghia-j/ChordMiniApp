/**
 * Environment Detection Utility for ChordMini
 *
 * Simplified URL-based strategy detection:
 * - Localhost Development: Use yt-dlp when both NEXT_PUBLIC_BASE_URL and NEXT_PUBLIC_PYTHON_API_URL contain "localhost"
 * - Production: Use yt2mp3magic for all other environments
 * - Automatic fallback between strategies for reliability
 */

export type AudioProcessingStrategy = 'appwrite-ytdlp' | 'ytdlp' | 'yt-mp3-go';

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

  // Determine strategy based on URL detection and Appwrite availability
  // Priority: appwrite-ytdlp > ytdlp (localhost) > yt-mp3-go (fallback)
  let strategy: AudioProcessingStrategy;

  // Check if Appwrite is configured
  const appwriteProjectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

  if (appwriteProjectId && appwriteProjectId.trim() !== '') {
    // Use Appwrite YT-DLP service if configured (most reliable)
    strategy = 'appwrite-ytdlp';
  } else if (isLocalhost) {
    // Use local yt-dlp for localhost development
    strategy = 'ytdlp';
  } else {
    // Fallback to yt-mp3-go for production without Appwrite
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
 * Check if we should use Appwrite YT-DLP integration (preferred)
 */
export function shouldUseAppwriteYtDlp(): boolean {
  return getAudioProcessingStrategy() === 'appwrite-ytdlp';
}

/**
 * Check if we should use yt-mp3-go integration (fallback)
 */
export function shouldUseYtMp3Go(): boolean {
  return getAudioProcessingStrategy() === 'yt-mp3-go';
}

/**
 * Get environment-specific configuration for audio processing
 */
export function getAudioProcessingConfig() {
  const env = detectEnvironment();
  
  return {
    strategy: env.strategy,
    endpoints: {
      appwriteYtdlp: {
        projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '',
        functionId: 'yt-dlp-audio-extractor',
        endpoint: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
          ? `https://${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}.appwrite.global`
          : '',
        timeout: 300000 // 5 minutes
      },
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
