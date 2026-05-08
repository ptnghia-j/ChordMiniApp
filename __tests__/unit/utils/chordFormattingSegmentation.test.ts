import { SegmentationResult } from '@/types/chatbotTypes';
import {
  getSegmentationColorForBeatIndex,
  getSegmentationCellClassNameForBeatIndex,
} from '@/utils/chordFormatting/segmentation';

// Helper to build a minimal SegmentationResult
const makeSegData = (
  segments: Array<{ type: string; startTime: number; endTime: number; label?: string }>
): SegmentationResult => ({
  segments: segments.map(s => ({
    type: s.type,
    startTime: s.startTime,
    endTime: s.endTime,
    ...(s.label ? { label: s.label } : {}),
  })),
  analysis: { structure: '' },
  metadata: { totalDuration: 100, analysisTimestamp: 0, model: 'test' },
});

const beats: (number | null)[] = [0, 2, 5, 10, null];

const segData = makeSegData([
  { type: 'verse', startTime: 0, endTime: 4 },
  { type: 'chorus', startTime: 4, endTime: 8 },
  { type: 'bridge', startTime: 8, endTime: 12 },
]);

// ────────────────────────────────────────────────────────────────
// getSegmentationColorForBeatIndex
// ────────────────────────────────────────────────────────────────
describe('getSegmentationColorForBeatIndex', () => {
  it('returns undefined when showSegmentation is false', () => {
    expect(getSegmentationColorForBeatIndex(0, beats, segData, false)).toBeUndefined();
  });

  it('returns undefined when segmentationData is null', () => {
    expect(getSegmentationColorForBeatIndex(0, beats, null, true)).toBeUndefined();
  });

  it('returns a color string for a beat within a segment', () => {
    const color = getSegmentationColorForBeatIndex(0, beats, segData, true);
    expect(color).toBeDefined();
    expect(typeof color).toBe('string');
    expect(color).toContain('rgba');
  });

  it('returns different colors for beats in different segments', () => {
    const verseColor = getSegmentationColorForBeatIndex(0, beats, segData, true);
    const chorusColor = getSegmentationColorForBeatIndex(2, beats, segData, true);
    expect(verseColor).not.toEqual(chorusColor);
  });

  it('returns undefined for a beat index whose timestamp is null', () => {
    expect(getSegmentationColorForBeatIndex(4, beats, segData, true)).toBeUndefined();
  });

  // Branch: explicit timestamp parameter takes precedence
  it('uses the provided timestamp parameter over beats array', () => {
    // beatIndex 0 has timestamp 0 (verse), but we pass timestamp 5 (chorus)
    const color = getSegmentationColorForBeatIndex(0, beats, segData, true, undefined, 5);
    const chorusColor = getSegmentationColorForBeatIndex(2, beats, segData, true);
    expect(color).toEqual(chorusColor);
  });

  // Branch: originalAudioMapping is provided and finalTimestamp is null
  it('resolves timestamp from originalAudioMapping when timestamp param is absent', () => {
    const mapping = [
      { visualIndex: 0, timestamp: 5 },  // maps beat 0 to timestamp 5 (chorus range)
    ];
    const color = getSegmentationColorForBeatIndex(0, beats, segData, true, mapping);
    const chorusColor = getSegmentationColorForBeatIndex(2, beats, segData, true);
    expect(color).toEqual(chorusColor);
  });

  it('falls back to beats array when mapping has no entry for beatIndex', () => {
    const mapping = [
      { visualIndex: 99, timestamp: 5 }, // no entry for beatIndex 0
    ];
    const color = getSegmentationColorForBeatIndex(0, beats, segData, true, mapping);
    // beatIndex 0 => beats[0] = 0 => verse
    const verseColor = getSegmentationColorForBeatIndex(0, beats, segData, true);
    expect(color).toEqual(verseColor);
  });

  // Branch: timestamp 0 is falsy, so `timestamp || null` falls back to beats array
  it('falls back to beats array when timestamp is 0 (falsy)', () => {
    // timestamp=0 is falsy, so the code uses beats[3]=10 => bridge segment
    const color = getSegmentationColorForBeatIndex(3, beats, segData, true, undefined, 0);
    const bridgeColor = getSegmentationColorForBeatIndex(3, beats, segData, true);
    expect(color).toEqual(bridgeColor);
  });

  // Branch: empty beats array
  it('returns undefined for beat index out of bounds in beats array', () => {
    expect(getSegmentationColorForBeatIndex(10, [], segData, true)).toBeUndefined();
  });

  // Branch: segmentation with empty segments array
  it('returns undefined when segmentationData has empty segments', () => {
    const emptySegData = makeSegData([]);
    expect(getSegmentationColorForBeatIndex(0, beats, emptySegData, true)).toBeUndefined();
  });

  // Branch: timestamp provided via param is explicitly null
  it('ignores null timestamp param and falls back to beats/mapping', () => {
    const color = getSegmentationColorForBeatIndex(0, beats, segData, true, undefined, null);
    // Should fall back to beats[0] = 0 => verse
    const verseColor = getSegmentationColorForBeatIndex(0, beats, segData, true);
    expect(color).toEqual(verseColor);
  });

  // Branch: originalAudioMapping provided but timestamp is also provided (non-null)
  it('prefers timestamp param over originalAudioMapping', () => {
    const mapping = [{ visualIndex: 0, timestamp: 10 }]; // bridge
    // timestamp param = 5 => chorus
    const color = getSegmentationColorForBeatIndex(0, beats, segData, true, mapping, 5);
    const chorusColor = getSegmentationColorForBeatIndex(2, beats, segData, true);
    expect(color).toEqual(chorusColor);
  });
});

