/**
 * SongFormer segmentation normalization helpers.
 *
 * The segmentation backend now runs entirely on SongFormer. This module keeps
 * only the frontend-side normalization needed to adapt raw backend segments to
 * the app's UI schema.
 */

import { SegmentationResult, SongContext, SongSegment } from '@/types/chatbotTypes';

type RawSegmentationSegment = Partial<SongSegment> & {
  start?: number | string;
  end?: number | string;
  label?: string;
};

const FALLBACK_SEGMENT_TYPES = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'instrumental', 'solo', 'breakdown'] as const;

function clampTime(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), duration);
}

function parseBoundary(value: number | string | undefined, fallback: number, duration: number): number {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : value;
  return clampTime(typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : fallback, duration);
}

function getEffectiveDuration(songContext: Partial<SongContext>): number {
  const durationCandidates = [
    typeof songContext.duration === 'number' ? songContext.duration : undefined,
    songContext.chords?.reduce((max, chord) => Math.max(max, chord.end || 0), 0),
    songContext.lyrics?.lines?.reduce((max, line) => Math.max(max, line.endTime || 0), 0),
    songContext.beats?.reduce((max, beat) => Math.max(max, typeof beat === 'number' ? beat : beat.time || 0), 0),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  return durationCandidates.length > 0 ? Math.max(...durationCandidates) : 0;
}

function toSegmentType(label?: string, fallbackIndex = 0): SongSegment['type'] {
  const normalized = label?.trim().toLowerCase();
  const matched = FALLBACK_SEGMENT_TYPES.find((type) => normalized?.includes(type));
  return matched || FALLBACK_SEGMENT_TYPES[fallbackIndex % FALLBACK_SEGMENT_TYPES.length];
}

function toDisplayLabel(type: SongSegment['type']): string {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mergeAdjacentSegments(segments: SongSegment[]): SongSegment[] {
  return segments.reduce<SongSegment[]>((merged, segment) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.type === segment.type &&
      (previous.label || previous.type) === (segment.label || segment.type) &&
      Math.abs(previous.endTime - segment.startTime) < 0.05
    ) {
      previous.endTime = segment.endTime;
      return merged;
    }

    merged.push({ ...segment });
    return merged;
  }, []);
}

function normalizeSegments(
  rawSegments: RawSegmentationSegment[],
  songContext: Partial<SongContext>,
  confidence = 0.78,
): SongSegment[] {
  const duration = getEffectiveDuration(songContext);
  if (duration <= 0) return [];

  const normalized = rawSegments
    .map((segment, index): SongSegment | null => {
      const rawStart = segment.startTime ?? segment.start;
      const rawEnd = segment.endTime ?? segment.end;
      const label = segment.label?.trim() || undefined;
      const type = segment.type || toSegmentType(label, index);

      const startTime = parseBoundary(rawStart, 0, duration);
      const fallbackEnd = index < rawSegments.length - 1
        ? parseBoundary(rawSegments[index + 1]?.startTime ?? rawSegments[index + 1]?.start, duration, duration)
        : duration;
      const endTime = parseBoundary(rawEnd, fallbackEnd, duration);

      if (endTime <= startTime) return null;

      return {
        type,
        startTime,
        endTime,
        confidence: segment.confidence ?? confidence,
        label: label || toDisplayLabel(type),
      };
    })
    .filter((segment): segment is SongSegment => segment !== null)
    .sort((a, b) => a.startTime - b.startTime);

  if (normalized.length === 0) {
    return [{
      type: 'intro',
      startTime: 0,
      endTime: duration,
      confidence,
      label: 'Full Song',
    }];
  }

  const gapFilled: SongSegment[] = [];
  let cursor = 0;

  normalized.forEach((segment, index) => {
    if (segment.startTime > cursor + 0.05) {
      gapFilled.push({
        type: index === 0 ? 'intro' : segment.type,
        startTime: cursor,
        endTime: segment.startTime,
        confidence: Math.min(segment.confidence ?? confidence, confidence),
        label: index === 0 ? 'Intro' : segment.label,
      });
    }

    segment.startTime = Math.min(segment.startTime, duration);
    segment.endTime = Math.min(segment.endTime, duration);
    cursor = Math.max(cursor, segment.endTime);
    gapFilled.push(segment);
  });

  if (cursor < duration) {
    const last = gapFilled[gapFilled.length - 1];
    if (last) {
      last.endTime = duration;
    }
  }

  return mergeAdjacentSegments(gapFilled);
}

function buildSegmentationResult(
  segments: SongSegment[],
  songContext: Partial<SongContext>,
  analysis: SegmentationResult['analysis'],
  model: string,
): SegmentationResult {
  return {
    segments,
    analysis,
    metadata: {
      totalDuration: getEffectiveDuration(songContext),
      analysisTimestamp: Date.now(),
      model,
    },
  };
}

export function normalizeSongFormerSegmentation(
  rawSegments: RawSegmentationSegment[],
  songContext: SongContext,
  model = 'songformer',
): SegmentationResult {
  const segments = normalizeSegments(
    rawSegments,
    songContext,
    0.78,
  );

  const structure = segments.map((segment) => segment.label || toDisplayLabel(segment.type)).join(' → ');

  return buildSegmentationResult(segments, songContext, {
    structure,
    tempo: songContext.bpm,
    timeSignature: songContext.time_signature,
    coverageCheck: `Complete coverage: ${segments.length} segments covering 0-${getEffectiveDuration(songContext).toFixed(2)}s`,
  }, model);
}