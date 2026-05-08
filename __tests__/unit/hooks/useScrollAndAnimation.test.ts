import { act, renderHook } from '@testing-library/react';
import { useScrollAndAnimation } from '@/hooks/scroll/useScrollAndAnimation';
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
    isPlaying: jest.fn(() => true),
    setStoreAdapter: jest.fn(),
  },
}));

const mockUseIsPitchShiftEnabled = useIsPitchShiftEnabled as jest.MockedFunction<typeof useIsPitchShiftEnabled>;
const mockUseIsPitchShiftReady = useIsPitchShiftReady as jest.MockedFunction<typeof useIsPitchShiftReady>;
const mockMaster = youtubeMasterClock as unknown as {
  getLivePosition: jest.Mock;
  getRate: jest.Mock;
  isPlaying: jest.Mock;
};

/**
 * CLOCK AUTHORITY TESTS (post-unification):
 *
 * The rAF loop now reads the time from `youtubeMasterClock.getLivePosition()`
 * unconditionally. Pitch-shift state no longer gates the read or the
 * store publish — both surfaces are fed by the same master. This is
 * the single-writer invariant that eliminated the drift-at-non-1×
 * and freeze-on-pitch-toggle bugs.
 */
describe('useScrollAndAnimation (master clock driven)', () => {
  const rafQueue: FrameRequestCallback[] = [];
  let nextRafId = 1;

  const flushAnimationFrames = (count: number) => {
    for (let i = 0; i < count; i += 1) {
      const callback = rafQueue.shift();
      if (!callback) break;
      act(() => {
        callback(performance.now());
      });
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rafQueue.length = 0;
    nextRafId = 1;
    mockUseIsPitchShiftEnabled.mockReturnValue(false);
    mockUseIsPitchShiftReady.mockReturnValue(false);
    mockMaster.getLivePosition.mockReturnValue(0);
    mockMaster.getRate.mockReturnValue(1);
    mockMaster.isPlaying.mockReturnValue(true);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      rafQueue.push(callback);
      return nextRafId += 1;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createDeps = () => ({
    youtubePlayer: { getCurrentTime: jest.fn(() => 12.5) },
    isPlaying: true,
    currentTime: 12.25,
    playbackRate: 1,
    analysisResults: { beats: [], downbeats: [], beatDetectionResult: { bpm: 120 } } as never,
    currentBeatIndex: -1,
    currentBeatIndexRef: { current: -1 },
    setCurrentBeatIndex: jest.fn(),
    setCurrentDownbeatIndex: jest.fn(),
    setCurrentTime: jest.fn(),
    isFollowModeEnabled: false,
    chordGridData: null,
    globalSpeedAdjustment: null,
    setGlobalSpeedAdjustment: jest.fn(),
    lastClickInfo: null,
  });

  it('reads the master clock and writes currentTime when pitch shift is inactive', () => {
    mockMaster.getLivePosition.mockReturnValue(12.5);
    const deps = createDeps();
    renderHook(() => useScrollAndAnimation(deps as never));

    flushAnimationFrames(3);

    expect(mockMaster.getLivePosition).toHaveBeenCalled();
    expect(deps.setCurrentTime).toHaveBeenCalledWith(12.5);
  });

  it('still reads the master and writes currentTime when pitch shift is active (unified authority)', () => {
    mockUseIsPitchShiftEnabled.mockReturnValue(true);
    mockUseIsPitchShiftReady.mockReturnValue(true);
    mockMaster.getLivePosition.mockReturnValue(42.1);
    const deps = createDeps();
    renderHook(() => useScrollAndAnimation(deps as never));

    flushAnimationFrames(3);

    // Under the unified model the animation loop ALWAYS reads the master
    // (never falls back to YT's own getCurrentTime) and ALWAYS publishes
    // to the store. There is no "GrainPlayer is the sole writer" branch
    // — the master is the single source of truth regardless of pitch
    // shift state.
    expect(mockMaster.getLivePosition).toHaveBeenCalled();
    expect(deps.setCurrentTime).toHaveBeenCalledWith(42.1);
  });

  it('publishes the master position as-is (click-override extrapolation removed under unified clock)', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    mockMaster.getLivePosition.mockReturnValue(10.1);
    const deps = {
      ...createDeps(),
      playbackRate: 2,
      lastClickInfo: {
        visualIndex: 4,
        timestamp: 10,
        clickTime: 1500,
      },
    };

    renderHook(() => useScrollAndAnimation(deps as never));

    flushAnimationFrames(3);

    // UNIFIED CLOCK INVARIANT: the old implementation applied a
    // `Date.now() × playbackRate` extrapolation on top of the player
    // clock to paper over seek latency (expected 11 = 10 + 1s at 2×
    // over 500 ms of wall time). That was a third independent place
    // where `playbackRate` was applied to time and was a known source
    // of non-1×-rate drift. With `youtubeMasterClock.onUserSeek` now
    // seeding the anchor synchronously, the extrapolation is gone and
    // the raw master position is sufficient.
    expect(deps.setCurrentTime).toHaveBeenCalledWith(10.1);
  });

  it('animates through padding beats before the first detected beat timestamp', () => {
    mockMaster.getLivePosition.mockReturnValue(0.6);
    const deps = {
      ...createDeps(),
      analysisResults: {
        beats: [{ time: 1 }],
        downbeats: [],
        beatDetectionResult: { bpm: 120 },
      } as never,
      chordGridData: {
        chords: ['', '', 'C', 'G'],
        beats: [0, 0.5, 1, 1.5],
        paddingCount: 2,
        shiftCount: 0,
      } as never,
    };

    renderHook(() => useScrollAndAnimation(deps as never));

    flushAnimationFrames(3);

    expect(deps.setCurrentBeatIndex).toHaveBeenCalledWith(1);
  });
});
