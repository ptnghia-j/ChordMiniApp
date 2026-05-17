/**
 * Metronome Service using Web Audio API for precise timing
 * Provides click sounds synchronized with beat detection results
 */
import { audioContextManager } from '../audio/audioContextManager';
import { loadMetronomeBuffers } from './metronome/clickBuffers';
import {
  DRUM_TRACK_PLAYBACK_BOOST,
  renderHiHat,
  renderKick,
  renderSnare,
} from './metronome/drumRenderer';
import type {
  MetronomeBufferPair,
  MetronomeOptions,
  MetronomeSoundStyle,
  MetronomeTrackMode,
} from './metronome/types';

const AVAILABLE_SOUND_STYLES: MetronomeSoundStyle[] = [
  'traditional',
  'digital',
  'wood',
  'bell',
  'librosa_default',
  'librosa_pitched',
  'librosa_short',
  'librosa_long',
];


export type { MetronomeOptions } from './metronome/types';

export class MetronomeService {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private isEnabled = false;
  private volume = 1.0;
  private volumeBoost = 3.0;
  private soundStyle: MetronomeSoundStyle = 'librosa_short';
  private trackMode: MetronomeTrackMode = 'metronome';
  private clickDuration = 0.06;
  private audioBuffers = new Map<MetronomeSoundStyle, MetronomeBufferPair>();
  private isLoadingBuffers = false;
  private settingsListeners = new Set<() => void>();
  private metronomeMasterGain: GainNode | null = null;

  private getMasterGain(): GainNode | null {
    if (!this.audioContext) return null;
    if (!this.metronomeMasterGain) {
      this.metronomeMasterGain = this.audioContext.createGain();
      this.metronomeMasterGain.connect(this.audioContext.destination);
    }
    return this.metronomeMasterGain;
  }

