import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/dynamic', () => () => function DynamicProcessingStub() {
  return null;
});

jest.mock('@/components/analysis/AnalysisErrorToast', () => function AnalysisErrorToastStub({
  error,
}: {
  error: string | null;
}) {
  return <div data-testid="analysis-error-toast" data-error={error || ''} />;
});

import ProcessingBanners from '@/components/analysis/ProcessingBanners';

describe('ProcessingBanners', () => {
  it('routes extraction errors to the toast controller instead of rendering the inline card', () => {
    render(
      <ProcessingBanners
        isDownloading={false}
        fromCache={false}
        showExtractionNotification={false}
        onDismissExtraction={jest.fn()}
        onRefreshExtraction={jest.fn()}
        analysisResults={null}
        audioDuration={0}
        error="Audio extraction failed due to YouTube restrictions"
        onTryAnotherVideo={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('analysis-error-toast')).toHaveAttribute(
      'data-error',
      'Audio extraction failed due to YouTube restrictions',
    );
    expect(screen.queryByText('Video Access Restricted')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });
});
