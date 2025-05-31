'use client';

import React from 'react';

interface SkeletonChordGridProps {
  timeSignature?: number;
}

const SkeletonChordGrid: React.FC<SkeletonChordGridProps> = ({
  timeSignature = 4
}) => {
  // Create skeleton grid with 4 rows of measures
  const rows = 4;
  const measuresPerRow = 4;
  
  const getGridColumnsClass = (beatsPerMeasure: number) => {
    switch (beatsPerMeasure) {
      case 3: return 'grid-cols-3';
      case 5: return 'grid-cols-5';
      case 6: return 'grid-cols-6';
      case 7: return 'grid-cols-7';
      default: return 'grid-cols-4';
    }
  };

  // Animated loading dots component
  const LoadingDots = () => (
    <div className="flex justify-center items-center space-x-1">
      <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse"></div>
      <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
      <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Skeleton header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-32 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16 animate-pulse"></div>
        </div>
        <div className="flex space-x-2">
          <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse"></div>
          <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-24 animate-pulse"></div>
        </div>
      </div>

      {/* Skeleton chord grid */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`skeleton-row-${rowIndex}`} className="space-y-2">
            {Array.from({ length: measuresPerRow }).map((_, measureIndex) => (
              <div key={`skeleton-measure-${rowIndex}-${measureIndex}`} className="space-y-1">
                {/* Measure header skeleton */}
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16 animate-pulse"></div>
                </div>
                
                {/* Chord cells skeleton */}
                <div className={`grid gap-1 auto-rows-fr ${getGridColumnsClass(timeSignature)}`}>
                  {Array.from({ length: timeSignature }).map((_, beatIndex) => (
                    <div
                      key={`skeleton-beat-${rowIndex}-${measureIndex}-${beatIndex}`}
                      className="flex flex-col items-start justify-center aspect-square border border-gray-300 dark:border-gray-600 rounded-sm bg-gray-50 dark:bg-gray-700 min-h-[3.75rem] transition-colors duration-300"
                    >
                      {/* Loading dots in some cells */}
                      {(rowIndex + measureIndex + beatIndex) % 3 === 0 && (
                        <div className="w-full h-full flex items-center justify-center">
                          <LoadingDots />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Skeleton analysis summary */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors duration-300">
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-gray-200 dark:bg-gray-600 rounded w-32 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`skeleton-stat-${index}`} className="text-center">
              <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-full animate-pulse mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mx-auto animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SkeletonChordGrid;
