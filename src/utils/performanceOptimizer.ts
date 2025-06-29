/**
 * Performance optimization utilities for ChordMiniApp
 * Helps reduce main thread work and improve mobile performance
 */

/**
 * Defer execution of non-critical code until the browser is idle
 */
export const deferUntilIdle = (callback: () => void, timeout = 5000): void => {
  if (typeof window === 'undefined') return;

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(callback, 0);
  }
};

/**
 * Batch DOM updates to reduce layout thrashing
 */
export const batchDOMUpdates = (updates: (() => void)[]): void => {
  if (typeof window === 'undefined') return;

  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
};

/**
 * Debounce function to limit expensive operations
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle function to limit execution frequency
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Lazy load heavy components when they come into view
 */
export const createIntersectionObserver = (
  callback: (entry: IntersectionObserverEntry) => void,
  options: IntersectionObserverInit = {}
): IntersectionObserver | null => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  return new IntersectionObserver((entries) => {
    entries.forEach(callback);
  }, {
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  });
};

/**
 * Preload critical resources during idle time
 */
export const preloadCriticalResources = (): void => {
  deferUntilIdle(() => {
    // Preload critical images
    const criticalImages = [
      '/demo1.png',
      '/demo1_dark.png',
      '/demo2.png',
      '/demo2_dark.png'
    ];

    criticalImages.forEach(src => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
    });
  });
};

/**
 * Optimize scroll performance
 */
export const optimizeScrollPerformance = (): void => {
  if (typeof window === 'undefined') return;

  // Use passive event listeners for better scroll performance
  const passiveSupported = (() => {
    let passive = false;
    try {
      const options = {
        get passive() {
          passive = true;
          return false;
        }
      } as AddEventListenerOptions;
      window.addEventListener('test', () => {}, options);
      window.removeEventListener('test', () => {}, options);
    } catch {
      passive = false;
    }
    return passive;
  })();

  if (passiveSupported) {
    // Add passive listeners to improve scroll performance
    ['touchstart', 'touchmove', 'wheel'].forEach(event => {
      document.addEventListener(event, () => {}, { passive: true });
    });
  }
};

/**
 * Memory management utilities
 */
export const memoryOptimizer = {
  /**
   * Clean up unused objects and force garbage collection (if available)
   */
  cleanup: (): void => {
    if (typeof window !== 'undefined' && 'gc' in window) {
      // Force garbage collection in development (Chrome DevTools)
      (window as Window & { gc?: () => void }).gc?.();
    }
  },

  /**
   * Monitor memory usage (development only)
   */
  monitor: (): void => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;

    if ('memory' in performance) {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (memory) {
        console.log('Memory Usage:', {
          used: Math.round(memory.usedJSHeapSize / 1048576) + ' MB',
          total: Math.round(memory.totalJSHeapSize / 1048576) + ' MB',
          limit: Math.round(memory.jsHeapSizeLimit / 1048576) + ' MB'
        });
      }
    }
  }
};

/**
 * Bundle size optimization helpers
 */
export const bundleOptimizer = {
  /**
   * Dynamically import heavy libraries only when needed
   */
  loadChartJS: () => import(/* webpackChunkName: "chartjs" */ 'chart.js'),
  loadFramerMotion: () => import(/* webpackChunkName: "framer-motion" */ 'framer-motion'),
  
  /**
   * Load Firebase services on demand
   */
  loadFirebaseAuth: () => import(/* webpackChunkName: "firebase-auth" */ 'firebase/auth'),
  loadFirebaseFirestore: () => import(/* webpackChunkName: "firebase-firestore" */ 'firebase/firestore'),
  loadFirebaseStorage: () => import(/* webpackChunkName: "firebase-storage" */ 'firebase/storage'),
};

/**
 * Performance monitoring
 */
export const performanceMonitor = {
  /**
   * Measure and log performance metrics
   */
  measurePerformance: (name: string, fn: () => void): void => {
    if (typeof window === 'undefined') return;

    const start = performance.now();
    fn();
    const end = performance.now();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Performance: ${name} took ${end - start} milliseconds`);
    }
  },

  /**
   * Track Core Web Vitals
   */
  trackWebVitals: (): void => {
    if (typeof window === 'undefined') return;

    // Track LCP (Largest Contentful Paint)
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log('LCP:', lastEntry.startTime);
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // Track FID (First Input Delay)
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach((entry) => {
        const fidEntry = entry as PerformanceEntry & { processingStart?: number };
        if (fidEntry.processingStart) {
          console.log('FID:', fidEntry.processingStart - entry.startTime);
        }
      });
    }).observe({ entryTypes: ['first-input'] });

    // Track CLS (Cumulative Layout Shift)
    new PerformanceObserver((entryList) => {
      let clsValue = 0;
      const entries = entryList.getEntries();
      entries.forEach((entry) => {
        const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!layoutShiftEntry.hadRecentInput) {
          clsValue += layoutShiftEntry.value || 0;
        }
      });
      console.log('CLS:', clsValue);
    }).observe({ entryTypes: ['layout-shift'] });
  }
};

/**
 * Initialize performance optimizations
 */
export const initializePerformanceOptimizations = (): void => {
  if (typeof window === 'undefined') return;

  // Optimize scroll performance
  optimizeScrollPerformance();

  // Preload critical resources
  preloadCriticalResources();

  // Track performance in development
  if (process.env.NODE_ENV === 'development') {
    performanceMonitor.trackWebVitals();
  }

  // Clean up memory periodically
  setInterval(() => {
    memoryOptimizer.cleanup();
  }, 60000); // Every minute
};
