#!/usr/bin/env node

/**
 * Admin Cache Deletion Script for ChordMini Application
 *
 * This script uses Firestore's REST API with Google-authenticated credentials
 * to delete cache data with elevated permissions.
 * It can be run with service account credentials or in environments with ADC.
 *
 * Usage Examples:
 *   node delete-cache-admin.js Y2ge3KrdeWs --translations
 *   node delete-cache-admin.js Y2ge3KrdeWs --beats --chords
 *   node delete-cache-admin.js Y2ge3KrdeWs --all
 */

const { GoogleAuth } = require('google-auth-library');
const dotenv = require('dotenv');
const readline = require('readline');

// Load environment variables
dotenv.config({ path: '.env.local' });

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
let projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'chordmini-d29f9';
let authClientPromise;

function getFirestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function getAuthClient() {
  if (authClientPromise) {
    return authClientPromise;
  }

  authClientPromise = (async () => {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        projectId = credentials.project_id || projectId;
        const auth = new GoogleAuth({
          credentials,
          scopes: [FIRESTORE_SCOPE],
        });
        return auth.getClient();
      } catch (parseError) {
        console.log('⚠️  Failed to parse service account key, falling back to default credentials');
      }
    }

    const auth = new GoogleAuth({
      projectId,
      scopes: [FIRESTORE_SCOPE],
    });
    return auth.getClient();
  })();

  return authClientPromise;
}

async function getAccessToken() {
  const client = await getAuthClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

  if (!token) {
    throw new Error('Failed to obtain Google access token');
  }

  return token;
}

async function firestoreRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore API request failed (${response.status} ${response.statusText}): ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function getDocumentId(documentName = '') {
  return documentName.split('/').pop() || '';
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return value.integerValue;
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, parseFirestoreValue(nested)])
    );
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  return value;
}

function getDocumentData(document) {
  return Object.fromEntries(
    Object.entries(document.fields || {}).map(([key, value]) => [key, parseFirestoreValue(value)])
  );
}

async function listCollectionDocuments(collectionName) {
  const documents = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({ pageSize: '300' });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const data = await firestoreRequest(`${getFirestoreBaseUrl()}/${collectionName}?${params.toString()}`);
    documents.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return documents;
}

async function commitDeleteBatch(documentNames) {
  if (!documentNames.length) {
    return;
  }

  await firestoreRequest(`${getFirestoreBaseUrl()}:commit`, {
    method: 'POST',
    body: JSON.stringify({
      writes: documentNames.map((name) => ({ delete: name })),
    }),
  });
}

