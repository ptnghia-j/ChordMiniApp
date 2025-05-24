#!/usr/bin/env node

/**
 * Comprehensive Cache Deletion Script for ChordMini Application
 *
 * This script provides a flexible command-line tool for deleting various types
 * of cached analysis data from Firebase Firestore database.
 *
 * Usage Examples:
 *   node delete-cache.js Y2ge3KrdeWs --translations
 *   node delete-cache.js Y2ge3KrdeWs --beats --chords
 *   node delete-cache.js Y2ge3KrdeWs --all
 *   node delete-cache.js --help
 */

// Import required modules
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

// Validate Firebase configuration
function validateFirebaseConfig() {
  const requiredFields = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  const missing = requiredFields.filter(field => !process.env[field]);

  if (missing.length > 0) {
    console.error('❌ Missing required Firebase environment variables:');
    missing.forEach(field => console.error(`   • ${field}`));
    console.error('\nPlease check your .env.local file');
    process.exit(1);
  }

  console.log('✅ Firebase configuration validated');
}

// Initialize Firebase
let app, db;
try {
  validateFirebaseConfig();
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error.message);
  process.exit(1);
}

// Collection names and their descriptions
const CACHE_COLLECTIONS = {
  translations: {
    name: 'translations',
    description: 'Lyrics translation cache (Gemini API translations)',
    searchField: 'videoId' // Field to search for video ID
  },
  lyrics: {
    name: 'lyrics',
    description: 'Lyrics transcription cache (Music.ai API transcriptions)',
    searchField: 'videoId'
  },
  transcriptions: {
    name: 'transcriptions',
    description: 'Beat and chord analysis cache (ML model results)',
    searchField: 'videoId'
  }
};

// Command line argument parsing
const args = process.argv.slice(2);
const videoId = args.find(arg => !arg.startsWith('--'));
const flags = args.filter(arg => arg.startsWith('--'));

/**
 * Display help information
 */
function showHelp() {
  console.log(`
🎵 ChordMini Cache Deletion Tool

USAGE:
  node delete-cache.js <VIDEO_ID> [OPTIONS]
  node delete-cache.js --help

ARGUMENTS:
  VIDEO_ID    YouTube video ID (e.g., Y2ge3KrdeWs)

OPTIONS:
  --translations    Delete translation cache only
  --lyrics         Delete lyrics transcription cache only
  --beats          Delete beat detection cache only
  --chords         Delete chord recognition cache only
  --analysis       Delete both beat and chord cache (--beats + --chords)
  --all            Delete all cached data for the video
  --force          Skip confirmation prompt
  --debug          Show debug information and detailed error messages
  --help           Show this help message

EXAMPLES:
  # Delete only translation cache
  node delete-cache.js Y2ge3KrdeWs --translations

  # Delete beat and chord analysis cache
  node delete-cache.js Y2ge3KrdeWs --analysis

  # Delete all cached data with confirmation
  node delete-cache.js Y2ge3KrdeWs --all

  # Delete all cached data without confirmation
  node delete-cache.js Y2ge3KrdeWs --all --force

CACHE TYPES:
  📝 Translations  - Lyrics translations (Gemini API)
  🎤 Lyrics        - Lyrics transcriptions (Music.ai API)
  🥁 Beats/Chords  - Beat and chord analysis (ML models)
`);
}

/**
 * Validate command line arguments
 */
