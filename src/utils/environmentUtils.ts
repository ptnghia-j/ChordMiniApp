/**
 * Environment Detection and Error Handling Utilities
 * 
 * Provides utilities for detecting the runtime environment and
 * providing appropriate error messages for different environments.
 */

export interface EnvironmentInfo {
  isProduction: boolean;
  isVercel: boolean;
  isLocalDevelopment: boolean;
  nodeVersion?: string;
  userAgent?: string;
}

/**
 * Detect the current runtime environment
 */
export function detectEnvironment(): EnvironmentInfo {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  const isLocalDevelopment = !isProduction && !isVercel;
  
  // Get Node.js version if available
  let nodeVersion: string | undefined;
  try {
    nodeVersion = process.version;
  } catch {
    // Not available in browser environment
  }

  // Get user agent if available (browser environment)
  let userAgent: string | undefined;
  try {
    userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  } catch {
    // Not available in server environment
  }

  return {
    isProduction,
    isVercel,
    isLocalDevelopment,
    nodeVersion,
    userAgent
  };
}

/**
 * Check if AbortSignal.timeout is available in the current environment
 */
export function isAbortSignalTimeoutAvailable(): boolean {
  try {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  } catch {
    return false;
  }
}

/**
 * Create a safe timeout signal that works across different environments
 */
export function createSafeTimeoutSignal(timeoutMs: number): AbortSignal {
  try {
    // Validate timeout value
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`Invalid timeout value: ${timeoutMs}. Must be a positive integer.`);
    }

    // Try the modern AbortSignal.timeout() first
    if (isAbortSignalTimeoutAvailable()) {
      return AbortSignal.timeout(timeoutMs);
    }
  } catch (error) {
    console.warn(`⚠️ AbortSignal.timeout failed, using fallback:`, error);
  }

  // Fallback to manual AbortController with setTimeout
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return controller.signal;
}

/**
 * Get environment-specific error messages
 */
export function getEnvironmentSpecificErrorMessage(
  baseError: string,
  errorType: 'timeout' | 'network' | 'compatibility' | 'general'
): string {
  const env = detectEnvironment();
  
  switch (errorType) {
    case 'timeout':
      if (env.isVercel) {
        return `${baseError} This may be due to Vercel's 60-second timeout limit. Please try a shorter video (under 3 minutes) or use the direct file upload option.`;
      } else if (env.isProduction) {
        return `${baseError} This may be due to server timeout limits. Please try a shorter audio file or try again later.`;
      } else {
        return `${baseError} Please try a shorter audio file or check your internet connection.`;
      }
      
    case 'network':
      if (env.isVercel) {
        return `${baseError} This may be due to Vercel's network configuration. Please try again or use a different network.`;
      } else {
        return `${baseError} Please check your internet connection and try again.`;
      }
      
    case 'compatibility':
      if (env.isVercel) {
        return `${baseError} This appears to be a browser compatibility issue in the production environment. Please try refreshing the page or using a different browser.`;
      } else if (env.isProduction) {
        return `${baseError} This appears to be a browser compatibility issue. Please try refreshing the page or using a different browser.`;
      } else {
        return `${baseError} This may be a browser compatibility issue. Please try refreshing the page.`;
      }
      
    case 'general':
    default:
      if (env.isVercel) {
        return `${baseError} If this issue persists, it may be related to Vercel's production environment. Please try again or contact support.`;
      } else if (env.isProduction) {
        return `${baseError} If this issue persists, please try again or contact support.`;
      } else {
        return `${baseError} Please try again.`;
      }
  }
}

/**
 * Log environment information for debugging
 */
export function logEnvironmentInfo(): void {
  // const env = detectEnvironment();
  // console.log('🌍 Environment Info:', {
  //   isProduction: env.isProduction,
  //   isVercel: env.isVercel,
  //   isLocalDevelopment: env.isLocalDevelopment,
  //   nodeVersion: env.nodeVersion,
  //   userAgent: env.userAgent?.substring(0, 100) + '...', // Truncate for readability
  //   abortSignalTimeoutAvailable: isAbortSignalTimeoutAvailable()
  // });
}