// ────────────────────────────────────────────────────────────────
// getSegmentationCellClassNameForBeatIndex
// ────────────────────────────────────────────────────────────────
describe('getSegmentationCellClassNameForBeatIndex', () => {
  it('returns undefined when showSegmentation is false', () => {
    expect(getSegmentationCellClassNameForBeatIndex(0, beats, segData, false)).toBeUndefined();
  });

  it('returns undefined when segmentationData is null', () => {
    expect(getSegmentationCellClassNameForBeatIndex(0, beats, null, true)).toBeUndefined();
  });

  it('returns a class name string for a beat within a segment', () => {
    const className = getSegmentationCellClassNameForBeatIndex(0, beats, segData, true);
    expect(className).toBeDefined();
    expect(typeof className).toBe('string');
    expect(className!.length).toBeGreaterThan(0);
  });

  it('returns different classNames for beats in different segments', () => {
    const verseClass = getSegmentationCellClassNameForBeatIndex(0, beats, segData, true);
    const chorusClass = getSegmentationCellClassNameForBeatIndex(2, beats, segData, true);
    expect(verseClass).not.toEqual(chorusClass);
  });

  it('returns undefined for a beat with null timestamp', () => {
    expect(getSegmentationCellClassNameForBeatIndex(4, beats, segData, true)).toBeUndefined();
  });

  // Branch: timestamp param provided
  it('uses provided timestamp param', () => {
    const className = getSegmentationCellClassNameForBeatIndex(0, beats, segData, true, undefined, 5);
    const chorusClass = getSegmentationCellClassNameForBeatIndex(2, beats, segData, true);
    expect(className).toEqual(chorusClass);
  });

  // Branch: originalAudioMapping
  it('resolves from originalAudioMapping when no timestamp param', () => {
    const mapping = [{ visualIndex: 0, timestamp: 10 }]; // bridge
    const className = getSegmentationCellClassNameForBeatIndex(0, beats, segData, true, mapping);
    const bridgeClass = getSegmentationCellClassNameForBeatIndex(3, beats, segData, true);
    expect(className).toEqual(bridgeClass);
  });

  // Branch: mapping entry not found, falls back to beats
  it('falls back to beats when mapping has no matching entry', () => {
    const mapping = [{ visualIndex: 99, timestamp: 10 }];
    const className = getSegmentationCellClassNameForBeatIndex(0, beats, segData, true, mapping);
    const verseClass = getSegmentationCellClassNameForBeatIndex(0, beats, segData, true);
    expect(className).toEqual(verseClass);
  });

  // Branch: empty segments
  it('returns undefined for empty segments array', () => {
    const emptySegData = makeSegData([]);
    expect(getSegmentationCellClassNameForBeatIndex(0, beats, emptySegData, true)).toBeUndefined();
  });

  // Edge: single segment
  it('works with a single segment', () => {
    const singleSeg = makeSegData([{ type: 'intro', startTime: 0, endTime: 100 }]);
    const className = getSegmentationCellClassNameForBeatIndex(0, beats, singleSeg, true);
    expect(className).toBeDefined();
    expect(typeof className).toBe('string');
  });
});
