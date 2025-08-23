/**
 * Audio Mixer Service
 * Centralized volume management for all audio sources in the application
 * Handles YouTube video, chord playback instruments, and master volume controls
 */

export interface AudioMixerSettings {
  masterVolume: number; // 0-100
  youtubeVolume: number; // 0-100
  chordPlaybackVolume: number; // 0-100
  pianoVolume: number; // 0-100
  guitarVolume: number; // 0-100
  metronomeVolume: number; // 0-100
}

export interface YouTubePlayer {
  seekTo: (time: number, type?: 'seconds' | 'fraction') => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  muted: boolean;
  // Volume control methods (may not be available on all YouTube player implementations)
  setVolume?: (volume: number) => void;
  getVolume?: () => number;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
}

export class AudioMixerService {
  private settings: AudioMixerSettings = {
    masterVolume: 80,
    youtubeVolume: 100,
    chordPlaybackVolume: 60,
    pianoVolume: 50,
    guitarVolume: 30,
    metronomeVolume: 70
  };

  private youtubePlayer: YouTubePlayer | null = null;
  private chordPlaybackService: { updateOptions: (options: { pianoVolume: number; guitarVolume: number }) => void } | null = null;
  private metronomeService: { setVolume: (volume: number) => void } | null = null;
  private listeners: Array<(settings: AudioMixerSettings) => void> = [];

  constructor() {
    this.loadSettings();
  }

  /**
   * Load settings from session storage
   */
  private loadSettings() {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('audioMixerSettings');
      if (saved) {
        try {
          this.settings = { ...this.settings, ...JSON.parse(saved) };
        } catch (error) {
          console.warn('Failed to load audio mixer settings:', error);
        }
      }
    }
  }

  /**
   * Save settings to session storage
   */
  private saveSettings() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('audioMixerSettings', JSON.stringify(this.settings));
    }
  }

  /**
   * Register audio services
   */
  setYouTubePlayer(player: YouTubePlayer | null) {
    this.youtubePlayer = player;
    if (player) {
      this.applyYouTubeVolume();
    }
  }

  setChordPlaybackService(service: { updateOptions: (options: { pianoVolume: number; guitarVolume: number }) => void } | null) {
    this.chordPlaybackService = service;
    this.applyChordPlaybackVolume();
  }

  setMetronomeService(service: { setVolume: (volume: number) => void } | null) {
    this.metronomeService = service;
    this.applyMetronomeVolume();
  }

  /**
   * Get current settings
   */
  getSettings(): AudioMixerSettings {
    return { ...this.settings };
  }

  /**
   * Add settings change listener
   */
  addListener(listener: (settings: AudioMixerSettings) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of settings changes
   */
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.settings));
  }

  /**
   * Calculate effective volume with master volume applied
   */
  private calculateEffectiveVolume(volume: number): number {
    return (volume / 100) * (this.settings.masterVolume / 100) * 100;
  }

  /**
   * Set master volume (affects all audio sources)
   */
  setMasterVolume(volume: number) {
    this.settings.masterVolume = Math.max(0, Math.min(100, volume));
    this.applyAllVolumes();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Set YouTube video volume
   */
  setYouTubeVolume(volume: number) {
    this.settings.youtubeVolume = Math.max(0, Math.min(100, volume));
    this.applyYouTubeVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Set chord playback master volume
   */
  setChordPlaybackVolume(volume: number) {
    this.settings.chordPlaybackVolume = Math.max(0, Math.min(100, volume));
    this.applyChordPlaybackVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Set piano volume
   */
  setPianoVolume(volume: number) {
    this.settings.pianoVolume = Math.max(0, Math.min(100, volume));
    this.applyChordPlaybackVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Set guitar volume
   */
  setGuitarVolume(volume: number) {
    this.settings.guitarVolume = Math.max(0, Math.min(100, volume));
    this.applyChordPlaybackVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Set metronome volume
   */
  setMetronomeVolume(volume: number) {
    this.settings.metronomeVolume = Math.max(0, Math.min(100, volume));
    this.applyMetronomeVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Apply YouTube volume
   */
  private applyYouTubeVolume() {
    if (this.youtubePlayer && this.youtubePlayer.setVolume) {
      const effectiveVolume = this.calculateEffectiveVolume(this.settings.youtubeVolume);
      this.youtubePlayer.setVolume(effectiveVolume);
    }
  }

  /**
   * Apply chord playback volume
   */
  private applyChordPlaybackVolume() {
    if (this.chordPlaybackService) {
      const effectiveChordVolume = this.calculateEffectiveVolume(this.settings.chordPlaybackVolume);
      const effectivePianoVolume = (this.settings.pianoVolume / 100) * (effectiveChordVolume / 100) * 100;
      const effectiveGuitarVolume = (this.settings.guitarVolume / 100) * (effectiveChordVolume / 100) * 100;
      
      this.chordPlaybackService.updateOptions({
        pianoVolume: effectivePianoVolume,
        guitarVolume: effectiveGuitarVolume
      });
    }
  }

  /**
   * Apply metronome volume
   */
  private applyMetronomeVolume() {
    if (this.metronomeService) {
      const effectiveVolume = this.calculateEffectiveVolume(this.settings.metronomeVolume) / 100;
      this.metronomeService.setVolume(effectiveVolume);
    }
  }

  /**
   * Apply all volume settings
   */
  private applyAllVolumes() {
    this.applyYouTubeVolume();
    this.applyChordPlaybackVolume();
    this.applyMetronomeVolume();
  }

  /**
   * Reset all volumes to defaults
   */
  resetToDefaults() {
    this.settings = {
      masterVolume: 80,
      youtubeVolume: 100,
      chordPlaybackVolume: 60,
      pianoVolume: 50,
      guitarVolume: 30,
      metronomeVolume: 70
    };
    this.applyAllVolumes();
    this.saveSettings();
    this.notifyListeners();
  }

  /**
   * Mute/unmute all audio
   */
  setMasterMute(muted: boolean) {
    if (muted) {
      this.setMasterVolume(0);
    } else {
      // Restore to a reasonable volume if currently muted
      if (this.settings.masterVolume === 0) {
        this.setMasterVolume(80);
      }
    }
  }

  /**
   * Get effective volumes for display purposes
   */
  getEffectiveVolumes() {
    return {
      youtube: this.calculateEffectiveVolume(this.settings.youtubeVolume),
      chordPlayback: this.calculateEffectiveVolume(this.settings.chordPlaybackVolume),
      piano: (this.settings.pianoVolume / 100) * (this.calculateEffectiveVolume(this.settings.chordPlaybackVolume) / 100) * 100,
      guitar: (this.settings.guitarVolume / 100) * (this.calculateEffectiveVolume(this.settings.chordPlaybackVolume) / 100) * 100,
      metronome: this.calculateEffectiveVolume(this.settings.metronomeVolume)
    };
  }
}

// Singleton instance
let audioMixerService: AudioMixerService | null = null;

export const getAudioMixerService = (): AudioMixerService => {
  if (!audioMixerService) {
    audioMixerService = new AudioMixerService();
  }
  return audioMixerService;
};
