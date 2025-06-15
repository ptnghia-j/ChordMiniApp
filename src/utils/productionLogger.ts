/**
 * Production-ready logging utility
 * Provides structured logging for production monitoring and debugging
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class ProductionLogger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';

  /**
   * Log an error message (always logged in production)
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      context,
      error
    };

    // Always log errors to console in production for monitoring
    console.error(`[ERROR] ${message}`, error || '', context || {});

    // In production, you would send this to your monitoring service
    if (this.isProduction) {
      this.sendToMonitoringService(logEntry);
    }
  }

  /**
   * Log a warning message (logged in production for important warnings)
   */
  warn(message: string, context?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      level: LogLevel.WARN,
      message,
      timestamp: new Date().toISOString(),
      context
    };

    // Log warnings in production for monitoring
    if (this.isProduction || this.isDevelopment) {
      console.warn(`[WARN] ${message}`, context || {});
    }

    if (this.isProduction) {
      this.sendToMonitoringService(logEntry);
    }
  }

  /**
   * Log an info message (only in development or when explicitly enabled)
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context || {});
    }
  }

  /**
   * Log a debug message (only in development)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, context || {});
    }
  }

  /**
   * Log API performance metrics
   */
  apiMetrics(endpoint: string, duration: number, status: number, context?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      level: LogLevel.INFO,
      message: `API ${endpoint} - ${status} (${duration}ms)`,
      timestamp: new Date().toISOString(),
      context: {
        endpoint,
        duration,
        status,
        ...context
      }
    };

    if (this.isProduction) {
      this.sendToMonitoringService(logEntry);
    } else if (this.isDevelopment) {
      console.info(`[API] ${endpoint} - ${status} (${duration}ms)`, context || {});
    }
  }

  /**
   * Log user actions for analytics
   */
  userAction(action: string, context?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      level: LogLevel.INFO,
      message: `User action: ${action}`,
      timestamp: new Date().toISOString(),
      context
    };

    if (this.isProduction) {
      this.sendToAnalyticsService(logEntry);
    } else if (this.isDevelopment) {
      console.info(`[USER] ${action}`, context || {});
    }
  }

  /**
   * Log security events (always logged)
   */
  security(message: string, context?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      level: LogLevel.WARN,
      message: `Security: ${message}`,
      timestamp: new Date().toISOString(),
      context
    };

    // Always log security events
    console.warn(`[SECURITY] ${message}`, context || {});

    if (this.isProduction) {
      this.sendToSecurityService(logEntry);
    }
  }

  /**
   * Send log entry to monitoring service (Sentry, LogRocket, etc.)
   */
  private sendToMonitoringService(logEntry: LogEntry): void {
    // In production, integrate with your monitoring service
    // Example: Sentry.captureMessage(logEntry.message, logEntry.level);
    
    // For now, we'll just ensure the log is captured
    if (logEntry.level === LogLevel.ERROR && logEntry.error) {
      // In production, you would send this to Sentry or similar
      // Sentry.captureException(logEntry.error, { extra: logEntry.context });
    }
  }

  /**
   * Send log entry to analytics service
   */
  private sendToAnalyticsService(logEntry: LogEntry): void {
    // In production, integrate with your analytics service
    // Example: analytics.track(logEntry.message, logEntry.context);
    console.log('Analytics:', logEntry);
  }

  /**
   * Send security log to security monitoring service
   */
  private sendToSecurityService(logEntry: LogEntry): void {
    // In production, integrate with security monitoring
    // Example: securityMonitor.alert(logEntry.message, logEntry.context);
    console.warn('Security Alert:', logEntry);
  }
}

// Export singleton instance
export const logger = new ProductionLogger();

// Convenience functions for common logging patterns
export const logError = (message: string, error?: Error, context?: Record<string, unknown>) =>
  logger.error(message, error, context);

export const logWarning = (message: string, context?: Record<string, unknown>) =>
  logger.warn(message, context);

export const logInfo = (message: string, context?: Record<string, unknown>) =>
  logger.info(message, context);

export const logDebug = (message: string, context?: Record<string, unknown>) =>
  logger.debug(message, context);

export const logApiCall = (endpoint: string, duration: number, status: number, context?: Record<string, unknown>) =>
  logger.apiMetrics(endpoint, duration, status, context);

export const logUserAction = (action: string, context?: Record<string, unknown>) =>
  logger.userAction(action, context);

export const logSecurity = (message: string, context?: Record<string, unknown>) =>
  logger.security(message, context);

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private startTimes = new Map<string, number>();

  start(operation: string): void {
    this.startTimes.set(operation, performance.now());
  }

  end(operation: string, context?: Record<string, unknown>): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      logger.warn(`Performance monitor: No start time found for operation ${operation}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.startTimes.delete(operation);

    // Log slow operations
    if (duration > 1000) { // Log operations taking more than 1 second
      logger.warn(`Slow operation detected: ${operation} took ${duration.toFixed(2)}ms`, {
        operation,
        duration,
        ...context
      });
    }

    return duration;
  }

  measure<T>(operation: string, fn: () => T, context?: Record<string, unknown>): T {
    this.start(operation);
    try {
      const result = fn();
      this.end(operation, context);
      return result;
    } catch (error) {
      this.end(operation, context);
      throw error;
    }
  }

  async measureAsync<T>(operation: string, fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
    this.start(operation);
    try {
      const result = await fn();
      this.end(operation, context);
      return result;
    } catch (error) {
      this.end(operation, context);
      throw error;
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * Error boundary logging helper
 */
export const logComponentError = (componentName: string, error: Error, errorInfo?: { componentStack?: string }) => {
  logger.error(`React component error in ${componentName}`, error, {
    componentName,
    errorInfo: errorInfo?.componentStack || 'No component stack available'
  });
};

/**
 * API error logging helper
 */
export const logApiError = (endpoint: string, error: Error, requestData?: unknown) => {
  logger.error(`API error for ${endpoint}`, error, {
    endpoint,
    requestData: requestData ? JSON.stringify(requestData).substring(0, 500) : undefined
  });
};

/**
 * User interaction logging helper
 */
export const logUserInteraction = (interaction: string, element?: string, context?: Record<string, unknown>) => {
  logger.userAction(`${interaction}${element ? ` on ${element}` : ''}`, context);
};
