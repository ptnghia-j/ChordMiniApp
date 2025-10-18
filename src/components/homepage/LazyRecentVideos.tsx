'use client';

import { lazy, Suspense } from 'react';

// Lazy load the RecentVideos component to reduce initial bundle size
const RecentVideos = lazy(() => import('./RecentVideos'));

// Loading skeleton component
const RecentVideosLoading = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse">
          <div className="aspect-video bg-gray-200 dark:bg-gray-700"></div>
          <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="flex items-center space-x-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Error boundary component (currently unused but kept for future error handling)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RecentVideosError = ({ error, retry }: { error: Error; retry: () => void }) => (
  <div className="text-center py-8">
    <div className="text-red-600 dark:text-red-400 mb-4">
      <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <p className="text-sm">Failed to load recent videos</p>
    </div>
    <button
      onClick={retry}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    >
      Try Again
    </button>
  </div>
);

export default function LazyRecentVideos() {
  return (
    <Suspense fallback={<RecentVideosLoading />}>
      <RecentVideos />
    </Suspense>
  );
}
