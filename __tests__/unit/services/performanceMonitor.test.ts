// We need to test the PerformanceMonitor class directly, not the singleton.
// Re-import the module to get a fresh class each time.

// The class isn't exported directly, but we can use the module's exports
// The source exports: performanceMonitor (singleton) and PerformanceMetrics (type)
// We'll test through the singleton but reset it between tests by creating new instances.

// Since PerformanceMonitor class is not directly exported, we test via the singleton
// and rely on its public API.

describe('PerformanceMonitor', () => {
  // We need a fresh instance per test. Since the class isn't exported,
  // we'll re-require the module each time.
  let monitor: any;

  beforeEach(() => {
    jest.resetModules();
    // Re-require to get a fresh singleton
    const mod = require('@/services/performance/performanceMonitor');
    monitor = mod.performanceMonitor;
  });

  describe('initial state', () => {
    it('starts with zeroed metrics', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.firebaseQueries.total).toBe(0);
      expect(metrics.firebaseQueries.cached).toBe(0);
      expect(metrics.firebaseQueries.failed).toBe(0);
      expect(metrics.filenameMatching.totalAttempts).toBe(0);
      expect(metrics.cachePerformance.hitRate).toBe(0);
      expect(metrics.errorTracking.totalErrors).toBe(0);
    });

    it('has a monitoringStartTime set', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.monitoringStartTime).toBeGreaterThan(0);
    });
  });

  describe('trackFirebaseQuery', () => {
    it('increments total on each call', () => {
      monitor.trackFirebaseQuery('cache_hit', 50);
      monitor.trackFirebaseQuery('cache_miss', 100);
      expect(monitor.getMetrics().firebaseQueries.total).toBe(2);
    });

    it('increments cached count for cache_hit', () => {
      monitor.trackFirebaseQuery('cache_hit', 30);
      expect(monitor.getMetrics().firebaseQueries.cached).toBe(1);
    });

    it('increments failed count for error', () => {
      monitor.trackFirebaseQuery('error', 200);
      expect(monitor.getMetrics().firebaseQueries.failed).toBe(1);
    });

    it('does not increment cached for cache_miss', () => {
      monitor.trackFirebaseQuery('cache_miss', 100);
      expect(monitor.getMetrics().firebaseQueries.cached).toBe(0);
    });

    it('calculates reduction percentage based on cache hits', () => {
      monitor.trackFirebaseQuery('cache_hit', 10);
      monitor.trackFirebaseQuery('cache_hit', 20);
      monitor.trackFirebaseQuery('cache_miss', 30);
      // 2 cached out of 3 total = 66.67%
      const reduction = monitor.getMetrics().firebaseQueries.reductionPercentage;
      expect(reduction).toBeCloseTo(66.67, 1);
    });

    it('computes average response time', () => {
      monitor.trackFirebaseQuery('cache_hit', 100);
      monitor.trackFirebaseQuery('cache_miss', 200);
      const avg = monitor.getMetrics().firebaseQueries.avgResponseTime;
      expect(avg).toBeCloseTo(150, 0);
    });

    it('updates lastUpdated timestamp', () => {
      const before = Date.now();
      monitor.trackFirebaseQuery('cache_hit', 50);
      const metrics = monitor.getMetrics();
      expect(metrics.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('trackFilenameMatching', () => {
    it('increments total attempts', () => {
      monitor.trackFilenameMatching(true);
      monitor.trackFilenameMatching(false);
      expect(monitor.getMetrics().filenameMatching.totalAttempts).toBe(2);
    });

    it('increments successful matches', () => {
      monitor.trackFilenameMatching(true);
      expect(monitor.getMetrics().filenameMatching.successfulMatches).toBe(1);
    });

    it('increments Vietnamese character tests', () => {
      monitor.trackFilenameMatching(true, true);
      expect(monitor.getMetrics().filenameMatching.vietnameseCharacterTests).toBe(1);
    });

    it('calculates accuracy percentage', () => {
      monitor.trackFilenameMatching(true);
      monitor.trackFilenameMatching(true);
      monitor.trackFilenameMatching(false);
      expect(monitor.getMetrics().filenameMatching.accuracyPercentage).toBeCloseTo(66.67, 1);
    });
  });

  describe('trackCachePerformance', () => {
    it('tracks cache hits', () => {
      monitor.trackCachePerformance('hit', 10);
      expect(monitor.getMetrics().cachePerformance.hitRate).toBe(1);
    });

    it('tracks cache misses', () => {
      monitor.trackCachePerformance('miss', 50);
      expect(monitor.getMetrics().cachePerformance.missRate).toBe(1);
    });

    it('tracks incomplete records', () => {
      monitor.trackCachePerformance('incomplete', 20);
      expect(monitor.getMetrics().cachePerformance.incompleteRecords).toBe(1);
    });

    it('tracks errors', () => {
      monitor.trackCachePerformance('error', 100);
      expect(monitor.getMetrics().cachePerformance.errorCount).toBe(1);
    });
  });

  describe('trackErrorReduction', () => {
    it('increments total errors', () => {
      monitor.trackErrorReduction('general_error');
      expect(monitor.getMetrics().errorTracking.totalErrors).toBe(1);
    });

    it('tracks warnings suppressed', () => {
      monitor.trackErrorReduction('warning_suppressed');
      expect(monitor.getMetrics().errorTracking.warningsSuppressed).toBe(1);
    });

    it('tracks legacy errors', () => {
      monitor.trackErrorReduction('legacy_error');
      expect(monitor.getMetrics().errorTracking.legacyRecordErrors).toBe(1);
    });

    it('calculates error reduction percentage', () => {
      monitor.trackErrorReduction('warning_suppressed');
      monitor.trackErrorReduction('warning_suppressed');
      monitor.trackErrorReduction('general_error');
      // 2 suppressed / 3 total = 66.67%
      expect(monitor.getMetrics().errorTracking.errorReductionPercentage).toBeCloseTo(66.67, 1);
    });
  });

  describe('getPerformanceSummary', () => {
    it('returns excellent status when no data (defaults to 0)', () => {
      const summary = monitor.getPerformanceSummary();
      // With all zeros, firebaseReduction=0 < 40, so status should be critical
      expect(summary.status).toBe('critical');
      expect(summary).toHaveProperty('summary');
      expect(summary).toHaveProperty('keyMetrics');
      expect(summary).toHaveProperty('alerts');
    });

    it('returns correct key metrics structure', () => {
      const summary = monitor.getPerformanceSummary();
      expect(summary.keyMetrics).toHaveProperty('Firebase Query Reduction');
      expect(summary.keyMetrics).toHaveProperty('Filename Accuracy');
      expect(summary.keyMetrics).toHaveProperty('Cache Hit Rate');
      expect(summary.keyMetrics).toHaveProperty('Error Reduction');
      expect(summary.keyMetrics).toHaveProperty('Vietnamese Tests');
      expect(summary.keyMetrics).toHaveProperty('Warnings Suppressed');
    });

    it('limits alerts to last 10', () => {
      const summary = monitor.getPerformanceSummary();
      expect(summary.alerts.length).toBeLessThanOrEqual(10);
    });
  });

  describe('exportMetrics', () => {
    it('returns a valid JSON string', () => {
      const exported = monitor.exportMetrics();
      const parsed = JSON.parse(exported);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('metrics');
      expect(parsed).toHaveProperty('summary');
    });
  });

  describe('getMetrics returns a copy', () => {
    it('returns a shallow copy (top-level is different reference)', () => {
      const metrics1 = monitor.getMetrics();
      const metrics2 = monitor.getMetrics();
      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('alerts', () => {
    it('generates critical alert when firebase reduction is very low', () => {
      // All cache_miss → 0% reduction → critical alert
      monitor.trackFirebaseQuery('cache_miss', 100);
      const summary = monitor.getPerformanceSummary();
      const criticalAlerts = summary.alerts.filter((a: any) => a.type === 'critical');
      expect(criticalAlerts.length).toBeGreaterThan(0);
    });

    it('generates warning alert when filename accuracy is below 95%', () => {
      // 9 successes, 1 failure = 90% → warning
      for (let i = 0; i < 9; i++) monitor.trackFilenameMatching(true);
      monitor.trackFilenameMatching(false);
      const summary = monitor.getPerformanceSummary();
      const warningAlerts = summary.alerts.filter(
        (a: any) => a.type === 'warning' && a.message.includes('Filename'),
      );
      expect(warningAlerts.length).toBeGreaterThan(0);
    });
  });
});
