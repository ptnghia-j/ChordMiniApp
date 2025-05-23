// Script to delete translation cache for a specific video ID
// Usage: node delete-translation-cache.js Y2ge3KrdeWs

// Import Firebase modules
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, deleteDoc, query, where } = require('firebase/firestore');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collection name
const TRANSLATIONS_COLLECTION = 'translations';

/**
 * Delete translation cache for a specific video ID
 * @param {string} videoId - The YouTube video ID
 */
async function deleteTranslationCache(videoId) {
  if (!videoId) {
    console.error('Error: Video ID is required');
    process.exit(1);
  }

  console.log(`Deleting translation cache for video ID: ${videoId}`);

  try {
    // Get all documents from the translations collection
    const translationsRef = collection(db, TRANSLATIONS_COLLECTION);
    const querySnapshot = await getDocs(translationsRef);
    
    let deletedCount = 0;
    let skippedCount = 0;
    
    // Loop through all documents and check if they contain the video ID
    for (const docSnapshot of querySnapshot.docs) {
      const docId = docSnapshot.id;
      const docData = docSnapshot.data();
      
      // Check if the document ID or data contains the video ID
      if (docId.includes(videoId) || JSON.stringify(docData).includes(videoId)) {
        // Delete the document
        await deleteDoc(doc(translationsRef, docId));
        console.log(`Deleted document: ${docId}`);
        deletedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log(`Deletion complete. Deleted ${deletedCount} documents, skipped ${skippedCount} documents.`);
    
    if (deletedCount === 0) {
      console.log('No translation cache found for this video ID.');
    }
  } catch (error) {
    console.error('Error deleting translation cache:', error);
    process.exit(1);
  }
}

// Get video ID from command line arguments
const videoId = process.argv[2];

// Execute the function
deleteTranslationCache(videoId)
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
