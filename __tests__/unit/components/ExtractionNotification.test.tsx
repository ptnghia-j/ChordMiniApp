import { render } from '@testing-library/react';

const mockAddToast = jest.fn();

jest.mock('@heroui/react', () => ({
  addToast: (...args: unknown[]) => mockAddToast(...args),
}));

import ExtractionNotification from '@/components/analysis/ExtractionNotification';

describe('ExtractionNotification', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
  });

  it('keeps the existing extraction toast and adds a separate Run analysis prompt', () => {
    render(
      <ExtractionNotification
        isVisible
        fromCache={false}
        onDismiss={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    expect(mockAddToast).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: 'Audio Extracted Successfully',
      description: 'Audio extraction complete. Select models to begin analysis.',
    }));
    expect(mockAddToast).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: 'Ready for Beat and Chord Analysis',
      description: 'Click "Run analysis" to start beat and chord inference.',
    }));
  });

  it('keeps the cached-audio toast text without the extraction-only Run analysis prompt', () => {
    render(
      <ExtractionNotification
        isVisible
        fromCache
        onDismiss={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    expect(mockAddToast).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Audio Loaded from Cache',
      description: 'Using cached audio file. Select models to begin analysis.',
    }));
  });
});
