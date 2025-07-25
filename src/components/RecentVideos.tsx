'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/config/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, DocumentSnapshot, doc, getDoc } from 'firebase/firestore';
import { FiMusic, FiCloud, FiClock } from 'react-icons/fi';
import { Card, CardBody, CardHeader, Button, Chip, Skeleton } from '@heroui/react';

interface TranscribedVideo {
  videoId: string;
  title?: string;
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
const INITIAL_LOAD_COUNT = 10; // Limit to 10 videos as requested
const LOAD_MORE_COUNT = 10; // Number of videos to load when "Load More" is clicked

export default function RecentVideos() {
  const [videos, setVideos] = useState<TranscribedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // hasMore state removed as it's not currently used
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Audio file metadata interface
  interface AudioFileMetadata {
    audioFilename: string;
    audioUrl: string;
    isStreamUrl: boolean;
    fromCache: boolean;
    fileSize: number;
    streamExpiresAt?: number;
    title?: string; // Add title from audio files
  }

  // Helper function to batch query audio files for video IDs with smart caching
  const fetchAudioFiles = useCallback(async (videoIds: string[]) => {
    if (!db || videoIds.length === 0) {
      return new Map<string, AudioFileMetadata>();
    }

    // Import smart cache
    const { audioMetadataCache } = await import('@/services/smartFirebaseCache');

    // Use smart cache for batch queries
    const audioFilesMap = await audioMetadataCache.getBatch(
      videoIds,
      async (videoId: string) => {
        try {
          if (!db) return null;
          const audioDocRef = doc(db, AUDIO_FILES_COLLECTION, videoId);
          const audioDocSnap = await getDoc(audioDocRef);

          if (audioDocSnap.exists()) {
            const audioData = audioDocSnap.data();
            return {
              audioFilename: audioData.extractionService || 'cached-audio', // Use extraction service instead of title
              audioUrl: audioData.audioUrl,
              isStreamUrl: audioData.isStreamUrl || false,
              fromCache: true,
              fileSize: audioData.fileSize || 0,
              streamExpiresAt: audioData.streamExpiresAt,
              title: audioData.title || null // Use proper video title from enhanced metadata
            };
          }
          return null;
        } catch {
          // Error handling is done by smart cache
          return null;
        }
      },
      // Check if audio metadata is complete
      (data: Record<string, unknown>) => {
        return !!(data.audioUrl && (data.audioFilename || data.title));
      }
    );

    // Convert to the expected format
    const resultMap = new Map<string, AudioFileMetadata>();
    for (const [videoId, data] of audioFilesMap.entries()) {
      if (data && typeof data === 'object') {
        resultMap.set(videoId, data as unknown as AudioFileMetadata);
      }
    }

    return resultMap;
  }, []);

  // Function to fetch transcribed videos with pagination support
  const fetchVideos = useCallback(async (isLoadMore = false) => {
    if (!db) {
      setError('Firebase not initialized');
      setLoading(false);
      return;
    }

    try {
      if (isLoadMore) {
        setLoadingMore(true);
      }

      // Query transcriptions collection to get songs with chord and beat detection
      const transcriptionsRef = collection(db, TRANSCRIPTIONS_COLLECTION);
      let q;

      if (isLoadMore && lastDoc) {
        // Load more transcriptions starting after the last document
        q = query(
          transcriptionsRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(LOAD_MORE_COUNT * 3) // Get more docs to account for duplicates
        );
      } else {
        // Initial load - get more docs to account for duplicates
        q = query(
          transcriptionsRef,
          orderBy('createdAt', 'desc'),
          limit(INITIAL_LOAD_COUNT * 3)
        );
      }

      // Get the documents
      const querySnapshot = await getDocs(q);

      // Convert documents to TranscribedVideo objects and deduplicate by videoId
      const videoMap = new Map<string, TranscribedVideo>();
      const existingVideoIds = new Set(videos.map(v => v.videoId));
      const videoIds: string[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Only include valid transcriptions with both beats and chords
        if (data.videoId && data.beats && data.chords && data.beats.length > 0 && data.chords.length > 0) {
          // Skip if we already have this video (for load more)
          if (isLoadMore && existingVideoIds.has(data.videoId)) {
            return;
          }

          // Only keep the most recent transcription for each video
          if (!videoMap.has(data.videoId)) {
            videoIds.push(data.videoId);
            videoMap.set(data.videoId, {
              videoId: data.videoId,
              title: data.title || `Video ${data.videoId}`,
              thumbnailUrl: `https://i.ytimg.com/vi/${data.videoId}/mqdefault.jpg`,
              processedAt: data.createdAt?.toMillis?.() ||
                          data.createdAt?.seconds ? data.createdAt.seconds * 1000 :
                          Date.now(),
              duration: data.audioDuration,
              beatModel: data.beatModel,
              chordModel: data.chordModel,
              bpm: data.bpm,
              timeSignature: data.timeSignature,
              keySignature: data.keySignature,
              // Initialize audio file metadata (will be populated below)
              audioFilename: undefined,
              audioUrl: undefined,
              isStreamUrl: false,
              fromCache: false
            });
          }
        }
      });

      // Batch fetch audio file metadata for all video IDs
      const audioFilesMap = await fetchAudioFiles(videoIds);

      // Merge audio file metadata with transcription data
      audioFilesMap.forEach((audioData, videoId) => {
        const video = videoMap.get(videoId);
        if (video) {
          video.audioFilename = audioData.audioFilename;
          video.audioUrl = audioData.audioUrl;
          video.isStreamUrl = audioData.isStreamUrl;
          video.fromCache = audioData.fromCache;

          // Update title with the proper song title from audio files if transcription title is missing
          if (audioData.title && audioData.title !== `Video ${videoId}` && video.title === `Video ${videoId}`) {
            video.title = audioData.title;
          }
        }
      });

      // Convert map to array and limit to requested count
      const transcribedVideos = Array.from(videoMap.values())
        .slice(0, isLoadMore ? LOAD_MORE_COUNT : INITIAL_LOAD_COUNT);

      // Update state
      if (isLoadMore) {
        setVideos(prev => [...prev, ...transcribedVideos]);
      } else {
        setVideos(transcribedVideos);
      }

      // Update pagination state
      const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(lastVisible || null);

      // Fetched transcribed videos successfully

    } catch (err) {
      console.error('Error fetching transcribed videos:', err);
      setError('Failed to load transcribed videos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [videos, lastDoc, fetchAudioFiles]);

  // Show more function - just expand the container
  const handleShowMore = () => {
    setIsExpanded(true);
  };

  // Show less function
  const handleShowLess = () => {
    setIsExpanded(false);
  };

  // Initial load
  useEffect(() => {
    fetchVideos(false);
  }, [fetchVideos]);

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Format BPM
  const formatBPM = (bpm?: number) => {
    if (!bpm) return '';
    return `${Math.round(bpm)} BPM`;
  };

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format time signature
  const formatTimeSignature = (timeSignature?: number) => {
    if (!timeSignature) return '';
    return `${timeSignature}/4`;
  };

  // Helper function to get audio source type and icon
  const getAudioSourceInfo = (video: TranscribedVideo) => {
    if (!video.audioFilename && !video.audioUrl) {
      return { type: 'Unknown', icon: FiMusic, color: 'text-gray-500' };
    }

    if (video.isStreamUrl) {
      return {
        type: 'Stream',
        icon: FiCloud,
        color: 'text-blue-500',
        tooltip: 'Streamed from external service'
      };
    }

    // Check extraction service from enhanced metadata
    if (video.audioFilename === 'yt-mp3-go') {
      return {
        type: 'Cached',
        icon: FiClock,
        color: 'text-green-500',
        tooltip: 'Cached from yt-mp3-go extraction'
      };
    }

    if (video.audioFilename === 'yt-dlp') {
      return {
        type: 'Cached',
        icon: FiClock,
        color: 'text-green-500',
        tooltip: 'Cached from yt-dlp extraction'
      };
    }

    if (video.audioFilename === 'quicktube') {
      return {
        type: 'Cached',
        icon: FiClock,
        color: 'text-green-500',
        tooltip: 'Cached from QuickTube extraction'
      };
    }

    return {
      type: 'Cached',
      icon: FiClock,
      color: 'text-purple-500',
      tooltip: 'Loaded from cache'
    };
  };

  // Helper function to format extraction service for display
  const formatExtractionService = (service?: string): string => {
    if (!service) return 'Unknown source';

    // Map extraction services to user-friendly names
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
      <Card className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider">
        <CardHeader className="flex justify-between items-center pb-2">
          <h3 className="text-xl font-medium">Recently Transcribed Songs</h3>
          <Chip size="md" variant="flat" color="default">Loading...</Chip>
        </CardHeader>
        <CardBody className="p-0">
          <div className={`${isExpanded ? 'h-[672px]' : 'h-96'} overflow-y-auto scrollbar-thin p-4 transition-all duration-300 ease-in-out`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
              {[...Array(INITIAL_LOAD_COUNT)].map((_, index) => (
                <Card key={index} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider">
                  <CardBody className="p-3">
                    <div className="flex gap-3">
                      <Skeleton className="w-20 h-12 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4 rounded" />
                        <Skeleton className="h-3 w-1/2 rounded" />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (error || videos.length === 0) {
    return null; // Don't show anything if there's an error or no videos
  }

  return (
    <Card className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider">
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
              href={`/analyze/${video.videoId}?title=${encodeURIComponent(video.title || `Video ${video.videoId}`)}`}
              isPressable
              className="group hover:scale-[1.02] transition-transform duration-200 bg-content2 dark:bg-content2 border border-divider dark:border-divider"
            >
              <CardBody className="p-3">
                <div className="flex gap-3">
                {/* Thumbnail with cache status border */}
                <div className={`relative w-20 h-12 bg-gray-100 dark:bg-gray-600 rounded-md overflow-hidden flex-shrink-0 shadow-sm transition-all duration-300 ${
                  video.fromCache
                    ? 'border-2 border-green-400 dark:border-green-500 shadow-green-200 dark:shadow-green-900/30'
                    : 'border border-gray-200 dark:border-gray-500'
                }`}>
                  <Image
                    src={video.thumbnailUrl || '/hero-image-placeholder.svg'}
                    alt={video.title || 'Video thumbnail'}
                    fill
                    sizes="80px"
                    className="object-cover"
                    onError={(e) => {
                      // Fallback if thumbnail fails to load
                      (e.target as HTMLImageElement).src = '/hero-image-placeholder.svg';
                    }}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200"></div>

                  {/* Duration overlay */}
                  {video.duration && (
                    <div className="absolute bottom-0.5 right-0.5 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">
                      {formatDuration(video.duration)}
                    </div>
                  )}
                  {/* Cache status indicator */}
                  {video.fromCache && (
                    <div className="absolute top-1 left-1 w-2 h-2 bg-green-400 rounded-full border border-white shadow-sm" title="Cached"></div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-medium text-gray-800 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">
                    {video.title}
                  </h4>

                  {/* Audio file information */}
                  {(video.audioFilename || video.audioUrl) && (
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-1">
                      {(() => {
                        const sourceInfo = getAudioSourceInfo(video);
                        const IconComponent = sourceInfo.icon;
                        return (
                          <>
                            <IconComponent className={`w-3 h-3 ${sourceInfo.color}`} />
                            <span className={sourceInfo.color}>{sourceInfo.type}</span>
                            <span className="text-gray-500">•</span>
                            <span title={`Extracted using ${video.audioFilename || 'unknown service'}`}>
                              {formatExtractionService(video.audioFilename)}
                            </span>

                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Transcription metadata - Compact layout */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span>{formatDate(video.processedAt)}</span>
                      {video.bpm && (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {formatBPM(video.bpm)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      {video.timeSignature && (
                        <span className="text-green-600 dark:text-green-400">
                          {formatTimeSignature(video.timeSignature)}
                        </span>
                      )}
                      {video.keySignature && (
                        <span className="text-purple-600 dark:text-purple-400 font-medium">
                          {video.keySignature}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </CardBody>
            </Card>
          ))}

          {/* Loading more indicator inside scrollable area */}
          {loadingMore && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {[...Array(LOAD_MORE_COUNT)].map((_, index) => (
                <Card key={`loading-${index}`} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider">
                  <CardBody className="p-3">
                    <div className="flex gap-3">
                      <Skeleton className="w-20 h-12 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4 rounded" />
                        <Skeleton className="h-3 w-1/2 rounded" />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

        {/* Show More / Show Less Button */}
        {videos.length > 0 && (
          <div className="p-4 border-t border-divider">
            <Button
              onPress={isExpanded ? handleShowLess : handleShowMore}
              color="default"
              variant="bordered"
              size="md"
              className="w-full transition-all duration-200 bg-default-100 dark:bg-default-200/20 border-default-300 dark:border-default-400 text-foreground hover:bg-default-200 dark:hover:bg-default-300/30"
              startContent={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
                  />
                </svg>
              }
            >
              {isExpanded ? "Show Less" : "Show More"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
