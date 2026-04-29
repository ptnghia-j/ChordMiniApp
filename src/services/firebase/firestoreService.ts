import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import type { SheetSageResult } from '@/types/sheetSage';
import { transcriptionCache } from '@/services/cache/smartFirebaseCache';
import { applyEnharmonicCorrection } from '@/utils/chordUtils';
import { buildSearchableKeys } from '@/utils/keySignatureUtils';
import { synchronizeChords } from '@/utils/chordSynchronization';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';
import { BeatInfo } from '../audio/beatDetectionService';
import { SmartFirebaseCache } from '@/services/cache/smartFirebaseCache';

// Extended interface for synchronized chords that may have additional properties
interface ExtendedSynchronizedChord {
  chord: string;
  beatIndex: number;
  beatNum?: number;
  source?: string;
}

export type RomanNumeralData = {
  analysis: string[];
  keyContext: string;
  temporalShifts?: Array<{
    chordIndex: number;
    targetKey: string;
    romanNumeral: string;
  }>;
};

export type SequenceCorrectionsData = {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: Array<{
      startIndex: number;
      endIndex: number;
      key: string;
      chords: string[];
    }>;
    modulations?: Array<{
      fromKey: string;
      toKey: string;
      atIndex: number;
      atTime?: number;
    }>;
  };
  romanNumerals?: RomanNumeralData | null;
} | null;

// Define the transcription data structure
export interface TranscriptionData {
  videoId: string;
  title?: string; // Video title field for proper display in RecentVideos
  channelTitle?: string; // FIXED: Add channel title for complete metadata
  thumbnail?: string; // FIXED: Add thumbnail URL for complete metadata
  audioUrl?: string | null;
  beatModel: string;
  chordModel: string;
  beats: BeatInfo[];
  chords: ChordDetectionResult[];
  downbeats?: number[];
  downbeats_with_measures?: { time: number; measureNum: number }[];
  synchronizedChords: { chord: string; beatIndex: number; beatNum?: number }[];
  createdAt: Timestamp;
  audioDuration?: number;
  totalProcessingTime?: number;
  // Add time signature and BPM fields
  timeSignature?: number | null;
  bpm?: number | null;
  // Add beat shift field for synchronization
  beatShift?: number;
  // Add key signature field
  keySignature?: string | null;
  keyModulation?: string | null;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: SequenceCorrectionsData;
  correctedChords?: string[] | null;
  originalChords?: string[] | null;
  // Compatibility fields from newer Gemini enrichment schema already present in Firestore
  primaryKey?: string | null;
  modulation?: string | null;
  corrections?: Record<string, string> | null;
  rawResponse?: string | null;
  // Add Roman numeral analysis field
  romanNumerals?: RomanNumeralData | null;
  isPrimaryVariant?: boolean;
  displayPriority?: number | null;
  searchableKeys?: string[];
  usageCount?: number;
}

export interface MelodyTranscriptionData extends SheetSageResult {
  videoId: string;
  model: string;
  createdAt: Timestamp;
}

function toPositiveBeatNum(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value > 0 ? value : undefined;
}

function toPersistedBeatNum(value: unknown): number | null {
  return toPositiveBeatNum(value) ?? null;
}

