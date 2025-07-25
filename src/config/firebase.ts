// Import only the specific Firebase functions we need for better tree-shaking
import { initializeApp, FirebaseApp, getApps } from "firebase/app";
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, User, setPersistence, browserLocalPersistence } from "firebase/auth";

// Enhanced authentication state management - Using object to avoid TDZ issues
const authState = {
  ready: false,
  promise: null as Promise<void> | null,
  user: null as User | null
};

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Firebase configuration validated

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;

// Check if we have the required configuration
const hasRequiredConfig =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.authDomain &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.storageBucket;

if (hasRequiredConfig) {
  try {
    // Check if Firebase app already exists
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
    } else {
      // Initialize Firebase
      app = initializeApp(firebaseConfig);
    }

    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);

    // Only set up client-side features when window is available
    if (typeof window !== 'undefined') {
      // Set up authentication persistence to survive page refreshes
      setupAuthPersistence();

      // Set up anonymous authentication
      setupAnonymousAuth();
    } else {
      console.log('🔧 Skipping client-side auth setup on server-side');
    }
  } catch (error) {
    console.error('Error initializing Firebase:', error);

    // Create a fallback implementation to prevent app crashes
    db = null;
    storage = null;
    auth = null;
  }
} else {
  console.warn('Missing required Firebase configuration. Firebase will not be initialized.');
  console.warn('Please check your .env.local file for the following variables:');
  console.warn('- NEXT_PUBLIC_FIREBASE_API_KEY');
  console.warn('- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  console.warn('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  console.warn('- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
}

// Set up Firebase Auth persistence to survive page refreshes (client-side only)
async function setupAuthPersistence() {
  // SSR Guard: Only run on client-side where window is available
  if (typeof window === 'undefined') {
    console.log('🔧 Skipping auth persistence setup on server-side');
    return;
  }

  if (!auth) {
    console.warn('Firebase Auth not initialized, skipping persistence setup');
    return;
  }

  try {
    await setPersistence(auth, browserLocalPersistence);
    console.log('✅ Firebase Auth persistence enabled (local storage)');
  } catch (error) {
    console.warn('⚠️ Failed to set Firebase Auth persistence:', error);
    // Continue without persistence - not critical
  }
}

// Anonymous authentication setup with enhanced cold start handling
function setupAnonymousAuth() {
  // SSR Guard: Only run on client-side
  if (typeof window === 'undefined') {
    console.log('🔧 Skipping anonymous auth setup on server-side');
    return;
  }

  if (!auth) {
    console.warn('Firebase Auth not initialized, skipping anonymous authentication');
    return;
  }

  // Only create the promise if it doesn't exist
  if (!authState.promise) {
    // Create a promise that resolves when auth state is ready
    authState.promise = new Promise((resolve) => {
    try {
      // Listen for auth state changes with enhanced logging
      onAuthStateChanged(auth!, async (user) => {
        console.log('🔐 Auth state changed:', {
          hasUser: !!user,
          isAnonymous: user?.isAnonymous,
          uid: user?.uid,
          timestamp: new Date().toISOString()
        });

        authState.user = user;

        if (user) {
          // User is authenticated
          console.log('✅ User authenticated:', {
            uid: user.uid,
            isAnonymous: user.isAnonymous,
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime
          });

          authState.ready = true;
          resolve();
        } else {
          // No user - attempt anonymous sign-in
          console.log('🔐 No user found, attempting anonymous sign-in...');

          // Attempt anonymous sign-in with network retry logic
          await attemptAnonymousSignInWithRetry(resolve);
        }
      });

      // Extended timeout for production network conditions
      setTimeout(() => {
        if (!authState.ready) {
          console.warn('⚠️ Auth state setup timeout after 30 seconds');
          authState.ready = false;
          resolve();
        }
      }, 30000); // Increased from 10s to 30s for production

    } catch (error) {
      console.error('❌ Error setting up auth state listener:', error);
      authState.ready = false;
      resolve();
    }

    });
  }
}

// Helper function for anonymous sign-in with network retry
async function attemptAnonymousSignInWithRetry(resolve: () => void) {
  const maxRetries = 5;
  const baseDelay = 1000; // Start with 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔐 Anonymous sign-in attempt ${attempt}/${maxRetries}...`);

      const userCredential = await signInAnonymously(auth!);
      console.log('✅ Anonymous sign-in successful:', {
        uid: userCredential.user.uid,
        isAnonymous: userCredential.user.isAnonymous
      });

      authState.user = userCredential.user;
      authState.ready = true;
      resolve();
      return;

    } catch (error: unknown) {
      console.error(`❌ Anonymous sign-in attempt ${attempt} failed:`, error);

      // Type guard for Firebase error
      const firebaseError = error as { code?: string; message?: string };

      // Log detailed error information
      if (firebaseError.code) {
        console.error('❌ Error code:', firebaseError.code);
      }
      if (firebaseError.message) {
        console.error('❌ Error message:', firebaseError.message);
      }

      // Handle specific error types
      if (firebaseError.code === 'auth/operation-not-allowed') {
        console.error('🚨 Anonymous authentication is not enabled in Firebase Console!');
        console.error('🚨 Please enable it at: https://console.firebase.google.com/project/chordmini-d29f9/authentication/providers');
        break; // Don't retry for configuration errors
      }

      if (firebaseError.code === 'auth/network-request-failed') {
        console.warn(`🌐 Network request failed on attempt ${attempt}. Retrying...`);

        if (attempt < maxRetries) {
          // Exponential backoff with jitter for network issues
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // If this is the last attempt or a non-retryable error
      if (attempt === maxRetries) {
        console.error('❌ All authentication attempts failed');
        authState.ready = false;
        resolve();
        return;
      }
    }
  }
}

// Export auth state utilities for cold start handling
export const waitForAuthState = async (timeoutMs: number = 10000): Promise<boolean> => {
  // SSR Guard: Return false on server-side
  if (typeof window === 'undefined') {
    return false;
  }

  if (authState.ready) return true;

  if (authState.promise) {
    try {
      await Promise.race([
        authState.promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth state timeout')), timeoutMs)
        )
      ]);
      return authState.ready;
    } catch (error) {
      console.warn('⚠️ Auth state wait timeout or error:', error);
      return false;
    }
  }

  return false;
};

export const getCurrentAuthUser = () => authState.user;

export const isAuthStateReady = () => authState.ready;

export const ensureAuthReady = async (timeoutMs: number = 30000): Promise<boolean> => {
  // SSR Guard: Return false on server-side
  if (typeof window === 'undefined') {
    console.log('🔧 ensureAuthReady called on server-side, returning false');
    return false;
  }

  // Quick check if already ready
  if (authState.ready && authState.user) {
    return true;
  }

  console.log('🔐 Ensuring Firebase authentication is ready...');

  // Extended wait for cold start scenarios (increased default timeout)
  const ready = await waitForAuthState(timeoutMs);
  if (ready && authState.user) {
    console.log('✅ Authentication ready via state listener');
    return true;
  }

  // If still not ready, try manual sign-in with enhanced retry logic
  if (auth && !authState.user) {
    const maxRetries = 5; // Increased from 3 to 5
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔐 Manual anonymous sign-in attempt ${attempt}/${maxRetries}...`);
        const userCredential = await signInAnonymously(auth);
        authState.user = userCredential.user;
        authState.ready = true;
        console.log('✅ Manual anonymous sign-in successful');
        return true;
      } catch (error: unknown) {
        console.error(`❌ Manual sign-in attempt ${attempt} failed:`, error);

        // Handle network errors specifically
        const firebaseError = error as { code?: string; message?: string };
        if (firebaseError.code === 'auth/network-request-failed' && attempt < maxRetries) {
          // Longer delay for network issues
          const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s, 16s
          console.log(`🌐 Network error detected. Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (attempt < maxRetries) {
          // Standard exponential backoff for other errors
          const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  console.warn('❌ Failed to ensure authentication after all attempts');
  return false;
};

// Collection names
export const TRANSLATIONS_COLLECTION = 'translations';

// Initialize translations collection if it doesn't exist
export const initTranslationsCollection = async () => {
  if (!db) {
    console.warn('Firebase not initialized, skipping translations collection initialization');
    return;
  }

  try {
    const translationsRef = collection(db, TRANSLATIONS_COLLECTION);
    const testDocRef = doc(translationsRef, 'init');
    const testDocSnap = await getDoc(testDocRef);

    if (!testDocSnap.exists()) {
      // Create an initial document to ensure the collection exists
      await setDoc(testDocRef, {
        createdAt: new Date().toISOString(),
        note: 'Initial document to create translations collection'
      });
      console.log('Translations collection initialized');
    }
  } catch (error) {
    console.error('Error initializing translations collection:', error);
  }
};

// Utility function to wait for authentication
// NOTE: This function is deprecated for caching operations since Firebase security rules
// allow public access without authentication. Use only for admin operations that require auth.
export const waitForAuth = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!auth) {
      console.warn('Firebase Auth not initialized');
      resolve();
      return;
    }

    // If user is already authenticated, resolve immediately
    if (auth.currentUser) {
      resolve();
      return;
    }

    // Wait for auth state change
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribe();
        resolve();
      }
    });

    // In production, use longer timeout to account for slower network conditions
    const timeoutMs = 10000;
    setTimeout(() => {
      unsubscribe();
      console.warn(`⚠️ Firebase auth timeout after ${timeoutMs}ms, proceeding without authentication`);
      resolve();
    }, timeoutMs);
  });
};

export { db, storage, auth };
