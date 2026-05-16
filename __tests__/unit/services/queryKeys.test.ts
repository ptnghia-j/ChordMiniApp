import { createQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/services/query/queryKeys';
import { queryGcTimes, queryStaleTimes } from '@/services/query/queryOptions';

describe('TanStack Query configuration', () => {
  it('builds stable query keys for shared server-state reads', () => {
    expect(queryKeys.modelInfo).toEqual(['model-info']);
    expect(queryKeys.recentVideos.list('C major', 12)).toEqual([
      'recent-videos',
      { selectedKey: 'C major', pageSize: 12 },
    ]);
    expect(queryKeys.sheetSage.cachedMelody('abc123')).toEqual([
      'sheetsage',
      'cached-melody',
      'abc123',
    ]);
    expect(queryKeys.lyrics.cached('video-1', 'https://cdn.example/audio.mp3')).toEqual([
      'lyrics',
      'cached',
      'video-1',
      'https://cdn.example/audio.mp3',
    ]);
  });

  it('uses conservative query client defaults', () => {
    const queryClient = createQueryClient();
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.gcTime).toBe(10 * 60 * 1000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('declares explicit stale and garbage collection windows for migrated reads', () => {
    expect(queryStaleTimes.modelInfo).toBe(5 * 60 * 1000);
    expect(queryStaleTimes.recentVideos).toBe(15 * 60 * 1000);
    expect(queryStaleTimes.cachedLyrics).toBe(2 * 60 * 1000);
    expect(queryGcTimes.recentVideos).toBe(6 * 60 * 60 * 1000);
    expect(queryGcTimes.transcriptionDetail).toBe(12 * 60 * 60 * 1000);
  });
});
