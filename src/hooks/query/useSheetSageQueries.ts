import { useQuery } from '@tanstack/react-query';
import {
  fetchCachedSheetSageMelody,
  fetchSheetSageBackendAvailability,
} from '@/services/query/sheetSage';
import { queryKeys } from '@/services/query/queryKeys';
import { queryGcTimes, queryStaleTimes } from '@/services/query/queryOptions';

export function useSheetSageBackendAvailabilityQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.sheetSage.backendAvailability,
    queryFn: fetchSheetSageBackendAvailability,
    enabled,
    staleTime: queryStaleTimes.sheetSageBackend,
    gcTime: queryGcTimes.sheetSageBackend,
  });
}

export function useCachedSheetSageMelodyQuery(videoId: string, enabled: boolean) {
  const normalizedVideoId = videoId.trim();

  return useQuery({
    queryKey: queryKeys.sheetSage.cachedMelody(normalizedVideoId),
    queryFn: () => fetchCachedSheetSageMelody(normalizedVideoId),
    enabled: enabled && normalizedVideoId.length > 0,
    staleTime: queryStaleTimes.cachedMelody,
    gcTime: queryGcTimes.cachedMelody,
  });
}
