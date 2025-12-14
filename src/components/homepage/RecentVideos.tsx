'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/config/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, DocumentSnapshot, DocumentData, QuerySnapshot, doc, getDoc, where, documentId } from 'firebase/firestore';
import { FiMusic, FiCloud, FiClock } from 'react-icons/fi';
import { Card, CardBody, Button, Chip, Skeleton } from '@heroui/react';
import { useIsVisible } from '@/hooks/scroll/useIntersectionObserver';

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
  // Audio file metadata
  audioFilename?: string;
  audioUrl?: string;
  isStreamUrl?: boolean;
  fromCache?: boolean;
}

const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
const AUDIO_FILES_COLLECTION = 'audioFiles';
// Quick Win constants for improved UX and batching
const TARGET_UNIQUE = 12;      // ensure 12 unique items on first load
const PAGE_SIZE = 20;          // fetch larger pages internally
const MAX_PAGES = 3;           // cap to avoid excessive reads

const INITIAL_LOAD_COUNT = 12; // show 12 on first paint
const LOAD_MORE_COUNT = 6;     // keep load-more size unchanged for now


interface AudioFileMetadata {
  audioFilename: string;
  audioUrl: string;
  isStreamUrl: boolean;
  fromCache: boolean;
  fileSize: number;
  streamExpiresAt?: number;
  title?: string;
  channelTitle?: string;
}

// Helper: enrich a transcribed video with audio file metadata (pure, top-level)
function enrichVideoWithAudioMetadata(
  video: TranscribedVideo,
  audioFilesMap: Map<string, AudioFileMetadata>
): TranscribedVideo {
  const audio = audioFilesMap.get(video.videoId);
  return audio
    ? {
        ...video,
        audioFilename: audio.audioFilename,
        audioUrl: audio.audioUrl,
        isStreamUrl: audio.isStreamUrl,
        fromCache: audio.fromCache,
        title:
          audio.title && video.title === `Video ${video.videoId}`
            ? audio.title
            : video.title,
        channelTitle: audio.channelTitle || video.channelTitle,
      }
    : video;
}


export default function RecentVideos() {
  const [videos, setVideos] = useState<TranscribedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true); // State to track if more videos can be loaded
  const [isExpanded, setIsExpanded] = useState(false);

  // PERFORMANCE FIX #5: Lazy load using Intersection Observer
  const [containerRef, isVisible] = useIsVisible<HTMLDivElement>({
    threshold: 0.1,
    rootMargin: '100px', // Start loading 100px before component enters viewport
    freezeOnceVisible: true // Only load once
  });

