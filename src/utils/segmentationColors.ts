/**
 * Shared segmentation color utilities for consistent visualization across all grid components
 * This ensures that both ChordGrid and GuitarChordsTab display identical color-coded sections
 */

import { SegmentationResult } from '@/types/chatbotTypes';

/**
 * Color mapping for different segment types
 * Uses light, semi-transparent colors that work well with existing UI
 * Avoids blue colors to prevent conflicts with beat animation colors
 */
export const SEGMENTATION_COLOR_MAP: Record<string, string> = {
  'intro': 'rgba(156, 163, 175, 0.3)', // Light gray
  'outro': 'rgba(156, 163, 175, 0.3)', // Light gray
  'verse': 'rgba(34, 197, 94, 0.3)', // Light green
  'pre-chorus': 'rgba(251, 146, 60, 0.3)', // Light orange
  'pre_chorus': 'rgba(251, 146, 60, 0.3)', // Light orange (alternative naming)
  'chorus': 'rgba(244, 63, 94, 0.3)', // Light red/pink
  'bridge': 'rgba(168, 85, 247, 0.3)', // Light purple
  'instrumental': 'rgba(250, 204, 21, 0.3)', // Light yellow
  'solo': 'rgba(250, 204, 21, 0.3)', // Light yellow (alternative for instrumental)
  'breakdown': 'rgba(156, 163, 175, 0.2)', // Light gray (alternative)
};

/**
 * Extract base segment type from labels that may contain qualifiers
 * Examples: "Verse 2 (Inferred)" -> "verse", "Chorus 1" -> "chorus", "Pre-Chorus" -> "pre-chorus"
 */
const extractBaseSegmentType = (segmentType: string): string => {
  const normalized = segmentType.toLowerCase();

  // Remove common qualifiers and numbers
  const cleaned = normalized
    .replace(/\s*\(.*?\)/g, '') // Remove parenthetical qualifiers like "(inferred)", "(assumed)"
    .replace(/\s*\d+/g, '') // Remove numbers like "1", "2"
    .replace(/\s+/g, '-') // Replace spaces with hyphens for consistency
    .trim();

  // Handle common variations
  if (cleaned.includes('pre') && cleaned.includes('chorus')) {
    return 'pre-chorus';
  }
  if (cleaned.includes('verse')) {
    return 'verse';
  }
  if (cleaned.includes('chorus')) {
    return 'chorus';
  }
  if (cleaned.includes('bridge')) {
    return 'bridge';
  }
  if (cleaned.includes('intro')) {
    return 'intro';
  }
  if (cleaned.includes('outro')) {
    return 'outro';
  }
  if (cleaned.includes('instrumental') || cleaned.includes('solo')) {
    return 'instrumental';
  }
  if (cleaned.includes('breakdown')) {
    return 'breakdown';
  }

  return cleaned;
};

/**
 * Get segmentation color for a specific segment type
 * Normalizes the segment type to handle variations in naming
 */
export const getSegmentationColor = (segmentType: string): string => {
  const normalizedType = extractBaseSegmentType(segmentType);
  return SEGMENTATION_COLOR_MAP[normalizedType] || 'rgba(156, 163, 175, 0.2)'; // Default light gray
};

/**
 * Get segmentation color for a specific beat index
 * This is the main function used by grid components to determine cell colors
 */
export const getSegmentationColorForBeat = (
  beatIndex: number,
  beats: (number | null)[],
  segmentationData: SegmentationResult | null,
  showSegmentation: boolean,
  overrideTimestamp?: number | null
): string | undefined => {
  if (!showSegmentation || !segmentationData?.segments) {
    return undefined;
  }

  // Use override timestamp if provided, otherwise fall back to beats array
  const beatTimestamp = overrideTimestamp !== undefined ? overrideTimestamp : beats[beatIndex];
  if (typeof beatTimestamp !== 'number') {
    return undefined;
  }

  // Find the segment that contains this timestamp
  let segment = segmentationData.segments.find(seg =>
    beatTimestamp >= seg.startTime && beatTimestamp < seg.endTime
  );

  // If no exact match found, try to find the closest segment for better coverage
  if (!segment && segmentationData.segments.length > 0) {
    // For timestamps at the very end, use the last segment if it's close
    const lastSegment = segmentationData.segments[segmentationData.segments.length - 1];
    if (beatTimestamp >= lastSegment.startTime && beatTimestamp <= lastSegment.endTime + 1) {
      segment = lastSegment;
    }

    // For timestamps at the very beginning, use the first segment if it's close
    if (!segment) {
      const firstSegment = segmentationData.segments[0];
      if (beatTimestamp >= firstSegment.startTime - 1 && beatTimestamp < firstSegment.endTime) {
        segment = firstSegment;
      }
    }
  }

  return segment ? getSegmentationColor(segment.label || segment.type || 'unknown') : undefined;
};

/**
 * Color legend data for UI components
 * Used for tooltips, legends, and documentation
 */
export const SEGMENTATION_COLOR_LEGEND = [
  { type: 'Intro/Outro', color: 'rgba(156, 163, 175, 0.3)' },
  { type: 'Verse', color: 'rgba(34, 197, 94, 0.3)' },
  { type: 'Pre-Chorus', color: 'rgba(251, 146, 60, 0.3)' },
  { type: 'Chorus', color: 'rgba(244, 63, 94, 0.3)' },
  { type: 'Bridge', color: 'rgba(168, 85, 247, 0.3)' },
  { type: 'Instrumental', color: 'rgba(250, 204, 21, 0.3)' },
] as const;

/**
 * Validate segmentation data structure
 * Ensures the data is properly formatted before use
 */
export const validateSegmentationData = (data: SegmentationResult | null): boolean => {
  if (!data || !data.segments || !Array.isArray(data.segments)) {
    return false;
  }

  return data.segments.every(segment => 
    typeof segment.startTime === 'number' &&
    typeof segment.endTime === 'number' &&
    segment.startTime < segment.endTime &&
    (segment.type || segment.label)
  );
};

/**
 * Get all unique segment types from segmentation data
 * Useful for generating dynamic legends or validation
 */
export const getUniqueSegmentTypes = (segmentationData: SegmentationResult | null): string[] => {
  if (!validateSegmentationData(segmentationData)) {
    return [];
  }

  const types = new Set<string>();
  segmentationData!.segments.forEach(segment => {
    const type = segment.label || segment.type || 'unknown';
    types.add(type);
  });

  return Array.from(types).sort();
};
