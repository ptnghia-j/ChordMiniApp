#!/usr/bin/env node

/**
 * Admin Cache Deletion Script for ChordMini Application
 *
 * Uses Firestore's REST API with Google-authenticated credentials to delete
 * cache data with elevated permissions.
 *
 * Supports both:
 * - legacy videoId-oriented cache invalidation (`translations`, `lyrics`, `transcriptions`)
 * - targeted `keyDetections` invalidation for a specific transcription context
 */

const crypto = require('crypto');
const { GoogleAuth } = require('google-auth-library');
const dotenv = require('dotenv');
const readline = require('readline');

dotenv.config({ path: '.env.local' });

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const KEY_DETECTION_PROMPT_VERSION = 'v3-enharmonic-key-consistency';
const KEY_ENRICHMENT_FIELDS = [
  'keySignature',
  'primaryKey',
  'keyModulation',
  'modulation',
  'chordCorrections',
  'corrections',
  'sequenceCorrections',
  'correctedChords',
  'originalChords',
  'romanNumerals',
];

let projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'chordmini-d29f9';
let authClientPromise;

const CACHE_COLLECTIONS = {
  translations: {
    name: 'translations',
    description: 'Lyrics translation cache (Gemini API translations)',
    searchField: 'videoId',
  },
  lyrics: {
    name: 'lyrics',
    description: 'Lyrics transcription cache (Music.ai API transcriptions)',
    searchField: 'videoId',
  },
  transcriptions: {
    name: 'transcriptions',
    description: 'Beat and chord analysis cache (ML model results)',
    searchField: 'videoId',
  },
};

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
      } catch {
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

function getDocumentName(collectionName, documentId) {
  return `${getFirestoreBaseUrl()}/${collectionName}/${documentId}`;
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

function getDocumentData(document) {
  return Object.fromEntries(
    Object.entries(document.fields || {}).map(([key, value]) => [key, parseFirestoreValue(value)])
  );
}

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(serializeFirestoreValue) } };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
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

async function getDocument(collectionName, documentId) {
  try {
    return await firestoreRequest(`${getFirestoreBaseUrl()}/${collectionName}/${documentId}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('(404')) {
      return null;
    }
    throw error;
  }
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

async function patchDocument(collectionName, documentId, fields) {
  const params = new URLSearchParams();
  Object.keys(fields).forEach((fieldPath) => params.append('updateMask.fieldPaths', fieldPath));

  const documentName = getDocumentName(collectionName, documentId);
  await firestoreRequest(`${documentName}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: documentName,
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, serializeFirestoreValue(value)])
      ),
    }),
  });
}

function buildTranscriptionDocId(videoId, beatModel, chordModel) {
  return `${videoId}_${beatModel}_${chordModel}`;
}

function generateKeyDetectionCacheKey(chords, includeEnharmonicCorrection = false, includeRomanNumerals = false) {
  const chordString = chords
    .map((chord) => `${chord.time?.toFixed(3) || 0}:${chord.chord || chord}`)
    .join('|');

  const keyString = `prompt:${KEY_DETECTION_PROMPT_VERSION}_enharmonic:${includeEnharmonicCorrection}_roman:${includeRomanNumerals}_${chordString}`;
  return crypto.createHash('sha256').update(keyString).digest('hex').substring(0, 32);
}

function normalizeChordTime(chord) {
  if (typeof chord?.time === 'number' && Number.isFinite(chord.time)) {
    return chord.time;
  }
  if (typeof chord?.start === 'number' && Number.isFinite(chord.start)) {
    return chord.start;
  }
  return undefined;
}

function buildChordDataFromTranscription(transcription, timeMode = 'canonical') {
  const rawChords = Array.isArray(transcription?.chords) ? transcription.chords : [];
  const mappedChords = rawChords
    .map((chord) => ({
      chord: chord?.chord || String(chord || ''),
      time: timeMode === 'zero' ? undefined : normalizeChordTime(chord),
    }))
    .filter((chord) => chord.chord);

  return mappedChords.filter((chord, index) => index === 0 || chord.chord !== mappedChords[index - 1].chord);
}

