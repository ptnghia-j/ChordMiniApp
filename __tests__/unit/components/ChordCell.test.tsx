import React from 'react';
import { render } from '@testing-library/react';

import { ChordCell } from '@/components/chord-analysis/ChordCell';

const baseProps = {
  chord: 'Db:maj',
  globalIndex: 0,
  isClickable: false,
  cellSize: 64,
  isDarkMode: false,
  showChordLabel: true,
  isEmpty: false,
  onBeatClick: jest.fn(),
  getChordStyle: () => '',
  getDynamicFontSize: () => 'text-base',
};

describe('ChordCell corrected chord rendering', () => {
  it('preserves Gemini-corrected enharmonic labels even when the global preference is sharp', () => {
    const { container } = render(
      <ChordCell
        {...baseProps}
        displayChord="Db:maj"
        wasCorrected={true}
        accidentalPreference="sharp"
      />
    );

    expect(container.textContent).toContain('D♭');
    expect(container.textContent).not.toContain('C♯');
  });

  it('still applies the global preference to uncorrected labels', () => {
    const { container } = render(
      <ChordCell
        {...baseProps}
        displayChord="Db:maj"
        wasCorrected={false}
        accidentalPreference="sharp"
      />
    );

    expect(container.textContent).toContain('C♯');
    expect(container.textContent).not.toContain('D♭');
  });
});