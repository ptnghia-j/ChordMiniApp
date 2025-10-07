/**
 * Pitch Shift Service
 * 
 * Provides real-time pitch shifting using Tone.js for audio playback.
 * Supports transposing audio by ±12 semitones while maintaining tempo.
 * 
 * Features:
 * - Real-time pitch shifting with Tone.js
 * - Audio buffer loading from Firebase Storage URLs
 * - Playback controls (play, pause, seek, setPlaybackRate)
 * - Memory management and proper cleanup
 * - Synchronization with existing playback state
 */

import * as Tone from 'tone';

export interface PitchShiftOptions {
  semitones: number; // -6 to +6 (optimized range for audio quality)
  windowSize?: number; // Default: 0.1 (quality vs latency tradeoff)
  delayTime?: number; // Default: 0
  feedback?: number; // Default: 0
}

export interface PitchShiftPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

/**
 * Service for managing pitch-shifted audio playback using Tone.js
 */
export class PitchShiftService {
  private player: Tone.Player | null = null;
  private pitchShift: Tone.PitchShift | null = null;
  private gainNode: Tone.Gain | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private isInitialized = false;
  private currentSemitones = 0;

  // Playback state
  private _isPlaying = false;
  private _currentTime = 0;
  private _duration = 0;
  private _playbackRate = 1;
  private _volume = 85; // 0-100 (start at 85% for good balance with noise gate, compressor and limiter)

  // Time tracking interval
  private timeUpdateInterval: NodeJS.Timeout | null = null;

  // Callbacks for state updates
  private onTimeUpdate: ((time: number) => void) | null = null;
  private onEnded: (() => void) | null = null;

  constructor() {
    // Bind methods to preserve context
    this.handlePlayerLoad = this.handlePlayerLoad.bind(this);
    this.handlePlayerEnded = this.handlePlayerEnded.bind(this);
  }

