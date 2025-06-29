#!/usr/bin/env node

/**
 * Script to investigate Firestore data for video H5BhwFlLON0
 * This will help us understand what's stored vs what's displayed
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, query, where, getDocs } = require('firebase/firestore');
const { getAuth, signInAnonymously } = require('firebase/auth');

// Firebase configuration (using environment variables)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
const VIDEO_ID = 'H5BhwFlLON0';

async function investigateFirestoreData() {
  try {
    console.log('🔍 Initializing Firebase...');
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // Sign in anonymously
    console.log('🔐 Signing in anonymously...');
    await signInAnonymously(auth);
    console.log('✅ Authentication successful');
    
    console.log(`\n📊 INVESTIGATING FIRESTORE DATA FOR VIDEO: ${VIDEO_ID}`);
    console.log('=' .repeat(80));
    
    // 1. Query all transcriptions for this video ID
    console.log('\n1️⃣ QUERYING ALL TRANSCRIPTIONS FOR VIDEO...');
    const q = query(
      collection(db, TRANSCRIPTIONS_COLLECTION),
      where('videoId', '==', VIDEO_ID)
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Found ${querySnapshot.size} transcription(s) for video ${VIDEO_ID}`);
    
    if (querySnapshot.empty) {
      console.log('❌ No transcriptions found in Firestore for this video');
      return;
    }
    
    // 2. Analyze each transcription document
    let docIndex = 0;
    querySnapshot.forEach((docSnap) => {
      docIndex++;
      console.log(`\n📄 DOCUMENT ${docIndex}: ${docSnap.id}`);
      console.log('-'.repeat(60));
      
      const data = docSnap.data();
      
      // Basic metadata
      console.log('📋 BASIC METADATA:');
      console.log(`  Video ID: ${data.videoId}`);
      console.log(`  Beat Model: ${data.beatModel}`);
      console.log(`  Chord Model: ${data.chordModel}`);
      console.log(`  Created At: ${data.createdAt?.toDate?.() || data.createdAt}`);
      console.log(`  Audio Duration: ${data.audioDuration} seconds`);
      console.log(`  Processing Time: ${data.totalProcessingTime} seconds`);
      
      // Beat and timing data
      console.log('\n🥁 BEAT DATA:');
      console.log(`  Time Signature: ${data.timeSignature}`);
      console.log(`  BPM: ${data.bpm}`);
      console.log(`  Beat Shift: ${data.beatShift}`);
      console.log(`  Total Beats: ${data.beats?.length || 0}`);
      
      if (data.beats && data.beats.length > 0) {
        console.log(`  First 10 beats:`, data.beats.slice(0, 10).map(b => 
          typeof b === 'number' ? b.toFixed(3) : `{time: ${b.time?.toFixed(3)}, strength: ${b.strength?.toFixed(3)}}`
        ));
        console.log(`  Beat data structure: ${typeof data.beats[0]} ${Array.isArray(data.beats) ? '(array)' : ''}`);
        if (typeof data.beats[0] === 'object') {
          console.log(`  Beat object keys:`, Object.keys(data.beats[0]));
        }
      }
      
      // Chord data
      console.log('\n🎵 CHORD DATA:');
      console.log(`  Total Chords: ${data.chords?.length || 0}`);
      
      if (data.chords && data.chords.length > 0) {
        console.log(`  First 10 chords:`, data.chords.slice(0, 10).map(c => 
          `${c.chord} (${c.start?.toFixed(2)}-${c.end?.toFixed(2)}s)`
        ));
        console.log(`  Chord object keys:`, Object.keys(data.chords[0]));
      }
      
      // Synchronized chords
      console.log('\n🔄 SYNCHRONIZED CHORDS:');
      console.log(`  Total Synchronized: ${data.synchronizedChords?.length || 0}`);
      
      if (data.synchronizedChords && data.synchronizedChords.length > 0) {
        console.log(`  First 20 synchronized:`, data.synchronizedChords.slice(0, 20).map(sc => 
          `[${sc.beatIndex}] ${sc.chord}${sc.beatNum ? ` (beat ${sc.beatNum})` : ''}`
        ));
        console.log(`  Sync chord object keys:`, Object.keys(data.synchronizedChords[0]));
        
        // Check for data consistency
        const maxBeatIndex = Math.max(...data.synchronizedChords.map(sc => sc.beatIndex));
        const minBeatIndex = Math.min(...data.synchronizedChords.map(sc => sc.beatIndex));
        console.log(`  Beat index range: ${minBeatIndex} to ${maxBeatIndex}`);
        console.log(`  Expected beats array length: ${maxBeatIndex + 1}`);
        console.log(`  Actual beats array length: ${data.beats?.length || 0}`);
        
        if (maxBeatIndex >= (data.beats?.length || 0)) {
          console.log(`  ⚠️  WARNING: Some synchronized chords reference beat indices beyond the beats array!`);
        }
      }
      
      // Downbeats
      if (data.downbeats) {
        console.log('\n📍 DOWNBEATS:');
        console.log(`  Total Downbeats: ${data.downbeats.length}`);
        console.log(`  First 10 downbeats:`, data.downbeats.slice(0, 10).map(d => d.toFixed(3)));
      }
      
      // Key signature and corrections
      console.log('\n🎼 KEY & CORRECTIONS:');
      console.log(`  Key Signature: ${data.keySignature || 'Not detected'}`);
      console.log(`  Key Modulation: ${data.keyModulation || 'None'}`);
      console.log(`  Has Chord Corrections: ${!!data.chordCorrections}`);
      console.log(`  Has Original Chords: ${!!data.originalChords}`);
      console.log(`  Has Corrected Chords: ${!!data.correctedChords}`);
      
      if (data.chordCorrections) {
        const correctionCount = Object.keys(data.chordCorrections).length;
        console.log(`  Correction count: ${correctionCount}`);
        if (correctionCount > 0) {
          console.log(`  Sample corrections:`, Object.entries(data.chordCorrections).slice(0, 5));
        }
      }
    });
    
    console.log('\n✅ Investigation complete!');
    
  } catch (error) {
    console.error('❌ Error investigating Firestore data:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
  }
}

// Run the investigation
investigateFirestoreData().then(() => {
  console.log('\n🏁 Script finished');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
