'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import UserFriendlyErrorDisplay from '@/components/common/UserFriendlyErrorDisplay';

// Dynamic imports for heavy components
const ProcessingStatusBanner = dynamic(() => import('@/components/analysis/ProcessingStatusBanner'), {
  ssr: false
});

const ExtractionNotification = dynamic(() => import('@/components/analysis/ExtractionNotification'), {
  ssr: false
});

const DownloadingIndicator = dynamic(() => import('@/components/analysis/DownloadingIndicator'), {
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
  audioDuration: _audioDuration,
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

      {/* Processing Status Banner - triggers HeroUI toasts based on processing stage */}
      <ProcessingStatusBanner
        fromCache={fromCache}
        fromFirestoreCache={fromFirestoreCache}
        audioUrl={audioUrl}
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
