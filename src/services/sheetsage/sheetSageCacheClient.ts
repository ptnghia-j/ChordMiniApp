import type { SheetSageResult } from '@/types/sheetSage';

const SHEETSAGE_CACHE_TTL_MS = 30_000;

const cachedMelodyByVideoId = new Map<string, {
  expiresAt: number;
  value: SheetSageResult | null;
}>();
const inFlightMelodyByVideoId = new Map<string, Promise<SheetSageResult | null>>();

export async function getCachedSheetSageMelody(
  videoId: string,
): Promise<SheetSageResult | null> {
  const normalizedVideoId = videoId.trim();
  if (!normalizedVideoId) return null;

  const now = Date.now();
  const cached = cachedMelodyByVideoId.get(normalizedVideoId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = inFlightMelodyByVideoId.get(normalizedVideoId);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const response = await fetch(`/api/melody-cache?videoId=${encodeURIComponent(normalizedVideoId)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load cached melody transcription');
    }

    const value = payload?.cached ? (payload.data as SheetSageResult) : null;
    cachedMelodyByVideoId.set(normalizedVideoId, {
      expiresAt: Date.now() + SHEETSAGE_CACHE_TTL_MS,
      value,
    });
    return value;
  })();

  inFlightMelodyByVideoId.set(normalizedVideoId, request);
  try {
    return await request;
  } finally {
    inFlightMelodyByVideoId.delete(normalizedVideoId);
  }
}
