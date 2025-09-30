/**
 * Public Configuration Loader
 * 
 * This module provides runtime configuration loading for the ChordMiniApp frontend.
 * It enables "build once, run anywhere" Docker deployment by fetching environment
 * variables at runtime from the /api/config endpoint.
 * 
 * Usage Patterns:
 * 
 * 1. Client-side (async):
 *    const config = await loadPublicConfig();
 *    const apiUrl = config.NEXT_PUBLIC_PYTHON_API_URL;
 * 
 * 2. Server-side (sync):
 *    const apiUrl = getConfigValueSync('NEXT_PUBLIC_PYTHON_API_URL', 'fallback');
 * 
 * 3. React components (use hook):
 *    const config = usePublicConfig();
 *    const apiUrl = config.NEXT_PUBLIC_PYTHON_API_URL;
 */

// Type definition for public configuration
export interface PublicConfig {
  // Firebase Configuration
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;

  // API Configuration
  NEXT_PUBLIC_YOUTUBE_API_KEY?: string;
  NEXT_PUBLIC_PYTHON_API_URL?: string;
  NEXT_PUBLIC_BASE_URL?: string;

  // Feature Flags
  NEXT_PUBLIC_AUDIO_STRATEGY?: string;
  NEXT_PUBLIC_ENABLE_TRUE_STREAMING?: string;
  NEXT_DISABLE_DEV_OVERLAY?: string;

  // Environment
  NODE_ENV?: string;

  // Allow additional NEXT_PUBLIC_* variables
  [key: string]: string | undefined;
}

// Cache for loaded configuration
let configCache: PublicConfig | null = null;

// Promise for in-flight config loading (prevents duplicate requests)
let configPromise: Promise<PublicConfig> | null = null;

/**
 * Load public configuration from /api/config endpoint (client-side)
 * or from process.env (server-side).
 * 
 * This function is cached - subsequent calls return the cached config.
 * 
 * @returns Promise resolving to public configuration object
 */
export async function loadPublicConfig(): Promise<PublicConfig> {
  // Return cached config if available
  if (configCache) {
    return configCache;
  }

  // Return in-flight promise if already loading
  if (configPromise) {
    return configPromise;
  }

  // Server-side: use process.env directly
  if (typeof window === 'undefined') {
    configCache = process.env as PublicConfig;
    return configCache;
  }

  // Client-side: fetch from /api/config
  console.log('[publicConfig] Loading runtime configuration from /api/config');

  configPromise = fetch('/api/config', { 
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to load config: ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then((config: PublicConfig) => {
      console.log('[publicConfig] Runtime configuration loaded successfully');
      console.log('[publicConfig] Config keys:', Object.keys(config));
      configCache = config;
      configPromise = null;
      return config;
    })
    .catch((error) => {
      console.error('[publicConfig] Failed to load runtime config, falling back to process.env:', error);
      configPromise = null;
      
      // Fallback to process.env (for build time or if /api/config fails)
      // This ensures the app still works during build and in case of API errors
      configCache = process.env as PublicConfig;
      return configCache;
    });

  return configPromise;
}

/**
 * Get a specific configuration value (async, for client-side)
 * 
 * @param key - Configuration key to retrieve
 * @param fallback - Fallback value if key is not found
 * @returns Promise resolving to configuration value or fallback
 */
export async function getConfigValue(key: string, fallback?: string): Promise<string | undefined> {
  const config = await loadPublicConfig();
  return config[key] || fallback;
}

/**
 * Get a specific configuration value (sync, for server-side only)
 * 
 * This function should only be used in server-side code (API routes, SSR, metadata).
 * For client-side code, use getConfigValue() or loadPublicConfig().
 * 
 * @param key - Configuration key to retrieve
 * @param fallback - Fallback value if key is not found
 * @returns Configuration value or fallback
 */
export function getConfigValueSync(key: string, fallback?: string): string | undefined {
  if (typeof window !== 'undefined') {
    console.warn('[publicConfig] getConfigValueSync called on client-side, use getConfigValue() instead');
  }
  return process.env[key] || fallback;
}

/**
 * Clear the configuration cache
 * 
 * This is useful for testing or when you need to force a config reload.
 * In production, this should rarely be needed.
 */
export function clearConfigCache(): void {
  configCache = null;
  configPromise = null;
  console.log('[publicConfig] Configuration cache cleared');
}

/**
 * Check if configuration is loaded
 * 
 * @returns True if configuration is cached, false otherwise
 */
export function isConfigLoaded(): boolean {
  return configCache !== null;
}

/**
 * Get cached configuration synchronously (if available)
 * 
 * This returns null if config hasn't been loaded yet.
 * Use loadPublicConfig() to ensure config is loaded.
 * 
 * @returns Cached configuration or null
 */
export function getCachedConfig(): PublicConfig | null {
  return configCache;
}

/**
 * Preload configuration
 * 
 * Call this early in your app initialization to start loading config
 * before it's actually needed. This can improve perceived performance.
 * 
 * @returns Promise that resolves when config is loaded
 */
export async function preloadConfig(): Promise<void> {
  await loadPublicConfig();
}

/**
 * Get Firebase configuration from runtime config
 * 
 * @returns Promise resolving to Firebase configuration object
 */
export async function getFirebaseConfig() {
  const config = await loadPublicConfig();
  
  return {
    apiKey: config.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: config.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: config.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: config.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: config.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: config.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: config.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

/**
 * Get Firebase configuration synchronously (server-side only)
 * 
 * @returns Firebase configuration object
 */
export function getFirebaseConfigSync() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

/**
 * Get backend URL from runtime config
 * 
 * @param fallback - Fallback URL if not configured
 * @returns Promise resolving to backend URL
 */
export async function getBackendUrl(fallback = 'http://localhost:5001'): Promise<string> {
  const config = await loadPublicConfig();
  return config.NEXT_PUBLIC_PYTHON_API_URL || fallback;
}

/**
 * Get backend URL synchronously (server-side only)
 * 
 * @param fallback - Fallback URL if not configured
 * @returns Backend URL
 */
export function getBackendUrlSync(fallback = 'http://localhost:5001'): string {
  return process.env.NEXT_PUBLIC_PYTHON_API_URL || fallback;
}

