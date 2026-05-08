import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/components/analysis/HeroUIBeatModelSelector', () => ({
  __esModule: true,
  default: ({ onChange, defaultValue }: { onChange: (value: 'madmom' | 'beat-transformer') => void; defaultValue?: string }) => (
    <button type="button" onClick={() => onChange('beat-transformer')}>
      Beat selector: {defaultValue}
    </button>
  ),
}));

jest.mock('@/components/analysis/HeroUIChordModelSelector', () => ({
  __esModule: true,
  default: ({ onModelChange, selectedModel }: { onModelChange: (value: 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl') => void; selectedModel: string }) => (
    <button type="button" onClick={() => onModelChange('btc-pl')}>
      Chord selector: {selectedModel}
    </button>
  ),
}));

import { AnalysisControls } from '@/components/analysis/AnalysisControls';

describe('AnalysisControls', () => {
  function Harness({
    isExtracted = true,
    isAnalyzing = false,
    hasError = false,
  }: {
    isExtracted?: boolean;
    isAnalyzing?: boolean;
    hasError?: boolean;
  }) {
    const [beatDetector, setBeatDetector] = React.useState<'madmom' | 'beat-transformer'>('madmom');
    const [chordDetector, setChordDetector] = React.useState<'chord-cnn-lstm' | 'btc-sl' | 'btc-pl'>('chord-cnn-lstm');

    return (
      <AnalysisControls
        isExtracted={isExtracted}
        isAnalyzed={false}
        isAnalyzing={isAnalyzing}
        hasError={hasError}
        stage="idle"
        beatDetector={beatDetector}
        chordDetector={chordDetector}
        onBeatDetectorChange={setBeatDetector}
        onChordDetectorChange={setChordDetector}
        onStartAnalysis={jest.fn()}
        cacheAvailable={false}
        cacheCheckCompleted={true}
      />
    );
  }

  it('shows the selected models and updates the displayed selection when the user changes them', () => {
    render(<Harness />);

    expect(screen.getByText('Analysis setup')).toBeInTheDocument();
    expect(screen.getByText('Beat: Madmom')).toBeInTheDocument();
    expect(screen.getByText('Chords: Chord CNN-LSTM')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Beat selector: madmom/i }));
    fireEvent.click(screen.getByRole('button', { name: /Chord selector: chord-cnn-lstm/i }));

    expect(screen.getByText('Beat: Beat Transformer')).toBeInTheDocument();
    expect(screen.getByText('Chords: BTC PL')).toBeInTheDocument();
  });

  it('shows the correct action state for preparation vs ready-to-run analysis', () => {
    const { rerender } = render(<Harness isExtracted={false} />);

    expect(screen.getByRole('button', { name: /preparing audio/i })).toBeDisabled();
    expect(screen.getByText('Preparing analysis session')).toBeInTheDocument();

    rerender(<Harness isExtracted={true} isAnalyzing={false} hasError={false} />);

    expect(screen.getByRole('button', { name: /run analysis/i })).toBeEnabled();
    expect(screen.getByText('Fresh analysis required')).toBeInTheDocument();
  });
});