function toPersistedSource(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeSynchronizedChords(
  synchronizedChords: TranscriptionData['synchronizedChords'] | undefined
): { chord: string; beatIndex: number; beatNum?: number }[] {
  if (!Array.isArray(synchronizedChords)) {
    return [];
  }

  return synchronizedChords
    .filter((item): item is { chord: string; beatIndex: number; beatNum?: number } => (
      Boolean(item)
      && typeof item.chord === 'string'
      && typeof item.beatIndex === 'number'
      && Number.isFinite(item.beatIndex)
      && item.beatIndex >= 0
    ))
    .map((item) => {
      const beatNum = toPositiveBeatNum(item.beatNum);
      return beatNum !== undefined
        ? { chord: item.chord, beatIndex: item.beatIndex, beatNum }
        : { chord: item.chord, beatIndex: item.beatIndex };
    });
}

function rebuildSynchronizedChordsIfNeeded(
  data: TranscriptionData
): { chord: string; beatIndex: number; beatNum?: number }[] {
  const hasUsableInputs = Array.isArray(data.chords) && data.chords.length > 0 && Array.isArray(data.beats) && data.beats.length > 0;
  const hasUsableSync = Array.isArray(data.synchronizedChords) && data.synchronizedChords.length === data.beats?.length;

  if (!hasUsableInputs) {
    return sanitizeSynchronizedChords(data.synchronizedChords);
  }

  if (hasUsableSync) {
    return sanitizeSynchronizedChords(data.synchronizedChords);
  }

  const rebuilt = synchronizeChords(data.chords, data.beats);
  return rebuilt.map((item, index) => {
    const beatNum = toPositiveBeatNum(data.beats[index]?.beatNum);
    return beatNum !== undefined
      ? { ...item, beatNum }
      : { chord: item.chord, beatIndex: item.beatIndex };
  });
}

function buildLegacySequenceCorrections(data: TranscriptionData): SequenceCorrectionsData {
  const legacyCorrections = data.chordCorrections ?? data.corrections ?? null;
  const originalSequence =
    data.originalChords ??
    data.synchronizedChords?.map((item) => item.chord) ??
    data.chords?.map((item) => item.chord) ??
    null;

  if (!legacyCorrections || !Array.isArray(originalSequence) || originalSequence.length === 0) {
    return null;
  }

  const correctedSequence = originalSequence.map((chord) => applyEnharmonicCorrection(chord, legacyCorrections));
  const hasAnyCorrection = correctedSequence.some((chord, index) => chord !== originalSequence[index]);

  if (!hasAnyCorrection) {
    return null;
  }

  return {
    originalSequence,
    correctedSequence,
    romanNumerals: data.romanNumerals ?? null,
  };
}

export function normalizeTranscriptionData(data: TranscriptionData): TranscriptionData {
  const normalizedSequenceCorrections =
    data.sequenceCorrections ??
    (
      Array.isArray(data.originalChords) &&
      Array.isArray(data.correctedChords) &&
      data.originalChords.length === data.correctedChords.length
        ? {
            originalSequence: data.originalChords,
            correctedSequence: data.correctedChords,
            romanNumerals: data.romanNumerals ?? null,
          }
        : null
    ) ??
    buildLegacySequenceCorrections(data);

  return {
    ...data,
    chords: Array.isArray(data.chords)
      ? data.chords.map((chord) => ({
          ...chord,
          time:
            typeof chord?.time === 'number' && Number.isFinite(chord.time)
              ? chord.time
              : (typeof chord?.start === 'number' && Number.isFinite(chord.start) ? chord.start : 0),
        }))
      : [],
    synchronizedChords: rebuildSynchronizedChordsIfNeeded(data),
    keySignature: data.keySignature ?? data.primaryKey ?? null,
    keyModulation: data.keyModulation ?? data.modulation ?? null,
    chordCorrections: data.chordCorrections ?? data.corrections ?? null,
    correctedChords: data.correctedChords ?? normalizedSequenceCorrections?.correctedSequence ?? null,
    originalChords: data.originalChords ?? normalizedSequenceCorrections?.originalSequence ?? null,
    sequenceCorrections: normalizedSequenceCorrections
      ? {
          ...normalizedSequenceCorrections,
          romanNumerals: normalizedSequenceCorrections.romanNumerals ?? data.romanNumerals ?? null,
        }
      : null,
    romanNumerals: data.romanNumerals ?? normalizedSequenceCorrections?.romanNumerals ?? null,
    usageCount:
      typeof data.usageCount === 'number' && Number.isFinite(data.usageCount) && data.usageCount >= 0
        ? data.usageCount
        : 0,
  };
}

// Collection name
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
const MELODY_COLLECTION = 'melody';
const MELODY_MODEL_ID = 'sheetsage-v0.2-handcrafted-melody-transformer';
const melodyCache = new SmartFirebaseCache<MelodyTranscriptionData>();

export const buildTranscriptionDocId = (
  videoId: string,
  beatModel: string,
  chordModel: string
) => `${videoId}_${beatModel}_${chordModel}`;

export const buildMelodyDocId = (videoId: string) => videoId;

function getTranscriptionCacheKey(
  videoId: string,
  beatModel: string,
  chordModel: string
): string {
  return buildTranscriptionDocId(videoId, beatModel, chordModel);
}

function getMelodyCacheKey(videoId: string): string {
  return buildMelodyDocId(videoId);
}

function normalizeMelodyTranscriptionData(data: MelodyTranscriptionData): MelodyTranscriptionData {
  const noteEvents = Array.isArray(data.noteEvents)
    ? [...data.noteEvents]
      .filter((note) => (
        typeof note?.onset === 'number'
        && Number.isFinite(note.onset)
        && typeof note?.offset === 'number'
        && Number.isFinite(note.offset)
        && typeof note?.pitch === 'number'
        && Number.isFinite(note.pitch)
        && typeof note?.velocity === 'number'
        && Number.isFinite(note.velocity)
      ))
      .sort((left, right) => (
        left.onset - right.onset
        || left.pitch - right.pitch
        || left.offset - right.offset
      ))
      .map((note) => ({
        onset: note.onset,
        offset: Math.max(note.offset, note.onset),
        pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
        velocity: Math.max(0, Math.min(127, Math.round(note.velocity))),
      }))
    : [];

  const beatTimes = Array.isArray(data.beatTimes)
    ? data.beatTimes.filter((beatTime) => typeof beatTime === 'number' && Number.isFinite(beatTime))
    : [];

  return {
    ...data,
    noteEvents,
    noteEventCount: noteEvents.length,
    beatTimes,
    beatsPerMeasure:
      typeof data.beatsPerMeasure === 'number' && Number.isFinite(data.beatsPerMeasure) && data.beatsPerMeasure > 0
        ? data.beatsPerMeasure
        : 4,
    tempoBpm:
      typeof data.tempoBpm === 'number' && Number.isFinite(data.tempoBpm) && data.tempoBpm > 0
        ? data.tempoBpm
        : 120,
    model: data.model || MELODY_MODEL_ID,
    source: 'sheetsage',
  };
}

type HomepageVariantCandidate = {
  docId: string;
  beatModel?: string | null;
  chordModel?: string | null;
  createdAt?: Timestamp | { toMillis?: () => number; seconds?: number } | null;
  keySignature?: string | null;
  primaryKey?: string | null;
};

function getCreatedAtMillis(
  createdAt: HomepageVariantCandidate['createdAt']
): number {
  if (!createdAt) return 0;
  if (createdAt instanceof Timestamp) return createdAt.toMillis();
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (typeof createdAt.seconds === 'number') return createdAt.seconds * 1000;
  return 0;
}

function getHomepageVariantScore(candidate: HomepageVariantCandidate): number {
  const beatRank: Record<string, number> = {
    madmom: 0,
    'beat-transformer': 1,
  };
  const chordRank: Record<string, number> = {
    'chord-cnn-lstm': 0,
    'btc-sl': 1,
    'btc-pl': 2,
  };

  return (
    (beatRank[candidate.beatModel || ''] ?? 99) * 100 +
    (chordRank[candidate.chordModel || ''] ?? 99)
  );
}

function buildHomepageVariantAssignments(candidates: HomepageVariantCandidate[]) {
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

// Flag to disable Firestore if CORS errors persist
let firestoreDisabled = false;

export interface TranscriptionEnrichmentUpdate {
  title?: string | null;
  channelTitle?: string | null;
  thumbnail?: string | null;
  keySignature?: string | null;
  keyModulation?: string | null;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: SequenceCorrectionsData;
  correctedChords?: string[] | null;
  originalChords?: string[] | null;
  romanNumerals?: TranscriptionData['romanNumerals'];
}

/**
 * Check if a transcription exists in the database
 * @param videoId YouTube video ID
 * @param beatModel Beat detection model name
 * @param chordModel Chord detection model name
 * @returns The transcription data if found, null otherwise
 */
export async function getTranscription(
  videoId: string,
  beatModel: string,
  chordModel: string
): Promise<TranscriptionData | null> {
  const cacheKey = getTranscriptionCacheKey(videoId, beatModel, chordModel);

  // Check if Firebase is initialized or disabled due to CORS issues
  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('Firestore disabled due to CORS issues, skipping transcription retrieval');
    } else {
      console.warn('Firebase not initialized, skipping transcription retrieval');
    }
    return null;
  }

  try {
    const cached = transcriptionCache.peek(cacheKey);
    if (cached !== undefined) {
      return cached ? normalizeTranscriptionData(cached as unknown as TranscriptionData) : null;
    }

    // console.log(`Checking for cached transcription: videoId=${videoId}, beatModel=${beatModel}, chordModel=${chordModel}`);

    // Create a unique document ID based on the parameters
    const docId = cacheKey;

    // Get the document reference
    const docRef = doc(db, TRANSCRIPTIONS_COLLECTION, docId);

    // Get the document
    const docSnap = await getDoc(docRef);

    // Check if the document exists
    if (docSnap.exists()) {
      const data = normalizeTranscriptionData(docSnap.data() as TranscriptionData);
      transcriptionCache.set(cacheKey, data as unknown as Record<string, unknown>, true);
      // console.log('Found cached transcription in Firestore:', {
      //   videoId: data.videoId,
      //   timeSignature: data.timeSignature,
      //   bpm: data.bpm,
      //   hasTimeSignature: data.timeSignature !== undefined,
      //   hasBpm: data.bpm !== undefined
      // });
      return data;
    }

    // console.log('No cached transcription found in Firestore');
    transcriptionCache.set(cacheKey, null, false);
    return null;
  } catch (error) {
    console.error('Error getting transcription from Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      // Check for CORS or network errors and handle gracefully
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('Network/CORS error accessing Firestore - disabling Firestore for this session');
        firestoreDisabled = true;
      }
    }
    return null;
  }
}

