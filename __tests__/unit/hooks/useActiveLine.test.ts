import { renderHook } from '@testing-library/react';
import { useActiveLine } from '@/hooks/lyrics/useActiveLine';

describe('useActiveLine', () => {
  const processedLines = [
    { startTime: 1, endTime: 2, text: 'first line' },
    { startTime: 2.1, endTime: 3, text: 'second line' },
  ];

  const chords = [
    { time: 1, chord: 'C' },
    { time: 2.1, chord: 'G' },
  ];

  it('hides lyrics before the first actual chord starts', () => {
    const { result } = renderHook(() => useActiveLine({
      processedLines,
      currentTime: 0.5,
      containerRef: { current: null },
      chords,
    }));

    expect(result.current.activeLine).toBe(-1);
  });

  it('moves the active line forward as playback crosses lyric timing boundaries', () => {
    const props = {
      processedLines,
      currentTime: 1.5,
      containerRef: { current: null },
      chords,
    };

    const { result, rerender } = renderHook((hookProps) => useActiveLine(hookProps), {
      initialProps: props,
    });

    expect(result.current.activeLine).toBe(0);

    rerender({
      ...props,
      currentTime: 2.4,
    });

    expect(result.current.activeLine).toBe(1);
  });
});