function validateArguments() {
  if (flags.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  if (!videoId) {
    console.error('❌ Error: Video ID is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  // Validate video ID format (basic YouTube video ID validation)
  const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  if (!videoIdRegex.test(videoId)) {
    console.error('❌ Error: Invalid video ID format');
    console.log('YouTube video IDs should be 11 characters long');
    process.exit(1);
  }

  // Check if at least one cache type is specified
  const cacheFlags = flags.filter(flag =>
    ['--translations', '--lyrics', '--beats', '--chords', '--analysis', '--all'].includes(flag)
  );

  if (cacheFlags.length === 0) {
    console.error('❌ Error: Please specify at least one cache type to delete');
    console.log('Use --help for available options');
    process.exit(1);
  }
}

/**
 * Determine which collections to target based on flags
 */
function getTargetCollections() {
  const targets = [];

  if (flags.includes('--all')) {
    return Object.keys(CACHE_COLLECTIONS);
  }

  if (flags.includes('--translations')) {
    targets.push('translations');
  }

  if (flags.includes('--lyrics')) {
    targets.push('lyrics');
  }

  if (flags.includes('--beats') || flags.includes('--chords') || flags.includes('--analysis')) {
    targets.push('transcriptions');
  }

  return targets;
}

/**
 * Check if a collection exists and has documents
 */
async function checkCollectionExists(collectionName) {
  try {
    const collectionRef = collection(db, collectionName);
    const querySnapshot = await getDocs(collectionRef);
    return { exists: true, docCount: querySnapshot.size };
  } catch (error) {
    console.warn(`  ⚠️  Collection '${collectionName}' may not exist or is inaccessible:`, error.message);
    return { exists: false, docCount: 0 };
  }
}

/**
 * Delete cache entries from a specific collection
 */
async function deleteCacheFromCollection(collectionName, videoId) {
  const collectionInfo = CACHE_COLLECTIONS[collectionName];
  if (!collectionInfo) {
    console.error(`❌ Unknown collection: ${collectionName}`);
    return { deleted: 0, errors: 0 };
  }

  console.log(`\n🔍 Searching ${collectionInfo.description}...`);

  // First check if collection exists
  const collectionStatus = await checkCollectionExists(collectionInfo.name);
  if (!collectionStatus.exists) {
    console.log(`  ℹ️  Collection '${collectionInfo.name}' does not exist or is empty`);
    return { deleted: 0, errors: 0 };
  }

  console.log(`  📋 Found ${collectionStatus.docCount} documents in collection`);

  try {
    const collectionRef = collection(db, collectionInfo.name);
    const querySnapshot = await getDocs(collectionRef);

    let deletedCount = 0;
    let errorCount = 0;
    let checkedCount = 0;

    for (const docSnapshot of querySnapshot.docs) {
      const docId = docSnapshot.id;
      const docData = docSnapshot.data();
      checkedCount++;

      // Check if document is related to the video ID
      const isRelated = docId.includes(videoId) ||
                       JSON.stringify(docData).includes(videoId) ||
                       (docData[collectionInfo.searchField] === videoId);

      if (isRelated) {
        try {
          await deleteDoc(doc(collectionRef, docId));
          console.log(`  ✅ Deleted: ${docId}`);
          deletedCount++;
        } catch (deleteError) {
          console.error(`  ❌ Failed to delete ${docId}:`, deleteError.message);
          errorCount++;
        }
      }
    }

    console.log(`  📊 Checked ${checkedCount} documents`);

    if (deletedCount === 0) {
      console.log(`  ℹ️  No cache entries found for video ${videoId}`);
    } else {
      console.log(`  🗑️  Deleted ${deletedCount} entries from ${collectionInfo.description}`);
    }

    return { deleted: deletedCount, errors: errorCount };
  } catch (error) {
    // Handle specific Firebase errors
    if (error.code === 'invalid-argument') {
      console.error(`  ❌ Invalid Firebase configuration or collection name: ${collectionInfo.name}`);
      console.error(`  💡 Please check your Firebase project settings and collection names`);
    } else if (error.code === 'permission-denied') {
      console.error(`  ❌ Permission denied accessing collection: ${collectionInfo.name}`);
      console.error(`  💡 Please check your Firebase security rules`);
    } else {
      console.error(`  ❌ Error accessing ${collectionInfo.description}:`, error.message);
    }
    return { deleted: 0, errors: 1 };
  }
}

/**
 * Prompt user for confirmation
 */
function promptConfirmation(targetCollections, videoId) {
  if (flags.includes('--force')) {
    return true;
  }

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log(`\n⚠️  You are about to delete cached data for video: ${videoId}`);
    console.log('📋 Target collections:');
    targetCollections.forEach(collection => {
      console.log(`   • ${CACHE_COLLECTIONS[collection].description}`);
    });

    rl.question('\n❓ Are you sure you want to proceed? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Test Firebase connection
 */
async function testFirebaseConnection() {
  console.log('\n🔧 Testing Firebase connection...');

  try {
    // Try to access a simple collection to test connection
    const testRef = collection(db, 'test-connection');
    await getDocs(testRef);
    console.log('✅ Firebase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection failed:', error.message);
    console.error('💡 Troubleshooting tips:');
    console.error('   • Check your internet connection');
    console.error('   • Verify Firebase project ID in .env.local');
    console.error('   • Check Firebase security rules');
    console.error('   • Ensure Firebase project is active');
    return false;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🎵 ChordMini Cache Deletion Tool\n');

    // Validate arguments
    validateArguments();

    // Test Firebase connection
    const connectionOk = await testFirebaseConnection();
    if (!connectionOk) {
      console.error('\n❌ Cannot proceed without Firebase connection');
      process.exit(1);
    }

    // Get target collections
    const targetCollections = getTargetCollections();

    // Show debug info if requested
    if (flags.includes('--debug')) {
      console.log('\n🐛 DEBUG INFO:');
      console.log(`Firebase Project ID: ${firebaseConfig.projectId}`);
      console.log(`Target Collections: ${targetCollections.join(', ')}`);
      console.log(`Video ID: ${videoId}`);
    }

    // Prompt for confirmation
    const confirmed = await promptConfirmation(targetCollections, videoId);

    if (!confirmed) {
      console.log('❌ Operation cancelled by user');
      process.exit(0);
    }

    console.log(`\n🚀 Starting cache deletion for video: ${videoId}`);

    let totalDeleted = 0;
    let totalErrors = 0;

    // Delete from each target collection
    for (const collectionName of targetCollections) {
      const result = await deleteCacheFromCollection(collectionName, videoId);
      totalDeleted += result.deleted;
      totalErrors += result.errors;
    }

    // Summary
    console.log('\n📊 DELETION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Video ID: ${videoId}`);
    console.log(`Total entries deleted: ${totalDeleted}`);
    console.log(`Errors encountered: ${totalErrors}`);

    if (totalDeleted > 0) {
      console.log('✅ Cache deletion completed successfully');
    } else {
      console.log('ℹ️  No cache entries found for this video');
    }

    process.exit(totalErrors > 0 ? 1 : 0);

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    if (flags.includes('--debug')) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Execute the script
main().catch((error) => {
  console.error('💥 Script execution failed:', error);
  process.exit(1);
});
