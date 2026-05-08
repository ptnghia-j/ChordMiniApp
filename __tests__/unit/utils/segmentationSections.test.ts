import {
  getActiveSegmentationSegment,
  isInstrumentalLikeSegment,
  isInstrumentalTime,
} from '@/utils/segmentationSections';
import type { SegmentationResult, SongSegment } from '@/types/chatbotTypes';

describe('segmentationSections', () => {
  const buildSegment = (overrides: Partial<SongSegment>): SongSegment => ({
    type: 'verse',
    startTime: 0,
    endTime: 10,
    ...overrides,
  });

  const segmentationData: SegmentationResult = {
    segments: [
      buildSegment({ type: 'intro', startTime: 0, endTime: 5 }),
      buildSegment({ type: 'verse', startTime: 5, endTime: 10, label: 'Verse 1' }),
      buildSegment({ type: 'bridge', startTime: 10, endTime: 15 }),
      buildSegment({ type: 'bridge', startTime: 15, endTime: 20, label: 'Vocal Bridge' }),
    ],
    analysis: { structure: 'intro-verse-bridge', timeSignature: 4 },
    metadata: { totalDuration: 20, analysisTimestamp: 1, model: 'test-model' },
  };

  it('identifies instrumental-like descriptors from type and label', () => {
    expect(isInstrumentalLikeSegment(buildSegment({ type: 'intro' }))).toBe(true);
    expect(isInstrumentalLikeSegment(buildSegment({ type: 'solo' }))).toBe(true);
    expect(isInstrumentalLikeSegment(buildSegment({ type: 'bridge', label: 'Bridge' }))).toBe(true);
    expect(isInstrumentalLikeSegment(buildSegment({ type: 'bridge', label: 'Vocal Bridge' }))).toBe(false);
    expect(isInstrumentalLikeSegment(buildSegment({ type: 'verse', label: 'Verse 1' }))).toBe(false);
  });

  it('finds the active segment for a playback time and respects the end boundary', () => {
    expect(getActiveSegmentationSegment(segmentationData, 4.9)?.type).toBe('intro');
    expect(getActiveSegmentationSegment(segmentationData, 10)?.type).toBe('bridge');
    expect(getActiveSegmentationSegment(segmentationData, 20)).toBeNull();
    expect(getActiveSegmentationSegment(null, 2)).toBeNull();
  });

  it('detects instrumental playback windows from the active segment', () => {
    expect(isInstrumentalTime(segmentationData, 1)).toBe(true);
    expect(isInstrumentalTime(segmentationData, 7)).toBe(false);
    expect(isInstrumentalTime(segmentationData, 12)).toBe(true);
    expect(isInstrumentalTime(segmentationData, 17)).toBe(false);
  });
});
