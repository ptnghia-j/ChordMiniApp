import { fireEvent, render, screen } from '@testing-library/react';
import CapoNeckPreview from '@/components/chord-analysis/CapoNeckPreview';

describe('CapoNeckPreview', () => {
  it('keeps the current capo strip non-interactive so the drag surface owns the cursor affordance', () => {
    render(<CapoNeckPreview capoFret={3} suggestedCapoFret={3} />);

    expect(screen.getByTestId('capo-current-strip')).toHaveStyle({ pointerEvents: 'none' });
  });

  it('maps mouse dragging across the neck to capo fret changes', () => {
    const onCapoFretChange = jest.fn();

    render(
      <CapoNeckPreview
        capoFret={0}
        suggestedCapoFret={3}
        onCapoFretChange={onCapoFretChange}
      />
    );

    const dragSurface = screen.getByTestId('capo-drag-surface');
    Object.defineProperty(dragSurface, 'getBoundingClientRect', {
      value: () => ({
        left: 12,
        width: 240,
        top: 0,
        height: 40,
        right: 252,
        bottom: 40,
        x: 12,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(dragSurface, { clientX: 212 });
    fireEvent.mouseMove(dragSurface, { clientX: 212 });
    fireEvent.mouseUp(dragSurface, { clientX: 212 });

    expect(onCapoFretChange).toHaveBeenCalledWith(10);
  });
});
