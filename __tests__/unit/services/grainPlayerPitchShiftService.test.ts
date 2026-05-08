import {
  GrainPlayerPitchShiftService,
  getGrainPlayerPitchShiftService,
  resetGrainPlayerPitchShiftService,
} from '@/services/audio/grainPlayerPitchShiftService';
import { DEFAULT_PITCH_SHIFTED_AUDIO_VOLUME } from '@/config/audioDefaults';
import * as Tone from 'tone';

const mockGrainPlayer = {
  loaded: true,
  buffer: {
    duration: 180,
    get: jest.fn(() => ({} as AudioBuffer)),
  },
  start: jest.fn(),
  stop: jest.fn(),
  connect: jest.fn(),
  dispose: jest.fn(),
  detune: 0,
  playbackRate: 1,
};

const mockGain = {
  gain: {
    rampTo: jest.fn(),
    value: 1,
  },
  connect: jest.fn(),
  dispose: jest.fn(),
};

const mockFilter = {
  frequency: {
    rampTo: jest.fn(),
    value: 16000,
  },
  connect: jest.fn(),
  dispose: jest.fn(),
};

const mockLimiter = {
  toDestination: jest.fn(),
  dispose: jest.fn(),
};

jest.mock('tone', () => ({
  Context: jest.fn().mockImplementation(() => ({
    resume: jest.fn(() => Promise.resolve()),
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
  })),
  setContext: jest.fn(),
  GrainPlayer: jest.fn().mockImplementation((options) => {
    setTimeout(() => options.onload?.(), 0);
    return mockGrainPlayer;
  }),
  Gain: jest.fn(() => mockGain),
  Filter: jest.fn(() => mockFilter),
  Limiter: jest.fn(() => mockLimiter),
  start: jest.fn().mockResolvedValue(undefined),
  getContext: jest.fn(() => ({
    state: 'running',
    resume: jest.fn().mockResolvedValue(undefined),
    rawContext: undefined,
  })),
  now: jest.fn(() => Date.now() / 1000),
}));

