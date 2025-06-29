'use client';

import React from 'react';

/**
 * Skeleton loading components for better perceived performance
 * Provides realistic loading states for different component types
 */

export const AudioPlayerSkeleton: React.FC = () => (
  <div className="w-full p-3 bg-gray-50 dark:bg-content-bg rounded-lg mb-3 border border-gray-200 dark:border-gray-600">
    <div className="flex items-center space-x-4">
      {/* Play button skeleton */}
      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      
      {/* Progress bar skeleton */}
      <div className="flex-1 space-y-2">
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="flex justify-between">
          <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
      
      {/* Controls skeleton */}
      <div className="flex space-x-2">
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    </div>
  </div>
);

export const AnalysisControlsSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-content-bg rounded-lg p-4 border border-gray-200 dark:border-gray-600">
    <div className="space-y-4">
      {/* Model selectors skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
      
      {/* Action button skeleton */}
      <div className="h-12 bg-blue-200 dark:bg-blue-800 rounded-lg animate-pulse" />
    </div>
  </div>
);

export const ChordGridSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-content-bg rounded-lg p-4 border border-gray-200 dark:border-gray-600">
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      
      {/* Grid skeleton */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
          />
        ))}
      </div>
      
      {/* Legend skeleton */}
      <div className="flex space-x-4">
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    </div>
  </div>
);

export const LyricsSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-content-bg rounded-lg p-4 border border-gray-200 dark:border-gray-600">
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="flex space-x-2">
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
      
      {/* Lyrics lines skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${
              i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6'
            }`} />
            {i % 2 === 0 && (
              <div className="h-3 w-2/3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const ChatbotSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-content-bg rounded-lg p-4 border border-gray-200 dark:border-gray-600">
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      
      {/* Chat messages skeleton */}
      <div className="space-y-3">
        <div className="flex justify-end">
          <div className="h-10 w-48 bg-blue-200 dark:bg-blue-800 rounded-lg animate-pulse" />
        </div>
        <div className="flex justify-start">
          <div className="h-16 w-56 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
      </div>
      
      {/* Input skeleton */}
      <div className="flex space-x-2">
        <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        <div className="w-10 h-10 bg-blue-200 dark:bg-blue-800 rounded-lg animate-pulse" />
      </div>
    </div>
  </div>
);

export const ProcessingStatusSkeleton: React.FC = () => (
  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
    <div className="flex items-center space-x-3">
      <div className="w-6 h-6 bg-blue-200 dark:bg-blue-700 rounded-full animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 bg-blue-200 dark:bg-blue-700 rounded animate-pulse" />
        <div className="h-2 bg-blue-200 dark:bg-blue-700 rounded animate-pulse" />
      </div>
    </div>
  </div>
);
