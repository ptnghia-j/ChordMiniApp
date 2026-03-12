/**
 * Shared segmentation color utilities for consistent visualization across all grid components
 * This ensures that both ChordGrid and GuitarChordsTab display identical color-coded sections
 */

import { SegmentationResult } from '@/types/chatbotTypes';

/**
 * Segmentation styling for different segment types.
 * Keep both the raw accent color and the Tailwind cell class in one place so
 * section headers and beat cells stay visually aligned without duplicate maps.
 */
export const SEGMENTATION_STYLE_MAP: Record<string, { color: string; cellClassName: string }> = {
  'intro': {
    color: 'rgba(156, 163, 175, 0.3)',
    cellClassName: '!bg-gray-400/25 dark:!bg-gray-800/20'
  },
  'outro': {
    color: 'rgba(156, 163, 175, 0.3)',
    cellClassName: '!bg-gray-400/25 dark:!bg-gray-800/20'
  },
  'verse': {
    color: 'rgba(34, 197, 94, 0.3)',
    cellClassName: '!bg-green-500/25 dark:!bg-green-800/20'
  },
  'pre-chorus': {
    color: 'rgba(251, 146, 60, 0.3)',
    cellClassName: '!bg-orange-400/25 dark:!bg-orange-800/20'
  },
  'pre_chorus': {
    color: 'rgba(251, 146, 60, 0.3)',
    cellClassName: '!bg-orange-400/25 dark:!bg-orange-800/20'
  },
  'chorus': {
    color: 'rgba(244, 63, 94, 0.3)',
    cellClassName: '!bg-rose-500/25 dark:!bg-rose-800/20'
  },
  'bridge': {
    color: 'rgba(168, 85, 247, 0.3)',
    cellClassName: '!bg-violet-500/25 dark:!bg-violet-800/20'
  },
  'instrumental': {
    color: 'rgba(250, 204, 21, 0.3)',
    cellClassName: '!bg-yellow-400/30 dark:!bg-yellow-800/20'
  },
  'solo': {
    color: 'rgba(250, 204, 21, 0.3)',
    cellClassName: '!bg-yellow-400/30 dark:!bg-yellow-800/20'
  },
  'breakdown': {
    color: 'rgba(156, 163, 175, 0.2)',
    cellClassName: '!bg-gray-400/20 dark:!bg-gray-800/15'
  },
};

const DEFAULT_SEGMENTATION_STYLE = {
  color: 'rgba(156, 163, 175, 0.2)',
  cellClassName: '!bg-gray-400/20 dark:!bg-gray-400/15'
} as const;

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

const getSegmentForBeat = (
  beatIndex: number,
  beats: (number | null)[],
  segmentationData: SegmentationResult | null,
  showSegmentation: boolean,
  overrideTimestamp?: number | null
) => {
  if (!showSegmentation || !segmentationData?.segments) {
    return undefined;
  }

  const beatTimestamp = overrideTimestamp !== undefined ? overrideTimestamp : beats[beatIndex];
  if (typeof beatTimestamp !== 'number') {
    return undefined;
  }

  let segment = segmentationData.segments.find(seg =>
    beatTimestamp >= seg.startTime && beatTimestamp < seg.endTime
  );

  if (!segment && segmentationData.segments.length > 0) {
    const lastSegment = segmentationData.segments[segmentationData.segments.length - 1];
    if (beatTimestamp >= lastSegment.startTime && beatTimestamp <= lastSegment.endTime + 1) {
      segment = lastSegment;
    }

    if (!segment) {
      const firstSegment = segmentationData.segments[0];
      if (beatTimestamp >= firstSegment.startTime - 1 && beatTimestamp < firstSegment.endTime) {
        segment = firstSegment;
      }
    }
  }

  return segment;
};

/**
 * Get segmentation color for a specific segment type
 * Normalizes the segment type to handle variations in naming
 */
export const getSegmentationColor = (segmentType: string): string => {
  const normalizedType = extractBaseSegmentType(segmentType);
  return SEGMENTATION_STYLE_MAP[normalizedType]?.color || DEFAULT_SEGMENTATION_STYLE.color;
};

export const getSegmentationCellClassName = (segmentType: string): string => {
  const normalizedType = extractBaseSegmentType(segmentType);
  return SEGMENTATION_STYLE_MAP[normalizedType]?.cellClassName || DEFAULT_SEGMENTATION_STYLE.cellClassName;
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
  const segment = getSegmentForBeat(beatIndex, beats, segmentationData, showSegmentation, overrideTimestamp);

  return segment ? getSegmentationColor(segment.label || segment.type || 'unknown') : undefined;
};

export const getSegmentationCellClassNameForBeat = (
  beatIndex: number,
  beats: (number | null)[],
  segmentationData: SegmentationResult | null,
  showSegmentation: boolean,
  overrideTimestamp?: number | null
): string | undefined => {
  const segment = getSegmentForBeat(beatIndex, beats, segmentationData, showSegmentation, overrideTimestamp);

  return segment ? getSegmentationCellClassName(segment.label || segment.type || 'unknown') : undefined;
};

/**
 * Color legend data for UI components
 * Used for tooltips, legends, and documentation
 */
export const SEGMENTATION_COLOR_LEGEND = [
  { type: 'Intro/Outro', color: SEGMENTATION_STYLE_MAP.intro.color },
  { type: 'Verse', color: SEGMENTATION_STYLE_MAP.verse.color },
  { type: 'Pre-Chorus', color: SEGMENTATION_STYLE_MAP['pre-chorus'].color },
  { type: 'Chorus', color: SEGMENTATION_STYLE_MAP.chorus.color },
  { type: 'Bridge', color: SEGMENTATION_STYLE_MAP.bridge.color },
  { type: 'Instrumental', color: SEGMENTATION_STYLE_MAP.instrumental.color },
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
