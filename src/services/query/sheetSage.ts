import type { SheetSageResult } from '@/types/sheetSage';
import { getCachedSheetSageMelody } from '@/services/sheetsage/sheetSageCacheClient';

export interface SheetSageBackendAvailability {
  available: boolean;
  error: string | null;
}

export async function fetchSheetSageBackendAvailability(): Promise<SheetSageBackendAvailability> {
  const response = await fetch('/api/transcribe-sheetsage?health=1', {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  const available = Boolean(payload?.available);
  return {
    available,
    error: available ? null : (payload?.error || 'Sheet Sage backend unavailable.'),
  };
}

export async function fetchCachedSheetSageMelody(videoId: string): Promise<SheetSageResult | null> {
  return getCachedSheetSageMelody(videoId);
}
