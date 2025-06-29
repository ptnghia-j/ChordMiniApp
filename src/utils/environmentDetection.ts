/**
 * Environment Detection Utility for ChordMini
 * 
 * Determines the appropriate audio processing strategy based on the environment:
 * - Production (Vercel): Use QuickTube integration with precise filename generation
 * - Development (localhost): Use yt-dlp integration for reliable local development
 */

export type AudioProcessingStrategy = 'quicktube' | 'ytdlp' | 'auto';

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
  
  if (isProduction || isVercel) {
    // Production: Use QuickTube for reliability and performance
    strategy = 'quicktube';
  } else if (isDevelopment || baseUrl.includes('localhost')) {
    // Development: Use yt-dlp for local development flexibility
    strategy = 'ytdlp';
  } else {
    // Default fallback to QuickTube
    strategy = 'quicktube';
  }
  
  // Allow manual override via environment variable (but not for 'auto')
  const manualStrategy = process.env.NEXT_PUBLIC_AUDIO_STRATEGY as AudioProcessingStrategy;
  if (manualStrategy && manualStrategy !== 'auto' && (manualStrategy === 'quicktube' || manualStrategy === 'ytdlp')) {
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
      }
    },
    features: {
      filenameGeneration: true, // Use our precise filename generation for both
      caching: env.isProduction, // Enable caching in production
      fallback: env.isProduction ? 'quicktube' : 'ytdlp' // Fallback strategy
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
