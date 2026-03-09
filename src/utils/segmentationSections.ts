import { SegmentationResult, SongSegment } from '@/types/chatbotTypes';

function normalizeSegmentDescriptor(segment: SongSegment): string {
  return `${segment.label || ''} ${segment.type || ''}`.trim().toLowerCase();
}

export function isInstrumentalLikeSegment(segment: SongSegment): boolean {
  const descriptor = normalizeSegmentDescriptor(segment);

  return descriptor.includes('intro') ||
    descriptor.includes('outro') ||
    descriptor.includes('instrumental') ||
    descriptor.includes('solo') ||
    (descriptor.includes('bridge') && !descriptor.includes('vocal'));
}

export function getActiveSegmentationSegment(
  segmentationData: SegmentationResult | null | undefined,
  timeInSeconds: number,
): SongSegment | null {
  if (!segmentationData?.segments?.length) {
    return null;
  }

  return segmentationData.segments.find(
    segment => timeInSeconds >= segment.startTime && timeInSeconds < segment.endTime,
  ) || null;
}

export function isInstrumentalTime(
  segmentationData: SegmentationResult | null | undefined,
  timeInSeconds: number,
): boolean {
  const activeSegment = getActiveSegmentationSegment(segmentationData, timeInSeconds);
  return activeSegment ? isInstrumentalLikeSegment(activeSegment) : false;
}