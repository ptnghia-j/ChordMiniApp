import {
  buildGuitarStrumClusterSizes,
  resolveGuitarClusterDensityCompensation,
} from '@/services/chord-playback/soundfont/utils';
import type { ScheduledNote } from '@/utils/instrumentNoteGeneration';

const n = (
  startOffset: number,
  overrides: Partial<ScheduledNote> = {},
): ScheduledNote => ({
  noteName: 'E4',
  midi: 64,
  startOffset,
  duration: 1,
  velocityMultiplier: 1,
  isBass: false,
  ...overrides,
});

describe('buildGuitarStrumClusterSizes', () => {
  it('groups staggered strum onsets into one cluster', () => {
    const notes: ScheduledNote[] = [
      n(0),
      n(0.02),
      n(0.04),
      n(0.06),
      n(0.08),
    ];
    const sizes = buildGuitarStrumClusterSizes(notes, 0.095);
    expect(sizes).toEqual([5, 5, 5, 5, 5]);
  });

  it('splits well-separated bursts', () => {
    const notes: ScheduledNote[] = [n(0), n(0.2)];
    const sizes = buildGuitarStrumClusterSizes(notes, 0.095);
    expect(sizes).toEqual([1, 1]);
  });

  it('preserves index alignment with the input note array', () => {
    const notes: ScheduledNote[] = [n(0.08), n(0), n(0.04)];
    const sizes = buildGuitarStrumClusterSizes(notes, 0.095);
    expect(sizes).toHaveLength(3);
    expect(sizes[0]).toBe(3);
    expect(sizes[1]).toBe(3);
    expect(sizes[2]).toBe(3);
  });
});

describe('resolveGuitarClusterDensityCompensation', () => {
  it('keeps single-note clusters near the legacy √3 boost', () => {
    const one = resolveGuitarClusterDensityCompensation(1);
    expect(one).toBeCloseTo(Math.sqrt(3), 5);
  });

  it('stays much fuller per string than aggressive 1/n leveling', () => {
    const six = resolveGuitarClusterDensityCompensation(6);
    const aggressiveLinear = 3.35 / 6;
    expect(six).toBeGreaterThan(aggressiveLinear * 1.35);
  });

  it('still tapers slightly vs naive constant-per-string stacking', () => {
    const naive = Math.sqrt(3);
    const six = resolveGuitarClusterDensityCompensation(6);
    expect(six).toBeLessThan(naive);
  });
});
