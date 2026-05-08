import {
  calculateGridLayout,
  estimateBeatCellWidth,
  getChordStyle,
  getDynamicFontSize,
  getGridColumnsClass,
} from '@/utils/chordStyling';

describe('chordStyling', () => {
  it('estimates beat cell width using the current gap and chrome formula', () => {
    expect(estimateBeatCellWidth(0, 4, 4)).toBe(0);
    expect(estimateBeatCellWidth(500, 2, 4)).toBe(59.25);
  });

  it('maps cell sizes and chord complexity to responsive font classes', () => {
    expect(getDynamicFontSize(0)).toBe('text-sm');
    expect(getDynamicFontSize(45)).toBe('text-xs');
    expect(getDynamicFontSize(75, 1)).toBe('text-base');
    expect(getDynamicFontSize(100, 5)).toBe('text-base');
    expect(getDynamicFontSize(120, 2)).toBe('text-xl');
  });

  it('returns grid column classes for supported time signatures and a fallback for unusual ones', () => {
    expect(getGridColumnsClass(3)).toBe('grid-cols-3');
    expect(getGridColumnsClass(12)).toBe('grid-cols-12');
    expect(getGridColumnsClass(13)).toBe('grid-cols-4');
  });

  it('styles alignment padding, empty cells, pickup beats, and standard clickable cells distinctly', () => {
    expect(getChordStyle('', 0, true, false, 4, 0, 1)).toContain('alignment-padding-cell');
    expect(getChordStyle('', 2, false, false, 4, 0)).toContain('bg-gray-100');
    expect(getChordStyle('C', 3, true, true, 4, 1)).toContain('bg-blue-50');
    expect(getChordStyle('C', 1, true, false, 4, 0)).toContain('cursor-pointer');
  });

  it('calculates a compact two-measure phone layout when width is constrained', () => {
    expect(calculateGridLayout(false, 4, 24, 320, 390, false, false)).toEqual({
      measuresPerRow: 2,
      cellsPerRow: 8,
      totalRows: 3,
    });
  });

  it('expands to wider desktop layouts when there is room', () => {
    expect(calculateGridLayout(false, 4, 48, 1400, 1400, false, false)).toEqual({
      measuresPerRow: 5,
      cellsPerRow: 20,
      totalRows: 3,
    });
  });
});