const fetchAudioFiles = useCallback(async (videoIds: string[]) => {
    // Ensure Firebase is initialized
    let firestoreDb = db;
    if (!firestoreDb) {
      try {
        const { ensureFirebaseInitialized } = await import('@/config/firebase');
        const { db: initializedDb } = await ensureFirebaseInitialized();
        firestoreDb = initializedDb;
      } catch (error) {
        console.error('❌ Firebase initialization failed in fetchAudioFiles:', error);
        return new Map<string, AudioFileMetadata>();
      }
    }

    if (!firestoreDb || videoIds.length === 0) {

      return new Map<string, AudioFileMetadata>();
    }

    const { audioMetadataCache } = await import('@/services/cache/smartFirebaseCache');

    // Batched prefetch using Firestore `in` queries (chunks of 10)
    const chunk = (arr: string[], size: number) => {
      const out: string[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const mapFirestoreToMeta = (audioData: {
      extractionService?: string;
      audioUrl?: string;
      isStreamUrl?: boolean;
      fileSize?: number;
      streamExpiresAt?: number;
      title?: string;
      channelTitle?: string;
    }): AudioFileMetadata => ({
      audioFilename: audioData?.extractionService || 'cached-audio',
      audioUrl: audioData?.audioUrl || '',
      isStreamUrl: !!audioData?.isStreamUrl,
      fromCache: true,
      fileSize: audioData?.fileSize || 0,
      streamExpiresAt: audioData?.streamExpiresAt,
      title: audioData?.title,
      channelTitle: audioData?.channelTitle
    });

    const prefetchMap = new Map<string, AudioFileMetadata | null>();
    let prefetchDone = false;

    const batchedPrefetch = async () => {
      if (prefetchDone || !firestoreDb) return;
      prefetchDone = true;
      try {
        const audioCol = collection(firestoreDb, AUDIO_FILES_COLLECTION);
        const batches = chunk(videoIds, 10);
        const qsPromises = batches.map(ids => getDocs(query(audioCol, where(documentId(), 'in', ids))));
        const snapshots = await Promise.all(qsPromises);
        snapshots.forEach((snap) => {
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            prefetchMap.set(docSnap.id, data ? mapFirestoreToMeta(data) : null);
          });
        });
        // Mark missing ids as null to avoid fallback
        for (const id of videoIds) {
          if (!prefetchMap.has(id)) prefetchMap.set(id, null);
        }
      } catch (e) {
        console.warn('Batch audio prefetch failed, will fallback to per-doc fetch:', e);
      }
    };

    const audioFilesMap = await audioMetadataCache.getBatch(
      videoIds,
      async (videoId: string) => {
        try {
          if (!firestoreDb) return null;
          if (!prefetchDone) await batchedPrefetch();
          if (prefetchMap.has(videoId)) {
            return prefetchMap.get(videoId) as unknown as Record<string, unknown> | null;
          }
          // Fallback to per-doc get if not found via prefetch
          const audioDocRef = doc(firestoreDb, AUDIO_FILES_COLLECTION, videoId);
          const audioDocSnap = await getDoc(audioDocRef);
          if (audioDocSnap.exists()) {
            return mapFirestoreToMeta(audioDocSnap.data()) as unknown as Record<string, unknown>;
          }
          return null;
        } catch {
          return null;
        }
      },
      (data: Record<string, unknown>) => !!(data.audioUrl && (data.audioFilename || data.title))
    );

    const resultMap = new Map<string, AudioFileMetadata>();
    for (const [videoId, data] of audioFilesMap.entries()) {
      if (data && typeof data === 'object') {
        resultMap.set(videoId, data as unknown as AudioFileMetadata);
      }
    }

    return resultMap;
  }, []);

  const fetchVideos = useCallback(async (isLoadMore = false, skipCache = false) => {
    // PERFORMANCE: Check cache first for initial load, then SWR-style background revalidate
    if (!isLoadMore && !skipCache) {
      try {
        const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
        const cacheKey = `recent-videos-${INITIAL_LOAD_COUNT}`;

        const cachedData = await recentVideosCache.get(
          cacheKey,
          async () => null, // Don't fetch yet, just check cache
          () => true
        );

        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          console.log('✅ Using cached recent videos data (SWR)');
          setVideos(cachedData as unknown as TranscribedVideo[]);
          setLoading(false);
          setHasMore(cachedData.length >= INITIAL_LOAD_COUNT);
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
        console.log('✅ Firebase initialized for RecentVideos');
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

      // Containers shared by both initial load and load-more paths
      const videoMap = new Map<string, TranscribedVideo>();
      const videoIds: string[] = [];
      const existingVideoIds = new Set(isLoadMore ? videos.map(v => v.videoId) : []);

      const addFromSnapshot = (snap: QuerySnapshot<DocumentData>) => {
        snap.forEach((d) => {
          const data = d.data() as {
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
            title?: string;
          };
          if (data.videoId && (data.beats?.length ?? 0) > 0 && (data.chords?.length ?? 0) > 0) {
            if (existingVideoIds.has(data.videoId) || videoMap.has(data.videoId)) return;
            const processedAt = data.createdAt?.toMillis?.() || (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : Date.now());
            videoIds.push(data.videoId);
            videoMap.set(data.videoId, {
              videoId: data.videoId,
              title: data.title || `Video ${data.videoId}`,
              thumbnailUrl: `https://i.ytimg.com/vi/${data.videoId}/mqdefault.jpg`,
              processedAt,
              duration: data.audioDuration,
              beatModel: data.beatModel,
              chordModel: data.chordModel,
              bpm: data.bpm,
              timeSignature: data.timeSignature || 4,
              keySignature: data.keySignature,
              audioFilename: undefined,
              audioUrl: undefined,
              isStreamUrl: false,
              fromCache: false
            });
          }
        });
      };

      let lastVisibleLocal: DocumentSnapshot | null = null;

      if (isLoadMore) {
        // Keep existing load-more behavior (6 unique items)
        const q = lastDoc
          ? query(transcriptionsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(LOAD_MORE_COUNT))
          : query(transcriptionsRef, orderBy('createdAt', 'desc'), limit(LOAD_MORE_COUNT));
        const qs = await getDocs(q);
        addFromSnapshot(qs);
        lastVisibleLocal = qs.docs[qs.docs.length - 1] || null;
      } else {
        // Multi-page accumulation to ensure 12 unique items on first load
        let page = 0;
        let cursor: DocumentSnapshot | null = null;
        while (videoMap.size < TARGET_UNIQUE && page < MAX_PAGES) {
          let qs: QuerySnapshot<DocumentData>;
          if (cursor) {
            const q1 = query(transcriptionsRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE));
            qs = await getDocs(q1);
          } else {
            const q2 = query(transcriptionsRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            qs = await getDocs(q2);
          }
          addFromSnapshot(qs);
          lastVisibleLocal = qs.docs[qs.docs.length - 1] || null;
          if (!lastVisibleLocal || qs.empty) break;
          cursor = lastVisibleLocal;
          page++;
        }
      }

      // Compute initial list and render immediately (audio metadata enrichment happens in background)
      const transcribedVideos = Array.from(videoMap.values())
        .slice(0, isLoadMore ? LOAD_MORE_COUNT : INITIAL_LOAD_COUNT);

      if (isLoadMore) {
        setVideos(prev => [...prev, ...transcribedVideos]);
      } else {
        setVideos(transcribedVideos);
        setLoading(false);
        try {
          const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
          const cacheKey = `recent-videos-${INITIAL_LOAD_COUNT}`;
          await recentVideosCache.get(
            cacheKey,
            async () => transcribedVideos as unknown as Record<string, unknown>[],
            () => true
          );
          console.log('✅ Cached recent videos data (initial list)');
        } catch (cacheError) {
          console.warn('Failed to cache recent videos:', cacheError);
        }
      }

      // Background enrich with audio file metadata
      const targetIds = transcribedVideos.map(v => v.videoId);
      void (async () => {
        try {
          const audioFilesMap = await fetchAudioFiles(targetIds);
          if (audioFilesMap.size === 0) return;

          setVideos(prev => {
            const map = new Map(prev.map(v => [v.videoId, v] as const));
            for (const id of targetIds) {
              const audioData = audioFilesMap.get(id);
              if (!audioData) continue;
              const v = map.get(id);
              if (!v) continue;
              map.set(id, enrichVideoWithAudioMetadata(v, audioFilesMap));
            }
            return Array.from(map.values());
          });

          if (!isLoadMore) {
            try {
              const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
              const cacheKey = `recent-videos-${INITIAL_LOAD_COUNT}`;
              const enrichedList = transcribedVideos.map(v => enrichVideoWithAudioMetadata(v, audioFilesMap)) as unknown as Record<string, unknown>[];
              await recentVideosCache.get(cacheKey, async () => enrichedList, () => true);
              console.log('✅ Cached recent videos data (enriched)');
            } catch {}
          }
        } catch {}
      })();

      setLastDoc(lastVisibleLocal || null);
      setHasMore(!!lastVisibleLocal); // If there's no last doc, we've reached the end

    } catch (err) {
      console.error('Error fetching transcribed videos:', err);
      setError('Failed to load transcribed videos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // FIX: Removed `videos` from dependency array. This hook now correctly depends
    // only on the functions and pagination state it needs to run.
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDoc, hasMore, fetchAudioFiles, videos]);

  const handleShowMore = () => setIsExpanded(true);
  const handleShowLess = () => setIsExpanded(false);

  // PERFORMANCE FIX #5: Only fetch when component is visible (Intersection Observer)
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (hasLoadedRef.current || !isVisible) return;
    hasLoadedRef.current = true;
    console.log('🔍 RecentVideos component is visible, loading data...');
    void fetchVideos(false);
  }, [fetchVideos, isVisible]);

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

  const getAudioSourceInfo = (video: TranscribedVideo) => {
    if (!video.audioFilename && !video.audioUrl) {
      return { type: 'Unknown', icon: FiMusic, color: 'text-gray-500' };
    }
    if (video.isStreamUrl) {
      return { type: 'Stream', icon: FiCloud, color: 'text-blue-500', tooltip: 'Streamed from external service' };
    }
    return { type: 'Cached', icon: FiClock, color: 'text-green-500', tooltip: 'Loaded from cache' };
  };

  const formatExtractionService = (service?: string): string => {
    if (!service) return 'Unknown source';
    const serviceMap: Record<string, string> = {
      'yt-mp3-go': 'yt-mp3-go',
      'quicktube': 'QuickTube',
      'yt-dlp': 'yt-dlp',
      'firebase-storage-cache': 'Cache',
      'cached-audio': 'Cached'
    };
    return serviceMap[service] || service;
  };


  if (loading) {
    return (
      <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recently Transcribed Songs</h3>
          <Chip size="sm" variant="flat" color="default">Loading...</Chip>
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(INITIAL_LOAD_COUNT)].map((_, index) => (
              <Card key={index} className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider">
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
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recently Transcribed Songs</h3>
          <Chip size="sm" variant="flat" color={error ? "danger" : "default"}>
            {error ? "Error" : "Empty"}
          </Chip>
        </div>
        <div className="h-48 flex items-center justify-center">
          <div className="text-center">
            <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
              {error ? 'Failed to load transcribed videos' : 'No recent transcriptions yet'}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {error ? 'Please retry or check your connection.' : 'New analyses will appear here as they are created.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ contentVisibility: 'auto', containIntrinsicSize: '384px' }} className="w-full">
      {/* Header row with title and count */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recently Transcribed Songs</h3>
        <Chip size="sm" variant="flat" color="default" className="text-foreground dark:text-white">
          {videos.length} song{videos.length !== 1 ? 's' : ''}
        </Chip>
      </div>

      {/* Song cards grid - no outer container box */}
      <div className={`${isExpanded ? 'max-h-[672px]' : 'max-h-96'} overflow-y-auto scrollbar-thin transition-all duration-300 ease-in-out`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <Card
              key={video.videoId}
              as={Link}
              href={(() => {
                const baseUrl = `/analyze/${video.videoId}`;
                const params = new URLSearchParams();
                if (video.title && video.title !== `Video ${video.videoId}`) params.set('title', video.title);
                if (video.channelTitle) params.set('channel', video.channelTitle);
                if (video.thumbnailUrl) params.set('thumbnail', video.thumbnailUrl);
                const paramString = params.toString();
                return paramString ? `${baseUrl}?${paramString}` : baseUrl;
              })()}
              isPressable
              className="group hover:scale-[1.02] transition-all duration-200 bg-content1 dark:bg-content1 border border-divider dark:border-divider hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-lg"
            >
              <CardBody className="p-3">
                <div className="flex gap-3">
                  <div className={`relative w-20 h-12 bg-gray-100 dark:bg-gray-600 rounded-md overflow-hidden flex-shrink-0 shadow-sm transition-all duration-300 ${video.fromCache ? 'border-2 border-green-400 dark:border-green-500' : 'border border-gray-200 dark:border-gray-500'}`}>
                    <Image src={video.thumbnailUrl || '/hero-image-placeholder.svg'} alt={video.title || 'Video thumbnail'} fill sizes="80px" className="object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/hero-image-placeholder.svg'; }} />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200"></div>
                    {video.duration && <div className="absolute bottom-0.5 right-0.5 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">{formatDuration(video.duration)}</div>}
                    {video.fromCache && <div className="absolute top-1 left-1 w-2 h-2 bg-green-400 rounded-full border border-white shadow-sm" title="Cached"></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">{video.title}</h4>
                    {(video.audioFilename || video.audioUrl) && (<div className="text-xs text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1">{(() => { const sourceInfo = getAudioSourceInfo(video); const IconComponent = sourceInfo.icon; return (<><IconComponent className={`w-3 h-3 ${sourceInfo.color}`} /> <span className={sourceInfo.color}>{sourceInfo.type}</span><span className="text-gray-500">•</span><span title={`Extracted using ${video.audioFilename || 'unknown service'}`}>{formatExtractionService(video.audioFilename)}</span></>);})()}</div>)}
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                      <div className="flex items-center justify-between"><span>{formatDate(video.processedAt)}</span>{video.bpm && (<span className="text-blue-600 dark:text-blue-400 font-medium">{formatBPM(video.bpm)}</span>)}</div>
                      <div className="flex items-center justify-between">{video.timeSignature && (<span className="text-green-600 dark:text-green-400">{formatTimeSignature(video.timeSignature)}</span>)}{video.keySignature && (<span className="text-purple-600 dark:text-purple-400 font-medium">{video.keySignature}</span>)}</div>
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
                <Card key={`loading-${index}`} className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider"><CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody></Card>
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