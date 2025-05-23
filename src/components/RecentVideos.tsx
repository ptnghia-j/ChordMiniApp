'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/config/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

interface CachedVideo {
  videoId: string;
  title?: string;
  thumbnailUrl?: string;
  processedAt: number;
}

const AUDIO_FILES_COLLECTION = 'audioFiles';
const MAX_VIDEOS = 6;

export default function RecentVideos() {
  const [videos, setVideos] = useState<CachedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecentVideos() {
      if (!db) {
        setError('Firebase not initialized');
        setLoading(false);
        return;
      }

      try {
        // Create a query to get the most recent videos
        const videosRef = collection(db, AUDIO_FILES_COLLECTION);
        const q = query(videosRef, orderBy('createdAt', 'desc'), limit(MAX_VIDEOS));

        // Get the documents
        const querySnapshot = await getDocs(q);

        // Convert the documents to CachedVideo objects
        const cachedVideos: CachedVideo[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();

          // Only include valid entries
          if (data.videoId && !data.invalid && !data.expired) {
            cachedVideos.push({
              videoId: data.videoId,
              title: data.title || `Video ${data.videoId}`,
              thumbnailUrl: `https://i.ytimg.com/vi/${data.videoId}/mqdefault.jpg`,
              processedAt: data.createdAt?.toMillis?.() ||
                          data.createdAt?.seconds ? data.createdAt.seconds * 1000 :
                          data.processedAt || Date.now()
            });
          }
        });

        setVideos(cachedVideos);
      } catch (err) {
        console.error('Error fetching recent videos:', err);
        setError('Failed to load recent videos');
      } finally {
        setLoading(false);
      }
    }

    fetchRecentVideos();
  }, []);

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card p-4 transition-colors duration-300">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-2 transition-colors duration-300">Recent Videos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-md mb-1 transition-colors duration-300"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1 transition-colors duration-300"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 transition-colors duration-300"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || videos.length === 0) {
    return null; // Don't show anything if there's an error or no videos
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-card p-4 transition-colors duration-300">
      <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-2 transition-colors duration-300">Recent Videos</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {videos.map((video) => (
          <Link
            href={`/analyze/${video.videoId}`}
            key={video.videoId}
            className="block group hover:opacity-90 transition-opacity"
          >
            <div className="relative aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden mb-1 shadow-sm transition-colors duration-300">
              <Image
                src={video.thumbnailUrl || '/hero-image-placeholder.svg'}
                alt={video.title || 'Video thumbnail'}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                className="object-cover"
                onError={(e) => {
                  // Fallback if thumbnail fails to load
                  (e.target as HTMLImageElement).src = '/hero-image-placeholder.svg';
                }}
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200"></div>
            </div>
            <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {video.title}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">{formatDate(video.processedAt)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
