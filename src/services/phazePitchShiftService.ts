/**
 * Phaze Pitch Shift Service (Proof of Concept)
 *
 * Real-time pitch shifting using phaze AudioWorklet (phase vocoder algorithm).
 * This is a minimal POC implementation for A/B comparison with Tone.js.
 *
 * Features:
 * - Real-time pitch shifting with phase vocoder (no processing delay)
 * - Instant pitch changes during playback
 * - Professional-grade audio quality
 * - Minimal API compatible with existing pitchShiftService
 */

import { audioContextManager } from './audioContextManager';

export interface PhazePitchShiftOptions {
  semitones: number; // -6 to +6
}

export interface PhazePitchShiftPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

/**
 * Service for managing pitch-shifted audio playback using phaze AudioWorklet
 */
export class PhazePitchShiftService {
  private audioContext: AudioContext | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isInitialized = false;
  private currentSemitones = 0;

  // Playback state
  private _isPlaying = false;
  private _volume = 40; // 0-100 (default 40% for balanced audio with YouTube)

  // Callbacks for state updates
  private onTimeUpdate: ((time: number) => void) | null = null;
  private onEnded: (() => void) | null = null;

  constructor() {
    // Bind methods to preserve context
    this.handleAudioEnded = this.handleAudioEnded.bind(this);
    this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
  }

