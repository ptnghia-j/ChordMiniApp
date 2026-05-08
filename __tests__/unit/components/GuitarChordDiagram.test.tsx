import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GuitarChordDiagram from '@/components/chord-playback/GuitarChordDiagram';

jest.mock('next/image', () => (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt || ''} />);

const mockChordRenderer = jest.fn((props: { chord?: { frets?: number[]; baseFret?: number } }) => (
  <div data-testid="mock-chord-diagram">
    <span data-testid="mock-chord-base-fret">{props.chord?.baseFret ?? ''}</span>
    <span data-testid="mock-chord-frets">{(props.chord?.frets ?? []).join('|')}</span>
  </div>
));

jest.mock('@tombatossals/react-chords/lib/Chord', () => ({
  __esModule: true,
  default: (props: unknown) => mockChordRenderer(props as { chord?: { frets?: number[]; baseFret?: number } }),
}));

describe('GuitarChordDiagram', () => {
  const chordData = {
    key: 'C',
    suffix: 'major',
    positions: [
      { frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, barres: [] },
      { frets: [3, 3, 5, 5, 5, 3], fingers: [1, 1, 3, 3, 3, 1], baseFret: 3, barres: [1] },
    ],
  };

  it('renders focus state content and multi-position controls', () => {
    const onPositionChange = jest.fn();

    render(
      <GuitarChordDiagram
        chordData={chordData}
        displayName="C"
        isFocused
        showPositionSelector
        positionIndex={0}
        onPositionChange={onPositionChange}
      />
    );

    expect(screen.getByTestId('mock-chord-diagram')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous chord position')).toBeInTheDocument();
    expect(screen.getByLabelText('Next chord position')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next chord position'));
    expect(onPositionChange).toHaveBeenCalledWith(1);
  });

  it('renders the no-chord fallback when diagram data is missing', () => {
    render(<GuitarChordDiagram chordData={null} showChordName />);

    expect(screen.getByText('No Chord')).toBeInTheDocument();
    expect(screen.getByAltText('No Chord')).toBeInTheDocument();
  });

  it('shifts the rendered neck up by the capo fret while keeping the same shape fingering', () => {
    render(
      <GuitarChordDiagram
        chordData={chordData}
        displayName="C"
        capoFret={2}
      />
    );

    expect(screen.getByTestId('mock-chord-frets')).toHaveTextContent('0|3|2|0|1|0');
    expect(screen.getByTestId('mock-chord-base-fret')).toHaveTextContent('3');
  });
});
