'use client';

import { useEffect } from 'react';

/**
 * Critical Performance Optimizer Component
 * Addresses specific PageSpeed Insights issues:
 * - Forced reflow prevention
 * - LCP request discovery optimization
 * - Network dependency optimization
 */
const CriticalPerformanceOptimizer: React.FC = () => {
  useEffect(() => {
    // 1. Prevent forced reflow by optimizing layout calculations (hydration-safe)
    const optimizeLayoutCalculations = () => {
      // Skip inline style modifications to prevent hydration mismatches
      // Layout optimizations are now handled via CSS classes
    };

    // 2. Optimize LCP image discovery
    const optimizeLCPDiscovery = () => {
      // Ensure LCP image is discoverable immediately
      const lcpImage = document.querySelector('[data-lcp-image]') as HTMLImageElement;
      if (lcpImage) {
        // Remove lazy loading from LCP image
        lcpImage.loading = 'eager';
        lcpImage.fetchPriority = 'high';
        
        // Preload the LCP image if not already done
        if (!document.querySelector(`link[href="${lcpImage.src}"]`)) {
          const preloadLink = document.createElement('link');
          preloadLink.rel = 'preload';
          preloadLink.href = lcpImage.src;
          preloadLink.as = 'image';
          preloadLink.fetchPriority = 'high';
          document.head.appendChild(preloadLink);
        }
      }
    };

    // 3. Optimize network dependencies
    const optimizeNetworkDependencies = () => {
      // Preconnect to critical domains
      const criticalDomains = [
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://i.ytimg.com',
        'https://img.youtube.com'
      ];

      criticalDomains.forEach(domain => {
        if (!document.querySelector(`link[href="${domain}"]`)) {
          const preconnectLink = document.createElement('link');
          preconnectLink.rel = 'preconnect';
          preconnectLink.href = domain;
          if (domain.includes('fonts.gstatic.com')) {
            preconnectLink.crossOrigin = 'anonymous';
          }
          document.head.appendChild(preconnectLink);
        }
      });
    };

    // 4. Reduce layout shift by setting explicit dimensions
    const preventLayoutShift = () => {
      // Set explicit dimensions for images without them
      const images = document.querySelectorAll('img:not([width]):not([height])');
      images.forEach(img => {
        if (img instanceof HTMLImageElement && img.naturalWidth && img.naturalHeight) {
          img.width = img.naturalWidth;
          img.height = img.naturalHeight;
        }
      });
    };

    // 5. Optimize font loading to prevent FOIT/FOUT
    const optimizeFontLoading = () => {
      // Add font-display: swap to improve perceived performance
      const fontLinks = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
      fontLinks.forEach(link => {
        if (link instanceof HTMLLinkElement && !link.href.includes('display=swap')) {
          link.href += link.href.includes('?') ? '&display=swap' : '?display=swap';
        }
      });
    };

    // 6. Defer non-critical JavaScript
    const deferNonCriticalJS = () => {
      // Mark non-critical scripts for deferred loading
      const nonCriticalScripts = document.querySelectorAll('script[data-defer]');
      nonCriticalScripts.forEach(script => {
        if (script instanceof HTMLScriptElement) {
          script.defer = true;
        }
      });
    };

    // Run optimizations
    const runOptimizations = () => {
      optimizeLayoutCalculations();
      optimizeLCPDiscovery();
      optimizeNetworkDependencies();
      preventLayoutShift();
      optimizeFontLoading();
      deferNonCriticalJS();
    };

    // Run immediately
    runOptimizations();

    // Run again after DOM is fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runOptimizations);
    }

    // Run after images load
    window.addEventListener('load', () => {
      preventLayoutShift();
      optimizeLCPDiscovery();
    });

    // Cleanup
    return () => {
      document.removeEventListener('DOMContentLoaded', runOptimizations);
      window.removeEventListener('load', preventLayoutShift);
    };
  }, []);

  // Add critical CSS for performance optimization (hydration-safe)
  useEffect(() => {
    const criticalCSS = `
      /* Prevent layout shift */
      img {
        height: auto;
        max-width: 100%;
      }

      /* Optimize font rendering */
      body {
        font-display: swap;
      }

      /* GPU acceleration for critical elements */
      .hero-container,
      .navigation-container {
        transform: translateZ(0);
        backface-visibility: hidden;
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.textContent = criticalCSS;
    styleElement.id = 'critical-performance-css';

    if (!document.getElementById('critical-performance-css')) {
      document.head.appendChild(styleElement);
    }

    return () => {
      const existingStyle = document.getElementById('critical-performance-css');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  return null;
};

export default CriticalPerformanceOptimizer;