  /**
   * Initialize Tone.js audio context (required for iOS)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await Tone.start();
      this.isInitialized = true;
      console.log('✅ Tone.js initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Tone.js:', error);
      throw new Error('Failed to initialize audio context');
    }
  }

  /**
   * Load audio from Firebase Storage URL and apply pitch shift
   */
  async loadAudio(audioUrl: string, semitones: number = 0): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`🎵 Loading audio for pitch shift: ${audioUrl}`);
      console.log(`🎚️ Pitch shift: ${semitones > 0 ? '+' : ''}${semitones} semitones`);

      // Clean up existing player if any
      this.disposePlayer();

      // Use proxy to avoid CORS issues
      const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(audioUrl)}`;
      console.log(`🔄 Using proxy URL for CORS-free loading: ${proxyUrl}`);

      // Ensure Tone.js context is started with optimal settings
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
        console.log('🎵 Tone.js AudioContext started');
      }

      // Get audio context for logging
      const context = Tone.getContext();

      // Create gain node for volume control (start at 85% for better headroom with noise gate)
      this.gainNode = new Tone.Gain(0.85);

      // Create pitch shift node with maximum quality settings
      // RESEARCH FINDINGS (Web Search Results):
      // 1. Tone.js PitchShift uses GRANULAR SYNTHESIS which inherently produces artifacts
      // 2. Phase vocoder algorithms (used in Rubber Band Library) are superior for pitch shifting
      // 3. Granular synthesis artifacts increase with larger pitch shifts (>3 semitones)
      // 4. Larger window sizes reduce artifacts but increase latency (acceptable for playback)
      // 5. Alternative: rubberband-wasm or rubberband-web provide professional-grade quality
      //
      // CURRENT LIMITATIONS:
      // - Tone.js does not support phase vocoder algorithms
      // - Granular synthesis will always have some artifacts, especially at extreme shifts
      // - This implementation maximizes quality within Tone.js constraints
      //
      // FUTURE IMPROVEMENT:
      // - Consider integrating rubberband-web (Audio Worklet) for production-grade quality
      this.pitchShift = new Tone.PitchShift({
        pitch: semitones,
        windowSize: 0.25, // MAXIMUM window size for best quality (trade latency for quality)
        delayTime: 0,
        feedback: 0
      });

      // Create a high-pass filter to remove low-frequency rumble and artifacts
      // This helps reduce buzzing and low-frequency noise
      const highPassFilter = new Tone.Filter({
        type: 'highpass',
        frequency: 80, // Remove frequencies below 80Hz (rumble, hum)
        rolloff: -12 // Gentle rolloff to preserve bass
      });

      // Create a low-pass filter to remove high-frequency artifacts from pitch shifting
      // This helps reduce hissing, crackling, and aliasing artifacts
      // More aggressive than previous setting (14kHz vs 16kHz)
      const lowPassFilter = new Tone.Filter({
        type: 'lowpass',
        frequency: 14000, // Cut off frequencies above 14kHz (aggressive artifact removal)
        rolloff: -24 // Steep rolloff for better artifact rejection
      });

      // Create a noise gate to reduce hissing and background noise
      // This helps address the "hissing and buzzing" issue
      const noiseGate = new Tone.Gate({
        threshold: -50, // Gate opens at -50dB (reduces quiet artifacts)
        smoothing: 0.1 // Smooth gate transitions to avoid clicks
      });

      // Create a compressor for more consistent volume and smoother dynamics
      // Less aggressive than previous setting to avoid introducing artifacts
      const compressor = new Tone.Compressor({
        threshold: -30, // Start compressing at -30dB (less aggressive)
        ratio: 3, // 3:1 compression ratio (gentle)
        attack: 0.005, // 5ms attack (slightly slower to preserve transients)
        release: 0.3, // 300ms release (smoother)
        knee: 8 // Softer knee for more natural compression
      });

      // Create a limiter to prevent clipping and distortion
      // -4dB threshold provides maximum headroom
      const limiter = new Tone.Limiter(-4);

      // Connect: Player → PitchShift → HighPass → LowPass → NoiseGate → Compressor → Gain → Limiter → Destination
      // This signal chain maximizes quality and artifact reduction
      this.pitchShift.connect(highPassFilter);
      highPassFilter.connect(lowPassFilter);
      lowPassFilter.connect(noiseGate);
      noiseGate.connect(compressor);
      compressor.connect(this.gainNode);
      this.gainNode.connect(limiter);
      limiter.toDestination();

      // Create player with fade settings to prevent clicks/pops
      this.player = new Tone.Player({
        url: proxyUrl,
        fadeIn: 0.01, // 10ms fade-in to prevent clicks
        fadeOut: 0.01, // 10ms fade-out to prevent clicks
        onload: this.handlePlayerLoad,
        onerror: (error) => {
          console.error('❌ Tone.js player load error:', error);
          throw new Error('Failed to load audio file');
        }
      }).connect(this.pitchShift);

      // Log audio context settings for debugging
      console.log(`🎵 AudioContext settings:`, {
        sampleRate: context.sampleRate,
        state: context.state
      });

      // Log pitch shift configuration for quality diagnostics
      console.log(`🎚️ Pitch shift configuration (MAXIMUM QUALITY):`, {
        semitones,
        algorithm: 'Granular Synthesis (Tone.js limitation)',
        windowSize: 0.25,
        highPassFrequency: '80Hz',
        lowPassFrequency: '14kHz',
        noiseGate: 'enabled (-50dB threshold)',
        compressor: 'enabled (3:1 ratio, gentle)',
        limiter: '-4dB threshold',
        signalChain: 'Player → PitchShift → HighPass → LowPass → NoiseGate → Compressor → Gain → Limiter → Output',
        note: 'Artifacts may still occur at large shifts (>3 semitones) due to granular synthesis limitations'
      });

      this.currentSemitones = semitones;

      // Wait for audio to load
      await new Promise<void>((resolve, reject) => {
        const checkLoaded = setInterval(() => {
          if (this.player?.loaded) {
            clearInterval(checkLoaded);
            resolve();
          }
        }, 100);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkLoaded);
          reject(new Error('Audio loading timeout'));
        }, 30000);
      });

      console.log('✅ Audio loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load audio:', error);
      this.disposePlayer();
      throw error;
    }
  }

  /**
   * Update pitch shift amount without reloading audio
   */
  setPitch(semitones: number): void {
    if (this.pitchShift) {
      this.pitchShift.pitch = semitones;
      this.currentSemitones = semitones;
      console.log(`🎚️ Pitch updated to ${semitones > 0 ? '+' : ''}${semitones} semitones`);
    }
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume));
    if (this.gainNode) {
      // Convert 0-100 to 0-1 gain value
      this.gainNode.gain.value = this._volume / 100;
      console.log(`🔊 Pitch-shifted audio volume set to ${this._volume}%`);
    }
  }

  /**
   * Get current volume (0-100)
   */
  getVolume(): number {
    return this._volume;
  }

  /**
   * Start playback
   */
  play(): void {
    if (!this.player || !this.player.loaded) {
      console.warn('⚠️ Cannot play: audio not loaded');
      return;
    }

    try {
      if (!this._isPlaying) {
        this.player.start();
        this._isPlaying = true;
        this.startTimeTracking();
        console.log('▶️ Playback started');
      }
    } catch (error) {
      console.error('❌ Failed to start playback:', error);
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.player) return;

    try {
      if (this._isPlaying) {
        this.player.stop();
        this._isPlaying = false;
        this.stopTimeTracking();
        console.log('⏸️ Playback paused');
      }
    } catch (error) {
      console.error('❌ Failed to pause playback:', error);
    }
  }

  /**
   * Seek to specific time in seconds
   */
  seek(time: number): void {
    if (!this.player || !this.player.loaded) return;

    try {
      const wasPlaying = this._isPlaying;
      
      // Stop current playback
      if (this._isPlaying) {
        this.player.stop();
        this._isPlaying = false;
      }

      // Update current time
      this._currentTime = time;

      // Restart from new position if was playing
      if (wasPlaying) {
        this.player.start(undefined, time);
        this._isPlaying = true;
      }

      console.log(`⏩ Seeked to ${time.toFixed(2)}s`);
    } catch (error) {
      console.error('❌ Failed to seek:', error);
    }
  }

  /**
   * Set playback rate (speed)
   */
  setPlaybackRate(rate: number): void {
    if (!this.player) return;

    try {
      this.player.playbackRate = rate;
      this._playbackRate = rate;
      console.log(`⏩ Playback rate set to ${rate}x`);
    } catch (error) {
      console.error('❌ Failed to set playback rate:', error);
    }
  }

  /**
   * Get current playback state
   */
  getState(): PitchShiftPlaybackState {
    return {
      isPlaying: this._isPlaying,
      currentTime: this._currentTime,
      duration: this._duration,
      playbackRate: this._playbackRate
    };
  }

  /**
   * Check if audio is loaded and ready
   */
  isReady(): boolean {
    return this.player?.loaded ?? false;
  }

  /**
   * Get current pitch shift amount
   */
  getCurrentPitch(): number {
    return this.currentSemitones;
  }

  /**
   * Set callback for time updates
   */
  setOnTimeUpdate(callback: (time: number) => void): void {
    this.onTimeUpdate = callback;
  }

  /**
   * Set callback for playback ended
   */
  setOnEnded(callback: () => void): void {
    this.onEnded = callback;
  }

  /**
   * Dispose of all resources and clean up
   */
  dispose(): void {
    console.log('🧹 Disposing pitch shift service');
    
    this.stopTimeTracking();
    this.disposePlayer();
    
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.audioBuffer = null;
    this.isInitialized = false;
  }

  // Private methods

  private handlePlayerLoad(): void {
    if (this.player) {
      this._duration = this.player.buffer.duration;
      console.log(`✅ Audio loaded, duration: ${this._duration.toFixed(2)}s`);
    }
  }

  private handlePlayerEnded(): void {
    this._isPlaying = false;
    this.stopTimeTracking();
    
    if (this.onEnded) {
      this.onEnded();
    }
    
    console.log('⏹️ Playback ended');
  }

  private startTimeTracking(): void {
    this.stopTimeTracking();
    
    // Update time every 100ms
    this.timeUpdateInterval = setInterval(() => {
      if (this._isPlaying && this.player) {
        // Estimate current time based on Tone.js transport time
        const transportTime = Tone.Transport.seconds;
        this._currentTime = Math.min(transportTime, this._duration);
        
        if (this.onTimeUpdate) {
          this.onTimeUpdate(this._currentTime);
        }

        // Check if playback ended
        if (this._currentTime >= this._duration) {
          this.handlePlayerEnded();
        }
      }
    }, 100);
  }

  private stopTimeTracking(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  private disposePlayer(): void {
    if (this.player) {
      try {
        this.player.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing player:', error);
      }
      this.player = null;
    }

    if (this.pitchShift) {
      try {
        this.pitchShift.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing pitch shift:', error);
      }
      this.pitchShift = null;
    }

    this._isPlaying = false;
    this._currentTime = 0;
    this._duration = 0;
  }
}

// Singleton instance
let pitchShiftServiceInstance: PitchShiftService | null = null;

/**
 * Get singleton instance of PitchShiftService
 */
export function getPitchShiftService(): PitchShiftService {
  if (!pitchShiftServiceInstance) {
    pitchShiftServiceInstance = new PitchShiftService();
  }
  return pitchShiftServiceInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetPitchShiftService(): void {
  if (pitchShiftServiceInstance) {
    pitchShiftServiceInstance.dispose();
    pitchShiftServiceInstance = null;
  }
}

