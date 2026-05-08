/**
 * Unit Tests: chordSynchronization
 *
 * Verifies pure chord-to-beat alignment behavior for the current
 * 65%-late / 35%-early threshold rule, forward fill semantics,
 * and special chord normalization.
 */

import { synchronizeChords } from '@/utils/chordSynchronization';

describe('chordSynchronization', () => {
  it('returns an empty array when chords or beats are missing', () => {
    expect(synchronizeChords([], [{ time: 0 }] as any)).toEqual([]);
    expect(synchronizeChords([{ start: 0, end: 1, chord: 'C' }] as any, [])).toEqual([]);
  });

  it('keeps an onset on beat 1 when it is before the next-beat 35% early-switch threshold', () => {
    const result = synchronizeChords(
      [
        { start: 0.2, end: 0.9, chord: 'C' },
        { start: 1.64, end: 2.1, chord: 'G' },
      ] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'C', beatIndex: 0 },
      { chord: 'G', beatIndex: 1 },
      { chord: 'G', beatIndex: 2 },
    ]);
  });

  it('advances an onset to the next beat once it reaches the 35% early-switch threshold', () => {
    const result = synchronizeChords(
      [{ start: 1.65, end: 2.1, chord: 'Am' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'N/C', beatIndex: 1 },
      { chord: 'Am', beatIndex: 2 },
    ]);
  });

  it('keeps chords before the first beat on beat 0', () => {
    const result = synchronizeChords(
      [{ start: -0.1, end: 0.4, chord: 'F' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'F', beatIndex: 0 },
      { chord: 'F', beatIndex: 1 },
      { chord: 'F', beatIndex: 2 },
    ]);
  });

  it('treats exact beat starts as belonging to that beat', () => {
    const result = synchronizeChords(
      [{ start: 1, end: 1.8, chord: 'Dm' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'Dm', beatIndex: 1 },
      { chord: 'Dm', beatIndex: 2 },
    ]);
  });

  it('keeps a late onset on the same beat until the next beat threshold is reached', () => {
    const result = synchronizeChords(
      [{ start: 1.34, end: 1.8, chord: 'G' }] as any,
      [{ time: 0 }, { time: 1 }, { time: 2 }, { time: 3 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'G', beatIndex: 1 },
      { chord: 'G', beatIndex: 2 },
      { chord: 'G', beatIndex: 3 },
    ]);
  });

  it('normalizes N chords to N/C and uses later matches for the same beat', () => {
    const result = synchronizeChords(
      [
        { start: 0.1, end: 0.4, chord: 'C' },
        { start: 0.2, end: 0.5, chord: 'N' },
      ] as any,
      [{ time: 0 }, { time: 1 }] as any
    );

    expect(result).toEqual([
      { chord: 'N/C', beatIndex: 0 },
      { chord: 'N/C', beatIndex: 1 },
    ]);
  });
});
