import { renderHook } from '@testing-library/react';
import { useProcessedLyrics } from '@/hooks/lyrics/useProcessedLyrics';

// Minimal types inline to avoid importing React types

type Line = {
  startTime: number;
  endTime: number;
  text: string;
  chords: Array<{ time: number; chord: string; position: number }>;
  wordTimings?: Array<{ text: string; startTime: number; endTime: number; startChar: number; endChar: number }>;
};

describe('useProcessedLyrics (beat-aligned)', () => {
  const mkLyrics = (lines: Array<Pick<Line, 'startTime' | 'endTime' | 'text'> & Partial<Pick<Line, 'wordTimings'>>>): { lines: Line[] } => ({
    lines: lines.map((l) => ({ ...l, chords: [] }))
  });

  test('Test case 1: non-lyrics gap with passing chords reduces to grid sequence', () => {
    // Gap chords: Gm7 -> F -> Bb -> Dm -> Cm7, but grid is Gm7 -> Cm7
    const chords = [
      { time: 10.0, chord: 'Gm7' },
      { time: 10.5, chord: 'F' },
      { time: 11.0, chord: 'Bb' },
      { time: 11.5, chord: 'Dm' },
      { time: 12.0, chord: 'Cm7' }
    ];

    const lyrics = mkLyrics([
      { startTime: 8.0, endTime: 9.5, text: 'line 1' },
      { startTime: 12.5, endTime: 14.0, text: 'line 2' }
    ]);

    const { result } = renderHook(() => useProcessedLyrics({
      lyrics: lyrics as any,
      beatAlignedChords: chords,
      segmentationData: null
    }));

    // Find chord-only placeholder (isChordOnly)
    const chordOnly = result.current.find((l: any) => l.isChordOnly);
    expect(chordOnly).toBeTruthy();
    const labels = (chordOnly!.chords || []).map((c: any) => c.chord);
    // Should be deduped on change only: start and end
    expect(labels[0]).toBe('Gm7');
    expect(labels[labels.length - 1]).toBe('Cm7');
  });

  test('Test case 2 & 3: snapping preserves non-overlap with guard gap (indirectly verified)', () => {
    const chords = [{ time: 5, chord: 'C' }];
    const lyrics = mkLyrics([
      { startTime: 1.02, endTime: 1.48, text: 'a' },
      { startTime: 1.49, endTime: 2.02, text: 'b' }
    ]);

    const { result } = renderHook(() => useProcessedLyrics({
      lyrics: lyrics as any,
      beatAlignedChords: chords,
      segmentationData: null
    }));

    // The hook itself does not snap; LyricsSection does snapping. This test ensures
    // at least no overlaps are introduced by merging. Placeholders are clipped to avoid overlap.
    const lines = result.current;
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startTime).toBeGreaterThanOrEqual(lines[i - 1].endTime - 1e-6);
    }
  });

  test('Test case 4: fallback with empty chords yields only original lyrics', () => {
    const lyrics = mkLyrics([{ startTime: 0, endTime: 2, text: 'hello world' }]);
    const { result } = renderHook(() => useProcessedLyrics({
      lyrics: lyrics as any,
      beatAlignedChords: [],
      segmentationData: null
    }));
    expect(result.current.length).toBe(1);
    expect(result.current[0].text).toBe('hello world');
  });

  test('maps beat-aligned chords using preserved word timing spans', () => {
    const chords = [
      { time: 0.25, chord: 'C' },
      { time: 1.6, chord: 'G' }
    ];
    const lyrics = mkLyrics([{
      startTime: 0,
      endTime: 2,
      text: 'hello world',
      wordTimings: [
        { text: 'hello', startTime: 0, endTime: 1, startChar: 0, endChar: 4 },
        { text: 'world', startTime: 1.2, endTime: 2, startChar: 6, endChar: 10 }
      ]
    }]);

    const { result } = renderHook(() => useProcessedLyrics({
      lyrics: lyrics as any,
      beatAlignedChords: chords,
      segmentationData: null
    }));

    const [line] = result.current;
    expect(line.chords[0].position).toBeGreaterThanOrEqual(0);
    expect(line.chords[0].position).toBeLessThanOrEqual(4);
    expect(line.chords[1].position).toBeGreaterThanOrEqual(6);
    expect(line.chords[1].position).toBeLessThanOrEqual(10);
  });

  test('Test case 5: downbeats-only filter keeps only chords near downbeats', () => {
    const chords = [
      { time: 1.00, chord: 'C' }, // downbeat
      { time: 1.50, chord: 'G' }, // off-beat
      { time: 2.00, chord: 'F' }  // downbeat
    ];
    const downbeatTimes = [1.0, 2.0, 3.0];
    const lyrics = mkLyrics([{ startTime: 0.5, endTime: 2.5, text: 'line' }]);

    const { result } = renderHook(() => useProcessedLyrics({
      lyrics: lyrics as any,
      beatAlignedChords: chords,
      segmentationData: null,
      downbeatsOnly: true,
      downbeatTimes
    }));

    const line = result.current[0];
    const labels = (line.chords || []).map((c: any) => c.chord);
    // Off-beat G should be removed
    expect(labels).toContain('C');
    expect(labels).toContain('F');
    expect(labels).not.toContain('G');
  });
});

