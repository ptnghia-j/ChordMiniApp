// Environment configuration
//
// RUNTIME CONFIG SUPPORT:
// - Server-side code: Use 'config' constant (process.env)
// - Client-side code: Use getConfigAsync() for runtime configuration

import { loadPublicConfig } from '@/config/publicConfig';

// Static configuration (suitable for server-side code)
export const config = {
  // Frontend API base URL - browser clients should call same-origin Next.js API routes.
  pythonApiUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',

  // Local development URL (for reference)
  localApiUrl: 'http://localhost:5001',

  // Other environment variables
  apiTimeout: 120000, // 2 minutes for production ML models
  maxAudioSize: 50 * 1024 * 1024, // 50MB
};

/**
 * Get configuration with runtime values (async, for client-side)
 *
 * Use this function in client-side code to get configuration
 * that is set at Docker container runtime.
 *
 * @returns Promise resolving to configuration object
 */
export async function getConfigAsync() {
  // Server-side: use static config
  if (typeof window === 'undefined') {
    return config;
  }

  // Client-side: load runtime config
  const runtimeConfig = await loadPublicConfig();
  return {
    pythonApiUrl: typeof window !== 'undefined' ? window.location.origin : (runtimeConfig.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
    localApiUrl: 'http://localhost:3000',
    apiTimeout: 120000,
    maxAudioSize: 50 * 1024 * 1024,
  };
}

export default config;