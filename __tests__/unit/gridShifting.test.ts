import { calculatePaddingAndShift } from '@/services/chord-analysis/gridShifting';

describe('calculatePaddingAndShift', () => {
  it('falls back to the globally aligned shift when short-intro preservation is clearly worse', () => {
    const chords = [
      'N/C', 'N/C', 'N/C',
      'B:maj', 'B:maj', 'B:maj',
      'E:maj', 'E:maj', 'E:maj', 'E:maj',
      'F#:maj', 'F#:maj', 'F#:maj', 'F#:maj',
      'G#:min', 'G#:min', 'G#:min', 'G#:min',
      'A:maj', 'A:maj', 'A:maj', 'A:maj',
      'B:maj', 'B:maj', 'B:maj', 'B:maj',
    ];

    const result = calculatePaddingAndShift(0.31, 72.28915662650617, 4, chords);

    expect(result.paddingCount).toBe(1);
    expect(result.shiftCount).toBe(1);
  });

  it('keeps the first musical chord on beat one when the intro-preserving shift stays competitive', () => {
    const chords = [
      'N/C', 'N/C', 'N/C',
      'B:maj', 'B:maj', 'B:maj',
      'E:maj', 'E:maj', 'E:maj', 'E:maj',
      'F#:maj', 'F#:maj', 'F#:maj', 'F#:maj', 'F#:maj',
      'G#:min', 'G#:min', 'G#:min', 'G#:min',
      'A:maj', 'A:maj', 'A:maj',
      'C#:min', 'C#:min', 'C#:min', 'C#:min',
    ];

    const result = calculatePaddingAndShift(0.31, 72.28915662650617, 4, chords);

    expect(result.paddingCount).toBe(1);
    expect(result.shiftCount).toBe(0);
  });

  it('normalizes away a full leading measure created by padding+shift', () => {
    const chords = [
      'C', 'C', 'C', 'C',
      'G', 'C', 'C', 'C',
      'Am', 'C', 'C', 'C',
    ];

    const result = calculatePaddingAndShift(0.5, 120, 4, chords);

    expect(result.paddingCount).toBe(0);
    expect(result.shiftCount).toBe(0);
    expect(result.totalPaddingCount).toBe(0);
  });
});
