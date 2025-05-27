// Import the functions you need from the SDKs you need
import { initializeApp, FirebaseApp, getApps } from "firebase/app";
import { getFirestore, Firestore, collection, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: 'chordmini-d29f9.appspot.com',
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
  } catch (error) {
    console.error('Error initializing Firebase:', error);

    // Create a fallback implementation to prevent app crashes
    db = null;
    storage = null;
  }
} else {
  console.warn('Missing required Firebase configuration. Firebase will not be initialized.');
  console.warn('Please check your .env.local file for the following variables:');
  console.warn('- NEXT_PUBLIC_FIREBASE_API_KEY');
  console.warn('- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  console.warn('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  console.warn('- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
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

export { db, storage };
