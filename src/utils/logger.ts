/**
 * Production-safe logging utility
 * Removes console logs in production builds while keeping them for development
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

// Current log level based on environment
const currentLogLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR;

/**
 * Production-safe logger that only logs in development
 */
export const logger = {
  error: (...args: unknown[]) => {
    if (currentLogLevel >= LogLevel.ERROR) {
      console.error(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(...args);
    }
  },

  info: (...args: unknown[]) => {
    if (currentLogLevel >= LogLevel.INFO) {
      console.info(...args);
    }
  },

  log: (...args: unknown[]) => {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(...args);
    }
  },

  debug: (...args: unknown[]) => {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  },

  // Special methods for specific use cases
  cache: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('🔍 [CACHE]', ...args);
    }
  },

  api: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('🌐 [API]', ...args);
    }
  },

  firebase: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('🔥 [FIREBASE]', ...args);
    }
  },

  performance: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('⚡ [PERFORMANCE]', ...args);
    }
  }
};

/**
 * Conditional logging for development only
 */
export const devLog = (...args: unknown[]) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

/**
 * Conditional logging for production debugging (only errors and warnings)
 */
export const prodLog = {
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => {
    if (!isProduction) {
      console.info(...args);
    }
  }
};

/**
 * Performance timing utility
 */
export const perfTimer = (label: string) => {
  if (isDevelopment) {
    console.time(label);
    return () => console.timeEnd(label);
  }
  return () => {}; // No-op in production
};

/**
 * Group logging utility
 */
export const logGroup = (label: string, fn: () => void) => {
  if (isDevelopment) {
    console.group(label);
    fn();
    console.groupEnd();
  }
};

export default logger;