  private async initializeAudioContext(): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        return;
      }

      this.audioContext = audioContextManager.getContext();
      await audioContextManager.resume();
      this.isInitialized = true;
      await this.loadAudioBuffers(this.soundStyle);
    } catch (error) {
      console.error('Failed to initialize metronome AudioContext:', error);
      this.isInitialized = false;
    }
  }

  private async ensureAudioContext(): Promise<boolean> {
    if (!this.audioContext) {
      await this.initializeAudioContext();
    }

    try {
      await audioContextManager.resume();
    } catch (error) {
      console.error('Failed to resume shared AudioContext:', error);
      return false;
    }

    return this.isInitialized && this.audioContext !== null;
  }

  private async loadAudioBuffers(style: MetronomeSoundStyle): Promise<void> {
    if (!this.audioContext || this.audioBuffers.has(style) || this.isLoadingBuffers) {
      return;
    }

    this.isLoadingBuffers = true;
    try {
      const buffers = await loadMetronomeBuffers(this.audioContext, style, this.clickDuration);
      if (buffers) {
        this.audioBuffers.set(style, buffers);
      }
    } finally {
      this.isLoadingBuffers = false;
    }
  }

  private async createClick(isDownbeat: boolean, startTime: number, force: boolean = false): Promise<void> {
    if (!this.audioContext || (!this.isEnabled && !force)) {
      return;
    }

    try {
      if (!this.audioBuffers.has(this.soundStyle)) {
        await this.loadAudioBuffers(this.soundStyle);
      }

      const buffers = this.audioBuffers.get(this.soundStyle);
      if (!buffers) {
        console.error(`No audio buffers available for sound style: ${this.soundStyle}`);
        return;
      }

      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();
      source.buffer = isDownbeat ? buffers.downbeat : buffers.regular;

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(this.volume * this.volumeBoost, startTime + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + this.clickDuration * 0.8);

      const masterGain = this.getMasterGain();
      if (!masterGain) return;

      source.connect(gainNode);
      gainNode.connect(masterGain);
      source.start(startTime);
      source.stop(startTime + this.clickDuration);
    } catch (error) {
      console.error('Error creating metronome click:', error);
    }
  }

  public scheduleClick(relativeTime: number, isDownbeat: boolean = false): void {
    if (!this.audioContext || !this.isEnabled) {
      return;
    }

    // Schedule up to a little bit in the past (to avoid missing beats due to slight event loop delays)
    if (relativeTime >= -0.15) {
      const audioTime = this.audioContext.currentTime + Math.max(0, relativeTime);
      const masterGain = this.getMasterGain();
      
      if (this.trackMode === 'drum' && masterGain) {
        const effectiveVolume = this.volume * DRUM_TRACK_PLAYBACK_BOOST;
        if (isDownbeat) {
          renderKick(this.audioContext, audioTime, 0.8, effectiveVolume, masterGain);
          renderHiHat(this.audioContext, audioTime + 0.08, 0.24, effectiveVolume, masterGain);
        } else {
          renderSnare(this.audioContext, audioTime, 0.58, effectiveVolume, masterGain);
        }
      } else {
        void this.createClick(isDownbeat, audioTime);
      }
    }
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    if (enabled && !(await this.ensureAudioContext())) {
      console.error('Cannot enable metronome: AudioContext not available');
      return;
    }
    this.isEnabled = enabled;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.volume;
  }

  public isMetronomeEnabled(): boolean {
    return this.isEnabled;
  }

  public async toggleMetronome(): Promise<boolean> {
    const newEnabled = !this.isEnabled;
    await this.setEnabled(newEnabled);
    return newEnabled;
  }



  public clearScheduledClicks(): void {
    if (this.metronomeMasterGain) {
      try {
        this.metronomeMasterGain.disconnect();
      } catch {}
      this.metronomeMasterGain = null;
    }
  }

  public async setSoundStyle(style: MetronomeSoundStyle): Promise<void> {
    if (this.soundStyle === style) {
      return;
    }

    this.soundStyle = style;
    this.notifySettingsChanged();

    if (this.audioContext && this.isInitialized) {
      await this.loadAudioBuffers(style);
    }
  }

  public getSoundStyle(): string {
    return this.soundStyle;
  }

  public async setTrackMode(mode: MetronomeTrackMode): Promise<void> {
    if (this.trackMode === mode) {
      return;
    }

    this.trackMode = mode;
    this.notifySettingsChanged();
  }

  public getTrackMode(): MetronomeTrackMode {
    return this.trackMode;
  }

  public getAvailableSoundStyles(): string[] {
    return [...AVAILABLE_SOUND_STYLES];
  }

  public async updateSettings(options: Partial<MetronomeOptions>): Promise<void> {
    if (options.volume !== undefined) {
      this.setVolume(options.volume);
    }
    if (options.soundStyle !== undefined) {
      await this.setSoundStyle(options.soundStyle);
    }
    if (options.trackMode !== undefined) {
      await this.setTrackMode(options.trackMode);
    }
    if (options.clickDuration !== undefined) {
      this.clickDuration = options.clickDuration;
      this.notifySettingsChanged();
    }
  }

  public getSettings(): MetronomeOptions {
    return {
      volume: this.volume,
      soundStyle: this.soundStyle,
      trackMode: this.trackMode,
      clickDuration: this.clickDuration,
    };
  }

  public dispose(): void {
    this.isEnabled = false;
    this.clearScheduledClicks();
    this.audioBuffers.clear();
    this.audioContext = null;
    this.isInitialized = false;
  }

  public async testClick(isDownbeat: boolean = false): Promise<void> {
    if (!(await this.ensureAudioContext())) {
      console.error('Metronome: AudioContext not available for test click');
      return;
    }

    if (this.trackMode !== 'drum' && !this.audioBuffers.has(this.soundStyle)) {
      await this.loadAudioBuffers(this.soundStyle);
      if (!this.audioBuffers.has(this.soundStyle)) {
        return;
      }
    }

    const testTime = this.audioContext!.currentTime + 0.1;
    if (this.trackMode === 'drum') {
      renderKick(this.audioContext!, testTime, isDownbeat ? 0.8 : 0.62, this.volume);
      if (isDownbeat) {
        renderHiHat(this.audioContext!, testTime + 0.08, 0.24, this.volume);
      } else {
        renderSnare(this.audioContext!, testTime, 0.58, this.volume);
      }
    } else {
      await this.createClick(isDownbeat, testTime, true);
    }
  }

  public addSettingsListener(listener: () => void): () => void {
    this.settingsListeners.add(listener);
    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  private notifySettingsChanged(): void {
    this.settingsListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Metronome settings listener failed:', error);
      }
    });
  }


}

export const metronomeService = new MetronomeService();
