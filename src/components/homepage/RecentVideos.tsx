'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { db } from '@/config/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, where, DocumentSnapshot, DocumentData, QuerySnapshot, QueryConstraint } from 'firebase/firestore';
import { Card, CardBody, Button, Chip, Select, SelectItem, Skeleton } from '@heroui/react';
import { useIsVisible } from '@/hooks/scroll/useIntersectionObserver';
import { buildAnalyzePageUrl } from '@/utils/analyzeRouteUtils';
import { buildSearchableKeys } from '@/utils/keySignatureUtils';
import { normalizeThumbnailUrl } from '@/utils/youtubeMetadata';

interface TranscribedVideo {
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

const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
const PAGE_SIZE = 12;
const LEGACY_QUERY_FETCH_LIMIT = PAGE_SIZE * 2;
const MAX_SCAN_PAGES = 4;
const ALL_KEYS_VALUE = 'all';
const KEY_OPTIONS = [
  { value: ALL_KEYS_VALUE, label: 'All Keys' },
  { value: 'C major', label: 'C Major' },
  { value: 'C minor', label: 'C Minor' },
  { value: 'C# major', label: 'C# / D♭ Major' },
  { value: 'C# minor', label: 'D♭ / C# Minor' },
  { value: 'D major', label: 'D Major' },
  { value: 'D minor', label: 'D Minor' },
  { value: 'E♭ major', label: 'D# / E♭ Major' },
  { value: 'E♭ minor', label: 'E♭ Minor' },
  { value: 'E major', label: 'E Major' },
  { value: 'E minor', label: 'E Minor' },
  { value: 'F major', label: 'F Major' },
  { value: 'F minor', label: 'F Minor' },
  { value: 'F# major', label: 'F# / G♭ Major' },
  { value: 'F# minor', label: 'G♭ / F# Minor' },
  { value: 'G major', label: 'G Major' },
  { value: 'G minor', label: 'G Minor' },
  { value: 'A♭ major', label: 'A♭ Major' },
  { value: 'A♭ minor', label: 'G# / A♭ Minor' },
  { value: 'A major', label: 'A Major' },
  { value: 'A minor', label: 'A Minor' },
  { value: 'B♭ major', label: 'B♭ Major' },
  { value: 'B♭ minor', label: 'A# / B♭ Minor' },
  { value: 'B major', label: 'B Major' },
  { value: 'B minor', label: 'B Minor' },
];
type QueryMode = 'primary' | 'legacy';
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

export default function RecentVideos() {
  const [videos, setVideos] = useState<TranscribedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true); // State to track if more videos can be loaded
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedKey, setSelectedKey] = useState(ALL_KEYS_VALUE);
  const [queryMode, setQueryMode] = useState<QueryMode | null>(null);

  // PERFORMANCE FIX #5: Lazy load using Intersection Observer
  const [containerRef, isVisible] = useIsVisible<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: '100px', // Start loading 100px before component enters viewport
    freezeOnceVisible: true // Only load once
  });

  const fetchVideos = useCallback(async (isLoadMore = false, skipCache = false) => {
    if (!isLoadMore && !skipCache) {
      try {
        const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
        const cacheKey = `recent-videos-${PAGE_SIZE}-${selectedKey}`;
        const cachedData = recentVideosCache.peek(cacheKey);

        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          setVideos(cachedData as unknown as TranscribedVideo[]);
          setLoading(false);
          setHasMore(cachedData.length >= PAGE_SIZE);
          // Background revalidate
          setTimeout(() => { void fetchVideos(false, true); }, 0);
          return;
        }
      } catch (cacheError) {
        console.warn('Cache check failed, proceeding with Firebase query:', cacheError);
      }
    }

    // CRITICAL FIX: Ensure Firebase is initialized before fetching
    // Race condition: Component mounts before setTimeout(0) in firebase.ts completes
    // This ensures db is initialized before attempting to fetch data
    let firestoreDb = db;
    if (!firestoreDb) {
      try {
        const { ensureFirebaseInitialized } = await import('@/config/firebase');
        const { db: initializedDb } = await ensureFirebaseInitialized();
        firestoreDb = initializedDb;
      } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        setError('Firebase not initialized');
        setLoading(false);
        return;
      }
    }

    if (!firestoreDb) {
      setError('Firebase not initialized');
      setLoading(false);
      return;
    }

    // Prevent fetching more if we know there are no more documents
    if (isLoadMore && !hasMore) {
        setLoadingMore(false);
        return;
    }

    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true); // Only set main loading state for initial fetch
      }

      const transcriptionsRef = collection(firestoreDb, TRANSCRIPTIONS_COLLECTION);
      const existingVideoIds = new Set(isLoadMore ? videos.map(v => v.videoId) : []);
      const selectedKeyVariants = selectedKey === ALL_KEYS_VALUE
        ? []
        : buildSearchableKeys(selectedKey);

      const mapSnapshotDocToVideo = (docData: FirestoreTranscriptionDoc): TranscribedVideo | null => {
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
      };

      const matchesSelectedKey = (docData: FirestoreTranscriptionDoc) => {
        if (selectedKeyVariants.length === 0) return true;
        const docKeys = Array.isArray(docData.searchableKeys) && docData.searchableKeys.length > 0
          ? docData.searchableKeys
          : buildSearchableKeys(docData.keySignature || docData.primaryKey);
        return docKeys.some((docKey) => selectedKeyVariants.includes(docKey));
      };

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

        constraints.push(limit(PAGE_SIZE));

        const snapshot = await getDocs(query(transcriptionsRef, ...constraints));
        const pageVideos = snapshot.docs
          .map((docSnapshot) => mapSnapshotDocToVideo(docSnapshot.data() as FirestoreTranscriptionDoc))
          .filter((video): video is TranscribedVideo => Boolean(video));

        return {
          videos: pageVideos,
          lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
          hasMore: snapshot.size === PAGE_SIZE && snapshot.docs.length === PAGE_SIZE,
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
            if (!matchesSelectedKey(docData)) return;

            const video = mapSnapshotDocToVideo(docData);
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

          if (videoMap.size >= PAGE_SIZE || fetchedDocCount < LEGACY_QUERY_FETCH_LIMIT) {
            break;
          }
        }

        return {
          videos: Array.from(videoMap.values()).slice(0, PAGE_SIZE),
          lastVisible: lastVisibleLocal,
          hasMore: fetchedDocCount === LEGACY_QUERY_FETCH_LIMIT && !!lastVisibleLocal,
        };
      };

      let transcribedVideos: TranscribedVideo[] = [];
      let lastVisibleLocal: DocumentSnapshot | null = null;
      let nextHasMore = false;

      const preferredMode: QueryMode = isLoadMore ? (queryMode ?? 'primary') : 'primary';

      if (preferredMode === 'primary') {
        try {
          const primaryResult = await fetchPrimaryPage(isLoadMore ? lastDoc : null);
          transcribedVideos = primaryResult.videos;
          lastVisibleLocal = primaryResult.lastVisible;
          nextHasMore = primaryResult.hasMore;
          setQueryMode('primary');

          if (!isLoadMore && transcribedVideos.length === 0) {
            const legacyResult = await fetchLegacyPage(null);
            transcribedVideos = legacyResult.videos;
            lastVisibleLocal = legacyResult.lastVisible;
            nextHasMore = legacyResult.hasMore;
            setQueryMode('legacy');
          }
        } catch (primaryError) {
          console.warn('Primary recent videos query failed, using legacy fallback:', primaryError);
          const legacyResult = await fetchLegacyPage(isLoadMore ? lastDoc : null);
          transcribedVideos = legacyResult.videos;
          lastVisibleLocal = legacyResult.lastVisible;
          nextHasMore = legacyResult.hasMore;
          setQueryMode('legacy');
        }
      } else {
        const legacyResult = await fetchLegacyPage(isLoadMore ? lastDoc : null);
        transcribedVideos = legacyResult.videos;
        lastVisibleLocal = legacyResult.lastVisible;
        nextHasMore = legacyResult.hasMore;
      }

      if (isLoadMore) {
        setVideos(prev => [...prev, ...transcribedVideos]);
      } else {
        setVideos(transcribedVideos);
        setLoading(false);
        try {
          const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
          const cacheKey = `recent-videos-${PAGE_SIZE}-${selectedKey}`;
          recentVideosCache.set(cacheKey, transcribedVideos as unknown as Record<string, unknown>[], true);
        } catch (cacheError) {
          console.warn('Failed to cache recent videos:', cacheError);
        }
      }

      setLastDoc(lastVisibleLocal || null);
      setHasMore(nextHasMore);

    } catch (err) {
      console.error('Error fetching transcribed videos:', err);
      setError('Failed to load transcribed videos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [hasMore, lastDoc, queryMode, selectedKey, videos]);

  const handleShowMore = () => setIsExpanded(true);
  const handleShowLess = () => setIsExpanded(false);

  // PERFORMANCE FIX #5: Only fetch when component is visible (Intersection Observer)
  const hasLoadedRef = useRef(false);
  const previousFilterRef = useRef(selectedKey);
  useEffect(() => {
    if (!isVisible) return;

    const filterChanged = previousFilterRef.current !== selectedKey;
    if (!hasLoadedRef.current || filterChanged) {
      hasLoadedRef.current = true;
      previousFilterRef.current = selectedKey;
      setVideos([]);
      setLastDoc(null);
      setHasMore(true);
      setQueryMode(null);
      setError(null);
      setIsExpanded(false);
      void fetchVideos(false);
    }
  }, [fetchVideos, isVisible, selectedKey]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatBPM = (bpm?: number) => {
    if (!bpm) return '';
    return `${Math.round(bpm)} BPM`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeSignature = (timeSignature?: number) => {
    if (!timeSignature) return '';
    return `${timeSignature}/4`;
  };

  const formatUsageCount = (usageCount?: number) => {
    const normalizedUsageCount =
      typeof usageCount === 'number' && Number.isFinite(usageCount) && usageCount >= 0
        ? usageCount
        : 0;

    return `${normalizedUsageCount} use${normalizedUsageCount === 1 ? '' : 's'}`;
  };

  const selectedKeyLabel = KEY_OPTIONS.find((option) => option.value === selectedKey)?.label ?? selectedKey;

  const renderHeader = (status: React.ReactNode) => (
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recently Transcribed Songs</h3>
          {status}
        </div>
        <div className="flex items-center gap-2 md:min-w-[250px]">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Key
          </span>
          <Select
            aria-label="Filter recent analyses by key"
            selectedKeys={[selectedKey]}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const nextValue = Array.from(keys)[0];
              if (typeof nextValue === 'string') {
                setSelectedKey(nextValue);
              }
            }}
            className="w-full"
            size="sm"
            variant="bordered"
            color="default"
            disallowEmptySelection
          >
            {KEY_OPTIONS.map((option) => (
              <SelectItem key={option.value} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
  );

  if (loading) {
    return (
      <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
        {renderHeader(<Chip size="sm" variant="flat" color="default">Loading...</Chip>)}
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(PAGE_SIZE)].map((_, index) => (
              <Card key={index} className="w-full bg-content1 dark:bg-white/[0.06] border border-divider dark:border-white/10">
                <CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || videos.length === 0) {
    return (
      <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
        {renderHeader(
          <Chip size="sm" variant="flat" color={error ? "danger" : "default"}>
            {error ? "Error" : "Empty"}
          </Chip>
        )}
        <div className="h-48 flex items-center justify-center">
          <div className="text-center">
            <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
              {error ? 'Failed to load transcribed videos' : 'No recent transcriptions found'}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {error
                ? 'Please retry or check your connection.'
                : selectedKey === ALL_KEYS_VALUE
                  ? 'New analyses will appear here as they are created.'
                  : `No recent analyses matched ${selectedKeyLabel}.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
      {renderHeader(
        <Chip size="sm" variant="flat" color="default" className="text-foreground dark:text-white">
          {videos.length} song{videos.length !== 1 ? 's' : ''}
        </Chip>
      )}

      {/* Song cards grid - no outer container box */}
      <div className={`${isExpanded ? 'max-h-[672px]' : 'max-h-96'} overflow-y-auto scrollbar-thin transition-all duration-300 ease-in-out`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <Card
              key={video.videoId}
              as={Link}
              href={buildAnalyzePageUrl(video.videoId, {
                title: video.title && video.title !== `Video ${video.videoId}` ? video.title : null,
                channel: video.channelTitle || null,
                thumbnail: video.thumbnailUrl || null,
                beatModel: (video.beatModel as 'madmom' | 'beat-transformer' | null) || null,
                chordModel: (video.chordModel as 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl' | null) || null,
              })}
              isPressable
              className="group hover:scale-[1.02] transition-all duration-200 bg-content1 dark:bg-white/[0.06] border border-divider dark:border-white/10 hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-lg"
            >
              <CardBody className="p-3">
                <div className="flex gap-3">
                  <div className="relative w-20 h-12 bg-gray-100 dark:bg-gray-600 rounded-md overflow-hidden flex-shrink-0 shadow-sm transition-all duration-300 border border-gray-200 dark:border-gray-500">
                    {/* Intentionally use direct YouTube thumbnails to avoid Vercel image-optimization quota usage. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnailUrl || '/hero-image-placeholder.svg'}
                      alt={video.title || 'Video thumbnail'}
                      width={80}
                      height={48}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.src = '/hero-image-placeholder.svg'; }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200"></div>
                    {video.duration && <div className="absolute bottom-0.5 right-0.5 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">{formatDuration(video.duration)}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">{video.title}</h4>
                    {video.channelTitle && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-1 truncate">
                        {video.channelTitle}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                      <div className="flex items-center justify-between"><span>{formatDate(video.processedAt)}</span>{video.bpm && (<span className="text-blue-600 dark:text-blue-400 font-medium">{formatBPM(video.bpm)}</span>)}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{formatUsageCount(video.usageCount)}</span>
                        {video.timeSignature && (<span className="text-green-600 dark:text-green-400">{formatTimeSignature(video.timeSignature)}</span>)}
                        {video.keySignature && (<span className="text-purple-600 dark:text-purple-400 font-medium truncate">{video.keySignature}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* "Load More" button and loading indicator */}
        <div className="flex justify-center mt-6">
          {hasMore && !loadingMore && (
            <Button onPress={() => fetchVideos(true)} color="primary" variant="flat">Load More</Button>
          )}
          {loadingMore && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
              {[...Array(2)].map((_, index) => (
                <Card key={`loading-${index}`} className="w-full bg-content1 dark:bg-white/[0.06] border border-divider dark:border-white/10"><CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody></Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Show More / Show Less Button */}
      <div className="mt-4">
        <Button onPress={isExpanded ? handleShowLess : handleShowMore} color="default" variant="bordered" size="md" className="w-full">
          {isExpanded ? "Show Less" : "Show More"}
        </Button>
      </div>
    </div>
  );
}
