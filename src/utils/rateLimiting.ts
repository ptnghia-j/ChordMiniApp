/**
 * Rate limiting utilities for frontend API calls
 */

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RateLimitError extends Error {
  status: 429;
  rateLimitInfo?: RateLimitInfo;
}

/**
 * Parse rate limit headers from API response
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  const retryAfter = headers.get('Retry-After');

  if (!limit || !remaining || !reset) {
    return null;
  }

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    reset: parseInt(reset, 10),
    retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
  };
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return !!(error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429);
}

/**
 * Create a rate limit error from response
 */
export function createRateLimitError(response: Response): RateLimitError {
  const rateLimitInfo = parseRateLimitHeaders(response.headers);
  const error = new Error('Rate limit exceeded') as RateLimitError;
  error.status = 429;
  error.rateLimitInfo = rateLimitInfo || undefined;
  return error;
}

/**
 * Exponential backoff utility
 */
export class ExponentialBackoff {
  private attempt = 0;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly maxAttempts: number;

  constructor(
    baseDelay = 1000, // 1 second
    maxDelay = 30000, // 30 seconds
    maxAttempts = 5
  ) {
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Get the delay for the current attempt
   */
  getDelay(): number {
    if (this.attempt >= this.maxAttempts) {
      throw new Error('Maximum retry attempts exceeded');
    }

    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.attempt),
      this.maxDelay
    );

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }

  /**
   * Wait for the calculated delay
   */
  async wait(): Promise<void> {
    const delay = this.getDelay();
    this.attempt++;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Reset the backoff counter
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Check if we can retry
   */
  canRetry(): boolean {
    return this.attempt < this.maxAttempts;
  }
}

/**
 * Enhanced fetch with rate limiting and retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions?: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
  }
): Promise<Response> {
  const backoff = new ExponentialBackoff(
    retryOptions?.baseDelay,
    retryOptions?.maxDelay,
    retryOptions?.maxAttempts
  );

  while (true) {
    try {
      const response = await fetch(url, options);

      // If rate limited, throw a specific error
      if (response.status === 429) {
        throw createRateLimitError(response);
      }

      // If successful or non-retryable error, return response
      if (response.ok || response.status < 500) {
        backoff.reset();
        return response;
      }

      // For 5xx errors, retry if possible
      if (!backoff.canRetry()) {
        return response;
      }

      console.warn(`Request failed with status ${response.status}, retrying...`);
      await backoff.wait();

    } catch (error) {
      // For rate limit errors, wait and retry if possible
      if (isRateLimitError(error)) {
        if (!backoff.canRetry()) {
          throw error;
        }

        const retryAfter = error.rateLimitInfo?.retryAfter;
        if (retryAfter) {
          // Use server-provided retry-after if available
          console.warn(`Rate limited, waiting ${retryAfter} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else {
          // Use exponential backoff
          console.warn('Rate limited, using exponential backoff...');
          await backoff.wait();
        }
        continue;
      }

      // For other errors, retry if possible
      if (!backoff.canRetry()) {
        throw error;
      }

      console.warn('Request failed, retrying...', error);
      await backoff.wait();
    }
  }
}

/**
 * Get user-friendly rate limit message
 */
export function getRateLimitMessage(error: RateLimitError): string {
  const retryAfter = error.rateLimitInfo?.retryAfter;
  
  if (retryAfter) {
    if (retryAfter < 60) {
      return `Too many requests. Please wait ${retryAfter} seconds before trying again.`;
    } else {
      const minutes = Math.ceil(retryAfter / 60);
      return `Too many requests. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.`;
    }
  }

  return 'Too many requests. Please wait a moment before trying again.';
}

/**
 * Client-side rate limiter for preventing excessive requests
 */
export class ClientRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests = 10, windowMs = 60000) { // 10 requests per minute by default
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    // Check if we're under the limit
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }

  /**
   * Get time until next request is allowed
   */
  getRetryAfter(key: string): number {
    const requests = this.requests.get(key) || [];
    if (requests.length === 0) return 0;

    const oldestRequest = Math.min(...requests);
    const timeUntilReset = this.windowMs - (Date.now() - oldestRequest);
    
    return Math.max(0, Math.ceil(timeUntilReset / 1000));
  }

  /**
   * Clear requests for a key
   */
  clear(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }
}
