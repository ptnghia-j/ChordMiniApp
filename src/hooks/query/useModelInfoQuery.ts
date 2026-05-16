import { useQuery } from '@tanstack/react-query';
import {
  fetchModelInfoPayload,
  ModelInfoPayload,
} from '@/services/query/modelInfo';
import { queryKeys } from '@/services/query/queryKeys';
import { queryGcTimes, queryStaleTimes } from '@/services/query/queryOptions';

export function useModelInfoQuery<TData = ModelInfoPayload>(options: {
  enabled?: boolean;
  select?: (data: ModelInfoPayload) => TData;
} = {}) {
  return useQuery<ModelInfoPayload, Error, TData>({
    queryKey: queryKeys.modelInfo,
    queryFn: fetchModelInfoPayload,
    staleTime: queryStaleTimes.modelInfo,
    gcTime: queryGcTimes.modelInfo,
    enabled: options.enabled ?? true,
    select: options.select,
  });
}
