/**
 * Metronome Service using Web Audio API for precise timing
 * Provides click sounds synchronized with beat detection results
 */
import { audioContextManager } from '../audio/audioContextManager';
import { loadMetronomeBuffers } from './metronome/clickBuffers';
import {
  DRUM_TRACK_PLAYBACK_BOOST,
  renderDrumBeat,
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
  private metronomeTrack: AudioBuffer | null = null;
  private metronomeSource: AudioBufferSourceNode | null = null;
  private metronomeGainNode: GainNode | null = null;
  private audioBuffers = new Map<MetronomeSoundStyle, MetronomeBufferPair>();
  private renderedTrackCache = new Map<string, AudioBuffer>();
  private isLoadingBuffers = false;
  private settingsListeners = new Set<() => void>();

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

  private async createClick(isDownbeat: boolean, startTime: number): Promise<void> {
    if (!this.audioContext || !this.isEnabled) {
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

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      source.start(startTime);
      source.stop(startTime + this.clickDuration);
    } catch (error) {
      console.error('Error creating metronome click:', error);
    }
  }

  public async generateMetronomeTrack(
    duration: number,
    bpm: number,
    rawTimeSignature: number = 4,
  ): Promise<AudioBuffer | null> {
    if (!(await this.ensureAudioContext())) {
      console.error('Cannot generate metronome track: AudioContext not available');
      return null;
    }

    const timeSignature = Math.max(1, rawTimeSignature);
    const cacheKey = [
      this.trackMode,
      this.soundStyle,
      duration.toFixed(3),
      bpm,
      timeSignature,
      this.clickDuration.toFixed(3),
    ].join(':');

    const cachedTrack = this.renderedTrackCache.get(cacheKey);
    if (cachedTrack) {
      this.metronomeTrack = cachedTrack;
      return cachedTrack;
    }

    let buffers: MetronomeBufferPair | undefined;
    if (this.trackMode !== 'drum') {
      await this.loadAudioBuffers(this.soundStyle);
      buffers = this.audioBuffers.get(this.soundStyle);
      if (!buffers) {
        console.error('Failed to load audio buffers for metronome track generation');
        return null;
      }
    }

    const sampleRate = this.audioContext!.sampleRate;
    const offlineContext = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
    const beatInterval = 60 / bpm;
    const totalBeats = Math.floor(duration / beatInterval);

    for (let beatIndex = 0; beatIndex < totalBeats; beatIndex += 1) {
      const beatTime = beatIndex * beatInterval;
      if (beatTime >= duration) {
        break;
      }

      const isDownbeat = beatIndex % timeSignature === 0;
      if (this.trackMode === 'drum') {
        renderDrumBeat(
          offlineContext,
          beatTime,
          beatInterval,
          isDownbeat,
          beatIndex,
          timeSignature,
          this.volume,
        );
        continue;
      }

      const source = offlineContext.createBufferSource();
      const gainNode = offlineContext.createGain();
      source.buffer = isDownbeat ? buffers!.downbeat : buffers!.regular;

      const clickVolume = this.volume * this.volumeBoost * (isDownbeat ? 1.08 : 0.92);
      gainNode.gain.setValueAtTime(0, beatTime);
      gainNode.gain.linearRampToValueAtTime(clickVolume, beatTime + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.001, beatTime + this.clickDuration * 0.8);

      source.connect(gainNode);
      gainNode.connect(offlineContext.destination);
      source.start(beatTime);
    }

    try {
      const renderedBuffer = await offlineContext.startRendering();
      this.metronomeTrack = renderedBuffer;
      this.renderedTrackCache.set(cacheKey, renderedBuffer);
      return renderedBuffer;
    } catch (error) {
      console.error('Failed to render metronome track:', error);
      return null;
    }
  }

  public scheduleClick(relativeTime: number, isDownbeat: boolean = false, _beatId?: string): void {
    console.log('scheduleClick called - deprecated in favor of pre-generated track approach');

    if (!this.audioContext || !this.isEnabled) {
      return;
    }

    if (relativeTime >= -0.01) {
      const audioTime = this.audioContext.currentTime + Math.max(0.01, relativeTime);
      void this.createClick(isDownbeat, audioTime);
    }
  }

  public async setEnabled(enabled: boolean, currentTime: number = 0): Promise<void> {
    if (enabled && !(await this.ensureAudioContext())) {
      console.error('Cannot enable metronome: AudioContext not available');
      return;
    }

    const wasEnabled = this.isEnabled;
    this.isEnabled = enabled;

    if (enabled && !wasEnabled && this.metronomeTrack) {
      this.startMetronomeTrack(currentTime);
    } else if (!enabled && wasEnabled) {
      this.stopMetronomeTrack();
    }
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateMetronomeVolume();
  }

  public getVolume(): number {
    return this.volume;
  }

  public isMetronomeEnabled(): boolean {
    return this.isEnabled;
  }

  public async toggleMetronome(currentTime: number = 0): Promise<boolean> {
    const newEnabled = !this.isEnabled;
    await this.setEnabled(newEnabled, currentTime);
    return newEnabled;
  }

  public startMetronomeTrack(currentTime: number = 0): void {
    if (!this.metronomeTrack || !this.audioContext || !this.isEnabled) {
      return;
    }

    this.stopMetronomeTrack();

    try {
      this.metronomeSource = this.audioContext.createBufferSource();
      this.metronomeGainNode = this.audioContext.createGain();
      this.metronomeSource.buffer = this.metronomeTrack;
      this.metronomeSource.loop = false;

      const effectiveVolume = this.volume * this.getPlaybackGainBoost();
      this.metronomeGainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime);

      this.metronomeSource.connect(this.metronomeGainNode);
      this.metronomeGainNode.connect(this.audioContext.destination);

      const startTime = Math.max(0, currentTime);
      if (startTime > 0 && startTime < this.metronomeTrack.duration) {
        this.metronomeSource.start(this.audioContext.currentTime, startTime);
      } else {
        this.metronomeSource.start(this.audioContext.currentTime);
      }

      this.metronomeSource.onended = () => {
        this.metronomeSource = null;
        this.metronomeGainNode = null;
      };
    } catch (error) {
      console.error('Failed to start metronome track:', error);
      this.metronomeSource = null;
      this.metronomeGainNode = null;
    }
  }

  public stopMetronomeTrack(): void {
    if (this.metronomeGainNode && this.audioContext) {
      try {
        const now = this.audioContext.currentTime;
        this.metronomeGainNode.gain.cancelScheduledValues(now);
        this.metronomeGainNode.gain.setValueAtTime(0, now);
      } catch {
        // Ignore automation cancellation errors.
      }
    }

    if (this.metronomeSource) {
      try {
        this.metronomeSource.onended = null;
      } catch {
        // Ignore cleanup errors.
      }

      try {
        this.metronomeSource.disconnect();
      } catch {
        // Ignore cleanup errors.
      }

      try {
        this.metronomeSource.stop(0);
      } catch {
        // Ignore cleanup errors.
      }

      this.metronomeSource = null;
    }

    if (this.metronomeGainNode) {
      try {
        this.metronomeGainNode.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
      this.metronomeGainNode = null;
    }
  }

  public seekMetronomeTrack(currentTime: number): void {
    if (!this.metronomeTrack || !this.isEnabled) {
      return;
    }

    this.startMetronomeTrack(currentTime);
  }

  public updateMetronomeVolume(): void {
    if (this.metronomeGainNode && this.audioContext) {
      const effectiveVolume = this.volume * this.getPlaybackGainBoost();
      this.metronomeGainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime);
    }
  }

  public hasMetronomeTrack(): boolean {
    return this.metronomeTrack !== null;
  }

  public getMetronomeTrackDuration(): number {
    return this.metronomeTrack?.duration || 0;
  }

  public clearScheduledClicks(): void {}

  public async setSoundStyle(style: MetronomeSoundStyle): Promise<void> {
    if (this.soundStyle === style) {
      return;
    }

    this.soundStyle = style;
    this.metronomeTrack = null;
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

    this.stopMetronomeTrack();
    this.trackMode = mode;
    this.metronomeTrack = null;
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
      this.metronomeTrack = null;
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
    this.stopMetronomeTrack();
    this.metronomeTrack = null;
    this.audioBuffers.clear();
    this.renderedTrackCache.clear();
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

    const wasEnabled = this.isEnabled;
    this.isEnabled = true;

    const testTime = this.audioContext!.currentTime + 0.1;
    if (this.trackMode === 'drum') {
      renderKick(this.audioContext!, testTime, isDownbeat ? 0.8 : 0.62, this.volume);
      if (isDownbeat) {
        renderHiHat(this.audioContext!, testTime + 0.08, 0.24, this.volume);
      } else {
        renderSnare(this.audioContext!, testTime, 0.58, this.volume);
      }
    } else {
      await this.createClick(isDownbeat, testTime);
    }

    setTimeout(() => {
      this.isEnabled = wasEnabled;
    }, 200);
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

  private getPlaybackGainBoost(): number {
    return this.trackMode === 'drum' ? DRUM_TRACK_PLAYBACK_BOOST : this.volumeBoost;
  }
}

export const metronomeService = new MetronomeService();
