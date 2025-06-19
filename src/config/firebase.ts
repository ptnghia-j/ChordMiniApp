// Import the functions you need from the SDKs you need
import { initializeApp, FirebaseApp, getApps } from "firebase/app";
import { getFirestore, Firestore, collection, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

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

// Log Firebase configuration for debugging (without sensitive values)
console.log('Firebase config:', {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  apiKeyProvided: !!firebaseConfig.apiKey,
  appIdProvided: !!firebaseConfig.appId
});

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
      console.log('Using existing Firebase app');
    } else {
      // Initialize Firebase
      app = initializeApp(firebaseConfig);
      console.log('Firebase initialized successfully');
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

// Anonymous authentication setup
async function setupAnonymousAuth() {
  if (!auth) {
    console.warn('Firebase Auth not initialized, skipping anonymous authentication');
    return;
  }

  try {
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('🔐 User authenticated:', user.isAnonymous ? 'Anonymous' : 'Signed in');
        console.log('🔐 User UID:', user.uid);
        console.log('🔐 Auth state ready for Firestore operations');
      } else {
        console.log('🔓 User not authenticated, signing in anonymously...');
        // Sign in anonymously if not already authenticated
        signInAnonymously(auth!)
          .then((result) => {
            console.log('✅ Anonymous authentication successful');
            console.log('✅ Anonymous user UID:', result.user.uid);
          })
          .catch((error) => {
            console.error('❌ Anonymous authentication failed:', error);
            console.error('❌ Error code:', error.code);
            console.error('❌ Error message:', error.message);

            // Check if anonymous auth is disabled
            if (error.code === 'auth/operation-not-allowed') {
              console.error('🚨 Anonymous authentication is not enabled in Firebase Console!');
              console.error('🚨 Please enable it at: https://console.firebase.google.com/project/chordmini-d29f9/authentication/providers');
            }
          });
      }
    });
  } catch (error) {
    console.error('Error setting up anonymous authentication:', error);
  }
}

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

export { db, storage, auth };
