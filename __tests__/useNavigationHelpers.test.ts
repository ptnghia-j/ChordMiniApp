import { renderHook, act } from '@testing-library/react';
import { useNavigationHelpers } from '@/hooks/useNavigationHelpers';

// Mock window.location
const mockLocation = {
  href: '',
};

// Use delete and reassign to avoid redefinition error
delete (window as any).location;
(window as any).location = mockLocation;

describe('useNavigationHelpers Hook', () => {
  // Create proper mock HTMLAudioElement
  const createMockAudioElement = () => ({
    muted: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    load: jest.fn(),
    // Add other required HTMLAudioElement properties as needed
  } as any);

  // Create proper mock YouTubePlayer
  const createMockYouTubePlayer = () => ({
    seekTo: jest.fn(),
    playVideo: jest.fn(),
    pauseVideo: jest.fn(),
    setPlaybackRate: jest.fn(),
    muted: false,
  });

  const mockDependencies = {
    setIsVideoMinimized: jest.fn(),
    setIsFollowModeEnabled: jest.fn(),
    preferredAudioSource: 'youtube' as const,
    setPreferredAudioSource: jest.fn(),
    youtubePlayer: createMockYouTubePlayer(),
    audioRef: {
      current: createMockAudioElement(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.href = '';
  });

  it('provides all navigation helper functions', () => {
    const { result } = renderHook(() => useNavigationHelpers(mockDependencies));

    expect(result.current.handleTryAnotherVideo).toBeDefined();
    expect(result.current.toggleVideoMinimization).toBeDefined();
    expect(result.current.toggleFollowMode).toBeDefined();
    expect(result.current.toggleAudioSource).toBeDefined();
  });

  describe('handleTryAnotherVideo', () => {
    it('navigates to home page', () => {
      const { result } = renderHook(() => useNavigationHelpers(mockDependencies));

      act(() => {
        result.current.handleTryAnotherVideo();
      });

      expect(mockLocation.href).toBe('/');
    });
  });

  describe('toggleVideoMinimization', () => {
    it('calls setIsVideoMinimized with toggle function', () => {
      const { result } = renderHook(() => useNavigationHelpers(mockDependencies));

      act(() => {
        result.current.toggleVideoMinimization();
      });

      expect(mockDependencies.setIsVideoMinimized).toHaveBeenCalledWith(expect.any(Function));
      
      // Test the toggle function
      const toggleFn = mockDependencies.setIsVideoMinimized.mock.calls[0][0];
      expect(toggleFn(false)).toBe(true);
      expect(toggleFn(true)).toBe(false);
    });
  });

  describe('toggleFollowMode', () => {
    it('calls setIsFollowModeEnabled with toggle function', () => {
      const { result } = renderHook(() => useNavigationHelpers(mockDependencies));

      act(() => {
        result.current.toggleFollowMode();
      });

      expect(mockDependencies.setIsFollowModeEnabled).toHaveBeenCalledWith(expect.any(Function));
      
      // Test the toggle function
      const toggleFn = mockDependencies.setIsFollowModeEnabled.mock.calls[0][0];
      expect(toggleFn(false)).toBe(true);
      expect(toggleFn(true)).toBe(false);
    });
  });

  describe('toggleAudioSource', () => {
    it('switches from youtube to extracted audio', () => {
      const deps = {
        ...mockDependencies,
        preferredAudioSource: 'youtube' as const,
      };
      
      const { result } = renderHook(() => useNavigationHelpers(deps));

      act(() => {
        result.current.toggleAudioSource();
      });

      expect(deps.setPreferredAudioSource).toHaveBeenCalledWith('extracted');
      expect(deps.youtubePlayer.muted).toBe(true);
      expect(deps.audioRef.current.muted).toBe(false);
    });

    it('switches from extracted to youtube audio', () => {
      const deps = {
        ...mockDependencies,
        preferredAudioSource: 'extracted' as const,
      };
      
      const { result } = renderHook(() => useNavigationHelpers(deps));

      act(() => {
        result.current.toggleAudioSource();
      });

      expect(deps.setPreferredAudioSource).toHaveBeenCalledWith('youtube');
      expect(deps.youtubePlayer.muted).toBe(false);
      expect(deps.audioRef.current.muted).toBe(true);
    });

    it('handles null youtubePlayer gracefully', () => {
      const deps = {
        ...mockDependencies,
        youtubePlayer: null,
        preferredAudioSource: 'youtube' as const,
      };
      
      const { result } = renderHook(() => useNavigationHelpers(deps));

      act(() => {
        result.current.toggleAudioSource();
      });

      expect(deps.setPreferredAudioSource).toHaveBeenCalledWith('extracted');
      expect(deps.audioRef.current.muted).toBe(false);
    });

    it('handles null audioRef.current gracefully', () => {
      const deps = {
        ...mockDependencies,
        audioRef: { current: null },
        preferredAudioSource: 'youtube' as const,
      };
      
      const { result } = renderHook(() => useNavigationHelpers(deps));

      act(() => {
        result.current.toggleAudioSource();
      });

      expect(deps.setPreferredAudioSource).toHaveBeenCalledWith('extracted');
      expect(deps.youtubePlayer.muted).toBe(true);
    });
  });
});
