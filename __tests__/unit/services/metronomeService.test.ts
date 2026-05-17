// Mock dependencies before importing the service
jest.mock('@/services/audio/audioContextManager', () => ({
  audioContextManager: {
    getContext: jest.fn(() => new AudioContext()),
    resume: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/services/chord-playback/metronome/clickBuffers', () => ({
  loadMetronomeBuffers: jest.fn(() =>
    Promise.resolve({
      downbeat: { duration: 0.1 } as AudioBuffer,
      regular: { duration: 0.1 } as AudioBuffer,
    }),
  ),
}));

jest.mock('@/services/chord-playback/metronome/drumRenderer', () => ({
  DRUM_TRACK_PLAYBACK_BOOST: 2.0,
  renderDrumBeat: jest.fn(),
  renderHiHat: jest.fn(),
  renderKick: jest.fn(),
  renderSnare: jest.fn(),
}));

import { MetronomeService } from '@/services/chord-playback/metronomeService';

describe('MetronomeService', () => {
  let service: MetronomeService;

  beforeEach(() => {
    service = new MetronomeService();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('construction and defaults', () => {
    it('starts with metronome disabled', () => {
      expect(service.isMetronomeEnabled()).toBe(false);
    });

    it('has default volume of 1.0', () => {
      expect(service.getVolume()).toBe(1.0);
    });

    it('has default sound style', () => {
      expect(service.getSoundStyle()).toBe('librosa_short');
    });

    it('has default track mode of metronome', () => {
      expect(service.getTrackMode()).toBe('metronome');
    });

  });

  describe('volume control', () => {
    it('sets volume within valid range', () => {
      service.setVolume(0.5);
      expect(service.getVolume()).toBe(0.5);
    });

    it('clamps volume to 0 minimum', () => {
      service.setVolume(-0.5);
      expect(service.getVolume()).toBe(0);
    });

    it('clamps volume to 1 maximum', () => {
      service.setVolume(2.0);
      expect(service.getVolume()).toBe(1);
    });

    it('sets volume to 0', () => {
      service.setVolume(0);
      expect(service.getVolume()).toBe(0);
    });
  });

  describe('sound style', () => {
    it('changes sound style', async () => {
      await service.setSoundStyle('digital');
      expect(service.getSoundStyle()).toBe('digital');
    });

    it('does nothing when setting same style', async () => {
      const defaultStyle = service.getSoundStyle();
      await service.setSoundStyle(defaultStyle as any);
      expect(service.getSoundStyle()).toBe(defaultStyle);
    });

    it('returns available sound styles', () => {
      const styles = service.getAvailableSoundStyles();
      expect(styles).toContain('traditional');
      expect(styles).toContain('digital');
      expect(styles).toContain('wood');
      expect(styles).toContain('bell');
      expect(styles.length).toBeGreaterThan(0);
    });

    it('returns a copy of available styles (not the same reference)', () => {
      const styles1 = service.getAvailableSoundStyles();
      const styles2 = service.getAvailableSoundStyles();
      expect(styles1).not.toBe(styles2);
      expect(styles1).toEqual(styles2);
    });
  });

  describe('track mode', () => {
    it('changes track mode', async () => {
      await service.setTrackMode('drum');
      expect(service.getTrackMode()).toBe('drum');
    });

    it('does nothing when setting same mode', async () => {
      await service.setTrackMode('metronome');
      expect(service.getTrackMode()).toBe('metronome');
    });
  });

  describe('enable/disable', () => {
    it('toggles metronome on', async () => {
      const result = await service.toggleMetronome();
      expect(result).toBe(true);
      expect(service.isMetronomeEnabled()).toBe(true);
    });

    it('toggles metronome off after enabling', async () => {
      await service.toggleMetronome(); // on
      const result = await service.toggleMetronome(); // off
      expect(result).toBe(false);
      expect(service.isMetronomeEnabled()).toBe(false);
    });

    it('can be explicitly enabled', async () => {
      await service.setEnabled(true);
      expect(service.isMetronomeEnabled()).toBe(true);
    });

    it('can be explicitly disabled', async () => {
      await service.setEnabled(true);
      await service.setEnabled(false);
      expect(service.isMetronomeEnabled()).toBe(false);
    });
  });

  describe('settings', () => {
    it('returns current settings', () => {
      const settings = service.getSettings();
      expect(settings).toHaveProperty('volume');
      expect(settings).toHaveProperty('soundStyle');
      expect(settings).toHaveProperty('trackMode');
      expect(settings).toHaveProperty('clickDuration');
    });

    it('updates multiple settings at once', async () => {
      await service.updateSettings({ volume: 0.7, soundStyle: 'wood' });
      expect(service.getVolume()).toBe(0.7);
      expect(service.getSoundStyle()).toBe('wood');
    });
  });

  describe('settings listeners', () => {
    it('notifies listeners on sound style change', async () => {
      const listener = jest.fn();
      service.addSettingsListener(listener);

      await service.setSoundStyle('bell');
      expect(listener).toHaveBeenCalled();
    });

    it('removes listener via returned unsubscribe', async () => {
      const listener = jest.fn();
      const unsubscribe = service.addSettingsListener(listener);

      unsubscribe();
      await service.setSoundStyle('wood');
      expect(listener).not.toHaveBeenCalled();
    });

    it('handles listener errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = jest.fn(() => {
        throw new Error('listener error');
      });
      service.addSettingsListener(badListener);

      // Should not throw
      await service.setSoundStyle('digital');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Metronome settings listener failed:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('cleans up state on dispose', () => {
      service.dispose();
      expect(service.isMetronomeEnabled()).toBe(false);
    });
  });



  describe('clearScheduledClicks', () => {
    it('is a no-op that does not throw', () => {
      expect(() => service.clearScheduledClicks()).not.toThrow();
    });
  });
});
