import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { getAudioMixerService } from '@/services/chord-playback/audioMixerService';

jest.mock('smplr', () => ({
  Soundfont: jest.fn().mockImplementation(() => ({
    loaded: Promise.resolve(),
    start: jest.fn(),
    stop: jest.fn(),
    output: {
      setVolume: jest.fn(),
    },
  })),
}));

global.AudioContext = jest.fn().mockImplementation(() => ({
  createGain: jest.fn(() => ({
    gain: { value: 1 },
    connect: jest.fn(),
  })),
  createOscillator: jest.fn(() => ({
    frequency: { value: 440 },
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  })),
  destination: {},
  currentTime: 0,
  state: 'running',
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
})) as any;

describe('Chord Playback Workflow Integration Tests', () => {
  let chordPlaybackService: ReturnType<typeof getSoundfontChordPlaybackService>;
  let audioMixerService: ReturnType<typeof getAudioMixerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    chordPlaybackService = getSoundfontChordPlaybackService();
    audioMixerService = getAudioMixerService();
    audioMixerService.resetToDefaults();
  });

  it('applies mixer-controlled instrument volumes to the playback service', () => {
    audioMixerService.setChordPlaybackService(chordPlaybackService);

    audioMixerService.setPianoVolume(70);
    audioMixerService.setGuitarVolume(80);
    audioMixerService.setViolinVolume(65);

    const effectiveVolumes = audioMixerService.getEffectiveVolumes();

    expect(chordPlaybackService.getOptions()).toEqual(
      expect.objectContaining({
        pianoVolume: effectiveVolumes.piano,
        guitarVolume: effectiveVolumes.guitar,
        violinVolume: effectiveVolumes.violin,
      }),
    );
  });

  it('keeps effective volumes consistent when master and chord playback levels change together', () => {
    audioMixerService.setChordPlaybackService(chordPlaybackService);

    audioMixerService.setMasterVolume(50);
    audioMixerService.setChordPlaybackVolume(100);
    audioMixerService.setPianoVolume(100);

    expect(audioMixerService.getEffectiveVolumes()).toEqual(
      expect.objectContaining({
        piano: 50,
      }),
    );
  });

  it('accepts a full chord progression while preserving enabled playback state', async () => {
    chordPlaybackService.updateOptions({ enabled: true, pianoVolume: 50 });

    await expect(
      Promise.all([
        chordPlaybackService.playChord('C', 1.5, 120),
        chordPlaybackService.playChord('Am', 1, 120),
        chordPlaybackService.playChord('F', 0.5, 120),
      ]),
    ).resolves.toEqual([undefined, undefined, undefined]);

    expect(chordPlaybackService.getOptions()).toEqual(
      expect.objectContaining({
        enabled: true,
        pianoVolume: 50,
      }),
    );
  });

  it('supports slash chords, jazz chords, and invalid chord names without breaking the playback flow', async () => {
    chordPlaybackService.updateOptions({ enabled: true, pianoVolume: 50 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(chordPlaybackService.playChord('C/E', 1, 120)).resolves.toBeUndefined();
    await expect(chordPlaybackService.playChord('Cmaj7', 1, 120)).resolves.toBeUndefined();
    await expect(chordPlaybackService.playChord('InvalidChord', 1, 120)).resolves.toBeUndefined();

    warnSpy.mockRestore();
  });

  it('lets pause-style cleanup and disposal run after playback activity', async () => {
    chordPlaybackService.updateOptions({ enabled: true, pianoVolume: 50 });

    await chordPlaybackService.playChord('C', 2, 120);

    expect(() => chordPlaybackService.stopAll()).not.toThrow();
    expect(() => chordPlaybackService.dispose()).not.toThrow();
    expect(chordPlaybackService.isReady()).toBe(false);
  });

  it('retains the latest service options after rapid user-style mixer updates', () => {
    for (let i = 0; i < 10; i += 1) {
      chordPlaybackService.updateOptions({
        enabled: true,
        pianoVolume: i * 10,
      });
    }

    expect(chordPlaybackService.getOptions()).toEqual(
      expect.objectContaining({
        enabled: true,
        pianoVolume: 90,
      }),
    );
  });
});