export async function getMelodyTranscription(
  videoId: string,
): Promise<MelodyTranscriptionData | null> {
  const cacheKey = getMelodyCacheKey(videoId);

  if (!db && !firestoreDisabled) {
    try {
      const { ensureFirebaseInitialized } = await import('@/config/firebase');
      await ensureFirebaseInitialized();
    } catch (error) {
      console.warn('Failed to initialize Firebase before melody retrieval:', error);
    }
  }

  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('Firestore disabled due to CORS issues, skipping melody retrieval');
    } else {
      console.warn('Firebase not initialized, skipping melody retrieval');
    }
    return null;
  }

  try {
    const cached = melodyCache.peek(cacheKey);
    if (cached !== undefined) {
      return cached ? normalizeMelodyTranscriptionData(cached as MelodyTranscriptionData) : null;
    }

    const docRef = doc(db, MELODY_COLLECTION, cacheKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = normalizeMelodyTranscriptionData(docSnap.data() as MelodyTranscriptionData);
      melodyCache.set(cacheKey, data, true);
      return data;
    }

    melodyCache.set(cacheKey, null, false);
    return null;
  } catch (error) {
    console.error('Error getting melody transcription from Firestore:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('Network/CORS error accessing Firestore - disabling Firestore for this session');
        firestoreDisabled = true;
      }
    }
    return null;
  }
}

