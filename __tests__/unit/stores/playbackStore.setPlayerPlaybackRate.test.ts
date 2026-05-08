/**
 * Regression tests for `playbackStore.setPlayerPlaybackRate`.
 *
 * Fan-out contract (Task 2 of the pitch-shift playback-sync refactor):
 *   Calling `setPlayerPlaybackRate(rate)` must imperatively propagate the
 *   rate to EVERY active playback surface in a single call:
 *     1. YouTube iframe  (`youtubePlayer.setPlaybackRate`)
 *     2. GrainPlayer pitch-shift service (`getPitchShiftService().setPlaybackRate`)
 *     3. HTML5 `<audio>` element fallback (`audioRef.current.playbackRate`)
 *   …and persist the value on the store as `playbackRate`.
 *
 * These tests guard against silent regressions where any one surface is
 * forgotten — historically the cause of the "pitch-shifted audio speeds up
 * but YouTube frame + beat animation stay at old rate" desync bug.
 */

import type { RefObject } from 'react';
import {
  setPitchShiftService,
  getPitchShiftService,
} from '@/services/audio/pitchShiftServiceInstance';
import { usePlaybackStore } from '@/stores/playbackStore';

type FakeService = {
  setPlaybackRate: jest.Mock;
};

describe('playbackStore.setPlayerPlaybackRate', () => {
  let originalService: ReturnType<typeof getPitchShiftService>;

  beforeEach(() => {
    originalService = getPitchShiftService();
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
  });

  afterEach(() => {
    // Restore whatever was installed before the test so other suites are not
    // affected by the fake service we inject below.
    setPitchShiftService(originalService as never);
  });

  it('propagates the rate to the YouTube iframe, pitch-shift service, and HTML5 audio, and persists the value', () => {
    const ytSetPlaybackRate = jest.fn();
    const fakeYoutubePlayer = { setPlaybackRate: ytSetPlaybackRate };

    const fakeAudio = { playbackRate: 1 } as unknown as HTMLAudioElement;
    const fakeAudioRef = { current: fakeAudio } as RefObject<HTMLAudioElement>;

    const fakeService: FakeService = { setPlaybackRate: jest.fn() };
    // The service instance module stores the GrainPlayerPitchShiftService; we
    // only assert on the shared `setPlaybackRate` method, so a minimal shape
    // injected via `as never` is sufficient for this fan-out contract test.
    setPitchShiftService(fakeService as never);

    const store = usePlaybackStore.getState();
    store.setYoutubePlayer(fakeYoutubePlayer);
    store.setAudioRef(fakeAudioRef);

    usePlaybackStore.getState().setPlayerPlaybackRate(1.5);

    expect(ytSetPlaybackRate).toHaveBeenCalledTimes(1);
    expect(ytSetPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(fakeService.setPlaybackRate).toHaveBeenCalledTimes(1);
    expect(fakeService.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(fakeAudio.playbackRate).toBe(1.5);
    expect(usePlaybackStore.getState().playbackRate).toBe(1.5);
  });

  it('does not throw when individual surfaces fail or are absent', () => {
    const ytSetPlaybackRate = jest.fn(() => {
      throw new Error('boom');
    });

    usePlaybackStore.getState().setYoutubePlayer({ setPlaybackRate: ytSetPlaybackRate });
    // No audioRef, no pitch-shift service installed.
    setPitchShiftService(null);

    // Silence expected console.warn noise emitted by the store's catch blocks.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => {
      usePlaybackStore.getState().setPlayerPlaybackRate(0.75);
    }).not.toThrow();

    expect(ytSetPlaybackRate).toHaveBeenCalledWith(0.75);
    expect(usePlaybackStore.getState().playbackRate).toBe(0.75);

    warnSpy.mockRestore();
  });

  it('still writes the rate to the store when no playback surfaces are attached', () => {
    setPitchShiftService(null);
    // Do not attach audioRef nor youtubePlayer.
    usePlaybackStore.getState().setPlayerPlaybackRate(2.0);
    expect(usePlaybackStore.getState().playbackRate).toBe(2.0);
  });

  it('snaps an off-list rate to YouTube\'s closest supported value before fan-out', () => {
    const ytSetPlaybackRate = jest.fn();
    const getAvailablePlaybackRates = jest.fn(
      () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    );
    const fakeYoutubePlayer = {
      setPlaybackRate: ytSetPlaybackRate,
      getAvailablePlaybackRates,
    };

    const fakeService: FakeService = { setPlaybackRate: jest.fn() };
    setPitchShiftService(fakeService as never);

    const fakeAudio = { playbackRate: 1 } as unknown as HTMLAudioElement;
    const fakeAudioRef = { current: fakeAudio } as RefObject<HTMLAudioElement>;

    usePlaybackStore.getState().setYoutubePlayer(fakeYoutubePlayer);
    usePlaybackStore.getState().setAudioRef(fakeAudioRef);

    // Silence dev-only warn about the snap.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // 1.3x is not in the supported list; closest values are 1.25 and 1.5, with
    // 1.25 at distance 0.05 < 1.5 at distance 0.2, so we must snap to 1.25.
    usePlaybackStore.getState().setPlayerPlaybackRate(1.3);

    expect(getAvailablePlaybackRates).toHaveBeenCalled();
    expect(ytSetPlaybackRate).toHaveBeenCalledWith(1.25);
    expect(fakeService.setPlaybackRate).toHaveBeenCalledWith(1.25);
    expect(fakeAudio.playbackRate).toBe(1.25);
    expect(usePlaybackStore.getState().playbackRate).toBe(1.25);

    warnSpy.mockRestore();
  });

  it('does not snap when the requested rate is already supported', () => {
    const ytSetPlaybackRate = jest.fn();
    const getAvailablePlaybackRates = jest.fn(
      () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    );
    const fakeYoutubePlayer = {
      setPlaybackRate: ytSetPlaybackRate,
      getAvailablePlaybackRates,
    };

    const fakeService: FakeService = { setPlaybackRate: jest.fn() };
    setPitchShiftService(fakeService as never);

    usePlaybackStore.getState().setYoutubePlayer(fakeYoutubePlayer);
    usePlaybackStore.getState().setPlayerPlaybackRate(1.5);

    expect(ytSetPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(fakeService.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(usePlaybackStore.getState().playbackRate).toBe(1.5);
  });
});
