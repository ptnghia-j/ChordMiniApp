const admin = require('firebase-admin');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const serviceAccountKeyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKeyString) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not defined in .env.local');
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountKeyString);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const videoId = '2RjUwH9iRVo';
  const beatModel = 'madmom';
  const chordModel = 'chord-cnn-lstm';
  const docId = `${videoId}_${beatModel}_${chordModel}`;

  console.log(`Fetching document ${docId} from Firestore...`);
  const docRef = db.collection('transcriptions').doc(docId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    console.error(`Document ${docId} not found in Firestore`);
    process.exit(1);
  }

  const data = docSnap.data();
  console.log('Document fetched successfully.');

  // Save the result to a JSON file
  const outputPath = 'scratch/transcription_2RjUwH9iRVo.json';
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Saved transcription to ${outputPath}`);
}

run().catch(console.error);
