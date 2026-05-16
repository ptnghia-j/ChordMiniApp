import type { LyricsData } from '@/types/musicAiTypes';

export async function fetchCachedLyrics({
  videoId,
  audioUrl,
}: {
  videoId: string;
  audioUrl: string;
}): Promise<LyricsData | null> {
  const response = await fetch('/api/transcribe-lyrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      audioPath: audioUrl,
      forceRefresh: false,
      checkCacheOnly: true,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || 'Cached lyrics lookup failed');
  }

  return data?.success && data.lyrics?.lines?.length
    ? (data.lyrics as LyricsData)
    : null;
}
