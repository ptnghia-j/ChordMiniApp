/**
 * Unit Tests: segmentationColors
 *
 * Tests segment type extraction, color mapping, beat-based color lookup,
 * validation, and unique segment type enumeration.
 */

import {
  SEGMENTATION_STYLE_MAP,
  SEGMENTATION_COLOR_LEGEND,
  getSegmentationColor,
  getSegmentationCellClassName,
  getSegmentationColorForBeat,
  getSegmentationCellClassNameForBeat,
  validateSegmentationData,
  getUniqueSegmentTypes,
} from '@/utils/segmentationColors';
import { SegmentationResult } from '@/types/chatbotTypes';

describe('segmentationColors', () => {
  describe('getSegmentationColor', () => {
    it('returns correct colors for standard segment types', () => {
      expect(getSegmentationColor('verse')).toBe(SEGMENTATION_STYLE_MAP['verse'].color);
      expect(getSegmentationColor('chorus')).toBe(SEGMENTATION_STYLE_MAP['chorus'].color);
      expect(getSegmentationColor('bridge')).toBe(SEGMENTATION_STYLE_MAP['bridge'].color);
      expect(getSegmentationColor('intro')).toBe(SEGMENTATION_STYLE_MAP['intro'].color);
      expect(getSegmentationColor('outro')).toBe(SEGMENTATION_STYLE_MAP['outro'].color);
    });

    it('handles case-insensitive matching', () => {
      expect(getSegmentationColor('Verse')).toBe(SEGMENTATION_STYLE_MAP['verse'].color);
      expect(getSegmentationColor('CHORUS')).toBe(SEGMENTATION_STYLE_MAP['chorus'].color);
    });

    it('handles qualified labels (e.g., "Verse 2 (Inferred)")', () => {
      expect(getSegmentationColor('Verse 2 (Inferred)')).toBe(SEGMENTATION_STYLE_MAP['verse'].color);
      expect(getSegmentationColor('Chorus 1')).toBe(SEGMENTATION_STYLE_MAP['chorus'].color);
      expect(getSegmentationColor('Bridge (Inferred)')).toBe(SEGMENTATION_STYLE_MAP['bridge'].color);
      expect(getSegmentationColor('Chorus 3 (Final, Inferred)')).toBe(SEGMENTATION_STYLE_MAP['chorus'].color);
    });

    it('handles pre-chorus variants', () => {
      expect(getSegmentationColor('pre-chorus')).toBe(SEGMENTATION_STYLE_MAP['pre-chorus'].color);
      expect(getSegmentationColor('Pre Chorus')).toBe(SEGMENTATION_STYLE_MAP['pre-chorus'].color);
      expect(getSegmentationColor('pre_chorus')).toBe(SEGMENTATION_STYLE_MAP['pre-chorus'].color);
    });

    it('handles intro with qualifiers', () => {
      expect(getSegmentationColor('Intro (Zulu Chant)')).toBe(SEGMENTATION_STYLE_MAP['intro'].color);
    });

    it('returns default color for unknown segment types', () => {
      const defaultColor = 'rgba(156, 163, 175, 0.2)';
      expect(getSegmentationColor('Transition')).toBe(defaultColor);
      expect(getSegmentationColor('unknown')).toBe(defaultColor);
      expect(getSegmentationColor('custom part')).toBe(defaultColor);
    });
  });

  describe('getSegmentationCellClassName', () => {
    it('returns correct cell class names for standard segment types', () => {
      expect(getSegmentationCellClassName('verse')).toBe(SEGMENTATION_STYLE_MAP['verse'].cellClassName);
      expect(getSegmentationCellClassName('chorus')).toBe(SEGMENTATION_STYLE_MAP['chorus'].cellClassName);
      expect(getSegmentationCellClassName('bridge')).toBe(SEGMENTATION_STYLE_MAP['bridge'].cellClassName);
    });

    it('handles qualified labels for cell class names', () => {
      expect(getSegmentationCellClassName('Verse 2')).toBe(SEGMENTATION_STYLE_MAP['verse'].cellClassName);
      expect(getSegmentationCellClassName('Chorus 1')).toBe(SEGMENTATION_STYLE_MAP['chorus'].cellClassName);
    });

    it('returns default cell class name for unknown types', () => {
      const className = getSegmentationCellClassName('unknown');
      expect(className).toContain('backdrop-blur');
    });
  });

  describe('getSegmentationColorForBeat', () => {
    const mockSegmentation: SegmentationResult = {
      segments: [
        { type: 'intro', startTime: 0, endTime: 10, confidence: 0.9, label: 'Intro' },
        { type: 'verse', startTime: 10, endTime: 30, confidence: 0.8, label: 'Verse 1' },
        { type: 'chorus', startTime: 30, endTime: 50, confidence: 0.9, label: 'Chorus 1' },
      ],
      analysis: { structure: 'ABC', tempo: 120, timeSignature: 4 },
      metadata: { totalDuration: 50, analysisTimestamp: Date.now(), model: 'test' },
    };

    const beats = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as (number | null)[];

    it('returns correct color for beats within segments', () => {
      const introColor = getSegmentationColorForBeat(0, beats, mockSegmentation, true);
      expect(introColor).toBe(SEGMENTATION_STYLE_MAP['intro'].color);

      const verseColor = getSegmentationColorForBeat(3, beats, mockSegmentation, true);
      expect(verseColor).toBe(SEGMENTATION_STYLE_MAP['verse'].color);

      const chorusColor = getSegmentationColorForBeat(7, beats, mockSegmentation, true);
      expect(chorusColor).toBe(SEGMENTATION_STYLE_MAP['chorus'].color);
    });

    it('returns undefined when segmentation is disabled', () => {
      expect(getSegmentationColorForBeat(0, beats, mockSegmentation, false)).toBeUndefined();
    });

    it('returns undefined when segmentation data is null', () => {
      expect(getSegmentationColorForBeat(0, beats, null, true)).toBeUndefined();
    });

    it('handles null beat timestamps', () => {
      const beatsWithNull = [null, 5, null] as (number | null)[];
      expect(getSegmentationColorForBeat(0, beatsWithNull, mockSegmentation, true)).toBeUndefined();
    });

    it('handles override timestamps', () => {
      const color = getSegmentationColorForBeat(0, beats, mockSegmentation, true, 15);
      expect(color).toBe(SEGMENTATION_STYLE_MAP['verse'].color); // 15 falls in verse
    });
  });

  describe('getSegmentationCellClassNameForBeat', () => {
    const mockSegmentation: SegmentationResult = {
      segments: [
        { type: 'intro', startTime: 0, endTime: 10, confidence: 0.9, label: 'Intro' },
        { type: 'verse', startTime: 10, endTime: 30, confidence: 0.8, label: 'Verse 1' },
      ],
      analysis: { structure: 'AB', tempo: 120, timeSignature: 4 },
      metadata: { totalDuration: 30, analysisTimestamp: Date.now(), model: 'test' },
    };

    const beats = [0, 5, 10, 15, 20, 25] as (number | null)[];

    it('returns correct cell class name for beats within segments', () => {
      const introClass = getSegmentationCellClassNameForBeat(0, beats, mockSegmentation, true);
      expect(introClass).toBe(SEGMENTATION_STYLE_MAP['intro'].cellClassName);

      const verseClass = getSegmentationCellClassNameForBeat(3, beats, mockSegmentation, true);
      expect(verseClass).toBe(SEGMENTATION_STYLE_MAP['verse'].cellClassName);
    });

    it('returns undefined when segmentation is disabled', () => {
      expect(getSegmentationCellClassNameForBeat(0, beats, mockSegmentation, false)).toBeUndefined();
    });
  });

  describe('validateSegmentationData', () => {
    it('validates correct data', () => {
      const validData: SegmentationResult = {
        segments: [
          { type: 'verse', startTime: 0, endTime: 10, confidence: 0.9, label: 'Verse' },
        ],
        analysis: { structure: 'A', tempo: 120, timeSignature: 4 },
        metadata: { totalDuration: 10, analysisTimestamp: Date.now(), model: 'test' },
      };
      expect(validateSegmentationData(validData)).toBe(true);
    });

    it('rejects null data', () => {
      expect(validateSegmentationData(null)).toBe(false);
    });

    it('rejects data with invalid segments', () => {
      const invalidData: SegmentationResult = {
        segments: [
          { type: 'verse', startTime: 10, endTime: 5, confidence: 0.9, label: 'Verse' }, // start > end
        ],
        analysis: { structure: 'A', tempo: 120, timeSignature: 4 },
        metadata: { totalDuration: 10, analysisTimestamp: Date.now(), model: 'test' },
      };
      expect(validateSegmentationData(invalidData)).toBe(false);
    });
  });

  describe('getUniqueSegmentTypes', () => {
    it('returns unique segment labels', () => {
      const data: SegmentationResult = {
        segments: [
          { type: 'verse', startTime: 0, endTime: 10, confidence: 0.9, label: 'Verse 1' },
          { type: 'chorus', startTime: 10, endTime: 20, confidence: 0.9, label: 'Chorus 1' },
          { type: 'verse', startTime: 20, endTime: 30, confidence: 0.9, label: 'Verse 2' },
        ],
        analysis: { structure: 'ABA', tempo: 120, timeSignature: 4 },
        metadata: { totalDuration: 30, analysisTimestamp: Date.now(), model: 'test' },
      };

      const types = getUniqueSegmentTypes(data);
      expect(types).toContain('Verse 1');
      expect(types).toContain('Chorus 1');
      expect(types).toContain('Verse 2');
    });

    it('returns empty array for null data', () => {
      expect(getUniqueSegmentTypes(null)).toEqual([]);
    });
  });

  describe('SEGMENTATION_COLOR_LEGEND', () => {
    it('contains all main segment types', () => {
      const types = SEGMENTATION_COLOR_LEGEND.map(item => item.type);
      expect(types).toContain('Verse');
      expect(types).toContain('Chorus');
      expect(types).toContain('Bridge');
    });

    it('has valid rgba colors', () => {
      SEGMENTATION_COLOR_LEGEND.forEach(item => {
        expect(item.color).toMatch(/rgba\(\d+, \d+, \d+, 0\.\d+\)/);
      });
    });
  });
});
