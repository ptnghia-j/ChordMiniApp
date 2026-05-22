'use client';

import dynamic from 'next/dynamic';
import Navigation from '@/components/common/Navigation';
import AnalyzePageBackdrop from '@/components/analysis/AnalyzePageBackdrop';
import ProcessingBanners from '@/components/analysis/ProcessingBanners';
import MelodyTranscriptionStatusToast from '@/components/analysis/MelodyTranscriptionStatusToast';
import PlaybackPromptToast from '@/components/analysis/PlaybackPromptToast';
import type { AnalyzePageChromeProps } from '../_types/analyzePageViewModel';

const PixelSnow = dynamic(() => import('@/components/ui/PixelSnow'), { ssr: false });

export default function AnalyzePageChrome({
  analyzeBackdropUrl,
  showFooterTransition,
  processingBannersProps,
  melodyToastProps,
  playbackPromptToastProps,
  videoTitle: _videoTitle,
  showSnow = false,
}: AnalyzePageChromeProps) {

  return (
    <>
      <AnalyzePageBackdrop
        thumbnailUrl={analyzeBackdropUrl}
        showFooterTransition={showFooterTransition}
      />

      {showSnow && (
        <div className="pointer-events-none absolute inset-0 z-[45] opacity-40 dark:opacity-30 mix-blend-screen">
          <PixelSnow
            variant="snowflake"
            pixelResolution={500}
            density={0.55}
            depthFade={9}
            brightness={1.5}
            speed={1.5}
            flakeSize={0.015}
            direction={100}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-white/45 to-transparent dark:from-white/5" />
      <Navigation />
      <ProcessingBanners {...processingBannersProps} />
      <MelodyTranscriptionStatusToast {...melodyToastProps} />
      <PlaybackPromptToast {...playbackPromptToastProps} />
    </>
  );
}
