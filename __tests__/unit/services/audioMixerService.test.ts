/**
 * Unit Tests: audioMixerService
 * 
 * Tests for the audio mixer service including:
 * - Volume control for all instruments
 * - Master volume management
 * - Service registration (YouTube, chord playback, metronome)
 * - Listener/observer pattern
 * - Settings persistence
 * - Mute/unmute functionality
 */

import { AudioMixerService, getAudioMixerService, YouTubePlayer } from '@/services/chord-playback/audioMixerService';
import { DEFAULT_AUDIO_MIXER_SETTINGS } from '@/config/audioDefaults';

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage
});

describe('AudioMixerService', () => {
  let service: AudioMixerService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSessionStorage.clear();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    service = new AudioMixerService();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getAudioMixerService();
      const instance2 = getAudioMixerService();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Initial Settings', () => {
    it('should have default settings', () => {
      const settings = service.getSettings();
      
      expect(settings).toEqual({ ...DEFAULT_AUDIO_MIXER_SETTINGS });
    });

    it('should load settings from sessionStorage', () => {
      const savedSettings = {
        masterVolume: 90,
        youtubeVolume: 80,
        pianoVolume: 70
      };
      
      mockSessionStorage.setItem('audioMixerSettings', JSON.stringify(savedSettings));
      
      const newService = new AudioMixerService();
      const settings = newService.getSettings();
      
      expect(settings.masterVolume).toBe(90);
      expect(settings.youtubeVolume).toBe(80);
      expect(settings.pianoVolume).toBe(70);
    });

    it('should handle corrupted sessionStorage data', () => {
      mockSessionStorage.setItem('audioMixerSettings', 'invalid json');
      
      const newService = new AudioMixerService();
      const settings = newService.getSettings();
      
      // Should fall back to defaults
      expect(settings.masterVolume).toBe(80);
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to load audio mixer settings:',
        expect.any(SyntaxError)
      );
    });
  });

  describe('Master Volume', () => {
    it('should set master volume', () => {
      service.setMasterVolume(50);
      expect(service.getSettings().masterVolume).toBe(50);
    });

    it('should clamp master volume to 0-100', () => {
      service.setMasterVolume(-10);
      expect(service.getSettings().masterVolume).toBe(0);
      
      service.setMasterVolume(150);
      expect(service.getSettings().masterVolume).toBe(100);
    });

    it('should save settings after changing master volume', () => {
      service.setMasterVolume(60);
      
      const saved = mockSessionStorage.getItem('audioMixerSettings');
      expect(saved).toBeDefined();
      expect(JSON.parse(saved!).masterVolume).toBe(60);
    });
  });

  describe('YouTube Volume', () => {
    it('should set YouTube volume', () => {
      service.setYouTubeVolume(75);
      expect(service.getSettings().youtubeVolume).toBe(75);
    });

    it('should clamp YouTube volume to 0-100', () => {
      service.setYouTubeVolume(-5);
      expect(service.getSettings().youtubeVolume).toBe(0);
      
      service.setYouTubeVolume(120);
      expect(service.getSettings().youtubeVolume).toBe(100);
    });

    it('should apply volume to YouTube player when set', () => {
      const mockPlayer: YouTubePlayer = {
        seekTo: jest.fn(),
        playVideo: jest.fn(),
        pauseVideo: jest.fn(),
        setPlaybackRate: jest.fn(),
        getCurrentTime: jest.fn(() => 0),
        muted: false,
        setVolume: jest.fn()
      };
      
      service.setYouTubePlayer(mockPlayer);
      service.setYouTubeVolume(50);
      
      expect(mockPlayer.setVolume).toHaveBeenCalled();
    });
  });

  describe('Pitch-Shifted Audio Volume', () => {
    it('should set pitch-shifted audio volume', () => {
      service.setPitchShiftedAudioVolume(40);
      expect(service.getSettings().pitchShiftedAudioVolume).toBe(40);
    });

    it('should get pitch-shifted audio volume', () => {
      service.setPitchShiftedAudioVolume(35);
      expect(service.getPitchShiftedAudioVolume()).toBe(35);
    });

    it('should clamp pitch-shifted audio volume', () => {
      service.setPitchShiftedAudioVolume(-10);
      expect(service.getPitchShiftedAudioVolume()).toBe(0);
      
      service.setPitchShiftedAudioVolume(110);
      expect(service.getPitchShiftedAudioVolume()).toBe(100);
    });
  });

  describe('Chord Playback Volume', () => {
    it('should set chord playback volume', () => {
      service.setChordPlaybackVolume(80);
      expect(service.getSettings().chordPlaybackVolume).toBe(80);
    });

    it('should clamp chord playback volume', () => {
      service.setChordPlaybackVolume(-5);
      expect(service.getSettings().chordPlaybackVolume).toBe(0);
      
      service.setChordPlaybackVolume(105);
      expect(service.getSettings().chordPlaybackVolume).toBe(100);
    });
  });

  describe('Individual Instrument Volumes', () => {
    it('should set piano volume', () => {
      service.setPianoVolume(70);
      expect(service.getSettings().pianoVolume).toBe(70);
    });

    it('should set guitar volume', () => {
      service.setGuitarVolume(80);
      expect(service.getSettings().guitarVolume).toBe(80);
    });

    it('should set violin volume', () => {
      service.setViolinVolume(65);
      expect(service.getSettings().violinVolume).toBe(65);
    });

    it('should set flute volume', () => {
      service.setFluteVolume(55);
      expect(service.getSettings().fluteVolume).toBe(55);
    });

    it('should clamp instrument volumes', () => {
      service.setPianoVolume(-10);
      expect(service.getSettings().pianoVolume).toBe(0);
      
      service.setGuitarVolume(150);
      expect(service.getSettings().guitarVolume).toBe(100);
    });
  });

  describe('Metronome Volume', () => {
    it('should set metronome volume', () => {
      service.setMetronomeVolume(85);
      expect(service.getSettings().metronomeVolume).toBe(85);
    });

    it('should clamp metronome volume', () => {
      service.setMetronomeVolume(-5);
      expect(service.getSettings().metronomeVolume).toBe(0);
      
      service.setMetronomeVolume(110);
      expect(service.getSettings().metronomeVolume).toBe(100);
    });

    it('should apply volume to metronome service', () => {
      const mockMetronome = {
        setVolume: jest.fn()
      };
      
      service.setMetronomeService(mockMetronome);
      service.setMetronomeVolume(75);
      
      expect(mockMetronome.setVolume).toHaveBeenCalled();
    });
  });

  describe('Service Registration', () => {
    it('should register YouTube player', () => {
      const mockPlayer: YouTubePlayer = {
        seekTo: jest.fn(),
        playVideo: jest.fn(),
        pauseVideo: jest.fn(),
        setPlaybackRate: jest.fn(),
        getCurrentTime: jest.fn(() => 0),
        muted: false,
        setVolume: jest.fn()
      };
      
      service.setYouTubePlayer(mockPlayer);
      expect(mockPlayer.setVolume).toHaveBeenCalled();
    });

    it('should register chord playback service', () => {
      const mockChordService = {
        updateOptions: jest.fn()
      };
      
      service.setChordPlaybackService(mockChordService);
      expect(mockChordService.updateOptions).toHaveBeenCalled();
    });

    it('should register metronome service', () => {
      const mockMetronome = {
        setVolume: jest.fn()
      };
      
      service.setMetronomeService(mockMetronome);
      expect(mockMetronome.setVolume).toHaveBeenCalled();
    });

    it('should handle null service registration', () => {
      service.setYouTubePlayer(null);
      service.setChordPlaybackService(null);
      service.setMetronomeService(null);
      
      expect(service).toBeDefined();
    });
  });

  describe('Listener Pattern', () => {
    it('should add listener', () => {
      const listener = jest.fn();
      service.addListener(listener);

      service.setMasterVolume(50);
      expect(listener).toHaveBeenCalledWith(service.getSettings());
    });

    it('should remove listener', () => {
      const listener = jest.fn();
      const unsubscribe = service.addListener(listener);

      unsubscribe();
      service.setMasterVolume(50);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      service.addListener(listener1);
      service.addListener(listener2);

      service.setMasterVolume(50);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should notify listeners on all volume changes', () => {
      const listener = jest.fn();
      service.addListener(listener);

      service.setYouTubeVolume(50);
      service.setPianoVolume(60);
      service.setMetronomeVolume(70);

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('Reset to Defaults', () => {
    it('should reset all settings to defaults', () => {
      service.setMasterVolume(50);
      service.setYouTubeVolume(30);
      service.setPianoVolume(20);

      service.resetToDefaults();

      const settings = service.getSettings();
      expect(settings).toEqual({ ...DEFAULT_AUDIO_MIXER_SETTINGS });
    });

    it('should notify listeners after reset', () => {
      const listener = jest.fn();
      service.addListener(listener);

      service.resetToDefaults();

      expect(listener).toHaveBeenCalled();
    });

    it('should save settings after reset', () => {
      service.resetToDefaults();

      const saved = mockSessionStorage.getItem('audioMixerSettings');
      expect(saved).toBeDefined();
    });
  });

  describe('Master Mute', () => {
    it('should mute all audio', () => {
      service.setMasterMute(true);
      expect(service.getSettings().masterVolume).toBe(0);
    });

    it('should unmute and restore volume', () => {
      service.setMasterVolume(50);
      service.setMasterMute(true);
      service.setMasterMute(false);

      expect(service.getSettings().masterVolume).toBe(80);
    });

    it('should not change volume when unmuting if not muted', () => {
      service.setMasterVolume(60);
      service.setMasterMute(false);

      expect(service.getSettings().masterVolume).toBe(60);
    });
  });

  describe('Effective Volumes', () => {
    it('should calculate effective volumes with master volume', () => {
      service.setMasterVolume(50);
      service.setYouTubeVolume(100);

      const effective = service.getEffectiveVolumes();
      expect(effective.youtube).toBe(50);
    });

    it('should calculate effective chord playback volumes', () => {
      service.setMasterVolume(100);
      service.setChordPlaybackVolume(50);
      service.setPianoVolume(100);

      const effective = service.getEffectiveVolumes();
      expect(effective.piano).toBe(50);
    });

    it('should return all effective volumes', () => {
      const effective = service.getEffectiveVolumes();

      expect(effective).toHaveProperty('youtube');
      expect(effective).toHaveProperty('chordPlayback');
      expect(effective).toHaveProperty('piano');
      expect(effective).toHaveProperty('guitar');
      expect(effective).toHaveProperty('violin');
      expect(effective).toHaveProperty('flute');
      expect(effective).toHaveProperty('saxophone');
      expect(effective).toHaveProperty('metronome');
    });
  });

  describe('Settings Persistence', () => {
    it('should persist settings on every change', () => {
      service.setMasterVolume(75);
      service.setYouTubeVolume(85);
      service.setPianoVolume(65);

      const saved = mockSessionStorage.getItem('audioMixerSettings');
      const parsed = JSON.parse(saved!);

      expect(parsed.masterVolume).toBe(75);
      expect(parsed.youtubeVolume).toBe(85);
      expect(parsed.pianoVolume).toBe(65);
    });

    it('should load persisted settings on initialization', () => {
      service.setMasterVolume(90);
      service.setYouTubeVolume(70);

      const newService = new AudioMixerService();
      const settings = newService.getSettings();

      expect(settings.masterVolume).toBe(90);
      expect(settings.youtubeVolume).toBe(70);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid volume changes', () => {
      for (let i = 0; i < 100; i++) {
        service.setMasterVolume(i);
      }

      expect(service.getSettings().masterVolume).toBe(99);
    });

    it('should handle all volumes at 0', () => {
      service.setMasterVolume(0);
      service.setYouTubeVolume(0);
      service.setPianoVolume(0);

      const effective = service.getEffectiveVolumes();
      expect(effective.youtube).toBe(0);
      expect(effective.piano).toBe(0);
    });

    it('should handle all volumes at 100', () => {
      service.setMasterVolume(100);
      service.setYouTubeVolume(100);
      service.setChordPlaybackVolume(100);
      service.setPianoVolume(100);

      const effective = service.getEffectiveVolumes();
      expect(effective.youtube).toBe(100);
      expect(effective.piano).toBe(100);
    });

    it('should handle service registration after volume changes', () => {
      service.setYouTubeVolume(50);

      const mockPlayer: YouTubePlayer = {
        seekTo: jest.fn(),
        playVideo: jest.fn(),
        pauseVideo: jest.fn(),
        setPlaybackRate: jest.fn(),
        getCurrentTime: jest.fn(() => 0),
        muted: false,
        setVolume: jest.fn()
      };

      service.setYouTubePlayer(mockPlayer);
      expect(mockPlayer.setVolume).toHaveBeenCalled();
    });
  });
});
