#!/usr/bin/env node

/**
 * Backfill usageCount for Firestore transcription documents.
 *
 * This script computes:
 * - usageCount
 *
 * Safety defaults:
 * - dry-run by default
 * - single-video writes require --write --video-id <id>
 * - bulk writes require --all --write
 */

const { GoogleAuth } = require('google-auth-library');
const dotenv = require('dotenv');
const readline = require('readline');

dotenv.config({ path: '.env.local' });

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
const DEFAULT_PAGE_SIZE = 300;
const DEFAULT_WRITE_BATCH_SIZE = 200;
const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

let projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'chordmini-d29f9';
let authClientPromise;

function getDatabaseBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
}

function getFirestoreDocumentsBaseUrl() {
  return `${getDatabaseBaseUrl()}/documents`;
}

async function getAuthClient() {
  if (authClientPromise) return authClientPromise;

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
      } catch {
        console.log('⚠️  Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to default credentials');
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
  if ('integerValue' in value) return Number(value.integerValue);
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

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(serializeFirestoreValue) } };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [key, serializeFirestoreValue(nestedValue)])
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore serialization type: ${typeof value}`);
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
    const params = new URLSearchParams({ pageSize: String(DEFAULT_PAGE_SIZE) });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const data = await firestoreRequest(`${getFirestoreDocumentsBaseUrl()}/${collectionName}?${params.toString()}`);
    documents.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return documents;
}

async function queryTranscriptionsByVideoId(videoId) {
  const response = await firestoreRequest(`${getFirestoreDocumentsBaseUrl()}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: TRANSCRIPTIONS_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'videoId' },
            op: 'EQUAL',
            value: { stringValue: videoId },
          },
        },
      },
    }),
  });

  return (response || []).map((entry) => entry.document).filter(Boolean);
}

function buildPendingUpdates(documents) {
  return documents.flatMap((document) => {
    const data = getDocumentData(document);
    const currentUsageCount = data.usageCount;
    const isValidUsageCount =
      typeof currentUsageCount === 'number' &&
      Number.isFinite(currentUsageCount) &&
      currentUsageCount >= 0;

    if (isValidUsageCount) {
      return [];
    }

    return [{
      docId: getDocumentId(document.name),
      documentName: document.name,
      before: currentUsageCount,
      fields: {
        usageCount: 0,
      },
    }];
  });
}

async function commitUpdateBatch(updates) {
  if (!updates.length) return;

  await firestoreRequest(`${getFirestoreDocumentsBaseUrl()}:commit`, {
    method: 'POST',
    body: JSON.stringify({
      writes: updates.map((update) => ({
        update: {
          name: update.documentName,
          fields: Object.fromEntries(
            Object.entries(update.fields).map(([key, value]) => [key, serializeFirestoreValue(value)])
          ),
        },
        updateMask: {
          fieldPaths: Object.keys(update.fields),
        },
      })),
    }),
  });
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    write: false,
    force: false,
    all: false,
    videoId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--write') {
      options.write = true;
      options.dryRun = false;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      options.write = false;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--all') {
      options.all = true;
      continue;
    }

    if (arg === '--video-id') {
      options.videoId = argv[index + 1] || null;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(`
ChordMini Firestore Usage Count Backfill

USAGE:
  node scripts/backfill-transcription-usage-count.js [options]

OPTIONS:
  --dry-run                 Preview changes only (default)
  --write                   Apply writes to Firestore
  --video-id <id>           Limit the operation to a single YouTube video ID
  --all                     Required for bulk writes across all transcriptions
  --force                   Skip confirmation prompt in write mode
  --help                    Show this help message

EXAMPLES:
  node scripts/backfill-transcription-usage-count.js --dry-run
  node scripts/backfill-transcription-usage-count.js --video-id Y2ge3KrdeWs --dry-run
  node scripts/backfill-transcription-usage-count.js --video-id Y2ge3KrdeWs --write
  node scripts/backfill-transcription-usage-count.js --all --write
`);
}