/**
 * Save a melody transcription to the database
 * @param videoId YouTube video ID
 * @param melodyData The melody transcription data to save
 * @returns True if successful, false otherwise
 */
export async function saveMelodyTranscription(
  videoId: string,
  melodyData: SheetSageResult,
): Promise<boolean> {
  if (!db && !firestoreDisabled) {
    try {
      const { ensureFirebaseInitialized } = await import('@/config/firebase');
      await ensureFirebaseInitialized();
    } catch (error) {
      console.warn('Failed to initialize Firebase before melody save:', error);
    }
  }

  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('❌ Firestore disabled due to CORS issues, skipping melody save');
    } else if (!db) {
      console.warn('❌ Firebase Firestore not initialized, skipping melody save');
    }
    return false;
  }

  try {
    const docId = buildMelodyDocId(videoId);
    const docRef = doc(db, MELODY_COLLECTION, docId);
    const sanitizedData = normalizeMelodyTranscriptionData({
      ...melodyData,
      videoId,
      model: MELODY_MODEL_ID,
      createdAt: Timestamp.now(),
    });

    await setDoc(docRef, sanitizedData, { merge: true });
    melodyCache.set(docId, sanitizedData, true);
    return true;
  } catch (error) {
    console.error('❌ Failed to save melody transcription:', error);
    if (error instanceof Error && (
      error.message.includes('CORS') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError')
    )) {
      console.warn('🌐 Network/CORS error saving melody transcription - disabling Firestore for this session');
      firestoreDisabled = true;
    }
    return false;
  }
}

/**
 * Save a transcription to the database
 * @param transcriptionData The transcription data to save
 * @returns True if successful, false otherwise
 */
export async function saveTranscription(
  transcriptionData: Omit<TranscriptionData, 'createdAt'>
): Promise<boolean> {
  // console.log('🚀 STARTING TRANSCRIPTION SAVE PROCESS');

  // Check if Firebase is initialized or disabled due to CORS issues
  // console.log('🔍 FIREBASE INITIALIZATION CHECK:', {
  //   dbExists: !!db,
  //   authExists: !!auth,
  //   firestoreDisabled,
  //   dbType: typeof db,
  //   authType: typeof auth
  // });

  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('❌ Firestore disabled due to CORS issues, skipping transcription save');
    } else if (!db) {
      console.warn('❌ Firebase Firestore not initialized, skipping transcription save');
    }
    return false;
  }

  // Public cache writes should not be blocked on anonymous auth readiness.
  return performFirestoreSave(transcriptionData);
}

export async function updateTranscriptionEnrichment(
  videoId: string,
  beatModel: string,
  chordModel: string,
  enrichment: TranscriptionEnrichmentUpdate
): Promise<boolean> {
  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('❌ Firestore disabled due to CORS issues, skipping transcription enrichment update');
    } else if (!db) {
      console.warn('❌ Firebase Firestore not initialized, skipping transcription enrichment update');
    }
    return false;
  }

  const sanitizedEnrichment = Object.fromEntries(
    Object.entries({
      title: enrichment.title,
      channelTitle: enrichment.channelTitle,
      thumbnail: enrichment.thumbnail,
      keySignature: enrichment.keySignature,
      primaryKey: enrichment.keySignature,
      keyModulation: enrichment.keyModulation,
      modulation: enrichment.keyModulation,
      chordCorrections: enrichment.chordCorrections,
      corrections: enrichment.chordCorrections,
      sequenceCorrections: enrichment.sequenceCorrections,
      correctedChords: enrichment.correctedChords ?? enrichment.sequenceCorrections?.correctedSequence ?? null,
      originalChords: enrichment.originalChords ?? enrichment.sequenceCorrections?.originalSequence ?? null,
      romanNumerals: enrichment.romanNumerals,
    }).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(sanitizedEnrichment).length === 0) {
    return true;
  }

  try {
    const cacheKey = getTranscriptionCacheKey(videoId, beatModel, chordModel);
    const docRef = doc(
      db!,
      TRANSCRIPTIONS_COLLECTION,
      cacheKey
    );

    await setDoc(docRef, sanitizedEnrichment, { merge: true });

    const cached = transcriptionCache.peek(cacheKey);
    if (cached && typeof cached === 'object') {
      const merged = normalizeTranscriptionData({
        ...(cached as unknown as TranscriptionData),
        ...sanitizedEnrichment,
      } as TranscriptionData);
      transcriptionCache.set(cacheKey, merged as unknown as Record<string, unknown>, true);
    } else {
      transcriptionCache.invalidate(cacheKey);
    }

    if (enrichment.keySignature !== undefined) {
      await syncHomepageVariantMetadataForVideo(videoId);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to update transcription enrichment:', error);
    if (error instanceof Error && (
      error.message.includes('CORS') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError')
    )) {
      console.warn('🌐 Network/CORS error updating transcription enrichment - disabling Firestore for this session');
      firestoreDisabled = true;
    }
    return false;
  }
}

