/**
 * Performance Monitoring Service for ChordMiniApp
 * 
 * Monitors the critical fixes deployed:
 * 1. Firebase query count reduction (target: 60-80% decrease)
 * 2. QuickTube filename pattern matching accuracy
 * 3. Smart caching system performance
 * 4. Error frequency and warning reduction
 */

interface PerformanceMetrics {
  // Firebase Performance
  firebaseQueries: {
    total: number;
    cached: number;
    failed: number;
    avgResponseTime: number;
    reductionPercentage: number;
  };
  
  // QuickTube Filename Accuracy
  filenameMatching: {
    totalAttempts: number;
    successfulMatches: number;
    vietnameseCharacterTests: number;
    accuracyPercentage: number;
  };
  
  // Smart Cache Performance
  cachePerformance: {
    hitRate: number;
    missRate: number;
    incompleteRecords: number;
    errorCount: number;
    avgCacheResponseTime: number;
  };
  
  // Error Tracking
  errorTracking: {
    warningsSuppressed: number;
    legacyRecordErrors: number;
    totalErrors: number;
    errorReductionPercentage: number;
  };
  
  // Timestamps
  lastUpdated: number;
  monitoringStartTime: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private alerts: Array<{ type: string; message: string; timestamp: number }> = [];
  private baselineMetrics: Partial<PerformanceMetrics> | null = null;

