/**
 * Optimized Firebase Service with modular imports
 * Only loads Firebase services when actually needed to reduce bundle size
 */

// Core Firebase app (always needed)
import {initializeApp, getApps, FirebaseApp} from 'firebase/app';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Singleton Firebase app instance
let firebaseApp: FirebaseApp | null = null;

/**
 * Initialize Firebase app (lightweight)
 */
const initializeFirebaseApp = (): FirebaseApp => {
  if (firebaseApp) return firebaseApp;
  
  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0];
  } else {
    firebaseApp = initializeApp(firebaseConfig);
  }
  
  return firebaseApp;
};

/**
 * Lazy-loaded Firebase services
 */
export const firebaseServices = {
  /**
   * Get Firestore instance (loads Firestore only when needed)
   */
  async getFirestore() {
    const { getFirestore } = await import('firebase/firestore');
    const app = initializeFirebaseApp();
    return getFirestore(app);
  },

  /**
   * Get Storage instance (loads Storage only when needed)
   */
  async getStorage() {
    const { getStorage } = await import('firebase/storage');
    const app = initializeFirebaseApp();
    return getStorage(app);
  },

  /**
   * Get Auth instance (loads Auth only when needed)
   */
  async getAuth() {
    const { getAuth } = await import('firebase/auth');
    const app = initializeFirebaseApp();
    return getAuth(app);
  }
};

/**
 * Optimized Firestore operations
 */
export const firestoreOperations = {
  /**
   * Get a document (loads Firestore functions only when needed)
   */
  async getDocument(collection: string, docId: string) {
    const [{ doc, getDoc }, db] = await Promise.all([
      import('firebase/firestore'),
      firebaseServices.getFirestore()
    ]);
    
    const docRef = doc(db, collection, docId);
    return getDoc(docRef);
  },

  /**
   * Set a document (loads Firestore functions only when needed)
   */
  async setDocument(collection: string, docId: string, data: Record<string, unknown>) {
    const [{ doc, setDoc }, db] = await Promise.all([
      import('firebase/firestore'),
      firebaseServices.getFirestore()
    ]);
    
    const docRef = doc(db, collection, docId);
    return setDoc(docRef, data);
  },

  /**
   * Batch get multiple documents
   */
  async getMultipleDocuments(collection: string, docIds: string[]) {
    const [{ doc, getDoc }, db] = await Promise.all([
      import('firebase/firestore'),
      firebaseServices.getFirestore()
    ]);
    
    const promises = docIds.map(docId => {
      const docRef = doc(db, collection, docId);
      return getDoc(docRef);
    });
    
    return Promise.all(promises);
  }
};

/**
 * Optimized Storage operations
 */
export const storageOperations = {
  /**
   * Upload file (loads Storage functions only when needed)
   */
  async uploadFile(path: string, file: Blob | ArrayBuffer, metadata?: Record<string, unknown>) {
    const [{ ref, uploadBytes, getDownloadURL }, storage] = await Promise.all([
      import('firebase/storage'),
      firebaseServices.getStorage()
    ]);
    
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file, metadata);
    return getDownloadURL(snapshot.ref);
  },

  /**
   * Get download URL (loads Storage functions only when needed)
   */
  async getDownloadURL(path: string) {
    const [{ ref, getDownloadURL }, storage] = await Promise.all([
      import('firebase/storage'),
      firebaseServices.getStorage()
    ]);
    
    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef);
  },

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await this.getDownloadURL(path);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Optimized Auth operations
 */
export const authOperations = {
  /**
   * Sign in anonymously (loads Auth functions only when needed)
   */
  async signInAnonymously() {
    const [{ signInAnonymously }, auth] = await Promise.all([
      import('firebase/auth'),
      firebaseServices.getAuth()
    ]);
    
    return signInAnonymously(auth);
  },

  /**
   * Get current user
   */
  async getCurrentUser() {
    const auth = await firebaseServices.getAuth();
    return auth.currentUser;
  },

  /**
   * Wait for auth state to be ready
   */
  async waitForAuth(): Promise<boolean> {
    const [{ onAuthStateChanged }, auth] = await Promise.all([
      import('firebase/auth'),
      firebaseServices.getAuth()
    ]);
    
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(!!user);
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, 10000);
    });
  }
};

/**
 * High-level optimized operations for ChordMini
 */
export const chordMiniFirebase = {
  /**
   * Cache transcription data
   */
  async cacheTranscription(videoId: string, beatModel: string, chordModel: string, data: Record<string, unknown>) {
    const docId = `${videoId}_${beatModel}_${chordModel}`;
    return firestoreOperations.setDocument('transcriptions', docId, {
      ...data,
      videoId,
      beatModel,
      chordModel,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Get cached transcription
   */
  async getCachedTranscription(videoId: string, beatModel: string, chordModel: string) {
    const docId = `${videoId}_${beatModel}_${chordModel}`;
    const docSnap = await firestoreOperations.getDocument('transcriptions', docId);
    return docSnap.exists() ? docSnap.data() : null;
  },

  /**
   * Cache audio metadata
   */
  async cacheAudioMetadata(videoId: string, metadata: Record<string, unknown>) {
    return firestoreOperations.setDocument('audio_files', videoId, {
      ...metadata,
      videoId,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Get cached audio metadata
   */
  async getCachedAudioMetadata(videoId: string) {
    const docSnap = await firestoreOperations.getDocument('audio_files', videoId);
    return docSnap.exists() ? docSnap.data() : null;
  },

  /**
   * Batch get cached audio metadata
   */
  async getBatchCachedAudioMetadata(videoIds: string[]) {
    const docSnaps = await firestoreOperations.getMultipleDocuments('audio_files', videoIds);
    const results = new Map();
    
    docSnaps.forEach((docSnap, index) => {
      if (docSnap.exists()) {
        results.set(videoIds[index], docSnap.data());
      }
    });
    
    return results;
  }
};

/**
 * Initialize Firebase with minimal footprint
 */
export const initializeOptimizedFirebase = () => {
  // Only initialize the app, don't load services yet
  initializeFirebaseApp();
  
  // Set up anonymous auth in the background
  setTimeout(async () => {
    try {
      await authOperations.signInAnonymously();
    } catch (error) {
      console.warn('Failed to sign in anonymously:', error);
    }
  }, 1000);
};

export default chordMiniFirebase;
