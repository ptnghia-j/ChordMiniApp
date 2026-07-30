import { buildChordCellStates } from '@/utils/chordCellState';
import { shouldShowChordLabel } from '@/utils/chordProcessing';

describe('chord cell state', () => {
  it('treats originalAudioMapping as authoritative over nominal leading padding', () => {
    const { disabledCellIndices, disabledCellCount } = buildChordCellStates(
      5,
      [
        { visualIndex: 2 }, // first real beat is an N.C. cell
        { visualIndex: 3 },
        { visualIndex: 4 },
      ],
      3,
    );

    expect(disabledCellCount).toBe(2);
    expect([...disabledCellIndices]).toEqual([0, 1]);
    expect(disabledCellIndices.has(2)).toBe(false);
    expect(shouldShowChordLabel(2, ['', '', 'N.C.', 'N.C.', 'C'], disabledCellIndices)).toBe(true);
  });

  it('uses the leading-padding count only when no mapping is available', () => {
    const { disabledCellIndices } = buildChordCellStates(4, [], 2);

    expect([...disabledCellIndices]).toEqual([0, 1]);
  });

  it('keeps an explicitly empty mapped cell disabled while retaining mapped N.C. rests', () => {
    const { disabledCellIndices } = buildChordCellStates(3, [
      { visualIndex: 0, chord: '' },
      { visualIndex: 1, chord: 'N.C.' },
      { visualIndex: 2, chord: 'C' },
    ]);

    expect([...disabledCellIndices]).toEqual([0]);
  });

  it('keeps an unmapped leading N.C. padding cell blank before the first mapped chord', () => {
    // Regression: hEsq34B4IAM / madmom / chord-cnn-lstm begins with Eb:maj.
    // The preceding N.C. is layout padding and must not leak a rest label.
    const { disabledCellIndices } = buildChordCellStates(
      6,
      [{ visualIndex: 4 }, { visualIndex: 5 }],
      3,
    );
    const chords = ['', '', '', 'N.C.', 'Eb:maj', 'Eb:maj'];

    expect([...disabledCellIndices]).toEqual([0, 1, 2, 3]);
    expect(shouldShowChordLabel(3, chords, disabledCellIndices)).toBe(false);
    expect(shouldShowChordLabel(4, chords, disabledCellIndices)).toBe(true);
  });
});
