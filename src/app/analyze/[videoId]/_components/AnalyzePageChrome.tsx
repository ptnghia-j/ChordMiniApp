'use client';

import Navigation from '@/components/common/Navigation';
import AnalyzePageBackdrop from '@/components/analysis/AnalyzePageBackdrop';
import ProcessingBanners from '@/components/analysis/ProcessingBanners';
import MelodyTranscriptionStatusToast from '@/components/analysis/MelodyTranscriptionStatusToast';
import type { AnalyzePageChromeProps } from '../_types/analyzePageViewModel';

export default function AnalyzePageChrome({
  analyzeBackdropUrl,
  showFooterTransition,
  processingBannersProps,
  melodyToastProps,
}: AnalyzePageChromeProps) {
  return (
    <>
      <AnalyzePageBackdrop
        thumbnailUrl={analyzeBackdropUrl}
        showFooterTransition={showFooterTransition}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-white/45 to-transparent dark:from-white/5" />
      <Navigation />
      <ProcessingBanners {...processingBannersProps} />
      <MelodyTranscriptionStatusToast {...melodyToastProps} />
    </>
  );
}
