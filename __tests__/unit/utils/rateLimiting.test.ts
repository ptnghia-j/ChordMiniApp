/**
 * Unit Tests: rateLimiting
 *
 * Tests ExponentialBackoff, ClientRateLimiter, rate limit header parsing,
 * error creation, and user-friendly messages.
 */

import {
  parseRateLimitHeaders,
  isRateLimitError,
  createRateLimitError,
  ExponentialBackoff,
  getRateLimitMessage,
  ClientRateLimiter,
} from '@/utils/rateLimiting';

describe('rateLimiting', () => {
  describe('parseRateLimitHeaders', () => {
    it('parses valid rate limit headers', () => {
      const headers = new Headers({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '50',
        'X-RateLimit-Reset': '1700000000',
      });

      const result = parseRateLimitHeaders(headers);
      expect(result).toEqual({
        limit: 100,
        remaining: 50,
        reset: 1700000000,
        retryAfter: undefined,
      });
    });

    it('includes retryAfter when Retry-After header is present', () => {
      const headers = new Headers({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1700000000',
        'Retry-After': '30',
      });

      const result = parseRateLimitHeaders(headers);
      expect(result?.retryAfter).toBe(30);
    });

    it('returns null when required headers are missing', () => {
      const headers = new Headers({});
      expect(parseRateLimitHeaders(headers)).toBeNull();
    });
  });

  describe('isRateLimitError', () => {
    it('returns true for 429 status errors', () => {
      const error = { status: 429, message: 'Rate limited' };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('returns false for other status codes', () => {
      expect(isRateLimitError({ status: 500 })).toBe(false);
      expect(isRateLimitError({ status: 200 })).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
      expect(isRateLimitError('error')).toBe(false);
    });
  });

  describe('createRateLimitError', () => {
    it('creates error with status 429', () => {
      // Create a mock response since Response is not available in jsdom
      const mockHeaders = new Headers({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1700000000',
      });

      const mockResponse = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: mockHeaders,
      } as unknown as Response;

      const error = createRateLimitError(mockResponse);
      expect(error.status).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.rateLimitInfo).toBeDefined();
      expect(error.rateLimitInfo?.limit).toBe(100);
    });
  });

  describe('ExponentialBackoff', () => {
    it('initializes with default values', () => {
      const backoff = new ExponentialBackoff();
      expect(backoff.canRetry()).toBe(true);
    });

    it('calculates increasing delays', () => {
      const backoff = new ExponentialBackoff(1000, 30000, 5);
      const delay1 = backoff.getDelay();
      // Delay should be around 1000ms (±25% jitter)
      expect(delay1).toBeGreaterThan(0);
      expect(delay1).toBeLessThanOrEqual(1250);
    });

    it('respects max delay', () => {
      const backoff = new ExponentialBackoff(10000, 15000, 10);
      const delay = backoff.getDelay();
      expect(delay).toBeLessThanOrEqual(15000 * 1.25); // max + jitter
    });

    it('tracks retry attempts correctly', () => {
      const backoff = new ExponentialBackoff(100, 1000, 2);
      expect(backoff.canRetry()).toBe(true);
    });

    it('throws when max attempts exceeded', () => {
      const backoff = new ExponentialBackoff(100, 1000, 0);
      expect(() => backoff.getDelay()).toThrow('Maximum retry attempts exceeded');
    });

    it('resets counter', () => {
      const backoff = new ExponentialBackoff(100, 1000, 2);
      backoff.reset();
      expect(backoff.canRetry()).toBe(true);
    });
  });

  describe('getRateLimitMessage', () => {
    it('shows seconds for short waits', () => {
      const error = {
        status: 429 as const,
        message: 'Rate limited',
        name: 'Error',
        rateLimitInfo: { limit: 100, remaining: 0, reset: 0, retryAfter: 30 },
      };

      const message = getRateLimitMessage(error);
      expect(message).toContain('30 seconds');
    });

    it('shows minutes for longer waits', () => {
      const error = {
        status: 429 as const,
        message: 'Rate limited',
        name: 'Error',
        rateLimitInfo: { limit: 100, remaining: 0, reset: 0, retryAfter: 120 },
      };

      const message = getRateLimitMessage(error);
      expect(message).toContain('minute');
    });

    it('shows generic message without retryAfter', () => {
      const error = {
        status: 429 as const,
        message: 'Rate limited',
        name: 'Error',
      };

      const message = getRateLimitMessage(error);
      expect(message).toContain('Too many requests');
    });
  });

  describe('ClientRateLimiter', () => {
    it('allows requests within limit', () => {
      const limiter = new ClientRateLimiter(3, 60000);
      expect(limiter.isAllowed('test')).toBe(true);
      expect(limiter.isAllowed('test')).toBe(true);
      expect(limiter.isAllowed('test')).toBe(true);
    });

    it('blocks requests exceeding limit', () => {
      const limiter = new ClientRateLimiter(2, 60000);
      expect(limiter.isAllowed('test')).toBe(true);
      expect(limiter.isAllowed('test')).toBe(true);
      expect(limiter.isAllowed('test')).toBe(false);
    });

    it('tracks different keys independently', () => {
      const limiter = new ClientRateLimiter(1, 60000);
      expect(limiter.isAllowed('key1')).toBe(true);
      expect(limiter.isAllowed('key2')).toBe(true);
      expect(limiter.isAllowed('key1')).toBe(false);
      expect(limiter.isAllowed('key2')).toBe(false);
    });

    it('returns retry-after time', () => {
      const limiter = new ClientRateLimiter(1, 60000);
      limiter.isAllowed('test');
      limiter.isAllowed('test');

      const retryAfter = limiter.getRetryAfter('test');
      expect(retryAfter).toBeGreaterThan(0);
    });

    it('returns 0 retry-after for unknown keys', () => {
      const limiter = new ClientRateLimiter();
      expect(limiter.getRetryAfter('unknown')).toBe(0);
    });

    it('clears specific key', () => {
      const limiter = new ClientRateLimiter(1, 60000);
      limiter.isAllowed('test');
      limiter.isAllowed('test');

      limiter.clear('test');
      expect(limiter.isAllowed('test')).toBe(true);
    });

    it('clears all keys', () => {
      const limiter = new ClientRateLimiter(1, 60000);
      limiter.isAllowed('key1');
      limiter.isAllowed('key2');

      limiter.clear();
      expect(limiter.isAllowed('key1')).toBe(true);
      expect(limiter.isAllowed('key2')).toBe(true);
    });
  });
});
