'use client';

import { useEffect } from 'react';
import { preloadFirebase } from '@/config/firebase';

/**
 * Client component that preloads Firebase when needed
 * Uses lazy loading to reduce initial bundle size
 *
 * MIGRATION: Updated to use @/config/firebase instead of @/lib/firebase-lazy
 */
export default function FirebaseInitializer() {
  useEffect(() => {
    // PERFORMANCE FIX: Initialize Firebase immediately to prevent cache check race condition
    // During cold starts, audio extraction was starting before Firebase initialized,
    // causing cache checks to be bypassed and unnecessary backend calls
    const setupFirebase = async () => {
      try {
        // Initialize Firebase immediately for cache functionality
        await preloadFirebase();

        // Initialize collections after core Firebase is ready
        const initializeCollections = async () => {
          try {
            const { initTranslationsCollection } = await import('@/config/firebase');
            await initTranslationsCollection();
          } catch (error) {
            console.error('Error initializing Firebase collections:', error);
          }
        };

        // Use requestIdleCallback for non-critical collection setup only
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => initializeCollections());
        } else {
          setTimeout(() => initializeCollections(), 100);
        }
      } catch (error) {
        console.error('Error setting up Firebase:', error);
      }
    };

    // Initialize Firebase immediately on component mount
    setupFirebase();

    // Initialize connection monitoring for inactivity handling
    const initializeConnectionMonitoring = async () => {
      try {
        const { initializeConnectionMonitoring } = await import('@/utils/firebaseConnectionManager');
        initializeConnectionMonitoring();
      } catch (error) {
        console.warn('Failed to initialize Firebase connection monitoring:', error);
      }
    };

    initializeConnectionMonitoring();
  }, []);

  // This component doesn't render anything
  return null;
}
