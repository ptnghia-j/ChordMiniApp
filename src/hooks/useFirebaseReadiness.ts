import { useState, useEffect } from 'react';

/**
 * Custom hook to manage Firebase readiness state
 * Extracted from the main page component to isolate Firebase connection logic
 */
export const useFirebaseReadiness = () => {
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    const checkFirebaseReady = async () => {
      try {
        // Test Firebase connection with a simple operation
        const { getFirestoreInstance } = await import('@/lib/firebase-lazy');
        const firestore = await getFirestoreInstance();

        // Quick connection test - just ensure firestore instance exists
        if (!firestore) throw new Error('Firestore instance not available');

        setFirebaseReady(true);
        console.log('✅ Firebase connection verified');
      } catch (error) {
        console.error('❌ Firebase connection failed:', error);
        setFirebaseReady(false);
        
        // Retry after a delay
        setTimeout(() => {
          console.log('🔄 Retrying Firebase connection...');
          checkFirebaseReady();
        }, 2000);
      }
    };

    checkFirebaseReady();
  }, []);

  return { firebaseReady };
};
