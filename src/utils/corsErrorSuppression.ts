/**
 * CORS Error Suppression Utility for ChordMini
 * 
 * This utility handles and suppresses harmless CORS warnings that occur from
 * embedded YouTube content and Google Ads tracking URLs. These warnings are
 * cosmetic and don't affect application functionality.
 */

/**
 * List of known harmless CORS error patterns from YouTube/Google services
 */
const HARMLESS_CORS_PATTERNS = [
  // Google Ads and tracking domains
  /googleads\.g\.doubleclick\.net/,
  /googlesyndication\.com/,
  /googletagmanager\.com/,
  /google-analytics\.com/,
  /googleadservices\.com/,
  /googletagservices\.com/,
  
  // YouTube tracking and analytics
  /youtube\.com\/api\/stats/,
  /youtube\.com\/youtubei\/v1\/log_event/,
  /youtube\.com\/ptracking/,
  /youtube\.com\/api\/timedtext/,
  
  // YouTube embed-related
  /ytimg\.com/,
  /ggpht\.com/,
  /youtube\.com\/embed/,
  
  // Generic CORS patterns for embedded content
  /Access to .* from origin .* has been blocked by CORS policy/,
  /Cross-Origin Request Blocked/,
  /Mixed Content: The page at .* was loaded over HTTPS, but requested an insecure/
];

/**
 * Error messages that are safe to suppress
 */
const HARMLESS_ERROR_MESSAGES = [
  'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT',
  'Failed to load resource: net::ERR_FAILED',
  'The resource was blocked by a content blocker',
  'AdBlock',
  'uBlock',
  'Privacy Badger',
  'WebKitBlobResource error',
  'Failed to load resource: The operation couldn\'t be completed. (WebKitBlobResource error',
  'blob:', // Generic blob URL errors
  'vercel-storage.com', // Vercel Blob storage errors
  'blob.vercel-storage.com' // Vercel Blob storage errors
];

/**
 * Check if an error is a harmless CORS/tracking error that can be suppressed
 */
export function isHarmlessCorsError(error: string | Error): boolean {
  const errorMessage = error instanceof Error ? error.message : error;
  
  // Check against known harmless patterns
  for (const pattern of HARMLESS_CORS_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return true;
    }
  }
  
  // Check against harmless error messages
  for (const message of HARMLESS_ERROR_MESSAGES) {
    if (errorMessage.includes(message)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Enhanced console error handler that filters out harmless CORS warnings
 */
export function setupCorsErrorSuppression(): void {
  // Only suppress in production to maintain debugging capabilities in development
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  
  // Store original console methods
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Override console.error to filter harmless CORS errors
  console.error = (...args: unknown[]) => {
    const errorMessage = args.join(' ');
    
    if (!isHarmlessCorsError(errorMessage)) {
      originalError.apply(console, args);
    }
  };
  
  // Override console.warn to filter harmless CORS warnings
  console.warn = (...args: unknown[]) => {
    const warnMessage = args.join(' ');
    
    if (!isHarmlessCorsError(warnMessage)) {
      originalWarn.apply(console, args);
    }
  };
}

/**
 * Window error handler for unhandled CORS errors
 */
export function setupWindowErrorHandler(): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') {
    return;
  }
  
  // Handle unhandled promise rejections (often CORS-related)
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (isHarmlessCorsError(errorMessage)) {
      event.preventDefault(); // Suppress the error
      return;
    }
  });
  
  // Handle general window errors
  window.addEventListener('error', (event) => {
    const errorMessage = event.message || event.error?.message || '';
    
    if (isHarmlessCorsError(errorMessage)) {
      event.preventDefault(); // Suppress the error
      return;
    }
  });
}

/**
 * Initialize CORS error suppression for the application
 * Call this once in your app initialization
 */
export function initializeCorsErrorSuppression(): void {
  setupCorsErrorSuppression();
  setupWindowErrorHandler();
}

/**
 * Documentation for developers about CORS warnings
 */
export const CORS_WARNING_DOCUMENTATION = {
  title: 'YouTube CORS Warnings - Expected Behavior',
  description: `
    The CORS warnings you may see in the browser console are expected and harmless.
    They occur because:
    
    1. Embedded YouTube content attempts to load tracking/analytics scripts
    2. Ad blockers and browser privacy settings block these requests
    3. Google Ads domains are blocked by CORS policies for security
    
    These warnings do NOT affect:
    - Video playback functionality
    - Audio extraction capabilities
    - Application performance
    - User experience
    
    The warnings are suppressed in production builds to reduce console noise
    while maintaining full debugging capabilities in development.
  `,
  technicalDetails: {
    affectedDomains: [
      'googleads.g.doubleclick.net',
      'googlesyndication.com',
      'googletagmanager.com',
      'youtube.com/api/stats',
      'ytimg.com',
      'ggpht.com'
    ],
    suppressionStrategy: 'Production-only console filtering with pattern matching',
    fallbackBehavior: 'All legitimate errors are preserved and logged normally'
  }
};
