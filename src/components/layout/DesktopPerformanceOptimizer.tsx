'use client';

import { useEffect } from 'react';

/**
 * Desktop Performance Optimizer Component
 * Addresses specific PageSpeed Insights issues for desktop performance:
 * - Render blocking resource optimization
 * - LCP image discovery enhancement
 * - Resource bundling and preloading
 * - Critical rendering path optimization
 */
export default function DesktopPerformanceOptimizer() {
  useEffect(() => {
    const performanceDebugEnabled =
      process.env.NODE_ENV === 'development' &&
      typeof window !== 'undefined' &&
      window.localStorage.getItem('performanceDebug') === '1';

    // 1. Optimize CSS loading to prevent render blocking
    const optimizeCSSLoading = () => {
      // Loading non-critical CSS manually is disabled; Next.js handles CSS injection from imports.

      // Defer non-critical stylesheets (disabled)
      // Do NOT manually reference Next.js internal CSS chunk paths.
      // Next injects CSS based on imports; hardcoding these causes 404s and Safari parse errors.
      const criticalCSS: string[] = [];

      criticalCSS.forEach(() => {
        /* no-op */
      });
    };

    // 2. Optimize LCP image discovery and loading
    const optimizeLCPImages = () => {
      // No-op: avoid post-paint image mutations that can force layout recalculation.
    };

    // 3. Implement resource bundling optimization
    const optimizeResourceBundling = () => {
      // Intentionally do nothing: rely on Next.js automatic image priority and route-level code splitting.
      // Avoid manual <link rel="preload"> to prevent preload-not-used warnings.
    };

    // 4. Optimize critical rendering path
    const optimizeCriticalRenderingPath = () => {
      // Minimize main thread work
      const optimizeMainThread = () => {
        // Use requestIdleCallback for non-critical operations
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            // Defer non-critical JavaScript execution
            const nonCriticalScripts = document.querySelectorAll('script[data-non-critical]');
            nonCriticalScripts.forEach(script => {
              if (script instanceof HTMLScriptElement && !script.src) {
                // Defer inline script execution
                setTimeout(() => {
                  // eslint-disable-next-line react-hooks/unsupported-syntax
                  eval(script.textContent || '');
                }, 0);
              }
            });
          });
        }
      };

      // Optimize font loading
      const optimizeFontLoading = () => {
        // No-op: font loading is handled by next/font at build time.
      };

      optimizeMainThread();
      optimizeFontLoading();
    };

    // 5. Implement progressive enhancement
    const implementProgressiveEnhancement = () => {
      // Add performance observer for monitoring
      if ('PerformanceObserver' in window && performanceDebugEnabled) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.entryType === 'largest-contentful-paint') {
              console.debug('LCP:', entry.startTime);
            }
            if (entry.entryType === 'first-input') {
              const fidEntry = entry as PerformanceEntry & { processingStart?: number };
              if (fidEntry.processingStart) {
                console.debug('FID:', fidEntry.processingStart - entry.startTime);
              }
            }
            if (entry.entryType === 'layout-shift') {
              const clsEntry = entry as PerformanceEntry & { value?: number };
              if (clsEntry.value !== undefined) {
                console.debug('CLS:', clsEntry.value);
              }
            }
          });
        });

        observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
      }
    };

    // Execute optimizations
    const runOptimizations = () => {
      optimizeCSSLoading();
      optimizeLCPImages();
      optimizeResourceBundling();
      optimizeCriticalRenderingPath();
      implementProgressiveEnhancement();
    };

    // Run immediately and on DOM content loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runOptimizations);
    } else {
      runOptimizations();
    }

    // Cleanup
    return () => {
      // Remove event listeners if needed
    };
  }, []);

  return null; // This component doesn't render anything
}
