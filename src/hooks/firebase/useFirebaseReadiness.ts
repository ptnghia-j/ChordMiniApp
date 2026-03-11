import { useState, useEffect } from 'react';

/**
 * Custom hook to manage Firebase readiness state
 * Extracted from the main page component to isolate Firebase connection logic
 *
 * MIGRATION: Updated to use @/config/firebase instead of @/lib/firebase-lazy
 */
export const useFirebaseReadiness = () => {
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const checkFirebaseReady = async () => {
      try {
        const { ensureFirebaseInitialized } = await import('@/config/firebase');
        const { db } = await ensureFirebaseInitialized();

        if (!db) {
          throw new Error('Firestore instance not available');
        }

        if (cancelled) {
          return;
        }

        setFirebaseReady(true);
        console.log('✅ Firebase connection verified');
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error('❌ Firebase connection failed:', error);
        setFirebaseReady(false);

        // Retry after a delay
        retryTimeout = setTimeout(() => {
          if (cancelled) {
            return;
          }

          console.log('🔄 Retrying Firebase connection...');
          void checkFirebaseReady();
        }, 2000);
      }
    };

    void checkFirebaseReady();

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, []);

  return { firebaseReady };
};
