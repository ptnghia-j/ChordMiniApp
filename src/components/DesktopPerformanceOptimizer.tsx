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
    // 1. Optimize CSS loading to prevent render blocking
    const optimizeCSSLoading = () => {
      // Load non-critical CSS asynchronously
      const loadCSS = (href: string) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.media = 'print';
        link.onload = () => {
          link.media = 'all';
        };
        document.head.appendChild(link);
      };

      // Defer non-critical stylesheets
      const criticalCSS = [
        '/_next/static/css/app/layout.css',
        '/_next/static/css/app/globals.css'
      ];

      criticalCSS.forEach(css => {
        const existingLink = document.querySelector(`link[href="${css}"]`);
        if (!existingLink) {
          loadCSS(css);
        }
      });
    };

    // 2. Optimize LCP image discovery and loading
    const optimizeLCPImages = () => {
      // Ensure LCP images are discoverable immediately
      const lcpImages = document.querySelectorAll('[data-lcp-image]');
      lcpImages.forEach((img) => {
        if (img instanceof HTMLImageElement) {
          // Force high priority loading
          img.loading = 'eager';
          img.fetchPriority = 'high';
          
          // Optimize image decoding
          img.decoding = 'sync';
          
          // Prevent layout shifts
          if (!img.style.aspectRatio && img.width && img.height) {
            img.style.aspectRatio = `${img.width} / ${img.height}`;
          }
        }
      });
    };

    // 3. Implement resource bundling optimization
    const optimizeResourceBundling = () => {
      // Only preload resources that are actually needed on the current page
      const isHomePage = typeof window !== 'undefined' && window.location.pathname === '/';

      // Only preload hero images that are immediately visible on homepage
      const criticalResources = [];

      if (isHomePage) {
        criticalResources.push(
          { href: '/hero-image-placeholder.svg', as: 'image', type: 'image/svg+xml' },
          { href: '/hero-image-placeholder-dark.svg', as: 'image', type: 'image/svg+xml' }
        );
        // Demo images are lazy-loaded and don't need preloading
      }

      criticalResources.forEach(resource => {
        const existingPreload = document.querySelector(`link[href="${resource.href}"][rel="preload"]`);
        if (!existingPreload) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.href = resource.href;
          link.as = resource.as;
          if (resource.type) {
            link.type = resource.type;
          }
          link.fetchPriority = 'high';
          document.head.appendChild(link);
        }
      });
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
                  eval(script.textContent || '');
                }, 0);
              }
            });
          });
        }
      };

      // Optimize font loading
      const optimizeFontLoading = () => {
        // Use font-display: swap for better perceived performance
        const fontFaces = document.styleSheets;
        Array.from(fontFaces).forEach(sheet => {
          try {
            const rules = sheet.cssRules || sheet.rules;
            Array.from(rules).forEach(rule => {
              if (rule instanceof CSSFontFaceRule) {
                const style = rule.style as CSSStyleDeclaration & { fontDisplay?: string };
                if (!style.fontDisplay) {
                  style.fontDisplay = 'swap';
                }
              }
            });
          } catch (e) {
            // Cross-origin stylesheets may throw errors
            console.debug('Cannot access stylesheet rules:', e);
          }
        });
      };

      optimizeMainThread();
      optimizeFontLoading();
    };

    // 5. Implement progressive enhancement
    const implementProgressiveEnhancement = () => {
      // Add performance observer for monitoring
      if ('PerformanceObserver' in window) {
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
