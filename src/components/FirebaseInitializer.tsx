'use client';

import { useEffect } from 'react';
import { preloadFirebase } from '@/lib/firebase-lazy';

/**
 * Client component that preloads Firebase when needed
 * Uses lazy loading to reduce initial bundle size
 */
export default function FirebaseInitializer() {
  useEffect(() => {
    // Preload Firebase during idle time
    preloadFirebase();

    // Initialize Firebase collections lazily
    const initializeCollections = async () => {
      try {
        // Dynamic import to avoid loading Firebase config in initial bundle
        const { initTranslationsCollection } = await import('@/config/firebase');
        await initTranslationsCollection();
      } catch (error) {
        console.error('Error initializing Firebase collections:', error);
      }
    };

    // Delay initialization to not block initial render
    const timeoutId = setTimeout(initializeCollections, 2000);

    return () => clearTimeout(timeoutId);
  }, []);

  // This component doesn't render anything
  return null;
}
