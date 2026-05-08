import { SegmentationResult } from '@/types/chatbotTypes';
import { buildSegmentedSectionBlocks, getVisibleCellsForSegmentedSlot, shouldRenderSegmentedSlotMeasureBar } from '@/utils/chordGridSegmentationLayout';

describe('chordGridSegmentationLayout', () => {
  const segmentationData: SegmentationResult = {
    segments: [
      { type: 'intro', label: 'Intro', startTime: 0, endTime: 1.9, confidence: 0.9 },
      { type: 'verse', label: 'Verse 1', startTime: 2, endTime: 7.9, confidence: 0.9 },
    ],
    analysis: { structure: 'AB', tempo: 120, timeSignature: 4 },
    metadata: { totalDuration: 8, analysisTimestamp: Date.now(), model: 'test' },
  };

  it('breaks at the exact mid-measure segment change and preserves the beat column', () => {
    const blocks = buildSegmentedSectionBlocks([
      { measureNumber: 0, visualStartIndex: 0, chords: ['C', '', 'G', ''], beats: [0, 1, 2, 3] },
      { measureNumber: 1, visualStartIndex: 4, chords: ['Am', '', 'F', ''], beats: [4, 5, 6, 7] },
    ], 2, 4, segmentationData);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].label).toBe('Intro');
    expect(blocks[1].label).toBe('Verse 1');

    expect(blocks[0].rows).toHaveLength(1);
    expect(blocks[0].rows[0].slots[0].cells.map((cell) => cell?.globalIndex ?? null)).toEqual([0, 1, null, null]);

    expect(blocks[1].rows).toHaveLength(1);
    expect(blocks[1].rows[0].slots[0].cells.map((cell) => cell?.globalIndex ?? null)).toEqual([null, null, 2, 3]);
    expect(blocks[1].rows[0].slots[1].cells.map((cell) => cell?.globalIndex ?? null)).toEqual([4, 5, 6, 7]);
  });

  it('keeps a new section starting in measure two at the same absolute column', () => {
    const laterSegmentation: SegmentationResult = {
      ...segmentationData,
      segments: [
        { type: 'intro', label: 'Intro', startTime: 0, endTime: 4.9, confidence: 0.9 },
        { type: 'verse', label: 'Verse 1', startTime: 5, endTime: 7.9, confidence: 0.9 },
      ],
    };

    const blocks = buildSegmentedSectionBlocks([
      { measureNumber: 0, visualStartIndex: 0, chords: ['C', '', '', ''], beats: [0, 1, 2, 3] },
      { measureNumber: 1, visualStartIndex: 4, chords: ['G', 'Am', '', 'F'], beats: [4, 5, 6, 7] },
    ], 2, 4, laterSegmentation);

    expect(blocks).toHaveLength(2);
    expect(blocks[1].rows[0].slots[0].cells.map((cell) => cell?.globalIndex ?? null)).toEqual([null, null, null, null]);
    expect(blocks[1].rows[0].slots[1].cells.map((cell) => cell?.globalIndex ?? null)).toEqual([null, 5, 6, 7]);
  });

  it('omits placeholder cells while preserving the first visible column', () => {
    const blocks = buildSegmentedSectionBlocks([
      { measureNumber: 0, visualStartIndex: 0, chords: ['C', '', 'G', ''], beats: [0, 1, 2, 3] },
      { measureNumber: 1, visualStartIndex: 4, chords: ['Am', '', 'F', ''], beats: [4, 5, 6, 7] },
    ], 2, 4, segmentationData);

    const visibleCells = getVisibleCellsForSegmentedSlot(blocks[1].rows[0].slots[0].cells);

    expect(visibleCells.map(({ cell }) => cell.globalIndex)).toEqual([2, 3]);
    expect(visibleCells[0]?.gridColumnStart).toBe(3);
    expect(visibleCells[1]?.gridColumnStart).toBeUndefined();
  });

  it('assigns leading unlabeled pickup beats to the first real segment instead of fallback Section', () => {
    const delayedIntro: SegmentationResult = {
      ...segmentationData,
      segments: [
        { type: 'intro', label: 'Intro', startTime: 1, endTime: 3.9, confidence: 0.9 },
        { type: 'verse', label: 'Verse 1', startTime: 4, endTime: 7.9, confidence: 0.9 },
      ],
    };

    const blocks = buildSegmentedSectionBlocks([
      { measureNumber: 0, visualStartIndex: 0, chords: ['N.C.', '', 'C', ''], beats: [0, 0.5, 1, 1.5] },
      { measureNumber: 1, visualStartIndex: 4, chords: ['G', '', '', ''], beats: [4, 5, 6, 7] },
    ], 2, 4, delayedIntro);

    expect(blocks[0].label).toBe('Intro');
    expect(blocks.map((block) => block.label)).not.toContain('Section');
    expect(blocks[0].rows[0].slots[0].cells.map((cell) => cell?.globalIndex ?? null)).toEqual([0, 1, 2, 3]);
  });

  it('shows measure bars only when a slot starts with a real cell', () => {
    const blocks = buildSegmentedSectionBlocks([
      { measureNumber: 0, visualStartIndex: 0, chords: ['C', '', 'G', ''], beats: [0, 1, 2, 3] },
      { measureNumber: 1, visualStartIndex: 4, chords: ['Am', '', 'F', ''], beats: [4, 5, 6, 7] },
    ], 2, 4, segmentationData);

    expect(shouldRenderSegmentedSlotMeasureBar(blocks[1].rows[0].slots[0].cells)).toBe(false);
    expect(shouldRenderSegmentedSlotMeasureBar(blocks[1].rows[0].slots[1].cells)).toBe(true);
    expect(shouldRenderSegmentedSlotMeasureBar([null, null, null, null])).toBe(false);
  });
});