function buildCandidateKeyDetectionCacheKeys(transcription) {
  const candidates = [];
  const seen = new Set();
  const optionCombos = [
    { includeEnharmonicCorrection: true, includeRomanNumerals: false, reason: 'current enharmonic flow' },
    { includeEnharmonicCorrection: true, includeRomanNumerals: true, reason: 'current Roman numeral flow' },
    { includeEnharmonicCorrection: false, includeRomanNumerals: false, reason: 'legacy basic flow' },
  ];

  ['canonical', 'zero'].forEach((timeMode) => {
    const chordData = buildChordDataFromTranscription(transcription, timeMode);
    if (!chordData.length) {
      return;
    }

    optionCombos.forEach((combo) => {
      const cacheKey = generateKeyDetectionCacheKey(
        chordData,
        combo.includeEnharmonicCorrection,
        combo.includeRomanNumerals
      );

      if (seen.has(cacheKey)) {
        return;
      }

      seen.add(cacheKey);
      candidates.push({
        cacheKey,
        timeMode,
        ...combo,
      });
    });
  });

  return candidates;
}

function buildKeyDetectionDocumentNames(candidates) {
  return candidates.map((candidate) => getDocumentName('keyDetections', candidate.cacheKey));
}

function parseCliArgs(rawArgs) {
  const flags = new Set();
  const options = {};
  const positionals = [];
  const valuedOptions = new Set(['--beat-model', '--chord-model']);

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [name, inlineValue] = arg.split('=', 2);
    if (inlineValue !== undefined) {
      options[name] = inlineValue;
      flags.add(name);
      continue;
    }

    if (valuedOptions.has(name) && rawArgs[index + 1] && !rawArgs[index + 1].startsWith('--')) {
      options[name] = rawArgs[index + 1];
      flags.add(name);
      index += 1;
      continue;
    }

    flags.add(name);
  }

  return {
    flags: Array.from(flags),
    options,
    videoId: positionals[0],
  };
}

function showHelp() {
  console.log(`
🎵 ChordMini Admin Cache Deletion Tool

USAGE:
  node scripts/delete-cache-admin.js <VIDEO_ID> [OPTIONS]

ARGUMENTS:
  VIDEO_ID    YouTube video ID (e.g., Y2ge3KrdeWs)

OPTIONS:
  --translations              Delete translation cache only
  --lyrics                    Delete lyrics transcription cache only
  --beats                     Delete beat detection cache only
  --chords                    Delete chord recognition cache only
  --analysis                  Delete both beat and chord cache
  --key-detections            Delete matching keyDetections docs for one transcription and clear key-enrichment fields on that transcription
  --beat-model <name>         Required with --key-detections (e.g., madmom)
  --chord-model <name>        Required with --key-detections (e.g., chord-cnn-lstm)
  --dry-run                   Preview matching documents without writing changes
  --all                       Delete all legacy video-linked caches for the video
  --force                     Skip confirmation prompt
  --help                      Show this help message

EXAMPLES:
  node scripts/delete-cache-admin.js Y2ge3KrdeWs --analysis
  node scripts/delete-cache-admin.js F2RnxZnubCM --key-detections --beat-model madmom --chord-model chord-cnn-lstm
  node scripts/delete-cache-admin.js F2RnxZnubCM --key-detections --beat-model madmom --chord-model chord-cnn-lstm --dry-run
`);
}

