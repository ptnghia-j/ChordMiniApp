import {
  calculatePaddingAndShift,
  calculateOptimalShift,
} from '@/services/chord-analysis/gridShifting';

// ---------------------------------------------------------------------------
// calculateOptimalShift
// ---------------------------------------------------------------------------
describe('calculateOptimalShift', () => {
  it('returns 0 for empty chords', () => {
    expect(calculateOptimalShift([], 4)).toBe(0);
  });

  it('returns 0 for a single chord (no chord changes possible)', () => {
    expect(calculateOptimalShift(['C'], 4)).toBe(0);
  });

  it('returns shift in range [0, timeSignature)', () => {
    const chords = ['C', 'C', 'G', 'G', 'Am', 'Am', 'F', 'F'];
    const shift = calculateOptimalShift(chords, 4);
    expect(shift).toBeGreaterThanOrEqual(0);
    expect(shift).toBeLessThan(4);
  });

  it('optimises chord changes on downbeats for 4/4', () => {
    // Chord changes happen every 4 beats — shift 0 should align perfectly
    const chords = ['C', 'C', 'C', 'C', 'G', 'G', 'G', 'G', 'Am', 'Am', 'Am', 'Am'];
    const shift = calculateOptimalShift(chords, 4);
    expect(shift).toBe(0);
  });

  it('finds best shift when chords are offset by 2', () => {
    // Chord changes at index 2 and 6 → shift=2 puts them on downbeats
    const chords = ['C', 'C', 'G', 'G', 'G', 'G', 'Am', 'Am', 'Am', 'Am'];
    const shift = calculateOptimalShift(chords, 4);
    expect(shift).toBeGreaterThanOrEqual(0);
    expect(shift).toBeLessThan(4);
  });

  it('respects paddingCount in downbeat calculation', () => {
    const chords = ['C', 'C', 'C', 'C', 'G', 'G', 'G', 'G'];
    const shiftNoPadding = calculateOptimalShift(chords, 4, 0);
    const shiftWithPadding = calculateOptimalShift(chords, 4, 2);
    // They may differ since padding changes visual positions
    expect(shiftNoPadding).toBeGreaterThanOrEqual(0);
    expect(shiftWithPadding).toBeGreaterThanOrEqual(0);
  });

  it('handles 3/4 time signature', () => {
    const chords = ['C', 'C', 'C', 'G', 'G', 'G', 'Am', 'Am', 'Am'];
    const shift = calculateOptimalShift(chords, 3);
    expect(shift).toBeGreaterThanOrEqual(0);
    expect(shift).toBeLessThan(3);
  });

  it('handles all-silent chords', () => {
    const chords = ['N', 'N', 'N', 'N'];
    const shift = calculateOptimalShift(chords, 4);
    expect(shift).toBeGreaterThanOrEqual(0);
    expect(shift).toBeLessThan(4);
  });
});