async function promptConfirmation(lines, { force = false } = {}) {
  if (force) return true;

  console.log('\n⚠️  Confirmation required before applying Firestore writes');
  lines.forEach((line) => console.log(`   • ${line}`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question('\nProceed? (y/N): ', (value) => resolve(value.trim().toLowerCase()));
  });

  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function testFirebaseConnection() {
  console.log('\n🔧 Testing Firestore admin connection...');

  try {
    await firestoreRequest(getDatabaseBaseUrl());
    console.log(`✅ Firestore admin connection successful (project: ${projectId})`);
    return true;
  } catch (error) {
    console.error('❌ Firestore admin connection failed:', error.message);
    console.error('💡 Troubleshooting tips:');
    console.error('   • Make sure you have service account credentials or Application Default Credentials');
    console.error('   • Verify your Firebase project ID and network access');
    return false;
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }

    if (options.videoId && !YOUTUBE_VIDEO_ID_REGEX.test(options.videoId)) {
      throw new Error(`Invalid YouTube video ID: ${options.videoId}`);
    }

    if (options.write && !options.videoId && !options.all) {
      throw new Error('Bulk write mode requires --all. Use --video-id <id> for a scoped write.');
    }

    console.log('🎵 ChordMini Usage Count Backfill');
    console.log(`Mode: ${options.write ? 'write' : 'dry-run'}`);
    console.log(`Project: ${projectId}`);
    console.log(`Scope: ${options.videoId ? `video ${options.videoId}` : 'all transcriptions'}`);

    const connected = await testFirebaseConnection();
    if (!connected) {
      process.exit(1);
    }

    const documents = options.videoId
      ? await queryTranscriptionsByVideoId(options.videoId)
      : await listCollectionDocuments(TRANSCRIPTIONS_COLLECTION);

    const pendingUpdates = buildPendingUpdates(documents);

    console.log('\n📊 Scan summary');
    console.log(`   • Documents scanned: ${documents.length}`);
    console.log(`   • Documents needing update: ${pendingUpdates.length}`);

    pendingUpdates.slice(0, 10).forEach((update) => {
      console.log(`   • ${update.docId}`);
      console.log(`     before: usageCount=${JSON.stringify(update.before)}`);
      console.log(`     after:  usageCount=${update.fields.usageCount}`);
    });

    if (pendingUpdates.length > 10) {
      console.log(`   • ...and ${pendingUpdates.length - 10} more documents`);
    }

    if (!options.write) {
      console.log('\n✅ Dry-run complete. No Firestore writes were performed.');
      return;
    }

    if (pendingUpdates.length === 0) {
      console.log('\n✅ No updates were needed.');
      return;
    }

    const confirmed = await promptConfirmation([
      `Project: ${projectId}`,
      `Scope: ${options.videoId ? `single video ${options.videoId}` : 'all transcription documents'}`,
      `Pending document updates: ${pendingUpdates.length}`,
      `Write batches: ${Math.ceil(pendingUpdates.length / DEFAULT_WRITE_BATCH_SIZE)}`,
    ], { force: options.force });

    if (!confirmed) {
      console.log('❌ Operation cancelled by user.');
      process.exit(0);
    }

    let applied = 0;
    for (let index = 0; index < pendingUpdates.length; index += DEFAULT_WRITE_BATCH_SIZE) {
      const batch = pendingUpdates.slice(index, index + DEFAULT_WRITE_BATCH_SIZE);
      await commitUpdateBatch(batch);
      applied += batch.length;
      console.log(`✅ Applied ${applied}/${pendingUpdates.length} updates`);
    }

    console.log('\n✅ Backfill completed successfully.');
  } catch (error) {
    console.error('💥 Backfill failed:', error.message);
    process.exit(1);
  }
}

void main();
