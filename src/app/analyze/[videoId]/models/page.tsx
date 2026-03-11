'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import Navigation from '@/components/common/Navigation';
import { buildAnalyzePageUrl, readAnalyzeRouteParams } from '@/utils/analyzeRouteUtils';

export default function AnalyzeModelSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoId = params?.videoId as string;
  const routeParams = readAnalyzeRouteParams(searchParams);

  const analyzeUrl = useMemo(() => buildAnalyzePageUrl(videoId, {
    ...routeParams,
    autoStart: false,
  }), [routeParams, videoId]);

  useEffect(() => {
    if (!videoId) {
      return;
    }

    router.replace(analyzeUrl, { scroll: false });
  }, [analyzeUrl, router, videoId]);

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg transition-colors duration-300">
      <Navigation />
      <main className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-4 py-8">
        <p className="text-sm text-default-500 dark:text-default-300">
          Redirecting to analysis…
        </p>
      </main>
    </div>
  );
}