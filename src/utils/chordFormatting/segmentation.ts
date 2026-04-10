import { SegmentationResult } from '@/types/chatbotTypes';
import { getSegmentationCellClassNameForBeat, getSegmentationColorForBeat } from '@/utils/segmentationColors';

/**
 * Gets segmentation color for a specific beat index
 */
export const getSegmentationColorForBeatIndex = (
  beatIndex: number,
  beats: (number | null)[],
  segmentationData: SegmentationResult | null,
  showSegmentation: boolean,
  originalAudioMapping?: Array<{ visualIndex: number; timestamp: number }>,
  timestamp?: number | null
): string | undefined => {
  // Try to get timestamp from originalAudioMapping first for accuracy
  let finalTimestamp: number | null = timestamp || null;

  if (originalAudioMapping && finalTimestamp === null) {
    const mappingEntry = originalAudioMapping.find(item => item.visualIndex === beatIndex);
    if (mappingEntry) {
      finalTimestamp = mappingEntry.timestamp;
    }
  }

  // Fallback to beats array if no mapping found
  if (finalTimestamp === null) {
    finalTimestamp = beats[beatIndex];
  }

  // Use the enhanced segmentation function with direct timestamp
  return getSegmentationColorForBeat(beatIndex, beats, segmentationData, showSegmentation, finalTimestamp);
};

export const getSegmentationCellClassNameForBeatIndex = (
  beatIndex: number,
  beats: (number | null)[],
  segmentationData: SegmentationResult | null,
  showSegmentation: boolean,
  originalAudioMapping?: Array<{ visualIndex: number; timestamp: number }>,
  timestamp?: number | null
): string | undefined => {
  let finalTimestamp: number | null = timestamp || null;

  if (originalAudioMapping && finalTimestamp === null) {
    const mappingEntry = originalAudioMapping.find(item => item.visualIndex === beatIndex);
    if (mappingEntry) {
      finalTimestamp = mappingEntry.timestamp;
    }
  }

  if (finalTimestamp === null) {
    finalTimestamp = beats[beatIndex];
  }

  return getSegmentationCellClassNameForBeat(beatIndex, beats, segmentationData, showSegmentation, finalTimestamp);
};
