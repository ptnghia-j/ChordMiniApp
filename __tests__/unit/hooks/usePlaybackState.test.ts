import { renderHook, act } from '@testing-library/react';
import { usePlaybackState } from '@/hooks/chord-playback/usePlaybackState';
import { useIsPitchShiftEnabled, useIsPitchShiftReady } from '@/stores/uiStore';
import { youtubeMasterClock } from '@/services/audio/youtubeMasterClock';

jest.mock('@/stores/uiStore', () => ({
  useIsPitchShiftEnabled: jest.fn(),
  useIsPitchShiftReady: jest.fn(),
}));

jest.mock('@/services/audio/youtubeMasterClock', () => ({
  youtubeMasterClock: {
    onYoutubeProgress: jest.fn(),
    onPlay: jest.fn(),
    onPause: jest.fn(),
    onUserSeek: jest.fn(),
    onRateChange: jest.fn(),
    getLivePosition: jest.fn(() => 0),
    getRate: jest.fn(() => 1),
    isPlaying: jest.fn(() => false),
    setStoreAdapter: jest.fn(),
  },
}));

const mockUseIsPitchShiftEnabled = useIsPitchShiftEnabled as jest.MockedFunction<typeof useIsPitchShiftEnabled>;
const mockUseIsPitchShiftReady = useIsPitchShiftReady as jest.MockedFunction<typeof useIsPitchShiftReady>;
const mockMaster = youtubeMasterClock as unknown as {
  onYoutubeProgress: jest.Mock;
  onPlay: jest.Mock;
  onPause: jest.Mock;
};

/**
 * CLOCK AUTHORITY TESTS (post-unification):
 *
 * These tests encode the new invariant: `handleYouTubeProgress` and
 * play/pause handlers no longer write to `audioPlayerState` directly.
 * Instead they forward to `youtubeMasterClock`, which is the single
 * source of truth for timing. The master then publishes to the store
 * via the rAF loop in `useScrollAndAnimation` (verified in the
 * `useScrollAndAnimation` test file).
 *
 * The previous "YouTube writes when pitch shift off; GrainPlayer writes
 * when pitch shift on" split-authority model has been removed — it was
 * the root cause of the drift-at-non-1×-rates and freeze-on-pitch-toggle
 * bugs.
 */
describe('usePlaybackState (master clock authority)', () => {
  const createMockAudioElement = () => ({
    duration: 120,
    muted: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as HTMLAudioElement);

  const createMockYoutubePlayer = () => ({
    seekTo: jest.fn(),
    unMute: jest.fn(),
  });

  const createProps = () => ({
    audioRef: { current: createMockAudioElement() },
    youtubePlayer: createMockYoutubePlayer(),
    setYoutubePlayer: jest.fn(),
    audioPlayerState: {
      isPlaying: false,
      currentTime: 0,
      duration: 120,
      playbackRate: 1,
    },
    setAudioPlayerState: jest.fn(),
    setDuration: jest.fn(),
    isFollowModeEnabled: false,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsPitchShiftEnabled.mockReturnValue(false);
    mockUseIsPitchShiftReady.mockReturnValue(false);
  });

  it('forwards YouTube progress to the master clock regardless of pitch-shift state', () => {
    const props = createProps();
    const { result } = renderHook(() => usePlaybackState(props as never));

    act(() => {
      result.current.handleYouTubeProgress({ played: 0.1, playedSeconds: 12.5 });
    });

    expect(mockMaster.onYoutubeProgress).toHaveBeenCalledWith(12.5);
    expect(props.setAudioPlayerState).not.toHaveBeenCalled();
  });

  it('forwards progress to the master even while pitch shift is initializing', () => {
    mockUseIsPitchShiftEnabled.mockReturnValue(true);
    mockUseIsPitchShiftReady.mockReturnValue(false);
    const props = createProps();
    const { result } = renderHook(() => usePlaybackState(props as never));

    act(() => {
      result.current.handleYouTubeProgress({ played: 0.2, playedSeconds: 24.7 });
    });

    expect(mockMaster.onYoutubeProgress).toHaveBeenCalledWith(24.7);
    expect(props.setAudioPlayerState).not.toHaveBeenCalled();
  });

  it('forwards progress to the master when pitch shift is active (unified authority)', () => {
    mockUseIsPitchShiftEnabled.mockReturnValue(true);
    mockUseIsPitchShiftReady.mockReturnValue(true);
    const props = createProps();
    const { result } = renderHook(() => usePlaybackState(props as never));

    act(() => {
      result.current.handleYouTubeProgress({ played: 0.3, playedSeconds: 33.0 });
    });

    // Unified model: master clock receives every onProgress tick. The
    // hysteresis inside the master decides whether to re-anchor. The
    // store is never written from this path — the beat-grid rAF loop
    // does the publish.
    expect(mockMaster.onYoutubeProgress).toHaveBeenCalledWith(33.0);
    expect(props.setAudioPlayerState).not.toHaveBeenCalled();
  });

  it('notifies the master on YouTube play and pause', () => {
    const props = createProps();
    const { result } = renderHook(() => usePlaybackState(props as never));

    act(() => {
      result.current.handleYouTubePlay();
    });
    expect(mockMaster.onPlay).toHaveBeenCalled();

    act(() => {
      result.current.handleYouTubePause();
    });
    expect(mockMaster.onPause).toHaveBeenCalled();
  });
});
