// Mock the dynamic import of performanceMonitor before any imports
jest.mock('@/services/performance/performanceMonitor', () => ({
  performanceMonitor: {
    trackFirebaseQuery: jest.fn(),
    trackCachePerformance: jest.fn(),
    trackErrorReduction: jest.fn(),
  },
}));

import { SmartFirebaseCache } from '@/services/cache/smartFirebaseCache';

describe('SmartFirebaseCache', () => {
  let cache: SmartFirebaseCache<Record<string, unknown>>;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new SmartFirebaseCache<Record<string, unknown>>({
      ttl: 5000, // 5s
      maxErrorCount: 3,
      incompleteRecordTtl: 30000, // 30s
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    cache.clear();
  });

  // ─── Constructor & defaults ──────────────────────────────────
  it('uses default config values when none provided', () => {
    const defaultCache = new SmartFirebaseCache();
    // Just ensure it instantiates without error
    expect(defaultCache.getStats().totalEntries).toBe(0);
  });

  // ─── peek() ──────────────────────────────────────────────────
  describe('peek', () => {
    it('returns undefined for a missing key', () => {
      expect(cache.peek('missing')).toBeUndefined();
    });

    it('returns data for a fresh complete entry', () => {
      cache.set('k1', { a: 1 }, true);
      expect(cache.peek('k1')).toEqual({ a: 1 });
    });

    it('returns null for a fresh entry whose data is null', () => {
      cache.set('k1', null, false);
      expect(cache.peek('k1')).toBeNull();
    });

    it('returns undefined when complete entry has expired', () => {
      cache.set('k1', { a: 1 }, true);
      jest.advanceTimersByTime(6000); // past 5s TTL
      expect(cache.peek('k1')).toBeUndefined();
    });

    it('returns data when incomplete entry is within incompleteRecordTtl', () => {
      cache.set('k1', { a: 1 }, false); // incomplete
      jest.advanceTimersByTime(20000); // within 30s incomplete TTL
      expect(cache.peek('k1')).toEqual({ a: 1 });
    });

    it('returns undefined when incomplete entry has expired', () => {
      cache.set('k1', { a: 1 }, false);
      jest.advanceTimersByTime(31000); // past 30s incomplete TTL
      expect(cache.peek('k1')).toBeUndefined();
    });

    it('returns data for expired entry if errorCount >= maxErrorCount', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      // Error entries are isIncomplete=true, so they use incompleteRecordTtl (30s)
      await cache.get('k1', failFn); // errorCount=1
      jest.advanceTimersByTime(31000); // past incompleteRecordTtl
      await cache.get('k1', failFn); // errorCount=2
      jest.advanceTimersByTime(31000);
      await cache.get('k1', failFn); // errorCount=3
      jest.advanceTimersByTime(60000); // way past TTL
      // peek returns data because errorCount >= maxErrorCount
      expect(cache.peek('k1')).toBeNull();
      errorSpy.mockRestore();
    });
  });

  // ─── set() ───────────────────────────────────────────────────
  describe('set', () => {
    it('stores data with isIncomplete=false when isComplete=true', () => {
      cache.set('k1', { x: 1 }, true);
      expect(cache.peek('k1')).toEqual({ x: 1 });
      expect(cache.getStats().incompleteEntries).toBe(0);
    });

    it('stores data with isIncomplete=true when isComplete=false', () => {
      cache.set('k1', { x: 1 }, false);
      expect(cache.getStats().incompleteEntries).toBe(1);
    });

    it('defaults isComplete to true', () => {
      cache.set('k1', { x: 1 });
      expect(cache.getStats().incompleteEntries).toBe(0);
    });
  });

  // ─── get() — cache hit ──────────────────────────────────────
  describe('get – cache hit', () => {
    it('returns cached data without calling queryFn', async () => {
      cache.set('k1', { val: 42 }, true);
      const queryFn = jest.fn();
      const result = await cache.get('k1', queryFn);
      expect(result).toEqual({ val: 42 });
      expect(queryFn).not.toHaveBeenCalled();
    });

    it('returns cached null for incomplete record without calling queryFn', async () => {
      cache.set('k1', null, false);
      const queryFn = jest.fn();
      const result = await cache.get('k1', queryFn);
      expect(result).toBeNull();
      expect(queryFn).not.toHaveBeenCalled();
    });
  });

  // ─── get() — cache miss ─────────────────────────────────────
  describe('get – cache miss', () => {
    it('calls queryFn and caches complete result', async () => {
      const queryFn = jest.fn().mockResolvedValue({ val: 1 });
      const result = await cache.get('k1', queryFn);
      expect(result).toEqual({ val: 1 });
      expect(queryFn).toHaveBeenCalledTimes(1);
      // Subsequent call should use cache
      const result2 = await cache.get('k1', queryFn);
      expect(result2).toEqual({ val: 1 });
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('caches null when queryFn returns null', async () => {
      const queryFn = jest.fn().mockResolvedValue(null);
      const result = await cache.get('k1', queryFn);
      expect(result).toBeNull();
      expect(cache.getStats().incompleteEntries).toBe(1);
    });
  });

  // ─── get() — isCompleteCheck ────────────────────────────────
  describe('get – isCompleteCheck', () => {
    it('marks entry as incomplete when isCompleteCheck returns false', async () => {
      const queryFn = jest.fn().mockResolvedValue({ partial: true });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      await cache.get('k1', queryFn, (data) => !data.partial);
      expect(cache.getStats().incompleteEntries).toBe(1);
      warnSpy.mockRestore();
    });

    it('marks entry as complete when isCompleteCheck returns true', async () => {
      const queryFn = jest.fn().mockResolvedValue({ complete: true });
      await cache.get('k1', queryFn, (data) => !!data.complete);
      expect(cache.getStats().incompleteEntries).toBe(0);
    });
  });

  // ─── get() — cache expiry & re-fetch ───────────────────────
  describe('get – expiry', () => {
    it('re-fetches after TTL expires', async () => {
      const queryFn = jest.fn()
        .mockResolvedValueOnce({ v: 1 })
        .mockResolvedValueOnce({ v: 2 });

      await cache.get('k1', queryFn);
      expect(queryFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(6000); // past TTL
      const result = await cache.get('k1', queryFn);
      expect(result).toEqual({ v: 2 });
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });

  // ─── get() — error handling ─────────────────────────────────
  describe('get – error recovery', () => {
    it('returns null on first error with no cached data', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const queryFn = jest.fn().mockRejectedValue(new Error('network'));
      const result = await cache.get('k1', queryFn);
      expect(result).toBeNull();
      expect(cache.getStats().errorEntries).toBe(1);
      errorSpy.mockRestore();
    });

    it('returns previously cached data on error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      cache.set('k1', { old: true }, true);
      jest.advanceTimersByTime(6000); // expire

      const queryFn = jest.fn().mockRejectedValue(new Error('fail'));
      const result = await cache.get('k1', queryFn);
      expect(result).toEqual({ old: true });
      errorSpy.mockRestore();
    });

    it('stores error message for Error instances', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const queryFn = jest.fn().mockRejectedValue(new Error('specific error'));
      await cache.get('k1', queryFn);
      expect(cache.getStats().errorEntries).toBe(1);
      errorSpy.mockRestore();
    });

    it('handles non-Error thrown values', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const queryFn = jest.fn().mockRejectedValue('string error');
      await cache.get('k1', queryFn);
      expect(cache.getStats().errorEntries).toBe(1);
      errorSpy.mockRestore();
    });

    it('skips queryFn after maxErrorCount errors', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const queryFn = jest.fn().mockRejectedValue(new Error('fail'));

      // First call has no cached data so it queries
      await cache.get('k1', queryFn); // errorCount=1
      jest.advanceTimersByTime(31000); // past incompleteRecordTtl
      await cache.get('k1', queryFn); // errorCount=2
      jest.advanceTimersByTime(31000);
      await cache.get('k1', queryFn); // errorCount=3
      expect(queryFn).toHaveBeenCalledTimes(3);

      // Next call should skip queryFn because errorCount >= maxErrorCount
      jest.advanceTimersByTime(31000);
      const freshQueryFn = jest.fn().mockResolvedValue({ fresh: true });
      await cache.get('k1', freshQueryFn);
      expect(freshQueryFn).not.toHaveBeenCalled();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  // ─── getBatch() ─────────────────────────────────────────────
  describe('getBatch', () => {
    it('returns cached values for all keys without querying', async () => {
      cache.set('a', { v: 1 }, true);
      cache.set('b', { v: 2 }, true);
      const queryFn = jest.fn();
      const results = await cache.getBatch(['a', 'b'], queryFn);
      expect(results.get('a')).toEqual({ v: 1 });
      expect(results.get('b')).toEqual({ v: 2 });
      expect(queryFn).not.toHaveBeenCalled();
    });

    it('queries only uncached keys', async () => {
      cache.set('a', { v: 1 }, true);
      const queryFn = jest.fn().mockResolvedValue({ v: 99 });
      const results = await cache.getBatch(['a', 'b'], queryFn);
      expect(results.get('a')).toEqual({ v: 1 });
      expect(results.get('b')).toEqual({ v: 99 });
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(queryFn).toHaveBeenCalledWith('b');
    });

    it('handles errors in batch queries gracefully', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const queryFn = jest.fn().mockRejectedValue(new Error('batch fail'));
      const results = await cache.getBatch(['a', 'b'], queryFn);
      expect(results.get('a')).toBeNull();
      expect(results.get('b')).toBeNull();
      errorSpy.mockRestore();
    });

    it('uses isCompleteCheck for batch results', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const queryFn = jest.fn().mockResolvedValue({ partial: true });
      await cache.getBatch(['a'], queryFn, (d) => !d.partial);
      expect(cache.getStats().incompleteEntries).toBe(1);
      warnSpy.mockRestore();
    });

    it('returns cached data for error-maxed keys without querying', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Build up errors to maxErrorCount with expiry between each
      await cache.get('a', failFn); // errorCount=1
      jest.advanceTimersByTime(31000);
      await cache.get('a', failFn); // errorCount=2
      jest.advanceTimersByTime(31000);
      await cache.get('a', failFn); // errorCount=3

      jest.advanceTimersByTime(60000); // way past TTL
      const freshFn = jest.fn().mockResolvedValue({ fresh: true });
      const results = await cache.getBatch(['a'], freshFn);
      expect(freshFn).not.toHaveBeenCalled();
      expect(results.get('a')).toBeNull();
      errorSpy.mockRestore();
    });
  });

  // ─── invalidate() ───────────────────────────────────────────
  describe('invalidate', () => {
    it('removes a cache entry', () => {
      cache.set('k1', { v: 1 }, true);
      cache.invalidate('k1');
      expect(cache.peek('k1')).toBeUndefined();
      expect(cache.getStats().totalEntries).toBe(0);
    });

    it('is safe to call on a non-existent key', () => {
      expect(() => cache.invalidate('nonexistent')).not.toThrow();
    });
  });

  // ─── clear() ────────────────────────────────────────────────
  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('a', { v: 1 });
      cache.set('b', { v: 2 });
      cache.clear();
      expect(cache.getStats().totalEntries).toBe(0);
    });
  });

  // ─── getStats() ─────────────────────────────────────────────
  describe('getStats', () => {
    it('returns correct counts', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      cache.set('complete', { v: 1 }, true);
      cache.set('incomplete', { v: 2 }, false);
      const failFn = jest.fn().mockRejectedValue(new Error('err'));
      await cache.get('errored', failFn);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.incompleteEntries).toBe(2); // incomplete + errored
      expect(stats.errorEntries).toBe(1);
      errorSpy.mockRestore();
    });
  });

  // ─── cleanup() ──────────────────────────────────────────────
  describe('cleanup', () => {
    it('removes entries past 2x TTL', () => {
      cache.set('k1', { v: 1 }, true);
      jest.advanceTimersByTime(11000); // > 2 * 5000 TTL
      cache.cleanup();
      expect(cache.getStats().totalEntries).toBe(0);
    });

    it('keeps entries within 2x TTL', () => {
      cache.set('k1', { v: 1 }, true);
      jest.advanceTimersByTime(8000); // < 2 * 5000
      cache.cleanup();
      expect(cache.getStats().totalEntries).toBe(1);
    });

    it('uses incompleteRecordTtl for incomplete entries', () => {
      cache.set('k1', { v: 1 }, false); // incomplete, ttl=30s
      jest.advanceTimersByTime(50000); // < 2 * 30000
      cache.cleanup();
      expect(cache.getStats().totalEntries).toBe(1);

      jest.advanceTimersByTime(20000); // now 70s total > 2 * 30000
      cache.cleanup();
      expect(cache.getStats().totalEntries).toBe(0);
    });
  });
});
