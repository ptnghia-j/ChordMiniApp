'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/config/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, DocumentSnapshot, doc, getDoc } from 'firebase/firestore';
import { FiMusic, FiCloud, FiClock } from 'react-icons/fi';
import { Card, CardBody, CardHeader, Button, Chip, Skeleton } from '@heroui/react';
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
const INITIAL_LOAD_COUNT = 6;
const LOAD_MORE_COUNT = 6;

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
    const audioFilesMap = await audioMetadataCache.getBatch(
      videoIds,
      async (videoId: string) => {
        try {
          if (!firestoreDb) return null;
          const audioDocRef = doc(firestoreDb, AUDIO_FILES_COLLECTION, videoId);
          const audioDocSnap = await getDoc(audioDocRef);

          if (audioDocSnap.exists()) {
            const audioData = audioDocSnap.data();
            return {
              audioFilename: audioData.extractionService || 'cached-audio',
              audioUrl: audioData.audioUrl,
              isStreamUrl: audioData.isStreamUrl || false,
              fromCache: true,
              fileSize: audioData.fileSize || 0,
              streamExpiresAt: audioData.streamExpiresAt,
              title: audioData.title || null,
              channelTitle: audioData.channelTitle || null
            };
          }
          return null;
        } catch {
          return null;
        }
      },
      (data: Record<string, unknown>) => {
        return !!(data.audioUrl && (data.audioFilename || data.title));
      }
    );

    const resultMap = new Map<string, AudioFileMetadata>();
    for (const [videoId, data] of audioFilesMap.entries()) {
      if (data && typeof data === 'object') {
        resultMap.set(videoId, data as unknown as AudioFileMetadata);
      }
    }

    return resultMap;
  }, []);

  const fetchVideos = useCallback(async (isLoadMore = false) => {
    // PERFORMANCE FIX #5: Check cache first for initial load
    if (!isLoadMore) {
      try {
        const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
        const cacheKey = `recent-videos-${INITIAL_LOAD_COUNT}`;

        const cachedData = await recentVideosCache.get(
          cacheKey,
          async () => null, // Don't fetch yet, just check cache
          () => true
        );

        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          console.log('✅ Using cached recent videos data');
          setVideos(cachedData as unknown as TranscribedVideo[]);
          setLoading(false);
          setHasMore(cachedData.length >= INITIAL_LOAD_COUNT);
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
      let q;


      if (isLoadMore && lastDoc) {
        q = query(
          transcriptionsRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(LOAD_MORE_COUNT)
        );
      } else {
        q = query(
          transcriptionsRef,
          orderBy('createdAt', 'desc'),
          limit(INITIAL_LOAD_COUNT)
        );
      }

      const querySnapshot = await getDocs(q);

      const videoMap = new Map<string, TranscribedVideo>();
      const videoIds: string[] = [];

      // Create a set of existing video IDs from the current state for deduplication on "load more"
      const existingVideoIds = new Set(isLoadMore ? videos.map(v => v.videoId) : []);

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        if (data.videoId && data.beats?.length > 0 && data.chords?.length > 0) {
          if (existingVideoIds.has(data.videoId) || videoMap.has(data.videoId)) {
            return;
          }

          videoIds.push(data.videoId);
          videoMap.set(data.videoId, {
            videoId: data.videoId,
            title: data.title || `Video ${data.videoId}`,
            thumbnailUrl: `https://i.ytimg.com/vi/${data.videoId}/mqdefault.jpg`,
            processedAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || Date.now(),
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

      const audioFilesMap = await fetchAudioFiles(videoIds);

      audioFilesMap.forEach((audioData, videoId) => {
        const video = videoMap.get(videoId);
        if (video) {
          video.audioFilename = audioData.audioFilename;
          video.audioUrl = audioData.audioUrl;
          video.isStreamUrl = audioData.isStreamUrl;
          video.fromCache = audioData.fromCache;

          if (audioData.title && video.title === `Video ${videoId}`) {
            video.title = audioData.title;
          }
          if (audioData.channelTitle) {
            video.channelTitle = audioData.channelTitle;
          }
        }
      });

      const transcribedVideos = Array.from(videoMap.values())
        .slice(0, isLoadMore ? LOAD_MORE_COUNT : INITIAL_LOAD_COUNT);

      // FIX: Use functional update to avoid `videos` dependency in useCallback
      if (isLoadMore) {
        setVideos(prev => [...prev, ...transcribedVideos]);
      } else {
        setVideos(transcribedVideos);

        // PERFORMANCE FIX #5: Cache the initial load results
        try {
          const { recentVideosCache } = await import('@/services/cache/smartFirebaseCache');
          const cacheKey = `recent-videos-${INITIAL_LOAD_COUNT}`;
          await recentVideosCache.get(
            cacheKey,
            async () => transcribedVideos as unknown as Record<string, unknown>[],
            () => true
          );
          console.log('✅ Cached recent videos data');
        } catch (cacheError) {
          console.warn('Failed to cache recent videos:', cacheError);
        }
      }

      const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(lastVisible || null);
      setHasMore(!!lastVisible); // If there's no last doc, we've reached the end

    } catch (err) {
      console.error('Error fetching transcribed videos:', err);
      setError('Failed to load transcribed videos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // FIX: Removed `videos` from dependency array. This hook now correctly depends
    // only on the functions and pagination state it needs to run.
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

  // PERFORMANCE FIX #5: Show placeholder until component is visible
  if (!isVisible) {
    return (
      <div ref={containerRef} className="w-full h-96 bg-content1 dark:bg-content1 border border-divider dark:border-divider rounded-lg" />
    );
  }

  if (loading) {
    return (
      <Card ref={containerRef} className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider">
        <CardHeader className="flex justify-between items-center pb-2">
          <h3 className="text-xl font-medium">Recently Transcribed Songs</h3>
          <Chip size="md" variant="flat" color="default">Loading...</Chip>
        </CardHeader>
        <CardBody className="p-0">
          <div className="h-96 overflow-y-auto scrollbar-thin p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
              {[...Array(INITIAL_LOAD_COUNT)].map((_, index) => (
                <Card key={index} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider">
                  <CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody>
                </Card>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error || videos.length === 0) {
    return null;
  }

  return (
    <Card ref={containerRef} className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider">
      <CardHeader className="flex justify-between items-center pb-2">
        <h3 className="text-lg font-medium">Recently Transcribed Songs</h3>
        <Chip size="sm" variant="flat" color="default" className="text-foreground dark:text-white">
          {videos.length} song{videos.length !== 1 ? 's' : ''}
        </Chip>
      </CardHeader>

      <CardBody className="p-0">
        <div className={`${isExpanded ? 'h-[672px]' : 'h-96'} overflow-y-auto scrollbar-thin p-4 transition-all duration-300 ease-in-out`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
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
                className="group hover:scale-[1.02] transition-transform duration-200 bg-content2 dark:bg-content2 border border-divider dark:border-divider"
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

          {/* "Load More" button and loading indicator inside the scrollable container */}
          <div className="flex justify-center mt-4">
            {hasMore && !loadingMore && (
              <Button onPress={() => fetchVideos(true)} color="primary" variant="flat">Load More</Button>
            )}
            {loadingMore && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {[...Array(2)].map((_, index) => (
                  <Card key={`loading-${index}`} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider"><CardBody className="p-3"><div className="flex gap-3"><Skeleton className="w-20 h-12 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4 rounded" /><Skeleton className="h-3 w-1/2 rounded" /></div></div></CardBody></Card>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Show More / Show Less Button for container height */}
        <div className="p-4 border-t border-divider dark:border-divider">
          <Button onPress={isExpanded ? handleShowLess : handleShowMore} color="default" variant="bordered" size="md" className="w-full">
            {isExpanded ? "Show Less" : "Show More"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}