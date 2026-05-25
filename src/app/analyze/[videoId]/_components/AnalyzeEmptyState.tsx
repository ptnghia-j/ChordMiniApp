'use client';

import { isDevelopmentEnvironment } from '@/utils/modelFiltering';
import ExtractionWaitPanel from './ExtractionWaitPanel';

interface AnalyzeEmptyStateProps {
  isExtracted?: boolean;
  isExtracting?: boolean;
  isAnalyzing?: boolean;
  isAnalyzed?: boolean;
  isDownloading?: boolean;
  fromCache?: boolean;
  hasCachedAnalysis?: boolean;
  queueStatus?: 'queued' | 'active' | 'released' | 'cancelled' | 'expired' | null;
  queuePosition?: number | null;
  estimatedWaitSeconds?: number | null;
  statusMessage?: string;
}

export default function AnalyzeEmptyState({
  isExtracted = false,
  isExtracting = false,
  isAnalyzing = false,
  isAnalyzed = false,
  isDownloading = false,
  hasCachedAnalysis = false,
  queueStatus,
  queuePosition,
  estimatedWaitSeconds,
  statusMessage,
}: AnalyzeEmptyStateProps) {
  const isWaitingForPipelineResult =
    isExtracting ||
    isDownloading ||
    isAnalyzing ||
    queueStatus === 'queued' ||
    queueStatus === 'active' ||
    (hasCachedAnalysis && !isAnalyzed) ||
    (isExtracted && !isAnalyzed);

  const showProductionWaitPanel =
    !isDevelopmentEnvironment() &&
    isWaitingForPipelineResult;

  if (showProductionWaitPanel) {
    return (
      <ExtractionWaitPanel
        queueStatus={queueStatus}
        queuePosition={queuePosition}
        estimatedWaitSeconds={estimatedWaitSeconds}
        statusMessage={statusMessage}
      />
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-default-300/70 dark:border-gray-800 bg-default-50/60 dark:bg-gray-900/20 p-6 text-center">
      <p className="text-sm font-medium text-foreground">No analysis loaded yet</p>
      <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
        Choose your models above, then open cached results or run a fresh analysis.
      </p>
      {!isDevelopmentEnvironment() && (
        <p className="mt-1 text-xs text-white/95 dark:text-white/95">
          For other experimental models, clone the repository and build the app from source.
        </p>
      )}
    </div>
  );
}
