import { getBrowserQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/services/query/queryKeys';

function getClientIfAvailable() {
  if (typeof window === 'undefined') {
    return null;
  }

  return getBrowserQueryClient();
}

export function invalidateRecentVideosQueries(): void {
  const queryClient = getClientIfAvailable();
  if (!queryClient) return;

  void queryClient.invalidateQueries({ queryKey: queryKeys.recentVideos.all });
}

export function invalidateTranscriptionQueries(
  videoId: string,
  beatModel: string,
  chordModel: string,
): void {
  const queryClient = getClientIfAvailable();
  if (!queryClient) return;

  void queryClient.invalidateQueries({
    queryKey: queryKeys.transcriptions.detail(videoId, beatModel, chordModel),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.recentVideos.all });
}

export function invalidateSheetSageMelodyQuery(videoId: string): void {
  const queryClient = getClientIfAvailable();
  if (!queryClient) return;

  void queryClient.invalidateQueries({
    queryKey: queryKeys.sheetSage.cachedMelody(videoId),
  });
}
