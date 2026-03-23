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
    // Avoid post-paint DOM writes here. They were triggering forced reflow and
    // CLS on the homepage by changing media and font behavior after first paint.
    return undefined;
  }, []);

  // Add critical CSS for performance optimization (hydration-safe)
  useEffect(() => {
    const criticalCSS = `
      /* Prevent layout shift */
      img {
        height: auto;
        max-width: 100%;
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
