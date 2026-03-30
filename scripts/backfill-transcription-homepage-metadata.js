#!/usr/bin/env node

/**
 * Backfill homepage metadata for Firestore transcription documents.
 *
 * This script computes:
 * - isPrimaryVariant
 * - displayPriority
 * - searchableKeys
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

const BEAT_MODEL_PRIORITY = {
  madmom: 0,
  'beat-transformer': 1,
};

const CHORD_MODEL_PRIORITY = {
  'chord-cnn-lstm': 0,
  'btc-sl': 1,
  'btc-pl': 2,
};

const ENHARMONIC_ROOTS = {
  'c#': ['db'],
  db: ['c#'],
  'd#': ['eb'],
  eb: ['d#'],
  'f#': ['gb'],
  gb: ['f#'],
  'g#': ['ab'],
  ab: ['g#'],
  'a#': ['bb'],
  bb: ['a#'],
};

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

function getDocumentName(collectionName, documentId) {
  return `${getFirestoreDocumentsBaseUrl()}/${collectionName}/${documentId}`;
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

function normalizeKeyForComparison(value) {
  return (
    value
      ?.trim()
      .replace(/♭/g, 'b')
      .replace(/♯/g, '#')
      .replace(/\s+/g, ' ')
      .toLowerCase() || ''
  );
}

function buildSearchableKeys(keySignature) {
  const normalized = normalizeKeyForComparison(keySignature);
  if (!normalized) return [];

  const match = normalized.match(/^([a-g](?:#|b)?)(?:\s+(major|minor))?$/i);
  if (!match) return [normalized];

  const [, root, quality] = match;
  const roots = [root, ...(ENHARMONIC_ROOTS[root] || [])];

  return Array.from(new Set(
    roots.map((rootVariant) => (quality ? `${rootVariant} ${quality.toLowerCase()}` : rootVariant))
  ));
}

function getCreatedAtMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt === 'string') {
    const parsed = Date.parse(createdAt);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
  if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis();
  return 0;
}

function getHomepageVariantScore(candidate) {
  return (
    (BEAT_MODEL_PRIORITY[candidate.beatModel || ''] ?? 99) * 100 +
    (CHORD_MODEL_PRIORITY[candidate.chordModel || ''] ?? 99)
  );
}

function buildHomepageVariantAssignments(candidates) {
  const ranked = [...candidates].sort((a, b) => {
    const scoreDiff = getHomepageVariantScore(a) - getHomepageVariantScore(b);
    if (scoreDiff !== 0) return scoreDiff;

    const createdAtDiff = getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;

    return a.docId.localeCompare(b.docId);
  });

  const rankLookup = new Map(ranked.map((candidate, index) => [candidate.docId, index + 1]));
  const primaryDocId = ranked[0]?.docId ?? null;

  return candidates.map((candidate) => ({
    docId: candidate.docId,
    isPrimaryVariant: candidate.docId === primaryDocId,
    displayPriority: rankLookup.get(candidate.docId) ?? null,
    searchableKeys: buildSearchableKeys(candidate.keySignature ?? candidate.primaryKey ?? null),
  }));
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function buildPendingUpdates(groupedDocs) {
  const updates = [];

  for (const [videoId, docs] of groupedDocs.entries()) {
    const assignments = buildHomepageVariantAssignments(
      docs.map(({ docId, data }) => ({
        docId,
        beatModel: data.beatModel,
        chordModel: data.chordModel,
        createdAt: data.createdAt,
        keySignature: data.keySignature,
        primaryKey: data.primaryKey,
      }))
    );

    const assignmentLookup = new Map(assignments.map((assignment) => [assignment.docId, assignment]));

    docs.forEach(({ docId, data, documentName }) => {
      const assignment = assignmentLookup.get(docId);
      if (!assignment) return;

      const needsUpdate =
        data.isPrimaryVariant !== assignment.isPrimaryVariant ||
        data.displayPriority !== assignment.displayPriority ||
        !arraysEqual(data.searchableKeys || [], assignment.searchableKeys);

      if (!needsUpdate) return;

      updates.push({
        videoId,
        docId,
        documentName,
        fields: {
          isPrimaryVariant: assignment.isPrimaryVariant,
          displayPriority: assignment.displayPriority,
          searchableKeys: assignment.searchableKeys,
        },
        before: {
          isPrimaryVariant: data.isPrimaryVariant,
          displayPriority: data.displayPriority,
          searchableKeys: data.searchableKeys || [],
        },
      });
    });
  }

  return updates;
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
ChordMini Firestore Homepage Metadata Backfill

USAGE:
  node scripts/backfill-transcription-homepage-metadata.js [options]

OPTIONS:
  --dry-run                 Preview changes only (default)
  --write                   Apply writes to Firestore
  --video-id <id>           Limit the operation to a single YouTube video ID
  --all                     Required for bulk writes across all transcriptions
  --force                   Skip confirmation prompt in write mode
  --help                    Show this help message

EXAMPLES:
  node scripts/backfill-transcription-homepage-metadata.js --dry-run
  node scripts/backfill-transcription-homepage-metadata.js --video-id Y2ge3KrdeWs --dry-run
  node scripts/backfill-transcription-homepage-metadata.js --video-id Y2ge3KrdeWs --write
  node scripts/backfill-transcription-homepage-metadata.js --all --write
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

    console.log('🎵 ChordMini Homepage Metadata Backfill');
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

    const groupedDocs = new Map();

    documents.forEach((document) => {
      const data = getDocumentData(document);
      if (!data.videoId) return;

      const docId = getDocumentId(document.name);
      const bucket = groupedDocs.get(data.videoId) || [];
      bucket.push({
        docId,
        documentName: document.name,
        data,
      });
      groupedDocs.set(data.videoId, bucket);
    });

    const pendingUpdates = buildPendingUpdates(groupedDocs);

    console.log(`\n📊 Scan summary`);
    console.log(`   • Documents scanned: ${documents.length}`);
    console.log(`   • Videos grouped: ${groupedDocs.size}`);
    console.log(`   • Documents needing update: ${pendingUpdates.length}`);

    pendingUpdates.slice(0, 10).forEach((update) => {
      console.log(`   • ${update.docId}`);
      console.log(`     before: primary=${String(update.before.isPrimaryVariant)}, priority=${String(update.before.displayPriority)}, keys=${JSON.stringify(update.before.searchableKeys)}`);
      console.log(`     after:  primary=${String(update.fields.isPrimaryVariant)}, priority=${String(update.fields.displayPriority)}, keys=${JSON.stringify(update.fields.searchableKeys)}`);
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
