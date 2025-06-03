'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/config/firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, DocumentSnapshot } from 'firebase/firestore';

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
}

const TRANSCRIPTIONS_COLLECTION = 'transcriptions';
const INITIAL_LOAD_COUNT = 10; // Limit to 10 videos as requested
const LOAD_MORE_COUNT = 10; // Number of videos to load when "Load More" is clicked

export default function RecentVideos() {
  const [videos, setVideos] = useState<TranscribedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);

  // Function to fetch transcribed videos with pagination support
  const fetchVideos = async (isLoadMore = false) => {
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
              keySignature: data.keySignature
            });
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
      setHasMore(transcribedVideos.length === (isLoadMore ? LOAD_MORE_COUNT : INITIAL_LOAD_COUNT));

      console.log(`Fetched ${transcribedVideos.length} transcribed videos${isLoadMore ? ' (load more)' : ' (initial)'}, hasMore: ${transcribedVideos.length === (isLoadMore ? LOAD_MORE_COUNT : INITIAL_LOAD_COUNT)}`);

    } catch (err) {
      console.error('Error fetching transcribed videos:', err);
      setError('Failed to load transcribed videos');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load more videos function
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchVideos(true);
    }
  };

  // Initial load
  useEffect(() => {
    fetchVideos(false);
  }, []);

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

  if (loading) {
    return (
      <div className="bg-white dark:bg-content-bg rounded-lg shadow-card transition-colors duration-300 border border-gray-200 dark:border-gray-600 overflow-hidden">
        {/* Minimal banner header - loading state - spans full width */}
        <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">Recently Transcribed Songs</span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">Loading...</span>
          </div>
        </div>
        {/* Scrollable container with fixed height for loading skeleton */}
        <div className="h-96 overflow-y-auto scrollbar-thin p-4">
          {/* Sidebar loading skeleton */}
          <div className="space-y-3 pr-2">
            {[...Array(INITIAL_LOAD_COUNT)].map((_, index) => (
              <div key={index} className="animate-pulse flex gap-3">
                <div className="w-20 h-12 bg-gray-200 dark:bg-gray-600 rounded-md transition-colors duration-300"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-1 transition-colors duration-300"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2 transition-colors duration-300"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || videos.length === 0) {
    return null; // Don't show anything if there's an error or no videos
  }

  return (
    <div className="bg-white dark:bg-content-bg rounded-lg shadow-card transition-colors duration-300 border border-gray-200 dark:border-gray-600 overflow-hidden">
      {/* Minimal banner header - spans full width */}
      <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">Recently Transcribed Songs</span>
          <span className="text-gray-500 dark:text-gray-400 text-xs">{videos.length} song{videos.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Scrollable container with fixed height */}
      <div className="h-96 overflow-y-auto scrollbar-thin p-4">
        {/* Sidebar layout: Single column for compact display */}
        <div className="space-y-3 pr-2">
          {videos.map((video) => (
            <Link
              href={`/analyze/${video.videoId}`}
              key={video.videoId}
              className="block group hover:opacity-90 transition-opacity"
            >
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="relative w-20 h-12 bg-gray-100 dark:bg-gray-600 rounded-md overflow-hidden flex-shrink-0 shadow-sm transition-colors duration-300">
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
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">
                    {video.title}
                  </h4>

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
            </Link>
          ))}

          {/* Loading more indicator inside scrollable area */}
          {loadingMore && (
            <div className="space-y-3 mt-3">
              {[...Array(LOAD_MORE_COUNT)].map((_, index) => (
                <div key={`loading-${index}`} className="animate-pulse flex gap-3">
                  <div className="w-20 h-12 bg-gray-200 dark:bg-gray-600 rounded-md transition-colors duration-300"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-1 transition-colors duration-300"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2 transition-colors duration-300"></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More Button inside scrollable area */}
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-blue-600 dark:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {loadingMore ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </div>
                ) : (
                  `Load More`
                )}
              </button>
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
