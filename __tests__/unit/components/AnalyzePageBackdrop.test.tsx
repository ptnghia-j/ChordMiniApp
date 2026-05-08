import React from 'react';
import { render, screen } from '@testing-library/react';

import AnalyzePageBackdrop from '@/components/analysis/AnalyzePageBackdrop';

describe('AnalyzePageBackdrop', () => {
  it('renders the blurred thumbnail backdrop when a thumbnail is available', () => {
    render(
      <AnalyzePageBackdrop
        thumbnailUrl="https://img.youtube.com/vi/demo/hqdefault.jpg"
        showFooterTransition
      />,
    );

    expect(screen.getByTestId('analyze-thumbnail-backdrop')).toHaveStyle({
      backgroundImage: 'url("https://img.youtube.com/vi/demo/hqdefault.jpg")',
    });
    expect(screen.getByTestId('analyze-footer-transition')).toBeInTheDocument();
  });

  it('keeps the footer transition available even without a thumbnail', () => {
    render(<AnalyzePageBackdrop showFooterTransition />);

    expect(screen.queryByTestId('analyze-thumbnail-backdrop')).not.toBeInTheDocument();
    expect(screen.getByTestId('analyze-footer-transition')).toBeInTheDocument();
  });
});