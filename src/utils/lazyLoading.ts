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

// Preload critical resources
export const preloadCriticalResources = () => {
  if (typeof window === 'undefined') return;
  
  // Preload critical CSS
  const criticalCSS = document.createElement('link');
  criticalCSS.rel = 'preload';
  criticalCSS.href = '/_next/static/css/app/layout.css';
  criticalCSS.as = 'style';
  document.head.appendChild(criticalCSS);
  
  // Preload critical JavaScript
  const criticalJS = document.createElement('link');
  criticalJS.rel = 'preload';
  criticalJS.href = '/_next/static/chunks/main.js';
  criticalJS.as = 'script';
  document.head.appendChild(criticalJS);
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