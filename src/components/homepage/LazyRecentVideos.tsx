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

export default function LazyRecentVideos() {
  return (
    <Suspense fallback={<RecentVideosLoading />}>
      <RecentVideos />
    </Suspense>
  );
}
