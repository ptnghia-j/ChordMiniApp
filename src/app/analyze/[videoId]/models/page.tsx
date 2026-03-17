import { redirect } from 'next/navigation';

import { buildAnalyzePageUrl, readAnalyzeRouteParams } from '@/utils/analyzeRouteUtils';

interface AnalyzeModelSelectionPageProps {
  params: Promise<{
    videoId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParamReader(searchParams: Record<string, string | string[] | undefined>) {
  return {
    get: (key: string) => {
      const value = searchParams[key];
      return Array.isArray(value) ? value[0] ?? null : value ?? null;
    },
  };
}

export default async function AnalyzeModelSelectionPage({
  params,
  searchParams,
}: AnalyzeModelSelectionPageProps) {
  const { videoId } = await params;
  const resolvedSearchParams = await searchParams;
  const routeParams = readAnalyzeRouteParams(toSearchParamReader(resolvedSearchParams));

  redirect(buildAnalyzePageUrl(videoId, {
    ...routeParams,
    autoStart: false,
  }));
}