export async function incrementTranscriptionUsage(
  videoId: string,
  beatModel: string,
  chordModel: string
): Promise<boolean> {
  if (!db || firestoreDisabled) {
    if (firestoreDisabled) {
      console.warn('❌ Firestore disabled due to CORS issues, skipping transcription usage increment');
    } else if (!db) {
      console.warn('❌ Firebase Firestore not initialized, skipping transcription usage increment');
    }
    return false;
  }

  const cacheKey = getTranscriptionCacheKey(videoId, beatModel, chordModel);
  const docRef = doc(db, TRANSCRIPTIONS_COLLECTION, cacheKey);

  try {
    await updateDoc(docRef, {
      usageCount: increment(1),
    });

    const cached = transcriptionCache.peek(cacheKey);
    if (cached && typeof cached === 'object') {
      const normalizedCached = normalizeTranscriptionData(cached as unknown as TranscriptionData);
      transcriptionCache.set(
        cacheKey,
        {
          ...normalizedCached,
          usageCount: (normalizedCached.usageCount ?? 0) + 1,
        } as unknown as Record<string, unknown>,
        true
      );
    } else {
      transcriptionCache.invalidate(cacheKey);
    }

    return true;
  } catch (error) {
    if (error instanceof Error) {
      const firestoreError = error as Error & { code?: string };
      if (firestoreError.code === 'not-found') {
        console.warn(`⚠️ Cannot increment usageCount for missing transcription doc: ${cacheKey}`);
        return false;
      }

      if (
        error.message.includes('CORS') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError')
      ) {
        console.warn('🌐 Network/CORS error incrementing transcription usage - disabling Firestore for this session');
        firestoreDisabled = true;
      }
    }

    console.error('❌ Failed to increment transcription usage:', error);
    return false;
  }
}

async function syncHomepageVariantMetadataForVideo(videoId: string): Promise<void> {
  if (!db) return;

  const variantsQuery = query(
    collection(db, TRANSCRIPTIONS_COLLECTION),
    where('videoId', '==', videoId)
  );
  const variantsSnapshot = await getDocs(variantsQuery);

  if (variantsSnapshot.empty) return;

  const assignments = buildHomepageVariantAssignments(
    variantsSnapshot.docs.map((variantDoc) => {
      const data = variantDoc.data() as Partial<TranscriptionData>;
      return {
        docId: variantDoc.id,
        beatModel: data.beatModel,
        chordModel: data.chordModel,
        createdAt: data.createdAt,
        keySignature: data.keySignature,
        primaryKey: data.primaryKey,
      };
    })
  );

  const assignmentLookup = new Map(
    assignments.map((assignment) => [assignment.docId, assignment])
  );

  const batch = writeBatch(db);

  variantsSnapshot.docs.forEach((variantDoc) => {
    const assignment = assignmentLookup.get(variantDoc.id);
    if (!assignment) return;

    batch.set(
      variantDoc.ref,
      {
        isPrimaryVariant: assignment.isPrimaryVariant,
        displayPriority: assignment.displayPriority,
        searchableKeys: assignment.searchableKeys,
      },
      { merge: true }
    );

    transcriptionCache.invalidate(variantDoc.id);
  });

  await batch.commit();
}

/**
 * Internal function to perform the actual Firestore save operation
 * @param transcriptionData The transcription data to save
 * @returns True if successful, false otherwise
 */
