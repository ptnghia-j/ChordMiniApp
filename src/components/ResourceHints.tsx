'use client';

import { useEffect } from 'react';

/**
 * Resource Hints Component for PageSpeed Optimization
 * Implements preloading and prefetching for critical resources
 */
const ResourceHints: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/') return;

    // Preload critical fonts (homepage only)
    const fontPreload = document.createElement('link');
    fontPreload.rel = 'preload';
    fontPreload.href = 'https://fonts.gstatic.com/s/robotomono/v23/L0xuDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vq_ROW4AJi8SJQt.woff2';
    fontPreload.as = 'font';
    fontPreload.type = 'font/woff2';
    fontPreload.crossOrigin = 'anonymous';
    document.head.appendChild(fontPreload);

    // Preload critical images (homepage only)
    const heroImagePreload = document.createElement('link');
    heroImagePreload.rel = 'preload';
    heroImagePreload.href = '/hero-image-placeholder.svg';
    heroImagePreload.as = 'image';
    heroImagePreload.fetchPriority = 'high';
    document.head.appendChild(heroImagePreload);

    // Prefetch likely navigation targets
    const prefetchTargets = ['/analyze', '/settings', '/docs'];
    prefetchTargets.forEach(target => {
      const prefetchLink = document.createElement('link');
      prefetchLink.rel = 'prefetch';
      prefetchLink.href = target;
      document.head.appendChild(prefetchLink);
    });
  }, []);

  return null;
};

export default ResourceHints;