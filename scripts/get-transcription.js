const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

async function run() {
  console.log('Firebase Config:', {
    projectId: firebaseConfig.projectId,
    apiKey: firebaseConfig.apiKey ? 'PRESENT' : 'MISSING'
  });
  
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  
  const docId = 'd_0UdMMXbBo_madmom_chord-cnn-lstm';
  const docRef = doc(db, 'transcriptions', docId);
  
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const outputFilePath = path.join(__dirname, 'transcription_data.json');
      fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2));
      console.log(`Successfully fetched transcription! Saved to: ${outputFilePath}`);
      console.log(`Beats count: ${data.beats ? data.beats.length : 0}`);
      console.log(`Chords count: ${data.chords ? data.chords.length : 0}`);
      console.log(`Synchronized chords count: ${data.synchronizedChords ? data.synchronizedChords.length : 0}`);
    } else {
      console.log(`No transcription document found with ID: ${docId}`);
    }
  } catch (error) {
    console.error('Error fetching document:', error);
  }
}

run();