async function performFirestoreSave(
  transcriptionData: Omit<TranscriptionData, 'createdAt'>
): Promise<boolean> {

  try {
    // console.log('🔄 Starting authenticated Firestore save process...');
    // console.log('🔍 DETAILED TRANSCRIPTION INPUT DATA:', {
    //   videoId: transcriptionData.videoId,
    //   videoIdType: typeof transcriptionData.videoId,
    //   videoIdLength: transcriptionData.videoId?.length,
    //   beatModel: transcriptionData.beatModel,
    //   beatModelType: typeof transcriptionData.beatModel,
    //   chordModel: transcriptionData.chordModel,
    //   chordModelType: typeof transcriptionData.chordModel,
    //   beatsCount: transcriptionData.beats?.length,
    //   beatsType: typeof transcriptionData.beats,
    //   chordsCount: transcriptionData.chords?.length,
    //   chordsType: typeof transcriptionData.chords,
    //   synchronizedChordsCount: transcriptionData.synchronizedChords?.length,
    //   synchronizedChordsType: typeof transcriptionData.synchronizedChords,
    //   timeSignature: transcriptionData.timeSignature,
    //   timeSignatureType: typeof transcriptionData.timeSignature,
    //   bpm: transcriptionData.bpm,
    //   bpmType: typeof transcriptionData.bpm,
    //   hasDownbeats: !!transcriptionData.downbeats,
    //   hasDownbeatsWithMeasures: !!transcriptionData.downbeats_with_measures,
    //   hasAudioDuration: !!transcriptionData.audioDuration,
    //   hasTotalProcessingTime: !!transcriptionData.totalProcessingTime,
    //   hasBeatShift: transcriptionData.beatShift !== undefined,
    //   hasKeySignature: transcriptionData.keySignature !== undefined,
    //   hasKeyModulation: transcriptionData.keyModulation !== undefined,
    //   hasChordCorrections: transcriptionData.chordCorrections !== undefined,
    //   totalInputFields: Object.keys(transcriptionData).length
    // });

    // Create a unique document ID based on the parameters
    const docId = buildTranscriptionDocId(
      transcriptionData.videoId,
      transcriptionData.beatModel,
      transcriptionData.chordModel
    );

    // Document ID created and validated

    // Get the document reference
    // console.log('📂 Creating document reference for collection:', TRANSCRIPTIONS_COLLECTION);
    // console.log('📂 Firebase db instance:', {
    //   dbExists: !!db,
    //   dbType: typeof db,
    //   collectionName: TRANSCRIPTIONS_COLLECTION
    // });

    const docRef = doc(db!, TRANSCRIPTIONS_COLLECTION, docId);

    // Document reference created successfully

    // Prepare data for Firestore
    // console.log('🧹 Starting data sanitization process...');

    // First, let's validate the input arrays
    // console.log('🔍 ARRAY VALIDATION:', {
    //   beatsIsArray: Array.isArray(transcriptionData.beats),
    //   beatsLength: transcriptionData.beats?.length || 0,
    //   chordsIsArray: Array.isArray(transcriptionData.chords),
    //   chordsLength: transcriptionData.chords?.length || 0,
    //   synchronizedChordsIsArray: Array.isArray(transcriptionData.synchronizedChords),
    //   synchronizedChordsLength: transcriptionData.synchronizedChords?.length || 0,
    //   firstBeat: transcriptionData.beats?.[0],
    //   firstChord: transcriptionData.chords?.[0],
    //   firstSyncChord: transcriptionData.synchronizedChords?.[0]
    // });

    const normalizedThumbnail = normalizeThumbnailUrl(
      transcriptionData.videoId,
      transcriptionData.thumbnail,
      'mqdefault'
    );
    const createdAt = Timestamp.now();
    const transcriptionKeySignature = transcriptionData.keySignature ?? transcriptionData.primaryKey ?? null;
    const searchableKeys = buildSearchableKeys(transcriptionKeySignature);

    // Convert any complex objects to a format Firestore can handle
    const sanitizedData = {
      videoId: transcriptionData.videoId,
      title: transcriptionData.title || null, // Include video title for proper display
      channelTitle: transcriptionData.channelTitle || null,
      thumbnail: normalizedThumbnail || null,
      audioUrl:
        typeof transcriptionData.audioUrl === 'string' && transcriptionData.audioUrl.trim().length > 0
          ? transcriptionData.audioUrl
          : null,
      beatModel: transcriptionData.beatModel,
      chordModel: transcriptionData.chordModel,
      beats: transcriptionData.beats.map((beat) => {
        // console.log(`🔍 Processing beat ${index}:`, beat);
        return {
          time: beat.time,
          strength: beat.strength || 0,
          beatNum: toPersistedBeatNum(beat.beatNum)
        };
      }),
      chords: transcriptionData.chords.map((chord) => {
        // console.log(`🔍 Processing chord ${index}:`, chord);
        return {
          chord: chord.chord,
          time:
            typeof chord.time === 'number' && Number.isFinite(chord.time)
              ? chord.time
              : chord.start,
          start: chord.start,
          end: chord.end,
          confidence: chord.confidence
        };
      }),
      downbeats: transcriptionData.downbeats || [],
      downbeats_with_measures: transcriptionData.downbeats_with_measures
        ? transcriptionData.downbeats_with_measures.map((d) => {
            // console.log(`🔍 Processing downbeat with measure ${index}:`, d);
            return {
              time: d.time,
              measureNum: d.measureNum
            };
          })
        : [],
      synchronizedChords: transcriptionData.synchronizedChords.map((sc) => {
        // console.log(`🔍 Processing synchronized chord ${index}:`, sc);
        return {
          chord: sc.chord,
          beatIndex: sc.beatIndex,
          beatNum: toPersistedBeatNum(sc.beatNum),
          source: toPersistedSource((sc as ExtendedSynchronizedChord).source)
        };
      }),
      audioDuration: transcriptionData.audioDuration || 0,
      totalProcessingTime: transcriptionData.totalProcessingTime || 0,
      // Include time signature and BPM fields - handle undefined values
      timeSignature: transcriptionData.timeSignature ?? null,
      bpm: transcriptionData.bpm ?? null,
      // Include beat shift for synchronization (handle undefined)
      beatShift: transcriptionData.beatShift ?? 0,
      // Include key signature fields (handle undefined)
      keySignature: transcriptionData.keySignature ?? null,
      primaryKey: transcriptionKeySignature,
      keyModulation: transcriptionData.keyModulation ?? null,
      modulation: transcriptionData.keyModulation ?? transcriptionData.modulation ?? null,
      chordCorrections: transcriptionData.chordCorrections ?? null,
      corrections: transcriptionData.chordCorrections ?? transcriptionData.corrections ?? null,
      sequenceCorrections: transcriptionData.sequenceCorrections ?? null,
      correctedChords: transcriptionData.correctedChords ?? transcriptionData.sequenceCorrections?.correctedSequence ?? null,
      originalChords: transcriptionData.originalChords ?? transcriptionData.sequenceCorrections?.originalSequence ?? null,
      romanNumerals: transcriptionData.romanNumerals ?? null,
      searchableKeys,
      usageCount:
        typeof transcriptionData.usageCount === 'number' && Number.isFinite(transcriptionData.usageCount) && transcriptionData.usageCount >= 0
          ? transcriptionData.usageCount
          : 0,
      createdAt
    };

    // Final validation before saving
    // const requiredFields = ['videoId', 'beatModel', 'chordModel', 'beats', 'chords', 'synchronizedChords', 'createdAt'];
    // const hasAllRequiredFields = requiredFields.every(field => field in sanitizedData);
    // const missingFields = requiredFields.filter(field => !(field in sanitizedData));

    // console.log('🔍 FINAL VALIDATION BEFORE SAVE:', {
    //   docId,
    //   docIdLength: docId.length,
    //   videoId: sanitizedData.videoId,
    //   videoIdLength: sanitizedData.videoId.length,
    //   videoIdMatches11Chars: sanitizedData.videoId.length === 11,
    //   videoIdRegexMatch: /^[a-zA-Z0-9_-]+$/.test(sanitizedData.videoId),
    //   beatModel: sanitizedData.beatModel,
    //   beatModelLength: sanitizedData.beatModel.length,
    //   chordModel: sanitizedData.chordModel,
    //   chordModelLength: sanitizedData.chordModel.length,
    //   fieldCount: Object.keys(sanitizedData).length,
    //   hasAllRequiredFields,
    //   missingFields,
    //   createdAtType: typeof sanitizedData.createdAt,
    //   createdAtValue: sanitizedData.createdAt,
    //   createdAtIsTimestamp: sanitizedData.createdAt instanceof Timestamp,
    //   // Check if data size is within limits
    //   dataSizeCheck: Object.keys(sanitizedData).length <= 50,
    //   // Validate each required field type
    //   videoIdIsString: typeof sanitizedData.videoId === 'string',
    //   beatModelIsString: typeof sanitizedData.beatModel === 'string',
    //   chordModelIsString: typeof sanitizedData.chordModel === 'string',
    //   beatsIsArray: Array.isArray(sanitizedData.beats),
    //   chordsIsArray: Array.isArray(sanitizedData.chords),
    //   synchronizedChordsIsArray: Array.isArray(sanitizedData.synchronizedChords)
    // });

    const variantsQuery = query(
      collection(db!, TRANSCRIPTIONS_COLLECTION),
      where('videoId', '==', transcriptionData.videoId)
    );
    const variantsSnapshot = await getDocs(variantsQuery);
    const siblingDocs = variantsSnapshot.docs.filter((variantDoc) => variantDoc.id !== docId);
    const assignments = buildHomepageVariantAssignments([
      ...siblingDocs.map((variantDoc) => {
        const data = variantDoc.data() as Partial<TranscriptionData>;
        return {
          docId: variantDoc.id,
          beatModel: data.beatModel,
          chordModel: data.chordModel,
          createdAt: data.createdAt,
          keySignature: data.keySignature,
          primaryKey: data.primaryKey,
        };
      }),
      {
        docId,
        beatModel: transcriptionData.beatModel,
        chordModel: transcriptionData.chordModel,
        createdAt,
        keySignature: transcriptionData.keySignature,
        primaryKey: transcriptionKeySignature,
      },
    ]);
    const assignmentLookup = new Map(
      assignments.map((assignment) => [assignment.docId, assignment])
    );
    const currentAssignment = assignmentLookup.get(docId);

    const batch = writeBatch(db!);

    siblingDocs.forEach((variantDoc) => {
      const assignment = assignmentLookup.get(variantDoc.id);
      if (!assignment) return;

      batch.set(
        variantDoc.ref,
        {
          isPrimaryVariant: assignment.isPrimaryVariant,
          displayPriority: assignment.displayPriority,
          searchableKeys: assignment.searchableKeys,
        },
        { merge: true }
      );
      transcriptionCache.invalidate(variantDoc.id);
    });

    batch.set(docRef, {
      ...sanitizedData,
      isPrimaryVariant: currentAssignment?.isPrimaryVariant ?? true,
      displayPriority: currentAssignment?.displayPriority ?? 1,
      searchableKeys: currentAssignment?.searchableKeys ?? searchableKeys,
    });

    await batch.commit();
    transcriptionCache.set(
      docId,
      normalizeTranscriptionData({
        ...(sanitizedData as unknown as TranscriptionData),
        isPrimaryVariant: currentAssignment?.isPrimaryVariant ?? true,
        displayPriority: currentAssignment?.displayPriority ?? 1,
        searchableKeys: currentAssignment?.searchableKeys ?? searchableKeys,
      }) as unknown as Record<string, unknown>,
      true
    );

    return true;
  } catch (error) {
    // Enhanced error logging for debugging
    console.error('❌ FIRESTORE SAVE ERROR - COMPREHENSIVE DEBUGGING:', error);

    if (error instanceof Error) {
      console.error('🔍 ERROR ANALYSIS:', {
        errorType: error.constructor.name,
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 1000),
        isPermissionError: error.message.includes('Missing or insufficient permissions'),
        isNetworkError: error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'),
        isValidationError: error.message.includes('Invalid document'),
        isQuotaError: error.message.includes('quota'),
        isAuthError: error.message.includes('auth') || error.message.includes('authentication'),
        errorCode: (error as { code?: string }).code || 'unknown',
        errorDetails: (error as { details?: string }).details || 'none'
      });

      // Check for specific Firebase errors with detailed analysis
      if (error.message.includes('Missing or insufficient permissions')) {
        console.error('🔒 PERMISSION ERROR ANALYSIS:');
        console.error('- This suggests the data structure does not match security rules');
        console.error('- Current security rules are simplified for debugging');
        console.error('- Required fields: videoId, beatModel, chordModel, beats, chords, synchronizedChords, createdAt');
        console.error('- Field size limit: 50 fields');
        console.error('- Check if videoId matches 11-character YouTube format');
        console.error('- Check if all required fields are present and correct types');
      } else if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('🌐 NETWORK ERROR ANALYSIS:');
        console.warn('- Network/CORS error accessing Firestore');
        console.warn('- This might be a temporary connectivity issue');
        console.warn('- Disabling Firestore for this session');
        firestoreDisabled = true;
      } else if (error.message.includes('Invalid document')) {
        console.error('📄 DOCUMENT VALIDATION ERROR:');
        console.error('- The document structure is invalid');
        console.error('- Check for unsupported data types or circular references');
        console.error('- Firestore supports: string, number, boolean, null, array, map, timestamp, geopoint, reference');
      } else if (error.message.includes('quota')) {
        console.error('💰 QUOTA ERROR:');
        console.error('- Firestore quota exceeded');
        console.error('- This might be a temporary limit issue');
      } else if (error.message.includes('auth') || error.message.includes('authentication')) {
        console.error('🔐 AUTHENTICATION ERROR:');
        console.error('- User authentication issue');
        console.error('- Check if anonymous auth is properly configured');
      } else {
        console.error('❓ UNKNOWN ERROR TYPE:');
        console.error('- This is an unexpected error');
        console.error('- Full error object:', error);
      }
    } else {
      console.error('❓ NON-ERROR OBJECT THROWN:', {
        type: typeof error,
        value: error,
        stringified: String(error)
      });
    }
    return false;
  }
}

/**
 * Get all transcriptions for a specific video
 * @param videoId YouTube video ID
 * @returns Array of transcription data
 */
export async function getVideoTranscriptions(
  videoId: string
): Promise<TranscriptionData[]> {
  // Check if Firebase is initialized
  if (!db) {
    console.warn('Firebase not initialized, skipping video transcriptions retrieval');
    return [];
  }

  try {
    // console.log(`Getting all transcriptions for video: ${videoId}`);

    // Create a query to get all transcriptions for the video
    const q = query(
      collection(db, TRANSCRIPTIONS_COLLECTION),
      where('videoId', '==', videoId)
    );

    // Get the documents
    const querySnapshot = await getDocs(q);

    // Convert the documents to TranscriptionData objects
    const transcriptions: TranscriptionData[] = [];
    querySnapshot.forEach((docSnap) => {
      transcriptions.push(docSnap.data() as TranscriptionData);
    });

    // console.log(`Found ${transcriptions.length} transcriptions for video ${videoId}`);
    return transcriptions;
  } catch (error) {
    console.error('Error getting video transcriptions from Firestore:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      // Check for CORS or network errors and handle gracefully
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        console.warn('Network/CORS error accessing Firestore - continuing without cache');
      }
    }
    return [];
  }
}
