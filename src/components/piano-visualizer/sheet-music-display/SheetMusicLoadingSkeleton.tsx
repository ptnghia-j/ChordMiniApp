'use client';

import React from 'react';
import { Skeleton } from '@heroui/react';

interface SheetMusicLoadingSkeletonProps {
  stageLabel: string;
}

const skeletonRowClassName = 'h-4 rounded !bg-gray-200';

export const SheetMusicLoadingSkeleton: React.FC<SheetMusicLoadingSkeletonProps> = ({ stageLabel }) => (
  <div
    data-testid="sheet-music-loading-skeleton"
    className="light absolute inset-0 z-10 flex items-start justify-center bg-white px-4 pt-6 sm:px-6 sm:pt-8"
  >
    <div className="w-full max-w-2xl rounded-3xl bg-white px-6 py-5 sm:px-7 sm:py-6">
      <div className="mb-5 text-sm font-medium text-gray-600">
        {stageLabel}
      </div>
      <div className="space-y-4">
        <div className="space-y-3">
          <Skeleton className={`${skeletonRowClassName} w-full`} />
          <Skeleton className={`${skeletonRowClassName} w-5/6`} />
          <Skeleton className={`${skeletonRowClassName} w-4/6`} />
          <Skeleton className={`${skeletonRowClassName} w-full`} />
          <Skeleton className={`${skeletonRowClassName} w-3/6`} />
        </div>
        <div className="space-y-3 pt-2">
          <Skeleton className={`${skeletonRowClassName} w-11/12`} />
          <Skeleton className={`${skeletonRowClassName} w-4/6`} />
          <Skeleton className={`${skeletonRowClassName} w-full`} />
          <Skeleton className={`${skeletonRowClassName} w-5/6`} />
          <Skeleton className={`${skeletonRowClassName} w-2/6`} />
        </div>
      </div>
    </div>
  </div>
);
