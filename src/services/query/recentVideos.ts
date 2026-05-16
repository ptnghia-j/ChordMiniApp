import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  startAfter,
  where,
  DocumentSnapshot,
  DocumentData,
  QuerySnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { db, ensureFirebaseInitialized } from '@/config/firebase';
import { buildSearchableKeys } from '@/utils/keySignatureUtils';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';

export interface TranscribedVideo {
  videoId: string;
  title?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  processedAt: number;
  duration?: number;
  beatModel?: string;
  chordModel?: string;
  bpm?: number;
  timeSignature?: number;
  keySignature?: string;
  usageCount?: number;
}

export type RecentVideosQueryMode = 'primary' | 'legacy';

export interface RecentVideosPageParam {
  cursor: DocumentSnapshot | null;
  mode: RecentVideosQueryMode | null;
  existingVideoIds: string[];
}

export interface RecentVideosPage {
  videos: TranscribedVideo[];
  lastVisible: DocumentSnapshot | null;
  hasMore: boolean;
  queryMode: RecentVideosQueryMode;
}

type FirestoreTranscriptionDoc = {
  videoId?: string;
  beats?: unknown[];
  chords?: unknown[];
  createdAt?: { toMillis?: () => number; seconds?: number };
  audioDuration?: number;
  beatModel?: string;
  chordModel?: string;
  bpm?: number;
  timeSignature?: number;
  keySignature?: string;
  primaryKey?: string;
  title?: string;
  channelTitle?: string;
  thumbnail?: string;
  searchableKeys?: string[];
  isPrimaryVariant?: boolean;
  usageCount?: number;
};

const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
export const RECENT_VIDEOS_PAGE_SIZE = 12;
const LEGACY_QUERY_FETCH_LIMIT = RECENT_VIDEOS_PAGE_SIZE * 2;
const MAX_SCAN_PAGES = 4;
export const ALL_KEYS_VALUE = 'all';

export const createInitialRecentVideosPageParam = (): RecentVideosPageParam => ({
  cursor: null,
  mode: null,
  existingVideoIds: [],
});

export function mapTranscriptionDocToRecentVideo(
  docData: FirestoreTranscriptionDoc,
  existingVideoIds: Set<string> = new Set(),
): TranscribedVideo | null {
  if (
    !docData.videoId ||
    existingVideoIds.has(docData.videoId) ||
    (docData.beats?.length ?? 0) === 0 ||
    (docData.chords?.length ?? 0) === 0
  ) {
    return null;
  }

  return {
    videoId: docData.videoId,
    title: docData.title || `Video ${docData.videoId}`,
    channelTitle: docData.channelTitle || undefined,
    thumbnailUrl: normalizeThumbnailUrl(docData.videoId, docData.thumbnail, 'mqdefault'),
    processedAt: docData.createdAt?.toMillis?.() || (docData.createdAt?.seconds ? docData.createdAt.seconds * 1000 : Date.now()),
    duration: docData.audioDuration,
    beatModel: docData.beatModel,
    chordModel: docData.chordModel,
    bpm: docData.bpm,
    timeSignature: docData.timeSignature || 4,
    keySignature: docData.keySignature || docData.primaryKey,
    usageCount: docData.usageCount,
  };
}

export function transcriptionMatchesSelectedKey(
  docData: FirestoreTranscriptionDoc,
  selectedKey: string,
): boolean {
  if (selectedKey === ALL_KEYS_VALUE) return true;

  const selectedKeyVariants = buildSearchableKeys(selectedKey);
  const docKeys = Array.isArray(docData.searchableKeys) && docData.searchableKeys.length > 0
    ? docData.searchableKeys
    : buildSearchableKeys(docData.keySignature || docData.primaryKey);

  return docKeys.some((docKey) => selectedKeyVariants.includes(docKey));
}

async function getFirestoreDb() {
  if (db) {
    return db;
  }

  const { db: initializedDb } = await ensureFirebaseInitialized();
  if (!initializedDb) {
    throw new Error('Firebase not initialized');
  }

  return initializedDb;
}