  /**
   * Initialize AudioContext and load AudioWorklet processor (shared context)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      console.log('🎵 [Phaze] Initializing shared AudioContext and AudioWorklet...');
      this.audioContext = audioContextManager.getContext();
      await audioContextManager.resume();

      // Load AudioWorklet processor
      const workletUrl = '/phase-vocoder.js';
      await this.audioContext.audioWorklet.addModule(workletUrl);
      console.log('🎵 [Phaze] AudioWorklet processor loaded successfully');

      // Create AudioWorklet node
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'phase-vocoder-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this._volume / 100;

      // Connect: AudioWorklet → Gain → Destination
      this.audioWorkletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;
      console.log('✅ [Phaze] Initialization complete');
    } catch (error) {
      console.error('❌ [Phaze] Failed to initialize:', error);
      throw new Error(`Failed to initialize phaze AudioWorklet: ${error}`);
    }
  }

  /**
   * Load audio from URL and apply pitch shift
   */
  async loadAudio(audioUrl: string, semitones: number = 0): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`🎵 [Phaze] Loading audio: ${audioUrl}`);
      console.log(`🎚️ [Phaze] Initial pitch shift: ${semitones > 0 ? '+' : ''}${semitones} semitones`);

      // Clean up existing audio if any
      this.disposeAudio();

      // Use proxy to avoid CORS issues (but not for blob URLs which are local)
      const isBlobUrl = audioUrl.startsWith('blob:');
      const finalUrl = isBlobUrl ? audioUrl : `/api/proxy-audio?url=${encodeURIComponent(audioUrl)}`;
      console.log(isBlobUrl
        ? `🔗 [Phaze] Using blob URL directly: ${audioUrl}`
        : `🔄 [Phaze] Using proxy URL: ${finalUrl}`);

      // Create audio element
      this.audioElement = new Audio(finalUrl);
      this.audioElement.crossOrigin = 'anonymous';
      this.audioElement.preload = 'auto';

      // Add event listeners
      this.audioElement.addEventListener('ended', this.handleAudioEnded);
      this.audioElement.addEventListener('timeupdate', this.handleTimeUpdate);

      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.audioElement) {
          reject(new Error('Audio element is null'));
          return;
        }

        this.audioElement.addEventListener('canplaythrough', () => resolve(), { once: true });
        this.audioElement.addEventListener('error', (e) => {
          console.error('❌ [Phaze] Audio loading error:', e);
          reject(new Error('Failed to load audio'));
        }, { once: true });

        // Trigger loading
        this.audioElement.load();
      });

      console.log('✅ [Phaze] Audio loaded successfully');

      // Create media element source node
      this.sourceNode = this.audioContext!.createMediaElementSource(this.audioElement);

      // Connect: Source → AudioWorklet
      this.sourceNode.connect(this.audioWorkletNode!);

      console.log('🔗 [Phaze] Audio pipeline connected: Source → AudioWorklet → Gain → Destination');

      // Set initial pitch
      this.setPitch(semitones);

      console.log('✅ [Phaze] Audio ready for playback');
    } catch (error) {
      console.error('❌ [Phaze] Failed to load audio:', error);
      throw new Error(`Failed to load audio: ${error}`);
    }
  }

  /**
   * Start playback
   */
  play(): void {
    if (!this.audioElement) {
      console.warn('⚠️ [Phaze] Cannot play: no audio loaded');
      return;
    }

    try {
      // Resume AudioContext if suspended
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }

      this.audioElement.play();
      this._isPlaying = true;
      console.log('▶️ [Phaze] Playback started');
    } catch (error) {
      console.error('❌ [Phaze] Failed to start playback:', error);
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.audioElement) {
      console.warn('⚠️ [Phaze] Cannot pause: no audio loaded');
      return;
    }

    this.audioElement.pause();
    this._isPlaying = false;
    console.log('⏸️ [Phaze] Playback paused');
  }

  /**
   * Seek to specific time
   */
  seek(time: number): void {
    if (!this.audioElement) {
      console.warn('⚠️ [Phaze] Cannot seek: no audio loaded');
      return;
    }

    this.audioElement.currentTime = time;
    console.log(`⏩ [Phaze] Seeked to ${time.toFixed(2)}s`);
  }

  /**
   * Stop playback and reset position
   */
  stop(): void {
    if (!this.audioElement) {
      console.warn('⚠️ [Phaze] Cannot stop: no audio loaded');
      return;
    }

    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this._isPlaying = false;
    console.log('⏹️ [Phaze] Playback stopped');
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume));

    if (this.gainNode) {
      this.gainNode.gain.value = this._volume / 100;
      console.log(`🔊 [Phaze] Volume set to ${this._volume}%`);
    }
  }

  /**
   * Set pitch shift in semitones (-6 to +6)
   * This is INSTANT - no re-processing required!
   */
  setPitch(semitones: number): void {
    // Clamp to valid range
    const clampedSemitones = Math.max(-6, Math.min(6, semitones));
    this.currentSemitones = clampedSemitones;

    if (!this.audioWorkletNode) {
      console.warn('⚠️ [Phaze] Cannot set pitch: AudioWorklet not initialized');
      return;
    }

    // Convert semitones to pitch factor: pitchFactor = 2^(semitones/12)
    const pitchFactor = Math.pow(2, clampedSemitones / 12);

    // Update AudioWorklet parameter (INSTANT!)
    const pitchParam = this.audioWorkletNode.parameters.get('pitchFactor');
    if (pitchParam) {
      pitchParam.setValueAtTime(pitchFactor, this.audioContext!.currentTime);
      console.log(`🎚️ [Phaze] Pitch set to ${clampedSemitones > 0 ? '+' : ''}${clampedSemitones} semitones (factor: ${pitchFactor.toFixed(4)})`);
    } else {
      console.error('❌ [Phaze] pitchFactor parameter not found on AudioWorklet');
    }
  }

  /**
   * Clean up audio resources (but keep AudioWorklet)
   */
  private disposeAudio(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.removeEventListener('ended', this.handleAudioEnded);
      this.audioElement.removeEventListener('timeupdate', this.handleTimeUpdate);
      this.audioElement = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    this._isPlaying = false;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    console.log('🧹 [Phaze] Disposing resources...');

    this.disposeAudio();

    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    // Do not close the shared AudioContext; just release local reference
    this.audioContext = null;

    this.isInitialized = false;
    console.log('✅ [Phaze] Resources disposed');
  }

  /**
   * Event handlers
   */
  private handleAudioEnded(): void {
    this._isPlaying = false;
    this.onEnded?.();
    console.log('🏁 [Phaze] Playback ended');
  }

  private handleTimeUpdate(): void {
    if (this.audioElement) {
      this.onTimeUpdate?.(this.audioElement.currentTime);
    }
  }

  /**
   * Getters
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get currentTime(): number {
    return this.audioElement?.currentTime ?? 0;
  }

  get duration(): number {
    return this.audioElement?.duration ?? 0;
  }

  get volume(): number {
    return this._volume;
  }
}

// Singleton instance for global access
let phazePitchShiftServiceInstance: PhazePitchShiftService | null = null;

export function getPhazePitchShiftService(): PhazePitchShiftService | null {
  return phazePitchShiftServiceInstance;
}

export function setPhazePitchShiftService(service: PhazePitchShiftService | null): void {
  phazePitchShiftServiceInstance = service;
}

