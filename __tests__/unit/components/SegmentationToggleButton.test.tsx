import React from 'react';
import { render, screen } from '@testing-library/react';
import SegmentationToggleButton from '@/components/analysis/SegmentationToggleButton';

jest.mock('@heroui/react', () => ({
  Tooltip: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content?: React.ReactNode;
  }) => (
    <div data-tooltip-content={typeof content === 'string' ? content : undefined}>
      {children}
    </div>
  ),
}));

describe('SegmentationToggleButton', () => {
  it('keeps the enable tooltip when the button is still clickable', () => {
    render(
      <SegmentationToggleButton
        isEnabled={false}
        onClick={() => undefined}
        hasSegmentationData={false}
        disabled={false}
        disabledReason="Song segmentation requires a backend-accessible extracted audio URL."
      />,
    );

    expect(screen.getByRole('button', { name: 'Enable song segmentation' }).parentElement).toHaveAttribute(
      'data-tooltip-content',
      'Enable song segmentation',
    );
  });

  it('shows the disabled reason when segmentation is actually unavailable', () => {
    render(
      <SegmentationToggleButton
        isEnabled={false}
        onClick={() => undefined}
        hasSegmentationData={false}
        disabled
        disabledReason="Song segmentation becomes available after audio extraction finishes."
      />,
    );

    expect(screen.getByRole('button', { name: 'Enable song segmentation' }).parentElement).toHaveAttribute(
      'data-tooltip-content',
      'Song segmentation becomes available after audio extraction finishes.',
    );
  });
});
