'use client';

import { useEffect } from 'react';
import { preloadFirebase } from '@/lib/firebase-lazy';

/**
 * Client component that preloads Firebase when needed
 * Uses lazy loading to reduce initial bundle size
 */
export default function FirebaseInitializer() {
  useEffect(() => {
    // Define a function to handle all our non-critical Firebase setup
    const setupFirebase = () => {
      preloadFirebase();
      
      const initializeCollections = async () => {
        try {
          const { initTranslationsCollection } = await import('@/config/firebase');
          await initTranslationsCollection();
        } catch (error) {
          console.error('Error initializing Firebase collections:', error);
        }
      };
      initializeCollections();
    };

    // Use requestIdleCallback to run our setup function only when the browser is idle
    // This is a much better approach than a fixed setTimeout
    if ('requestIdleCallback' in window) {
      const idleCallbackId = window.requestIdleCallback(setupFirebase);
      return () => window.cancelIdleCallback(idleCallbackId);
    } else {
      // Fallback for older browsers
      const timeoutId = setTimeout(setupFirebase, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, []);

  // This component doesn't render anything
  return null;
}
