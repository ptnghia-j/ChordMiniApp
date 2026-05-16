import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import {
  createInitialRecentVideosPageParam,
  fetchRecentVideosPage,
  RECENT_VIDEOS_PAGE_SIZE,
  RecentVideosPage,
  RecentVideosPageParam,
} from '@/services/query/recentVideos';
import { queryKeys } from '@/services/query/queryKeys';
import { queryGcTimes, queryStaleTimes } from '@/services/query/queryOptions';

export function useRecentVideosQuery({
  selectedKey,
  enabled,
  pageSize = RECENT_VIDEOS_PAGE_SIZE,
}: {
  selectedKey: string;
  enabled: boolean;
  pageSize?: number;
}) {
  return useInfiniteQuery<RecentVideosPage, Error, InfiniteData<RecentVideosPage>, ReturnType<typeof queryKeys.recentVideos.list>, RecentVideosPageParam>({
    queryKey: queryKeys.recentVideos.list(selectedKey, pageSize),
    queryFn: ({ pageParam }) => fetchRecentVideosPage({
      selectedKey,
      pageParam,
      pageSize,
    }),
    initialPageParam: createInitialRecentVideosPageParam(),
    enabled,
    staleTime: queryStaleTimes.recentVideos,
    gcTime: queryGcTimes.recentVideos,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) {
        return undefined;
      }

      return {
        cursor: lastPage.lastVisible,
        mode: lastPage.queryMode,
        existingVideoIds: allPages.flatMap((page) => page.videos.map((video) => video.videoId)),
      };
    },
  });
}
