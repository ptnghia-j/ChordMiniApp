import type { SegmentationResult, SongSegment } from '@/types/chatbotTypes';

export function hashPatternSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getActiveSegmentationSegmentForTime(
  segmentationData: SegmentationResult | null | undefined,
  timeInSeconds: number,
): SongSegment | null {
  if (!segmentationData?.segments?.length) {
    return null;
  }

  const segments = segmentationData.segments;
  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const segment = segments[mid];

    if (timeInSeconds < segment.startTime) {
      hi = mid - 1;
    } else if (timeInSeconds >= segment.endTime) {
      lo = mid + 1;
    } else {
      return segment;
    }
  }

  return null;
}

export function isSparsePianoSegment(segment: SongSegment | null): boolean {
  if (!segment) {
    return false;
  }

  const descriptor = `${segment.label || ''} ${segment.type || ''}`.trim().toLowerCase();
  return descriptor.includes('intro') || descriptor.includes('outro');
}
