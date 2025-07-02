import { renderHook, act } from '@testing-library/react';
import { useAudioInteractions } from '@/hooks/useAudioInteractions';

describe('useAudioInteractions Hook', () => {
  // Create proper mock HTMLAudioElement
  const createMockAudioElement = () => ({
    currentTime: 0,
    duration: 100,
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
    audioRef: {
      current: createMockAudioElement(),
    },
    youtubePlayer: createMockYouTubePlayer(),
    setCurrentTime: jest.fn(),
    setDuration: jest.fn(),
    setIsPlaying: jest.fn(),
    currentBeatIndexRef: { current: -1 },
    setCurrentBeatIndex: jest.fn(),
    setLastClickInfo: jest.fn(),
    showCorrectedChords: false,
    setShowCorrectedChords: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset audio element currentTime
    if (mockDependencies.audioRef.current) {
      mockDependencies.audioRef.current.currentTime = 0;
    }
  });

  it('provides all audio interaction functions', () => {
    const { result } = renderHook(() => useAudioInteractions(mockDependencies));

    expect(result.current.handleBeatClick).toBeDefined();
    expect(result.current.toggleEnharmonicCorrection).toBeDefined();
    expect(result.current.handleLoadedMetadata).toBeDefined();
    expect(result.current.handleTimeUpdate).toBeDefined();
  });

  describe('handleBeatClick', () => {
    it('seeks audio element and updates state', () => {
      const { result } = renderHook(() => useAudioInteractions(mockDependencies));

      act(() => {
        result.current.handleBeatClick(5, 10.5);
      });

      expect(mockDependencies.audioRef.current.currentTime).toBe(10.5);
      expect(mockDependencies.setCurrentTime).toHaveBeenCalledWith(10.5);
      expect(mockDependencies.youtubePlayer.seekTo).toHaveBeenCalledWith(10.5, 'seconds');
      expect(mockDependencies.currentBeatIndexRef.current).toBe(5);
      expect(mockDependencies.setCurrentBeatIndex).toHaveBeenCalledWith(5);
      expect(mockDependencies.setLastClickInfo).toHaveBeenCalledWith({
        visualIndex: 5,
        timestamp: 10.5,
        clickTime: expect.any(Number),
      });
    });

    it('handles null audioRef gracefully', () => {
      const deps = {
        ...mockDependencies,
        audioRef: { current: null },
      };
      
      const { result } = renderHook(() => useAudioInteractions(deps));

      act(() => {
        result.current.handleBeatClick(5, 10.5);
      });

      expect(deps.setCurrentTime).not.toHaveBeenCalled();
      expect(deps.youtubePlayer.seekTo).toHaveBeenCalledWith(10.5, 'seconds');
    });

    it('handles null youtubePlayer gracefully', () => {
      const deps = {
        ...mockDependencies,
        youtubePlayer: null,
      };
      
      const { result } = renderHook(() => useAudioInteractions(deps));

      act(() => {
        result.current.handleBeatClick(5, 10.5);
      });

      expect(deps.audioRef.current.currentTime).toBe(10.5);
      expect(deps.setCurrentTime).toHaveBeenCalledWith(10.5);
    });
  });

  describe('toggleEnharmonicCorrection', () => {
    it('toggles showCorrectedChords state', () => {
      const { result } = renderHook(() => useAudioInteractions(mockDependencies));

      act(() => {
        result.current.toggleEnharmonicCorrection();
      });

      expect(mockDependencies.setShowCorrectedChords).toHaveBeenCalledWith(true);
    });

    it('toggles from true to false', () => {
      const deps = {
        ...mockDependencies,
        showCorrectedChords: true,
      };
      
      const { result } = renderHook(() => useAudioInteractions(deps));

      act(() => {
        result.current.toggleEnharmonicCorrection();
      });

      expect(deps.setShowCorrectedChords).toHaveBeenCalledWith(false);
    });
  });

  describe('handleLoadedMetadata', () => {
    it('sets duration from audio element', () => {
      const { result } = renderHook(() => useAudioInteractions(mockDependencies));

      act(() => {
        result.current.handleLoadedMetadata();
      });

      expect(mockDependencies.setDuration).toHaveBeenCalledWith(100);
    });

    it('handles null audioRef gracefully', () => {
      const deps = {
        ...mockDependencies,
        audioRef: { current: null },
      };
      
      const { result } = renderHook(() => useAudioInteractions(deps));

      act(() => {
        result.current.handleLoadedMetadata();
      });

      expect(deps.setDuration).not.toHaveBeenCalled();
    });
  });

  describe('handleTimeUpdate', () => {
    it('updates current time from audio element', () => {
      const { result } = renderHook(() => useAudioInteractions(mockDependencies));

      act(() => {
        result.current.handleTimeUpdate();
      });

      expect(mockDependencies.setCurrentTime).toHaveBeenCalledWith(0);
    });

    it('handles null audioRef gracefully', () => {
      const deps = {
        ...mockDependencies,
        audioRef: { current: null },
      };
      
      const { result } = renderHook(() => useAudioInteractions(deps));

      act(() => {
        result.current.handleTimeUpdate();
      });

      expect(deps.setCurrentTime).not.toHaveBeenCalled();
    });
  });
});
