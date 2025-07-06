'use client';

import { lazy, Suspense } from 'react';

// Lazy load the IntegratedSearchContainer component
const IntegratedSearchContainer = lazy(() => import('./IntegratedSearchContainer'));

// Loading skeleton component
const SearchContainerLoading = () => (
  <div className="bg-white dark:bg-content-bg rounded-lg shadow-card border border-gray-200 dark:border-gray-600 animate-pulse">
    {/* Header skeleton */}
    <div className="p-2 border-b border-gray-200 dark:border-gray-600">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mx-auto mb-2"></div>
      
      {/* Search form skeleton */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
        </div>
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
    </div>
    
    {/* Content skeleton */}
    <div className="p-2">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3 border border-gray-100 dark:border-gray-700 rounded-lg">
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

// Error boundary component (currently unused but kept for future error handling)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SearchContainerError = ({ error, retry }: { error: Error; retry: () => void }) => (
  <div className="bg-white dark:bg-content-bg rounded-lg shadow-card border border-gray-200 dark:border-gray-600 p-6 text-center">
    <div className="text-red-600 dark:text-red-400 mb-4">
      <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <p className="text-sm">Failed to load search component</p>
    </div>
    <button
      onClick={retry}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    >
      Try Again
    </button>
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
