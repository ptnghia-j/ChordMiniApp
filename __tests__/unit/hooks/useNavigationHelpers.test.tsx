import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { useMemo, useState } from 'react';

import { useNavigationHelpers } from '@/hooks/ui/useNavigationHelpers';

function NavigationHarness({
  navigateToUrl = jest.fn(),
}: {
  navigateToUrl?: jest.Mock;
}) {
  const [isVideoMinimized, setIsVideoMinimized] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);

  const helpers = useNavigationHelpers({
    setIsVideoMinimized,
    setIsFollowModeEnabled,
    navigateToUrl,
  });

  const stateText = useMemo(
    () => `${isVideoMinimized ? 'minimized' : 'expanded'}|${isFollowModeEnabled ? 'follow-on' : 'follow-off'}`,
    [isFollowModeEnabled, isVideoMinimized],
  );

  return (
    <div>
      <div data-testid="nav-state">{stateText}</div>
      <button type="button" onClick={helpers.handleTryAnotherVideo}>Try another video</button>
      <button type="button" onClick={helpers.toggleVideoMinimization}>Toggle video</button>
      <button type="button" onClick={helpers.toggleFollowMode}>Toggle follow</button>
    </div>
  );
}

describe('useNavigationHelpers', () => {
  it('navigates to the homepage when trying another video', () => {
    const navigateToUrl = jest.fn();

    render(<NavigationHarness navigateToUrl={navigateToUrl} />);

    fireEvent.click(screen.getByRole('button', { name: /try another video/i }));

    expect(navigateToUrl).toHaveBeenCalledWith('/');
  });

  it('toggles minimized and follow-mode state through the returned helpers', () => {
    render(<NavigationHarness />);

    expect(screen.getByTestId('nav-state')).toHaveTextContent('expanded|follow-on');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /toggle video/i }));
    });
    expect(screen.getByTestId('nav-state')).toHaveTextContent('minimized|follow-on');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /toggle follow/i }));
    });
    expect(screen.getByTestId('nav-state')).toHaveTextContent('minimized|follow-off');
  });
});
