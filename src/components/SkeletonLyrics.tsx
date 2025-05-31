'use client';

import React from 'react';

const SkeletonLyrics: React.FC = () => {
  // Animated loading dots component
  const LoadingDots = () => (
    <div className="flex justify-center items-center space-x-1">
      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse"></div>
      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Skeleton lyrics header */}
      <div className="flex justify-between items-center">
        <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-40 animate-pulse"></div>
        <div className="flex space-x-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-24 animate-pulse"></div>
        </div>
      </div>

      {/* Skeleton lyrics content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-6 min-h-[400px] transition-colors duration-300">
        <div className="space-y-8">
          {/* Loading message */}
          <div className="text-center py-12">
            <LoadingDots />
            <p className="text-gray-500 dark:text-gray-400 mt-4 text-sm">
              Processing lyrics...
            </p>
          </div>

          {/* Skeleton lyrics lines */}
          {Array.from({ length: 6 }).map((_, lineIndex) => (
            <div key={`skeleton-line-${lineIndex}`} className="space-y-3">
              {/* Chord line skeleton */}
              <div className="flex space-x-4 mb-1">
                {Array.from({ length: Math.floor(Math.random() * 4) + 2 }).map((_, chordIndex) => (
                  <div
                    key={`skeleton-chord-${lineIndex}-${chordIndex}`}
                    className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"
                    style={{ width: `${Math.random() * 30 + 20}px` }}
                  ></div>
                ))}
              </div>
              
              {/* Lyrics line skeleton */}
              <div className="space-y-2">
                <div
                  className="h-5 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"
                  style={{ width: `${Math.random() * 40 + 60}%` }}
                ></div>
                {/* Some lines have translation */}
                {lineIndex % 3 === 0 && (
                  <div
                    className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"
                    style={{ width: `${Math.random() * 35 + 55}%` }}
                  ></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton controls */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-16 animate-pulse"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse"></div>
        </div>
        <div className="flex space-x-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-8 animate-pulse"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-12 animate-pulse"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-8 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonLyrics;