describe('GrainPlayerPitchShiftService', () => {
  let service: GrainPlayerPitchShiftService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    service = new GrainPlayerPitchShiftService();
    mockGrainPlayer.detune = 0;
    mockGrainPlayer.playbackRate = 1;
  });

  afterEach(() => {
    service.dispose();
  });

  it('keeps the singleton contract stable', () => {
    const first = getGrainPlayerPitchShiftService();
    const second = getGrainPlayerPitchShiftService();
    expect(first).toBe(second);

    resetGrainPlayerPitchShiftService();
    expect(getGrainPlayerPitchShiftService()).not.toBe(first);
  });

  it('loads audio and creates the expected playback chain for remote and blob URLs', async () => {
    await service.loadAudio('https://example.com/audio.mp3', 0);

    expect(Tone.GrainPlayer).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/proxy-audio?url=https%3A%2F%2Fexample.com%2Faudio.mp3&forceProxy=1',
      detune: 0,
    }));
    expect(Tone.Gain).toHaveBeenCalled();
    expect(Tone.Filter).toHaveBeenCalled();
    expect(Tone.Limiter).toHaveBeenCalled();

    await service.loadAudio('blob:http://localhost/test', 5);

    expect(Tone.GrainPlayer).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'blob:http://localhost/test',
      detune: 500,
    }));
    expect(service.getState().duration).toBe(180);
  });

  it('applies pitch and volume through the audio engine while clamping user input', async () => {
    await service.loadAudio('https://example.com/audio.mp3', 0);

    service.setPitch(12);
    expect(mockGrainPlayer.detune).toBe(1200);
    expect(mockFilter.frequency.rampTo).toHaveBeenCalledWith(expect.any(Number), 0.1);

    service.setVolume(150);
    expect(service.getVolume()).toBe(100);
    expect(mockGain.gain.rampTo).toHaveBeenCalledWith(1, 0.1);

    service.setVolume(-10);
    expect(service.getVolume()).toBe(0);
    expect(mockGain.gain.rampTo).toHaveBeenLastCalledWith(0, 0.1);
  });

  it('plays, pauses, seeks, and resumes from bounded playback positions', async () => {
    const onTimeUpdate = jest.fn();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await service.loadAudio('https://example.com/audio.mp3', 0);
    service.setOnTimeUpdate(onTimeUpdate);

    service.play();
    expect(mockGrainPlayer.start).toHaveBeenCalledWith(undefined, 0);
    expect(service.getState().isPlaying).toBe(true);

    service.seek(999);
    expect(onTimeUpdate).toHaveBeenCalledWith(180);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[GrainPlayerPitchShiftService] seek(999.000s) exceeds buffer duration 180.000s; clamping',
    );
    consoleWarnSpy.mockRestore();
    expect(mockGrainPlayer.stop).toHaveBeenCalled();
    expect(mockGrainPlayer.start).toHaveBeenLastCalledWith(undefined, 180);
    expect(service.getState().currentTime).toBe(180);

    service.pause();
    expect(mockGrainPlayer.stop).toHaveBeenCalledTimes(2);
    expect(service.getState().isPlaying).toBe(false);
  });

  it('does not start playback before audio is loaded and preserves safe state', () => {
    service.play();

    expect(mockGrainPlayer.start).not.toHaveBeenCalled();
    expect(service.getState().isPlaying).toBe(false);
    expect(service.getVolume()).toBe(DEFAULT_PITCH_SHIFTED_AUDIO_VOLUME);
  });

  // REGRESSION: Tone.js GrainPlayer._start() silently multiplies the offset
  // by playbackRate before scheduling the first grain (see
  // node_modules/tone/build/esm/source/buffer/GrainPlayer.js _start + _tick).
  // Without compensation, `grainPlayer.start(undefined, 30)` at rate 1.5
  // starts playback at buffer position 45. The service compensates by
  // pre-dividing the offset by `_playbackRate`.
  describe('Tone.js GrainPlayer offset rate-scaling compensation', () => {
    it('divides the play() offset by playbackRate at non-default rates', async () => {
      await service.loadAudio('https://example.com/audio.mp3', 0, 1.5);
      service.seek(30);
      service.play();

      // 30 / 1.5 = 20 — compensates Tone.js internal multiplication by rate
      expect(mockGrainPlayer.start).toHaveBeenLastCalledWith(undefined, 20);
      // Live position extrapolates with wall-clock after play(); tolerate drift
      expect(service.getState().currentTime).toBeCloseTo(30, 0);
    });

    it('divides the seek() offset by playbackRate when resuming playback at non-default rates', async () => {
      await service.loadAudio('https://example.com/audio.mp3', 0, 2);
      service.play();
      mockGrainPlayer.start.mockClear();

      service.seek(60);

      // 60 / 2.0 = 30 — compensates Tone.js internal multiplication by rate
      expect(mockGrainPlayer.start).toHaveBeenLastCalledWith(undefined, 30);
      expect(service.getState().currentTime).toBeCloseTo(60, 0);
    });

    it('passes the raw offset unchanged at rate 1.0 (identity case)', async () => {
      await service.loadAudio('https://example.com/audio.mp3', 0, 1);
      service.seek(45);
      service.play();

      expect(mockGrainPlayer.start).toHaveBeenLastCalledWith(undefined, 45);
    });

    it('falls back to raw offset if rate becomes invalid', async () => {
      await service.loadAudio('https://example.com/audio.mp3', 0, 1);
      service.seek(30);
      // Force an invalid rate via internal mutation — guards against a NaN/0
      // leak if upstream ever passes a bad rate.
      (service as unknown as { _playbackRate: number })._playbackRate = 0;
      service.play();

      expect(mockGrainPlayer.start).toHaveBeenLastCalledWith(undefined, 30);
    });
  });

  it('disposes loaded resources and resets exposed playback state', async () => {
    await service.loadAudio('https://example.com/audio.mp3', 0);
    service.play();

    service.dispose();

    expect(mockGrainPlayer.dispose).toHaveBeenCalled();
    expect(mockGain.dispose).toHaveBeenCalled();
    expect(mockFilter.dispose).toHaveBeenCalled();
    expect(mockLimiter.dispose).toHaveBeenCalled();
    expect(service.getState()).toEqual({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playbackRate: 1,
    });
  });
});
