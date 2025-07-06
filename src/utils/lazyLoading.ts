/**
 * Lazy Loading Utilities for Performance Optimization
 */

import React from 'react';

// Intersection Observer for lazy loading
export const createLazyLoadObserver = (callback: IntersectionObserverCallback) => {
  if (typeof window === 'undefined') return null;
  
  return new IntersectionObserver(callback, {
    root: null,
    rootMargin: '50px',
    threshold: 0.1
  });
};

// Lazy load components with dynamic imports
export const lazyLoadComponent = (importFn: () => Promise<{ default: React.ComponentType<unknown> }>) => {
  return React.lazy(() =>
    importFn().then(module => ({
      default: module.default || module
    }))
  );
};

// Preload critical resources (removed CSS preloading as Next.js handles this automatically)
export const preloadCriticalResources = () => {
  if (typeof window === 'undefined') return;

  // Next.js automatically handles CSS and JavaScript preloading
  // Manual preloading can cause "unused preload" warnings
  // Only preload resources that are truly critical and not handled by Next.js

  console.debug('Critical resources are handled automatically by Next.js');
};

// Defer non-critical resources
export const deferNonCriticalResources = () => {
  if (typeof window === 'undefined') return;
  
  // Defer analytics and tracking scripts
  setTimeout(() => {
    // Load analytics after initial render
    const analytics = document.createElement('script');
    analytics.src = '/analytics.js';
    analytics.defer = true;
    document.head.appendChild(analytics);
  }, 2000);
};