  constructor() {
    this.metrics = this.initializeMetrics();
    this.startMonitoring();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      firebaseQueries: {
        total: 0,
        cached: 0,
        failed: 0,
        avgResponseTime: 0,
        reductionPercentage: 0
      },
      filenameMatching: {
        totalAttempts: 0,
        successfulMatches: 0,
        vietnameseCharacterTests: 0,
        accuracyPercentage: 0
      },
      cachePerformance: {
        hitRate: 0,
        missRate: 0,
        incompleteRecords: 0,
        errorCount: 0,
        avgCacheResponseTime: 0
      },
      errorTracking: {
        warningsSuppressed: 0,
        legacyRecordErrors: 0,
        totalErrors: 0,
        errorReductionPercentage: 0
      },
      lastUpdated: Date.now(),
      monitoringStartTime: Date.now()
    };
  }

  /**
   * Track Firebase query performance
   */
  trackFirebaseQuery(type: 'cache_hit' | 'cache_miss' | 'error', responseTime: number): void {
    this.metrics.firebaseQueries.total++;
    
    switch (type) {
      case 'cache_hit':
        this.metrics.firebaseQueries.cached++;
        break;
      case 'error':
        this.metrics.firebaseQueries.failed++;
        break;
    }

    // Update average response time
    this.updateAverageResponseTime(responseTime);
    
    // Calculate reduction percentage
    this.calculateFirebaseReduction();
    
    this.checkFirebaseAlerts();
    this.updateTimestamp();
  }

  /**
   * Track QuickTube filename matching accuracy
   */
  trackFilenameMatching(success: boolean, isVietnamese: boolean = false): void {
    this.metrics.filenameMatching.totalAttempts++;
    
    if (success) {
      this.metrics.filenameMatching.successfulMatches++;
    }
    
    if (isVietnamese) {
      this.metrics.filenameMatching.vietnameseCharacterTests++;
    }

    // Calculate accuracy percentage
    this.metrics.filenameMatching.accuracyPercentage = 
      (this.metrics.filenameMatching.successfulMatches / this.metrics.filenameMatching.totalAttempts) * 100;

    this.checkFilenameAccuracyAlerts();
    this.updateTimestamp();
  }

  /**
   * Track smart cache performance
   */
  trackCachePerformance(type: 'hit' | 'miss' | 'incomplete' | 'error', responseTime: number): void {
    switch (type) {
      case 'hit':
        this.metrics.cachePerformance.hitRate++;
        break;
      case 'miss':
        this.metrics.cachePerformance.missRate++;
        break;
      case 'incomplete':
        this.metrics.cachePerformance.incompleteRecords++;
        break;
      case 'error':
        this.metrics.cachePerformance.errorCount++;
        break;
    }

    // Update average cache response time
    this.updateAverageCacheResponseTime(responseTime);
    
    this.checkCachePerformanceAlerts();
    this.updateTimestamp();
  }

  /**
   * Track error reduction and warning suppression
   */
  trackErrorReduction(type: 'warning_suppressed' | 'legacy_error' | 'general_error'): void {
    this.metrics.errorTracking.totalErrors++;
    
    switch (type) {
      case 'warning_suppressed':
        this.metrics.errorTracking.warningsSuppressed++;
        break;
      case 'legacy_error':
        this.metrics.errorTracking.legacyRecordErrors++;
        break;
    }

    this.calculateErrorReduction();
    this.checkErrorReductionAlerts();
    this.updateTimestamp();
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance summary for dashboard
   */
  getPerformanceSummary(): {
    status: 'excellent' | 'good' | 'warning' | 'critical';
    summary: string;
    keyMetrics: Record<string, string>;
    alerts: Array<{ type: string; message: string; timestamp: number }>;
  } {
    const firebaseReduction = this.metrics.firebaseQueries.reductionPercentage;
    const filenameAccuracy = this.metrics.filenameMatching.accuracyPercentage;
    const cacheHitRate = this.calculateCacheHitRate();
    const errorReduction = this.metrics.errorTracking.errorReductionPercentage;

    let status: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
    let summary = 'All systems performing optimally';

    // Determine overall status
    if (firebaseReduction < 40 || filenameAccuracy < 90 || cacheHitRate < 60) {
      status = 'critical';
      summary = 'Critical performance issues detected';
    } else if (firebaseReduction < 60 || filenameAccuracy < 95 || cacheHitRate < 80) {
      status = 'warning';
      summary = 'Performance below target thresholds';
    } else if (firebaseReduction < 70 || filenameAccuracy < 98) {
      status = 'good';
      summary = 'Performance within acceptable range';
    }

    return {
      status,
      summary,
      keyMetrics: {
        'Firebase Query Reduction': `${firebaseReduction.toFixed(1)}%`,
        'Filename Accuracy': `${filenameAccuracy.toFixed(1)}%`,
        'Cache Hit Rate': `${cacheHitRate.toFixed(1)}%`,
        'Error Reduction': `${errorReduction.toFixed(1)}%`,
        'Vietnamese Tests': `${this.metrics.filenameMatching.vietnameseCharacterTests}`,
        'Warnings Suppressed': `${this.metrics.errorTracking.warningsSuppressed}`
      },
      alerts: this.alerts.slice(-10) // Last 10 alerts
    };
  }

  /**
   * Set baseline metrics for comparison
   */
  setBaseline(baseline: Partial<PerformanceMetrics>): void {
    this.baselineMetrics = baseline;
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      summary: this.getPerformanceSummary()
    }, null, 2);
  }

  // Private helper methods
  private updateAverageResponseTime(responseTime: number): void {
    const total = this.metrics.firebaseQueries.total;
    const current = this.metrics.firebaseQueries.avgResponseTime;
    this.metrics.firebaseQueries.avgResponseTime = ((current * (total - 1)) + responseTime) / total;
  }

  private updateAverageCacheResponseTime(responseTime: number): void {
    const total = this.metrics.cachePerformance.hitRate + this.metrics.cachePerformance.missRate;
    const current = this.metrics.cachePerformance.avgCacheResponseTime;
    this.metrics.cachePerformance.avgCacheResponseTime = ((current * (total - 1)) + responseTime) / total;
  }

  private calculateFirebaseReduction(): void {
    const total = this.metrics.firebaseQueries.total;
    const cached = this.metrics.firebaseQueries.cached;
    
    if (total > 0) {
      this.metrics.firebaseQueries.reductionPercentage = (cached / total) * 100;
    }
  }

  private calculateCacheHitRate(): number {
    const hits = this.metrics.cachePerformance.hitRate;
    const misses = this.metrics.cachePerformance.missRate;
    const total = hits + misses;
    
    return total > 0 ? (hits / total) * 100 : 0;
  }

  private calculateErrorReduction(): void {
    const suppressed = this.metrics.errorTracking.warningsSuppressed;
    const total = this.metrics.errorTracking.totalErrors;
    
    if (total > 0) {
      this.metrics.errorTracking.errorReductionPercentage = (suppressed / total) * 100;
    }
  }

  private checkFirebaseAlerts(): void {
    const reduction = this.metrics.firebaseQueries.reductionPercentage;
    
    if (reduction < 40) {
      this.addAlert('critical', `Firebase query reduction critically low: ${reduction.toFixed(1)}%`);
    } else if (reduction < 60) {
      this.addAlert('warning', `Firebase query reduction below target: ${reduction.toFixed(1)}%`);
    }
  }

  private checkFilenameAccuracyAlerts(): void {
    const accuracy = this.metrics.filenameMatching.accuracyPercentage;
    
    if (accuracy < 90) {
      this.addAlert('critical', `Filename matching accuracy critically low: ${accuracy.toFixed(1)}%`);
    } else if (accuracy < 95) {
      this.addAlert('warning', `Filename matching accuracy below target: ${accuracy.toFixed(1)}%`);
    }
  }

  private checkCachePerformanceAlerts(): void {
    const hitRate = this.calculateCacheHitRate();
    
    if (hitRate < 60) {
      this.addAlert('critical', `Cache hit rate critically low: ${hitRate.toFixed(1)}%`);
    } else if (hitRate < 80) {
      this.addAlert('warning', `Cache hit rate below target: ${hitRate.toFixed(1)}%`);
    }
  }

  private checkErrorReductionAlerts(): void {
    const reduction = this.metrics.errorTracking.errorReductionPercentage;
    
    if (reduction < 50) {
      this.addAlert('warning', `Error reduction below expected: ${reduction.toFixed(1)}%`);
    }
  }

  private addAlert(type: string, message: string): void {
    this.alerts.push({
      type,
      message,
      timestamp: Date.now()
    });

    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }

    // Performance alert logged to metrics only
  }

  private updateTimestamp(): void {
    this.metrics.lastUpdated = Date.now();
  }

  private startMonitoring(): void {
    // Performance monitoring started silently
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export types for use in other modules
export type { PerformanceMetrics };