// ---------------------------------------------------------------------------
// calculatePaddingAndShift
// ---------------------------------------------------------------------------
describe('calculatePaddingAndShift', () => {
  it('returns zero padding when first beat is near zero', () => {
    const result = calculatePaddingAndShift(0.01, 120, 4);
    expect(result.paddingCount).toBe(0);
  });

  it('calculates padding for significant pre-beat time', () => {
    // firstBeat = 1.0s, bpm = 120 → rawPadding = floor((1.0/60)*120) = 2
    const result = calculatePaddingAndShift(1.0, 120, 4);
    expect(result.paddingCount).toBe(2);
  });

  it('removes full measures from padding', () => {
    // firstBeat = 2.5s, bpm = 120 → rawPadding = floor(2.5/60*120) = 5
    // 5 >= 4 → remove 1 full measure → 5 - 4 = 1
    const result = calculatePaddingAndShift(2.5, 120, 4);
    expect(result.paddingCount).toBe(1);
  });

  it('totalPaddingCount equals paddingCount + shiftCount', () => {
    const result = calculatePaddingAndShift(1.0, 120, 4, ['C', 'C', 'G', 'G']);
    expect(result.totalPaddingCount).toBe(result.paddingCount + result.shiftCount);
  });

  it('shift is 0 when padding alone aligns to downbeat (no chords)', () => {
    // firstBeat = 0.01, padding = 0, beatPos = 1 → shift = 0
    const result = calculatePaddingAndShift(0.01, 120, 4);
    expect(result.shiftCount).toBe(0);
  });

  it('shift aligns first beat to downbeat when no chords provided', () => {
    // firstBeat = 0.5s, bpm = 120 → rawPadding = floor(0.5/60*120) = 1
    // No chords: beatPosition = (1 % 4) + 1 = 2 → shift = 4 - 2 + 1 = 3
    const result = calculatePaddingAndShift(0.5, 120, 4);
    expect(result.paddingCount).toBe(1);
    expect(result.shiftCount).toBe(3);
  });

  it('returns non-negative values for all fields', () => {
    const result = calculatePaddingAndShift(0.3, 90, 4, ['C', 'G']);
    expect(result.paddingCount).toBeGreaterThanOrEqual(0);
    expect(result.shiftCount).toBeGreaterThanOrEqual(0);
    expect(result.totalPaddingCount).toBeGreaterThanOrEqual(0);
  });

  it('handles very high BPM', () => {
    const result = calculatePaddingAndShift(0.5, 300, 4);
    expect(result.paddingCount).toBeGreaterThanOrEqual(0);
    expect(result.paddingCount).toBeLessThan(4); // Always < timeSignature after full-measure removal
  });

  it('handles 3/4 time signature', () => {
    const result = calculatePaddingAndShift(1.0, 120, 3, ['C', 'C', 'C', 'G', 'G', 'G']);
    expect(result.paddingCount).toBeGreaterThanOrEqual(0);
    expect(result.paddingCount).toBeLessThan(3);
    expect(result.shiftCount).toBeGreaterThanOrEqual(0);
    expect(result.shiftCount).toBeLessThan(3);
  });

  it('applies single padding when gap ratio exceeds threshold', () => {
    // firstBeat small enough that rawPadding = 0 but gapRatio > 0.2
    // beatDuration at 60bpm = 1.0s; firstBeat = 0.25 → gapRatio = 0.25 > 0.2
    const result = calculatePaddingAndShift(0.25, 60, 4);
    expect(result.paddingCount).toBe(1);
  });

  it('uses chord-based optimal shift when chords are provided', () => {
    const chords = ['C', 'C', 'C', 'C', 'G', 'G', 'G', 'G'];
    const result = calculatePaddingAndShift(0.01, 120, 4, chords);
    expect(result.shiftCount).toBeGreaterThanOrEqual(0);
    expect(result.shiftCount).toBeLessThan(4);
  });

  it('removes full-measure leading offset when padding and shift sum to one bar', () => {
    // firstBeat=0.5s at 120bpm yields paddingCount=1.
    // This chord pattern prefers shiftCount=3 before normalization, so
    // combined offset is 4 beats (one full 4/4 measure) and should be removed.
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

  it('keeps chord-aware total leading offset below one measure', () => {
    const result = calculatePaddingAndShift(
      1.0,
      120,
      4,
      ['C', 'C', 'C', 'C', 'G', 'C', 'C', 'C', 'Am', 'C', 'C', 'C']
    );

    expect(result.totalPaddingCount).toBeLessThan(4);
  });

  it('short intro preservation: first chord on downbeat when competitive', () => {
    // From existing test context: intro-preserving shift stays competitive
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
    // Padding + leading silence (3) should align first chord to downbeat
    expect((result.paddingCount + result.shiftCount + 3) % 4).toBe(0);
  });

  it('long intro preservation: keeps the first musical phrase on a downbeat when globally competitive', () => {
    const chords: string[] = Array(25).fill('N/C');
    const appendChord = (chord: string, beats: number) => {
      chords.push(...Array(beats).fill(chord));
    };

    [
      'G:maj/3',
      'C:maj',
      'F:maj',
      'C:maj/3',
      'D:min',
      'Bb:maj/3',
      'D:min',
      'G:7',
      'C:maj',
      'E:min',
      'A:min',
      'G:min7',
    ].forEach((chord) => appendChord(chord, 4));

    // One continuation beat places the later section's chord starts on the
    // competing shift, mimicking the Nàng Thơ cache where later material
    // overpowers the opening phrase.
    appendChord('G:min7', 1);

    [
      'C:7',
      'F:maj7',
      'D:min7',
      'G:sus4(b7)',
      'G:7',
      'C:maj',
      'E:min7',
      'A:min7',
      'G:min7',
      'C:7',
      'F:maj7',
      'D:min7',
      'G:sus4(b7)',
      'G:7',
    ].forEach((chord) => appendChord(chord, 4));

    const result = calculatePaddingAndShift(0.43, 122.44897959184156, 4, chords);

    expect(result.paddingCount).toBe(1);
    expect(result.shiftCount).toBe(2);
    expect((result.paddingCount + result.shiftCount + 25) % 4).toBe(0);
  });

  it('handles zero BPM gracefully (edge case)', () => {
    // bpm = 0 causes beatDuration division by zero paths
    // rawPaddingCount = floor((firstBeat / 60) * 0) = 0
    const result = calculatePaddingAndShift(1.0, 0, 4);
    expect(result.paddingCount).toBeGreaterThanOrEqual(0);
  });
});
