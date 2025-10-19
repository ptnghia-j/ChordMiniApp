'use client';

import { lazy, Suspense } from 'react';

// Lazy load the RecentVideos component to reduce initial bundle size
const RecentVideos = lazy(() => import('./RecentVideos'));

// Loading skeleton component
const RecentVideosLoading = () => (
  <div className="w-full bg-content1 dark:bg-content1 border border-divider dark:border-divider rounded-lg">
    <div className="flex items-center justify-between px-4 py-3 border-b border-divider dark:border-divider">
      <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
    </div>
    <div className="h-96 overflow-hidden p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="w-full bg-content2 dark:bg-content2 border border-divider dark:border-divider rounded-md">
            <div className="p-3">
              <div className="flex gap-3">
                <div className="w-20 h-12 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
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
