import { renderHook } from '@testing-library/react';
import { useChordInteractions } from '@/hooks/chord-analysis/useChordInteractions';

describe('useChordInteractions Hook', () => {
  const mockOnBeatClick = jest.fn();
  const mockBeats = [0.0, 0.5, 1.0, 1.5, 2.0];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks starting alignment and padding cells as non-clickable', () => {
    const disabledCellIndices = new Set([0, 1]);
    const { result } = renderHook(() =>
      useChordInteractions(mockOnBeatClick, mockBeats, undefined, disabledCellIndices)
    );

    // Starting padding/shift cells should be non-clickable
    expect(result.current.isClickable(0, '')).toBe(false);
    expect(result.current.isClickable(1, 'N.C.', false)).toBe(false);

    // A real N.C. beat is functional even when its label is suppressed.
    expect(result.current.isClickable(2, 'N.C.', false)).toBe(true);

    // Regular cells and labeled rests outside the disabled set are clickable.
    expect(result.current.isClickable(2, 'N.C.', true)).toBe(true);
    expect(result.current.isClickable(2, 'C', true)).toBe(true);
    expect(result.current.isClickable(3, 'G', true)).toBe(true);
  });

  it('handles beat clicks for clickable cells', () => {
    const disabledCellIndices = new Set([0, 1]);
    const { result } = renderHook(() =>
      useChordInteractions(mockOnBeatClick, mockBeats, undefined, disabledCellIndices)
    );

    result.current.handleBeatClick(2);
    expect(mockOnBeatClick).toHaveBeenCalledWith(2, 1.0);
  });
});
