import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockAddToast = jest.fn(() => 'toast-key');
const mockCloseToast = jest.fn();
let mockPathname = '/analyze/video-one';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>{children}</button>
  ),
  addToast: (...args: unknown[]) => mockAddToast(...args),
  closeToast: (...args: unknown[]) => mockCloseToast(...args),
}));

import AnalysisErrorToast from '@/components/analysis/AnalysisErrorToast';

describe('AnalysisErrorToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/analyze/video-one';
  });

  it('creates a user-friendly extraction error toast with working actions', () => {
    const onRetry = jest.fn();
    const onTryAnotherVideo = jest.fn();

    render(
      <AnalysisErrorToast
        error="Audio extraction failed due to YouTube restrictions"
        onRetry={onRetry}
        onTryAnotherVideo={onTryAnotherVideo}
      />,
    );

    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Video Access Restricted',
      color: 'default',
      timeout: 0,
    }));

    const toastOptions = mockAddToast.mock.calls[0][0] as { description: React.ReactNode };
    render(<>{toastOptions.description}</>);

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mockCloseToast).toHaveBeenCalledWith('toast-key');
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try Another Video' }));
    expect(onTryAnotherVideo).toHaveBeenCalledTimes(1);
  });

  it('replaces the toast when the error changes', () => {
    const { rerender } = render(
      <AnalysisErrorToast
        error="first extraction failed"
        onRetry={jest.fn()}
        onTryAnotherVideo={jest.fn()}
      />,
    );

    rerender(
      <AnalysisErrorToast
        error="second extraction failed"
        onRetry={jest.fn()}
        onTryAnotherVideo={jest.fn()}
      />,
    );

    expect(mockAddToast).toHaveBeenCalledTimes(2);
    expect(mockCloseToast).toHaveBeenCalledWith('toast-key');
  });

  it('closes the toast on route change and unmount', () => {
    const { rerender, unmount } = render(
      <AnalysisErrorToast
        error="extraction failed"
        onRetry={jest.fn()}
        onTryAnotherVideo={jest.fn()}
      />,
    );

    mockPathname = '/analyze/video-two';
    rerender(
      <AnalysisErrorToast
        error="extraction failed"
        onRetry={jest.fn()}
        onTryAnotherVideo={jest.fn()}
      />,
    );
    unmount();

    expect(mockAddToast).toHaveBeenCalledTimes(2);
    expect(mockCloseToast).toHaveBeenCalledWith('toast-key');
  });
});
