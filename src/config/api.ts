/**
 * API Configuration for ChordMini
 * 
 * This file centralizes API endpoint configuration and routing logic.
 * YouTube-related endpoints are routed to the Python backend (Google Cloud Run)
 * while other endpoints remain on the Vercel frontend.
 */

// Backend URLs
export const BACKEND_URLS = {
  // Google Cloud Run Python backend
  PYTHON_BACKEND: 'https://chordmini-backend-full-12071603127.us-central1.run.app',

  // Vercel frontend (current domain)
  VERCEL_FRONTEND: typeof window !== 'undefined' ? window.location.origin : '',
} as const;

// Endpoint routing configuration
export const API_ROUTES = {
  // YouTube endpoints - routed to Python backend
  SEARCH_YOUTUBE: `${BACKEND_URLS.PYTHON_BACKEND}/api/search-youtube`,
  EXTRACT_AUDIO: `${BACKEND_URLS.PYTHON_BACKEND}/api/extract-audio`,
  
  // Other endpoints - remain on Vercel frontend
  RECOGNIZE_CHORDS: '/api/recognize-chords',
  RECOGNIZE_CHORDS_BTC_PL: '/api/recognize-chords-btc-pl',
  RECOGNIZE_CHORDS_BTC_SL: '/api/recognize-chords-btc-sl',
  TRANSCRIBE_LYRICS: '/api/transcribe-lyrics',
  TRANSLATE_LYRICS: '/api/translate-lyrics',
  TRANSLATE_LYRICS_CACHED: '/api/translate-lyrics-cached',
  DETECT_KEY: '/api/detect-key',
  VALIDATE_GEMINI_KEY: '/api/validate-gemini-key',
  VALIDATE_MUSIC_AI_KEY: '/api/validate-music-ai-key',
  CACHE: '/api/cache',
  CHATBOT: '/api/chatbot',
  MODEL_INFO: '/api/model-info',
  DOCS: '/api/docs',
} as const;

/**
 * Get the full URL for an API endpoint
 * @param endpoint - The endpoint key from API_ROUTES
 * @returns Full URL for the endpoint
 */
export function getApiUrl(endpoint: keyof typeof API_ROUTES): string {
  return API_ROUTES[endpoint];
}

/**
 * Check if an endpoint is routed to the external backend
 * @param endpoint - The endpoint key from API_ROUTES
 * @returns True if the endpoint uses external backend
 */
export function isExternalBackendEndpoint(endpoint: keyof typeof API_ROUTES): boolean {
  const url = API_ROUTES[endpoint];
  return url.startsWith('http') && !url.includes(BACKEND_URLS.VERCEL_FRONTEND);
}

/**
 * Default fetch options for API requests
 */
export const DEFAULT_FETCH_OPTIONS: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Enhanced fetch options for external backend requests
 */
export const EXTERNAL_BACKEND_FETCH_OPTIONS: RequestInit = {
  ...DEFAULT_FETCH_OPTIONS,
  mode: 'cors',
  credentials: 'omit', // Don't send cookies to external backend
};

/**
 * Make an API request with proper routing and error handling
 * @param endpoint - The endpoint key from API_ROUTES
 * @param options - Fetch options
 * @returns Promise with the response
 */
export async function apiRequest(
  endpoint: keyof typeof API_ROUTES,
  options: RequestInit = {}
): Promise<Response> {
  const url = getApiUrl(endpoint);
  const isExternal = isExternalBackendEndpoint(endpoint);
  
  const fetchOptions: RequestInit = {
    ...(isExternal ? EXTERNAL_BACKEND_FETCH_OPTIONS : DEFAULT_FETCH_OPTIONS),
    ...options,
  };
  
  try {
    console.log(`Making API request to: ${url} (external: ${isExternal})`);
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
      console.error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    console.error(`API request error for ${url}:`, error);
    throw error;
  }
}

/**
 * Make a POST request to an API endpoint
 * @param endpoint - The endpoint key from API_ROUTES
 * @param data - Request body data
 * @param options - Additional fetch options (e.g., signal for timeout)
 * @returns Promise with the response
 */
export async function apiPost(
  endpoint: keyof typeof API_ROUTES,
  data: Record<string, unknown>,
  options: RequestInit = {}
): Promise<Response> {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options,
  });
}

/**
 * Make a GET request to an API endpoint
 * @param endpoint - The endpoint key from API_ROUTES
 * @returns Promise with the response
 */
export async function apiGet(
  endpoint: keyof typeof API_ROUTES
): Promise<Response> {
  return apiRequest(endpoint, {
    method: 'GET',
  });
}
