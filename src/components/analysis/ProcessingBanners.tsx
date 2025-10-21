'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import UserFriendlyErrorDisplay from '@/components/common/UserFriendlyErrorDisplay';

// Dynamic imports for heavy components
const ProcessingStatusBanner = dynamic(() => import('@/components/analysis/ProcessingStatusBanner'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: true
});

const ExtractionNotification = dynamic(() => import('@/components/analysis/ExtractionNotification'), {
  loading: () => <div className="h-12 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

const DownloadingIndicator = dynamic(() => import('@/components/analysis/DownloadingIndicator'), {
  loading: () => <div className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

interface ProcessingBannersProps {
  // Downloading indicator
  isDownloading: boolean;
  fromCache: boolean;

  // Extraction notification
  showExtractionNotification: boolean;
  onDismissExtraction: () => void;
  onRefreshExtraction: () => void;

  // Processing status
  analysisResults: AnalysisResult | null;
  audioDuration: number;
  audioUrl?: string;
  fromFirestoreCache?: boolean;
  videoId?: string; // Optional for cache-aware duration detection
  beatDetector?: 'madmom' | 'beat-transformer' | 'auto'; // Beat detection model

  // Error display
  error: string | null;
  suggestion?: string;
  onTryAnotherVideo: () => void;
  onRetry: () => void;
}

const ProcessingBanners: React.FC<ProcessingBannersProps> = ({
  isDownloading,
  fromCache,
  showExtractionNotification,
  onDismissExtraction,
  onRefreshExtraction,
  analysisResults,
  audioDuration,
  audioUrl,
  fromFirestoreCache,
  videoId,
  beatDetector,
  error,
  suggestion,
  onTryAnotherVideo,
  onRetry
}) => {
  return (
    <>
      {/* Downloading Indicator - shown during initial download */}
      <DownloadingIndicator
        isVisible={isDownloading && !fromCache}
      />

      {/* Extraction Notification Banner - shown after download completes */}
      <ExtractionNotification
        isVisible={showExtractionNotification}
        fromCache={fromCache}
        onDismiss={onDismissExtraction}
        onRefresh={onRefreshExtraction}
      />

      {/* Processing Status Banner - positioned in content flow */}
      <ProcessingStatusBanner
        analysisResults={analysisResults}
        audioDuration={audioDuration}
        audioUrl={audioUrl}
        fromCache={fromCache}
        fromFirestoreCache={fromFirestoreCache}
        videoId={videoId}
        beatDetector={beatDetector}
      />

      {/* Error message */}
      {error && (
        <div className="mb-2 px-4 pt-2 pb-1">
          <UserFriendlyErrorDisplay
            error={error}
            suggestion={suggestion}
            onTryAnotherVideo={onTryAnotherVideo}
            onRetry={onRetry}
            className="mb-2"
          />
        </div>
      )}
    </>
  );
};

export default ProcessingBanners;
export { ProcessingBanners };
