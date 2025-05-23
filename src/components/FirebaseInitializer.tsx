'use client';

import { useEffect } from 'react';
import { initTranslationsCollection } from '@/config/firebase';

/**
 * Client component that initializes Firebase collections
 * This component doesn't render anything visible
 */
export default function FirebaseInitializer() {
  useEffect(() => {
    // Initialize Firebase collections
    const initializeCollections = async () => {
      try {
        await initTranslationsCollection();
      } catch (error) {
        console.error('Error initializing Firebase collections:', error);
      }
    };

    initializeCollections();
  }, []);

  // This component doesn't render anything
  return null;
}
