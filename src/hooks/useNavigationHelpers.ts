import { useCallback } from 'react';

export interface NavigationHelpersDependencies {
  // State setters for UI controls
  setIsVideoMinimized: (updater: (prev: boolean) => boolean) => void;
  setIsFollowModeEnabled: (updater: (prev: boolean) => boolean) => void;
}

export interface NavigationHelpers {
  handleTryAnotherVideo: () => void;
  toggleVideoMinimization: () => void;
  toggleFollowMode: () => void;
}

/**
 * Custom hook for navigation helper functions
 * Extracted from analyze page component - maintains ZERO logic changes
 */
export const useNavigationHelpers = (deps: NavigationHelpersDependencies): NavigationHelpers => {
  const {
    setIsVideoMinimized,
    setIsFollowModeEnabled,
  } = deps;

  // Handle "Try Another Video" action
  const handleTryAnotherVideo = useCallback(() => {
    // Navigate back to search
    window.location.href = '/';
  }, []);

  // Function to toggle video minimization
  const toggleVideoMinimization = useCallback(() => {
    setIsVideoMinimized(prev => !prev);
  }, [setIsVideoMinimized]);

  // Function to toggle follow mode
  const toggleFollowMode = useCallback(() => {
    setIsFollowModeEnabled(prev => !prev);
  }, [setIsFollowModeEnabled]);

  return {
    handleTryAnotherVideo,
    toggleVideoMinimization,
    toggleFollowMode,
  };
};
