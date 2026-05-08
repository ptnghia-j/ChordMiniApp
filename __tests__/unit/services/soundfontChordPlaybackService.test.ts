import { SoundfontChordPlaybackService, getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { Soundfont } from 'smplr';

const mockSoundfontInstances: Array<{
  load: jest.Mock;
  loaded: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  hasLoops: boolean;
  output: { setVolume: jest.Mock };
}> = [];

jest.mock('smplr', () => ({
  Soundfont: jest.fn().mockImplementation(() => {
    const instrument = {
      load: jest.fn().mockResolvedValue(undefined),
      loaded: jest.fn().mockResolvedValue(undefined),
      start: jest.fn(() => jest.fn()),
      stop: jest.fn(),
      hasLoops: true,
      output: {
        setVolume: jest.fn(),
      },
    };
    mockSoundfontInstances.push(instrument);
    return instrument;
  }),
}));

global.AudioContext = jest.fn().mockImplementation(() => ({
  createGain: jest.fn(() => ({
    gain: { value: 1 },
    connect: jest.fn(),
  })),
  destination: {},
  currentTime: 0,
  state: 'running',
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
})) as any;

describe('SoundfontChordPlaybackService', () => {
  let service: SoundfontChordPlaybackService;

  beforeEach(() => {
    service = getSoundfontChordPlaybackService();
    service.dispose();
    jest.clearAllMocks();
    mockSoundfontInstances.length = 0;
  });

  it('keeps the singleton contract stable', () => {
    const first = getSoundfontChordPlaybackService();
    const second = getSoundfontChordPlaybackService();

    expect(first).toBe(second);
  });

  it('preserves updated public options through getOptions()', () => {
    service.updateOptions({
      pianoVolume: 80,
      guitarVolume: 10,
      violinVolume: 0,
      fluteVolume: 0,
      saxophoneVolume: 0,
      bassVolume: 15,
      enabled: true,
    });

    expect(service.getOptions()).toMatchObject({
      pianoVolume: 80,
      guitarVolume: 10,
      bassVolume: 15,
      enabled: true,
    });
  });

  it('does not schedule instruments when playback is disabled or all relevant volumes are muted', async () => {
    service.updateOptions({
      pianoVolume: 0,
      guitarVolume: 0,
      violinVolume: 0,
      fluteVolume: 0,
      saxophoneVolume: 0,
      bassVolume: 0,
      enabled: false,
    });

    await service.playChord('C', 2, 120, 1);

    expect(Soundfont).not.toHaveBeenCalled();
    expect(mockSoundfontInstances).toHaveLength(0);
  });

  it('loads and schedules the melody violin instrument for direct instrument playback', async () => {
    service.updateOptions({
      pianoVolume: 0,
      guitarVolume: 0,
      violinVolume: 0,
      melodyVolume: 45,
      fluteVolume: 0,
      saxophoneVolume: 0,
      bassVolume: 0,
      enabled: true,
    });

    await service.playChordInstrument('melodyViolin', 'C', 2, 120, 1);

    expect(Soundfont).toHaveBeenCalledTimes(1);
    expect(Soundfont).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      instrument: expect.any(String),
    }));
    expect(mockSoundfontInstances[0].start).toHaveBeenCalled();
    expect(mockSoundfontInstances[0].output.setVolume).toHaveBeenCalled();
  });

  it('does not schedule retired saxophone chord-pattern playback', async () => {
    service.updateOptions({
      pianoVolume: 0,
      guitarVolume: 0,
      violinVolume: 0,
      melodyVolume: 0,
      fluteVolume: 0,
      saxophoneVolume: 45,
      bassVolume: 0,
      enabled: true,
    });

    await service.playChordInstrument('saxophone', 'C', 2, 120, 1);

    expect(Soundfont).not.toHaveBeenCalled();
    expect(mockSoundfontInstances).toHaveLength(0);
  });

  it('uses more note starts for denser chords without making the loudest onset hotter than a simpler chord', async () => {
    service.updateOptions({
      pianoVolume: 70,
      guitarVolume: 0,
      violinVolume: 0,
      fluteVolume: 0,
      saxophoneVolume: 0,
      bassVolume: 0,
      enabled: true,
    });

    await service.playChord('C', 1.5, 120, 1);
    const pianoInstrument = mockSoundfontInstances.at(-1)!;
    const simpleCalls = pianoInstrument.start.mock.calls.map(([args]: [{ velocity: number; time: number }]) => args);
    const simpleOnsetVelocities = simpleCalls.filter((args) => args.time === 0).map((args) => args.velocity);

    pianoInstrument.start.mockClear();

    await service.playChord('Cmaj7', 1.5, 120, 1);
    const denseCalls = pianoInstrument.start.mock.calls.map(([args]: [{ velocity: number; time: number }]) => args);
    const denseOnsetVelocities = denseCalls.filter((args) => args.time === 0).map((args) => args.velocity);

    expect(denseOnsetVelocities.length).toBeGreaterThan(simpleOnsetVelocities.length);
    expect(Math.max(...denseOnsetVelocities)).toBeLessThanOrEqual(Math.max(...simpleOnsetVelocities));
  });

  it('starts replacement chord playback and stops pending prior notes on chord switches', async () => {
    service.updateOptions({
      pianoVolume: 70,
      guitarVolume: 0,
      violinVolume: 0,
      fluteVolume: 0,
      saxophoneVolume: 0,
      bassVolume: 0,
      enabled: true,
    });

    await service.playChord('C', 2, 120, 1);
    const pianoInstrument = mockSoundfontInstances.at(-1)!;
    const firstStopFns = pianoInstrument.start.mock.results
      .map((result) => result.value)
      .filter((value): value is jest.Mock => typeof value === 'function');

    (service as any).audioContext.currentTime = 0.5;
    pianoInstrument.start.mockClear();

    await service.playChord('F', 2, 120, 1);

    expect(pianoInstrument.start).toHaveBeenCalled();
    expect(firstStopFns.some((stopFn) => stopFn.mock.calls.length > 0)).toBe(true);
  });

  it('stops active notes and clears runtime state when stopAll/dispose are used', async () => {
    service.updateOptions({
      pianoVolume: 70,
      guitarVolume: 0,
      violinVolume: 0,
      fluteVolume: 0,
      saxophoneVolume: 0,
      bassVolume: 0,
      enabled: true,
    });

    await service.playChord('C', 2, 120, 1);
    const pianoInstrument = mockSoundfontInstances.at(-1)!;
    const stopFns = pianoInstrument.start.mock.results
      .map((result) => result.value)
      .filter((value): value is jest.Mock => typeof value === 'function');

    service.stopAll();
    expect(stopFns.some((stopFn) => stopFn.mock.calls.length > 0)).toBe(true);

    service.dispose();
    expect(service.isReady()).toBe(false);
  });
});
