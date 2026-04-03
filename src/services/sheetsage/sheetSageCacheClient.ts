import type { SheetSageResult } from '@/types/sheetSage';

export async function getCachedSheetSageMelody(
  videoId: string,
): Promise<SheetSageResult | null> {
  const response = await fetch(`/api/melody-cache?videoId=${encodeURIComponent(videoId)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load cached melody transcription');
  }

  return payload?.cached ? (payload.data as SheetSageResult) : null;
}