try {
  console.log('✅ Firestore admin access configured');
} catch (error) {
  console.error('❌ Failed to initialize Firestore admin access:', error.message);
  console.error('💡 Admin credentials required for cache deletion');
  console.error('💡 Current security rules prevent deletion by regular users');
  console.error('💡 Solutions:');
  console.error('   1. Set FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
  console.error('   2. Run in Google Cloud environment with default credentials');
  console.error('   3. Use Firebase Console to delete cache manually');
  process.exit(1);
}

// Collection definitions
const CACHE_COLLECTIONS = {
  translations: {
    name: 'translations',
    description: 'Lyrics translation cache (Gemini API translations)',
    searchField: 'videoId'
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

// Parse command line arguments
const args = process.argv.slice(2);
const videoId = args.find(arg => !arg.startsWith('--'));
const flags = args.filter(arg => arg.startsWith('--'));

function showHelp() {
  console.log(`
🎵 ChordMini Admin Cache Deletion Tool

USAGE:
  node delete-cache-admin.js <VIDEO_ID> [OPTIONS]

ARGUMENTS:
  VIDEO_ID    YouTube video ID (e.g., Y2ge3KrdeWs)

OPTIONS:
  --translations    Delete translation cache only
  --lyrics         Delete lyrics transcription cache only  
  --beats          Delete beat detection cache only
  --chords         Delete chord recognition cache only
  --analysis       Delete both beat and chord cache
  --all            Delete all cached data for the video
  --force          Skip confirmation prompt
  --help           Show this help message

EXAMPLES:
  node delete-cache-admin.js Y2ge3KrdeWs --translations
  node delete-cache-admin.js Y2ge3KrdeWs --analysis
  node delete-cache-admin.js Y2ge3KrdeWs --all --force
`);
}

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

  const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  if (!videoIdRegex.test(videoId)) {
    console.error('❌ Error: Invalid video ID format');
    process.exit(1);
  }

  const cacheFlags = flags.filter(flag =>
    ['--translations', '--lyrics', '--beats', '--chords', '--analysis', '--all'].includes(flag)
  );

  if (cacheFlags.length === 0) {
    console.error('❌ Error: Please specify at least one cache type to delete');
    process.exit(1);
  }
}

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

async function deleteCacheFromCollection(collectionName, videoId) {
  const collectionInfo = CACHE_COLLECTIONS[collectionName];
  if (!collectionInfo) {
    console.error(`❌ Unknown collection: ${collectionName}`);
    return { deleted: 0, errors: 0 };
  }

  console.log(`\n🔍 Searching ${collectionInfo.description}...`);

  try {
    const documents = await listCollectionDocuments(collectionInfo.name);

    if (documents.length === 0) {
      console.log(`  ℹ️  Collection '${collectionInfo.name}' is empty`);
      return { deleted: 0, errors: 0 };
    }

    console.log(`  📋 Found ${documents.length} documents in collection`);

    let deletedCount = 0;
    let errorCount = 0;
    let checkedCount = 0;

    let pendingDeletes = [];
    let batchSize = 0;
    const maxBatchSize = 500; // Firestore batch limit

    for (const document of documents) {
      const docId = getDocumentId(document.name);
      const docData = getDocumentData(document);
      checkedCount++;

      // Check if document is related to the video ID
      const isRelated = docId.includes(videoId) ||
                       JSON.stringify(docData).includes(videoId) ||
                       (docData[collectionInfo.searchField] === videoId);

      if (isRelated) {
        pendingDeletes.push(document.name);
        batchSize++;
        console.log(`  📝 Queued for deletion: ${docId}`);

        // Execute batch if we hit the limit
        if (batchSize >= maxBatchSize) {
          try {
            await commitDeleteBatch(pendingDeletes);
            deletedCount += batchSize;
            console.log(`  ✅ Batch deleted ${batchSize} documents`);
            pendingDeletes = [];
            batchSize = 0;
          } catch (batchError) {
            console.error(`  ❌ Batch deletion failed:`, batchError.message);
            errorCount += batchSize;
            pendingDeletes = [];
            batchSize = 0;
          }
        }
      }
    }

    // Execute remaining batch
    if (batchSize > 0) {
      try {
        await commitDeleteBatch(pendingDeletes);
        deletedCount += batchSize;
        console.log(`  ✅ Final batch deleted ${batchSize} documents`);
      } catch (batchError) {
        console.error(`  ❌ Final batch deletion failed:`, batchError.message);
        errorCount += batchSize;
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
    console.error(`  ❌ Error accessing ${collectionInfo.description}:`, error.message);
    return { deleted: 0, errors: 1 };
  }
}

function promptConfirmation(targetCollections, videoId) {
  if (flags.includes('--force')) {
    return Promise.resolve(true);
  }

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

async function testFirebaseConnection() {
  console.log('\n🔧 Testing Firestore admin connection...');
  
  try {
    const databaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
    await firestoreRequest(databaseUrl);
    console.log(`✅ Firestore admin connection successful (project: ${projectId})`);
    return true;
  } catch (error) {
    console.error('❌ Firestore admin connection failed:', error.message);
    console.error('💡 Troubleshooting tips:');
    console.error('   • Make sure you have service account credentials or Application Default Credentials');
    console.error('   • Check if you are running in a Google Cloud environment');
    console.error('   • Verify your Firebase project ID');
    return false;
  }
}

async function main() {
  try {
    console.log('🎵 ChordMini Admin Cache Deletion Tool\n');

    validateArguments();

    const connectionOk = await testFirebaseConnection();
    if (!connectionOk) {
      console.error('\n❌ Cannot proceed without Firestore admin connection');
      process.exit(1);
    }

    const targetCollections = getTargetCollections();
    const confirmed = await promptConfirmation(targetCollections, videoId);

    if (!confirmed) {
      console.log('❌ Operation cancelled by user');
      process.exit(0);
    }

    console.log(`\n🚀 Starting admin cache deletion for video: ${videoId}`);

    let totalDeleted = 0;
    let totalErrors = 0;

    for (const collectionName of targetCollections) {
      const result = await deleteCacheFromCollection(collectionName, videoId);
      totalDeleted += result.deleted;
      totalErrors += result.errors;
    }

    console.log('\n📊 DELETION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Video ID: ${videoId}`);
    console.log(`Total entries deleted: ${totalDeleted}`);
    console.log(`Errors encountered: ${totalErrors}`);

    if (totalDeleted > 0) {
      console.log('✅ Admin cache deletion completed successfully');
    } else {
      console.log('ℹ️  No cache entries found for this video');
    }

    process.exit(totalErrors > 0 ? 1 : 0);

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('💥 Script execution failed:', error);
  process.exit(1);
});