export async function fetchRecentVideosPage({
  selectedKey,
  pageParam,
  pageSize = RECENT_VIDEOS_PAGE_SIZE,
}: {
  selectedKey: string;
  pageParam: RecentVideosPageParam;
  pageSize?: number;
}): Promise<RecentVideosPage> {
  const firestoreDb = await getFirestoreDb();
  const transcriptionsRef = collection(firestoreDb, TRANSCRIPTIONS_COLLECTION);
  const existingVideoIds = new Set(pageParam.existingVideoIds);
  const selectedKeyVariants = selectedKey === ALL_KEYS_VALUE
    ? []
    : buildSearchableKeys(selectedKey);

  const fetchPrimaryPage = async (cursor: DocumentSnapshot | null) => {
    const constraints: QueryConstraint[] = [
      where('isPrimaryVariant', '==', true),
    ];

    if (selectedKeyVariants.length > 0) {
      constraints.push(where('searchableKeys', 'array-contains-any', selectedKeyVariants));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    if (cursor) {
      constraints.push(startAfter(cursor));
    }

    constraints.push(limit(pageSize));

    const snapshot = await getDocs(query(transcriptionsRef, ...constraints));
    const pageVideos = snapshot.docs
      .map((docSnapshot) => mapTranscriptionDocToRecentVideo(
        docSnapshot.data() as FirestoreTranscriptionDoc,
        existingVideoIds,
      ))
      .filter((video): video is TranscribedVideo => Boolean(video));

    return {
      videos: pageVideos,
      lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.size === pageSize && snapshot.docs.length === pageSize,
    };
  };

  const fetchLegacyPage = async (cursor: DocumentSnapshot | null) => {
    const videoMap = new Map<string, TranscribedVideo>();
    let lastVisibleLocal: DocumentSnapshot | null = null;
    let fetchedDocCount = 0;
    let scanCursor = cursor;

    const addFromSnapshot = (snap: QuerySnapshot<DocumentData>) => {
      snap.forEach((docSnapshot) => {
        const docData = docSnapshot.data() as FirestoreTranscriptionDoc;
        if (!transcriptionMatchesSelectedKey(docData, selectedKey)) return;

        const video = mapTranscriptionDocToRecentVideo(docData, existingVideoIds);
        if (!video || videoMap.has(video.videoId)) return;
        videoMap.set(video.videoId, video);
      });
    };

    for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
      const snapshot = scanCursor
        ? await getDocs(query(transcriptionsRef, orderBy('createdAt', 'desc'), startAfter(scanCursor), limit(LEGACY_QUERY_FETCH_LIMIT)))
        : await getDocs(query(transcriptionsRef, orderBy('createdAt', 'desc'), limit(LEGACY_QUERY_FETCH_LIMIT)));

      addFromSnapshot(snapshot);
      fetchedDocCount = snapshot.size;
      lastVisibleLocal = snapshot.docs[snapshot.docs.length - 1] || null;
      scanCursor = lastVisibleLocal;

      if (videoMap.size >= pageSize || fetchedDocCount < LEGACY_QUERY_FETCH_LIMIT) {
        break;
      }
    }

    return {
      videos: Array.from(videoMap.values()).slice(0, pageSize),
      lastVisible: lastVisibleLocal,
      hasMore: fetchedDocCount === LEGACY_QUERY_FETCH_LIMIT && !!lastVisibleLocal,
    };
  };

  const preferredMode = pageParam.mode ?? 'primary';

  if (preferredMode === 'primary') {
    try {
      const primaryResult = await fetchPrimaryPage(pageParam.cursor);
      if (!pageParam.cursor && primaryResult.videos.length === 0) {
        const legacyResult = await fetchLegacyPage(null);
        return { ...legacyResult, queryMode: 'legacy' };
      }

      return { ...primaryResult, queryMode: 'primary' };
    } catch (primaryError) {
      console.warn('Primary recent videos query failed, using legacy fallback:', primaryError);
      const legacyResult = await fetchLegacyPage(pageParam.cursor);
      return { ...legacyResult, queryMode: 'legacy' };
    }
  }

  const legacyResult = await fetchLegacyPage(pageParam.cursor);
  return { ...legacyResult, queryMode: 'legacy' };
}