function validateArguments(cli) {
  const { flags, options, videoId } = cli;

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

  const cacheFlags = flags.filter((flag) =>
    ['--translations', '--lyrics', '--beats', '--chords', '--analysis', '--all', '--key-detections'].includes(flag)
  );

  if (cacheFlags.length === 0) {
    console.error('❌ Error: Please specify at least one cache type to delete');
    process.exit(1);
  }

  if (flags.includes('--key-detections')) {
    if (!options['--beat-model'] || !options['--chord-model']) {
      console.error('❌ Error: --key-detections requires both --beat-model and --chord-model');
      process.exit(1);
    }
  }
}

function getLegacyTargetCollections(flags) {
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

async function deleteCacheFromCollection(collectionName, videoId, { dryRun = false } = {}) {
  const collectionInfo = CACHE_COLLECTIONS[collectionName];
  if (!collectionInfo) {
    console.error(`❌ Unknown collection: ${collectionName}`);
    return { deleted: 0, errors: 1 };
  }

  console.log(`\n🔍 Searching ${collectionInfo.description}...`);

  try {
    const documents = await listCollectionDocuments(collectionInfo.name);
    if (documents.length === 0) {
      console.log(`  ℹ️  Collection '${collectionInfo.name}' is empty`);
      return { deleted: 0, errors: 0 };
    }

    const matchedDocumentNames = [];
    for (const document of documents) {
      const docId = getDocumentId(document.name);
      const docData = getDocumentData(document);
      const isRelated =
        docId.includes(videoId) ||
        JSON.stringify(docData).includes(videoId) ||
        docData[collectionInfo.searchField] === videoId;

      if (isRelated) {
        matchedDocumentNames.push(document.name);
        console.log(`  ${dryRun ? '🔎 Would delete' : '📝 Queued for deletion'}: ${docId}`);
      }
    }

    if (!matchedDocumentNames.length) {
      console.log(`  ℹ️  No cache entries found for video ${videoId}`);
      return { deleted: 0, errors: 0 };
    }

    if (!dryRun) {
      await commitDeleteBatch(matchedDocumentNames);
      console.log(`  ✅ Deleted ${matchedDocumentNames.length} entries from ${collectionInfo.description}`);
    }

    return { deleted: matchedDocumentNames.length, errors: 0 };
  } catch (error) {
    console.error(`  ❌ Error accessing ${collectionInfo.description}:`, error.message);
    return { deleted: 0, errors: 1 };
  }
}

async function invalidateKeyDetectionsForTranscription(videoId, beatModel, chordModel, { dryRun = false } = {}) {
  const transcriptionDocId = buildTranscriptionDocId(videoId, beatModel, chordModel);
  console.log(`\n🎼 Resolving key-detection cache for transcription: ${transcriptionDocId}`);

  const transcriptionDocument = await getDocument('transcriptions', transcriptionDocId);
  if (!transcriptionDocument) {
    console.error('  ❌ Matching transcription document not found');
    return { deleted: 0, updated: 0, errors: 1 };
  }

  const transcription = getDocumentData(transcriptionDocument);
  const candidates = buildCandidateKeyDetectionCacheKeys(transcription);
  if (!candidates.length) {
    console.error('  ❌ Transcription does not contain enough chord data to compute cache keys');
    return { deleted: 0, updated: 0, errors: 1 };
  }

  const matchingCandidates = [];
  for (const candidate of candidates) {
    const existingDocument = await getDocument('keyDetections', candidate.cacheKey);
    if (existingDocument) {
      matchingCandidates.push(candidate);
      console.log(
        `  ${dryRun ? '🔎 Found' : '📝 Matched'} keyDetections/${candidate.cacheKey} (${candidate.reason}, ${candidate.timeMode} timing)`
      );
    }
  }

  if (!matchingCandidates.length) {
    console.log('  ℹ️  No matching keyDetections documents were found for this transcription');
  }

  if (!dryRun && matchingCandidates.length) {
    await commitDeleteBatch(buildKeyDetectionDocumentNames(matchingCandidates));
    console.log(`  ✅ Deleted ${matchingCandidates.length} keyDetections document(s)`);
  }

  const keyFieldReset = Object.fromEntries(KEY_ENRICHMENT_FIELDS.map((field) => [field, null]));
  if (dryRun) {
    console.log(`  🔎 Would reset transcription enrichment fields: ${KEY_ENRICHMENT_FIELDS.join(', ')}`);
  } else {
    await patchDocument('transcriptions', transcriptionDocId, keyFieldReset);
    console.log('  ✅ Cleared transcription key enrichment to force recomputation on next analyze load');
    console.log('  ℹ️  The base transcriptions cache document still exists. Use --analysis as well if you need a full beat/chord recompute.');
  }

  return {
    deleted: matchingCandidates.length,
    updated: 1,
    errors: 0,
    transcriptionDocId,
  };
}

function promptConfirmation(lines, { force = false } = {}) {
  if (force) {
    return Promise.resolve(true);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('\n⚠️  About to perform these admin cache actions:');
    lines.forEach((line) => console.log(`   • ${line}`));
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

async function main(cli = parseCliArgs(process.argv.slice(2))) {
  try {
    validateArguments(cli);
    console.log('🎵 ChordMini Admin Cache Deletion Tool\n');

    const connectionOk = await testFirebaseConnection();
    if (!connectionOk) {
      console.error('\n❌ Cannot proceed without Firestore admin connection');
      process.exit(1);
    }

    const legacyTargets = getLegacyTargetCollections(cli.flags);
    const confirmationLines = legacyTargets.map((collection) => CACHE_COLLECTIONS[collection].description);
    if (cli.flags.includes('--key-detections')) {
      confirmationLines.push(
        `Targeted keyDetections invalidation for ${buildTranscriptionDocId(
          cli.videoId,
          cli.options['--beat-model'],
          cli.options['--chord-model']
        )}`
      );
      confirmationLines.push(`Reset transcription enrichment fields: ${KEY_ENRICHMENT_FIELDS.join(', ')}`);
    }

    if (cli.flags.includes('--dry-run')) {
      confirmationLines.unshift('DRY RUN ONLY — no Firestore writes will be performed');
    }

    const confirmed = await promptConfirmation(confirmationLines, { force: cli.flags.includes('--force') });
    if (!confirmed) {
      console.log('❌ Operation cancelled by user');
      process.exit(0);
    }

    console.log(`\n🚀 Starting admin cache invalidation for video: ${cli.videoId}`);

    let totalDeleted = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    for (const collectionName of legacyTargets) {
      const result = await deleteCacheFromCollection(collectionName, cli.videoId, {
        dryRun: cli.flags.includes('--dry-run'),
      });
      totalDeleted += result.deleted;
      totalErrors += result.errors;
    }

    if (cli.flags.includes('--key-detections')) {
      const result = await invalidateKeyDetectionsForTranscription(
        cli.videoId,
        cli.options['--beat-model'],
        cli.options['--chord-model'],
        { dryRun: cli.flags.includes('--dry-run') }
      );
      totalDeleted += result.deleted;
      totalUpdated += result.updated;
      totalErrors += result.errors;
    }

    console.log('\n📊 DELETION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Video ID: ${cli.videoId}`);
    console.log(`Matched/deleted documents: ${totalDeleted}`);
    console.log(`Updated transcription docs: ${totalUpdated}`);
    console.log(`Errors encountered: ${totalErrors}`);
    console.log(`Mode: ${cli.flags.includes('--dry-run') ? 'dry-run' : 'write'}`);

    if (totalErrors === 0) {
      console.log(`✅ Admin cache ${cli.flags.includes('--dry-run') ? 'preview' : 'invalidation'} completed successfully`);
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  KEY_ENRICHMENT_FIELDS,
  buildCandidateKeyDetectionCacheKeys,
  buildChordDataFromTranscription,
  buildKeyDetectionDocumentNames,
  buildTranscriptionDocId,
  generateKeyDetectionCacheKey,
  parseCliArgs,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
  });
}
