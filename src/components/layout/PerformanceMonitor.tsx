'use client';

import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  ttfb: number | null;
  fcp: number | null;
}

/**
 * Performance monitoring component for tracking Core Web Vitals
 * Helps monitor improvements in mobile performance
 */
const PerformanceMonitor: React.FC = () => {
  const metricsRef = useRef<PerformanceMetrics>({
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null,
    fcp: null
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;


    if (process.env.NODE_ENV === 'development') {
      // Development builds include extra overhead; use production for accurate Web Vitals.
      console.info('ℹ️ PerformanceMonitor: Development metrics are slower by design. Check production for accurate Web Vitals.');
    }

    // Track Largest Contentful Paint (LCP)
    const observeLCP = () => {
      try {
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          metricsRef.current.lcp = lastEntry.startTime;

          if (process.env.NODE_ENV === 'development') {
            console.log('📊 LCP:', lastEntry.startTime.toFixed(2), 'ms');
            if (lastEntry.startTime > 2500) {
              console.warn('⚠️ LCP is poor (>2.5s). Target: <2.5s');
            }
          }
        });

        observer.observe({ entryTypes: ['largest-contentful-paint'] });
        return observer;
      } catch {
        console.warn('LCP observation not supported');
        return null;
      }
    };

    // Track First Input Delay (FID)
    const observeFID = () => {
      try {
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          entries.forEach((entry: PerformanceEntry & { processingStart?: number }) => {
            const fid = (entry.processingStart || 0) - entry.startTime;
            metricsRef.current.fid = fid;

            if (process.env.NODE_ENV === 'development') {
              console.log('📊 FID:', fid.toFixed(2), 'ms');
              if (fid > 100) {
                console.warn('⚠️ FID is poor (>100ms). Target: <100ms');
              }
            }
          });
        });

        observer.observe({ entryTypes: ['first-input'] });
        return observer;
      } catch {
        console.warn('FID observation not supported');
        return null;
      }
    };

    // Track Cumulative Layout Shift (CLS)
    const observeCLS = () => {
      try {
        let clsValue = 0;
        let lastCLSLog = 0;
        let warned = false;
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          entries.forEach((entry: PerformanceEntry & { value?: number; hadRecentInput?: boolean }) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value || 0;
            }
          });

          metricsRef.current.cls = clsValue;

          if (process.env.NODE_ENV === 'development') {
            const now = performance.now();
            // Throttle CLS logs to once every 2s to reduce console noise
            if (now - lastCLSLog > 2000) {
              // eslint-disable-next-line no-console
              console.log('📊 CLS:', clsValue.toFixed(4));
              lastCLSLog = now;
            }
            // Warn once after initial load window if threshold exceeded
            if (!warned && clsValue > 0.1 && now > 5000) {
              // eslint-disable-next-line no-console
              console.warn('⚠️ CLS is poor (>0.1). Target: <0.1');
              warned = true;
            }
          }
        });

        observer.observe({ entryTypes: ['layout-shift'] });
        return observer;
      } catch {
        console.warn('CLS observation not supported');
        return null;
      }
    };

    // Track First Contentful Paint (FCP)
    const observeFCP = () => {
      try {
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              metricsRef.current.fcp = entry.startTime;

              if (process.env.NODE_ENV === 'development') {
                console.log('📊 FCP:', entry.startTime.toFixed(2), 'ms');
                if (entry.startTime > 1800) {
                  console.warn('⚠️ FCP is poor (>1.8s). Target: <1.8s');
                }
              }
            }
          });
        });

        observer.observe({ entryTypes: ['paint'] });
        return observer;
      } catch {
        console.warn('FCP observation not supported');
        return null;
      }
    };

    // Track Time to First Byte (TTFB)
    const measureTTFB = () => {
      try {
        const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigationEntry) {
          const ttfb = navigationEntry.responseStart - navigationEntry.requestStart;
          metricsRef.current.ttfb = ttfb;

          if (process.env.NODE_ENV === 'development') {
            console.log('📊 TTFB:', ttfb.toFixed(2), 'ms');
            if (ttfb > 800) {
              console.warn('⚠️ TTFB is poor (>800ms). Target: <800ms');
            }
          }
        }
      } catch {
        console.warn('TTFB measurement not supported');
      }
    };

    // Track JavaScript bundle sizes
    const trackBundleSizes = () => {
      try {
        const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const jsResources = resourceEntries.filter(entry =>
          entry.name.includes('.js') &&
          (entry.name.includes('_next') || entry.name.includes('chunk'))
        );

        let totalJSSize = 0;
        const bundleInfo: Array<{name: string, size: number}> = [];

        jsResources.forEach(resource => {
          const size = resource.transferSize || 0;
          totalJSSize += size;

          if (size > 50000) { // Log bundles larger than 50KB
            bundleInfo.push({
              name: resource.name.split('/').pop() || 'unknown',
              size: Math.round(size / 1024)
            });
          }
        });

        if (process.env.NODE_ENV === 'development') {
          console.log('📦 Total JS Bundle Size:', Math.round(totalJSSize / 1024), 'KB');
          if (bundleInfo.length > 0) {
            console.log('📦 Large Bundles (>50KB):', bundleInfo);
          }

          if (totalJSSize > 500000) { // 500KB
            console.warn('⚠️ Total JS bundle is large (>500KB). Consider code splitting.');
          }
        }
      } catch {
        console.warn('Bundle size tracking not supported');
      }
    };

    // Track memory usage (if available)
    const trackMemoryUsage = () => {
      try {
        if ('memory' in performance) {
          const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;

          if (process.env.NODE_ENV === 'development' && memory) {
            console.log('🧠 Memory Usage:', {
              used: Math.round(memory.usedJSHeapSize / 1048576) + ' MB',
              total: Math.round(memory.totalJSHeapSize / 1048576) + ' MB',
              limit: Math.round(memory.jsHeapSizeLimit / 1048576) + ' MB'
            });
          }
        }
      } catch {
        console.warn('Memory tracking not supported');
      }
    };

    // Initialize observers
    const lcpObserver = observeLCP();
    const fidObserver = observeFID();
    const clsObserver = observeCLS();
    const fcpObserver = observeFCP();

    // Measure TTFB immediately
    measureTTFB();

    // Track bundle sizes and memory after load
    setTimeout(() => {
      trackBundleSizes();
      trackMemoryUsage();
    }, 1000);

    // Generate performance report after 10 seconds
    const reportTimeout = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Performance Report:', {
          LCP: metricsRef.current.lcp ? `${metricsRef.current.lcp.toFixed(2)}ms` : 'Not measured',
          FID: metricsRef.current.fid ? `${metricsRef.current.fid.toFixed(2)}ms` : 'Not measured',
          CLS: metricsRef.current.cls ? metricsRef.current.cls.toFixed(4) : 'Not measured',
          FCP: metricsRef.current.fcp ? `${metricsRef.current.fcp.toFixed(2)}ms` : 'Not measured',
          TTFB: metricsRef.current.ttfb ? `${metricsRef.current.ttfb.toFixed(2)}ms` : 'Not measured'
        });
      }
    }, 10000);

    // Cleanup
    return () => {
      lcpObserver?.disconnect();
      fidObserver?.disconnect();
      clsObserver?.disconnect();
      fcpObserver?.disconnect();
      clearTimeout(reportTimeout);
    };
  }, []);

  // This component doesn't render anything visible
  return null;
};

export default PerformanceMonitor;
