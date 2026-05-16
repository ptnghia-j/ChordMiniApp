import { useQuery } from '@tanstack/react-query';
import { fetchCachedLyrics } from '@/services/query/cachedLyrics';
import { queryKeys } from '@/services/query/queryKeys';
import { queryGcTimes, queryStaleTimes } from '@/services/query/queryOptions';

export function useCachedLyricsQuery({
  videoId,
  audioUrl,
  enabled,
}: {
  videoId: string;
  audioUrl: string | null | undefined;
  enabled: boolean;
}) {
  const normalizedAudioUrl = audioUrl || '';

  return useQuery({
    queryKey: queryKeys.lyrics.cached(videoId, normalizedAudioUrl),
    queryFn: () => fetchCachedLyrics({ videoId, audioUrl: normalizedAudioUrl }),
    enabled: enabled && videoId.length > 0 && normalizedAudioUrl.length > 0,
    staleTime: queryStaleTimes.cachedLyrics,
    gcTime: queryGcTimes.cachedLyrics,
    retry: false,
  });
}
