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
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";

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

    // Set up anonymous authentication
    setupAnonymousAuth();
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

// Anonymous authentication setup with enhanced cold start handling
function setupAnonymousAuth() {
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

          try {
            const userCredential = await signInAnonymously(auth!);
            console.log('✅ Anonymous sign-in successful:', {
              uid: userCredential.user.uid,
              isAnonymous: userCredential.user.isAnonymous
            });

            authState.user = userCredential.user;
            authState.ready = true;
            resolve();
          } catch (error: unknown) {
            console.error('❌ Anonymous authentication failed:', error);

            // Type guard for Firebase error
            const firebaseError = error as { code?: string; message?: string };
            if (firebaseError.code) {
              console.error('❌ Error code:', firebaseError.code);
            }
            if (firebaseError.message) {
              console.error('❌ Error message:', firebaseError.message);
            }

            // Check if anonymous auth is disabled
            if (firebaseError.code === 'auth/operation-not-allowed') {
              console.error('🚨 Anonymous authentication is not enabled in Firebase Console!');
              console.error('🚨 Please enable it at: https://console.firebase.google.com/project/chordmini-d29f9/authentication/providers');
            }

            // Still resolve to prevent hanging, but mark as not ready
            authState.ready = false;
            resolve();
          }
        }
      });

      // Timeout fallback to prevent hanging
      setTimeout(() => {
        if (!authState.ready) {
          console.warn('⚠️ Auth state setup timeout after 10 seconds');
          authState.ready = false;
          resolve();
        }
      }, 10000);

    } catch (error) {
      console.error('❌ Error setting up auth state listener:', error);
      authState.ready = false;
      resolve();
    }

    });
  }
}

// Export auth state utilities for cold start handling
export const waitForAuthState = async (timeoutMs: number = 10000): Promise<boolean> => {
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

export const ensureAuthReady = async (): Promise<boolean> => {
  if (authState.ready && authState.user) {
    return true;
  }

  // If auth is not ready, try to wait for it
  const ready = await waitForAuthState(5000);
  if (ready && authState.user) {
    return true;
  }

  // If still not ready, try to sign in manually
  if (auth && !authState.user) {
    try {
      console.log('🔐 Manually attempting anonymous sign-in...');
      const userCredential = await signInAnonymously(auth);
      authState.user = userCredential.user;
      authState.ready = true;
      console.log('✅ Manual anonymous sign-in successful');
      return true;
    } catch (error) {
      console.error('❌ Manual anonymous sign-in failed:', error);
      return false;
    }
  }

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
