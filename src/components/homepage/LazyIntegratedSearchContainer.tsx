'use client';

import { lazy, Suspense } from 'react';

// Lazy load the IntegratedSearchContainer component
const IntegratedSearchContainer = lazy(() => import('./IntegratedSearchContainer'));

// Loading skeleton component
const SearchContainerLoading = () => (
  <div className="w-full animate-pulse">
    {/* Clean Search Form Skeleton */}
    <div className="flex gap-3">
      <div className="flex-1">
        <div className="h-12 bg-white dark:bg-content-bg rounded-2xl shadow-lg"></div>
      </div>
      <div className="h-12 w-32 bg-default-100 dark:bg-default-200/20 rounded-lg shadow-lg border border-default-300 dark:border-default-400"></div>
    </div>

    {/* Search Results Skeleton */}
    <div className="mt-4 bg-white/95 dark:bg-content-bg/95 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-gray-200/50 dark:border-gray-600/50">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-lg shadow-sm bg-gray-50/80 dark:bg-content-bg/80 border border-gray-200/60 dark:border-gray-600/60">
            <div className="w-20 h-12 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Props interface (re-export from original component)
interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  view_count?: number;
  upload_date?: string;
  description?: string;
  url?: string;
}

interface LazyIntegratedSearchContainerProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  isSearching: boolean;
  searchError: string | null;
  error: string;
  setError: (error: string) => void;
  setSearchError: (error: string | null) => void;
  searchResults: YouTubeSearchResult[];
  handleVideoSelect: (videoId: string, title?: string, metadata?: YouTubeSearchResult) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function LazyIntegratedSearchContainer(props: LazyIntegratedSearchContainerProps) {
  return (
    <Suspense fallback={<SearchContainerLoading />}>
      <IntegratedSearchContainer {...props} />
    </Suspense>
  );
}
