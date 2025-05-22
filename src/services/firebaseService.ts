import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, deleteDoc, Firestore } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, Storage } from 'firebase/storage';
import { LyricsData } from '@/types/musicAiTypes';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let firebaseApp: FirebaseApp;
let firestoreDb: Firestore;
let firebaseStorage: Storage;

if (getApps().length === 0) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}

firestoreDb = getFirestore(firebaseApp);
firebaseStorage = getStorage(firebaseApp);

/**
 * Save lyrics data to Firestore
 * @param videoId YouTube video ID
 * @param lyricsData Lyrics data to save
 * @returns Promise that resolves when the data is saved
 */
export async function saveLyricsToFirestore(videoId: string, lyricsData: LyricsData): Promise<void> {
  try {
    const lyricsRef = doc(firestoreDb, 'lyrics', videoId);
    await setDoc(lyricsRef, {
      ...lyricsData,
      videoId,
      timestamp: new Date().toISOString()
    });
    console.log(`Saved lyrics for video ID ${videoId} to Firestore`);
  } catch (error) {
    console.error('Error saving lyrics to Firestore:', error);
    throw error;
  }
}

/**
 * Get lyrics data from Firestore
 * @param videoId YouTube video ID
 * @returns Promise that resolves with the lyrics data or null if not found
 */
export async function getLyricsFromFirestore(videoId: string): Promise<LyricsData | null> {
  try {
    const lyricsRef = doc(firestoreDb, 'lyrics', videoId);
    const lyricsDoc = await getDoc(lyricsRef);
    
    if (lyricsDoc.exists()) {
      return lyricsDoc.data() as LyricsData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting lyrics from Firestore:', error);
    return null;
  }
}

/**
 * Get audio file metadata from Firestore
 * @param videoId YouTube video ID
 * @returns Promise that resolves with the audio file metadata or null if not found
 */
export async function getAudioFileMetadata(videoId: string): Promise<any | null> {
  try {
    const audioRef = doc(firestoreDb, 'audio_files', videoId);
    const audioDoc = await getDoc(audioRef);
    
    if (audioDoc.exists()) {
      return audioDoc.data();
    }
    
    return null;
  } catch (error) {
    console.error('Error getting audio file metadata from Firestore:', error);
    return null;
  }
}

/**
 * Save audio file metadata to Firestore
 * @param videoId YouTube video ID
 * @param metadata Audio file metadata to save
 * @returns Promise that resolves when the data is saved
 */
export async function saveAudioFileMetadata(videoId: string, metadata: any): Promise<void> {
  try {
    const audioRef = doc(firestoreDb, 'audio_files', videoId);
    await setDoc(audioRef, {
      ...metadata,
      videoId,
      timestamp: new Date().toISOString()
    });
    console.log(`Saved audio file metadata for video ID ${videoId} to Firestore`);
  } catch (error) {
    console.error('Error saving audio file metadata to Firestore:', error);
    throw error;
  }
}

/**
 * Upload audio file to Firebase Storage
 * @param videoId YouTube video ID
 * @param audioData Audio file data
 * @param contentType Content type of the audio file
 * @returns Promise that resolves with the download URL
 */
export async function uploadAudioToStorage(videoId: string, audioData: Blob | ArrayBuffer, contentType: string): Promise<string> {
  try {
    const filename = `${videoId}_${Date.now()}.mp3`;
    const storageRef = ref(firebaseStorage, `audio/${filename}`);
    
    await uploadBytes(storageRef, audioData, { contentType });
    const downloadUrl = await getDownloadURL(storageRef);
    
    // Save metadata to Firestore
    await saveAudioFileMetadata(videoId, {
      filename,
      contentType,
      downloadUrl,
      size: audioData.byteLength
    });
    
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading audio to Firebase Storage:', error);
    throw error;
  }
}

export { firebaseApp, firestoreDb, firebaseStorage };
