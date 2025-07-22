// Ultra-lazy Firebase initialization with tree-shaking optimization
// Import only what we need, when we need it
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Lazy initialization functions
let firebaseApp: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

export const initializeFirebaseApp = async () => {
  if (firebaseApp) return firebaseApp;

  try {
    // Dynamic import to reduce initial bundle
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    return firebaseApp;
  } catch (error) {
    console.error('Firebase app initialization failed:', error);
    throw error;
  }
};

export const getFirestoreInstance = async () => {
  if (firestore) return firestore;

  const app = await initializeFirebaseApp();

  // Dynamic import for Firestore
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  firestore = getFirestore(app);

  // Connect to emulator in development only if explicitly enabled
  const useEmulator = process.env.NODE_ENV === 'development' &&
                     process.env.USE_FIREBASE_EMULATOR === 'true';

  if (useEmulator) {
    try {
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      console.log('🔥 Connected to Firestore emulator (localhost:8080)');
    } catch (error) {
      console.warn('⚠️ Failed to connect to Firestore emulator, using production Firebase:', error);
    }
  } else {
    console.log('🔥 Using production Firestore database');
  }

  return firestore;
};

export const getAuthInstance = async () => {
  if (auth) return auth;

  const app = await initializeFirebaseApp();

  // Dynamic import for Auth
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  auth = getAuth(app);

  // Connect to emulator in development only if explicitly enabled
  const useEmulator = process.env.NODE_ENV === 'development' &&
                     process.env.USE_FIREBASE_EMULATOR === 'true';

  if (useEmulator) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099');
      console.log('🔐 Connected to Auth emulator (localhost:9099)');
    } catch (error) {
      console.warn('⚠️ Failed to connect to Auth emulator, using production Firebase:', error);
    }
  } else {
    console.log('🔐 Using production Firebase Auth');
  }

  return auth;
};

// Preload Firebase when user interaction is detected
export const preloadFirebase = async (): Promise<void> => {
  try {
    // PERFORMANCE FIX: Initialize Firebase immediately to prevent cache check race condition
    // Return a Promise so callers can await Firebase initialization
    await initializeFirebaseApp();
  } catch (error) {
    console.error('Firebase preload failed:', error);
    throw error;
  }
};

// Export lazy-loaded instances
export { firebaseApp, firestore, auth };
