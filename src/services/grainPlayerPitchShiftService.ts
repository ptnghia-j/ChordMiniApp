/**
 * GrainPlayer Pitch Shift Service
 *
 * Provides real-time pitch shifting and time-stretching using Tone.js GrainPlayer.
 * GrainPlayer uses granular synthesis to enable INDEPENDENT pitch and playback speed control.
 *
 * Features:
 * - Independent pitch shifting (±12 semitones) via `detune` property
 * - Independent speed control (0.25x - 2.0x) via `playbackRate` property
 * - No manual compensation needed - both parameters work independently
 * - Audio buffer loading from Firebase Storage URLs
 * - Playback controls (play, pause, seek)
 * - Memory management and proper cleanup
 * - Lazy loading of Tone.js library (~150KB) for better initial bundle size
 */

// Lazy load Tone.js to reduce initial bundle size
let ToneModule: typeof import('tone') | null = null;

async function getTone() {
  if (!ToneModule) {
    ToneModule = await import('tone');
  }
  return ToneModule;
}

export interface GrainPlayerPitchShiftOptions {
  semitones: number; // -12 to +12
  grainSize?: number; // Default: 0.2 (200ms) - Duration of each grain
  overlap?: number; // Default: 0.1 (100ms) - Crossfade duration between grains
  // Note: 'overlap' in Tone.js is the CROSSFADE DURATION, not the interval!
  // Grain start interval = grainSize - overlap
  // For 50% overlap: overlap = grainSize * 0.5
}

export interface PitchShiftPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

/**
 * Service for managing pitch-shifted audio playback using Tone.js GrainPlayer
 */
export class GrainPlayerPitchShiftService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private grainPlayer: any | null = null; // Type will be Tone.GrainPlayer after lazy load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gainNode: any | null = null; // Type will be Tone.Gain after lazy load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lowPassFilter: any | null = null; // Type will be Tone.Filter after lazy load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private limiter: any | null = null; // Type will be Tone.Limiter after lazy load
  private audioBuffer: AudioBuffer | null = null;
  private isInitialized = false;
  private currentSemitones = 0;

  // Playback state
  private _isPlaying = false;
  private _currentTime = 0;
  private _duration = 0;
  private _playbackRate = 1;
  private _volume = 30; // 0-100 (default 30% for balanced audio with YouTube)

  // Time tracking
  private timeTrackingInterval: ReturnType<typeof setInterval> | null = null;
  private lastUpdateTime = 0;
  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;

  /**
   * Initialize Tone.js context (lazy loads Tone.js on first use)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Lazy load Tone.js
      const Tone = await getTone();

      // Start Tone.js context
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize GrainPlayer service:', error);
      throw error;
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
      // Lazy load Tone.js
      const Tone = await getTone();

      // Clean up existing player if any
      this.disposePlayer();

      // Use proxy to avoid CORS issues (but not for blob URLs which are local)
      const isBlobUrl = audioUrl.startsWith('blob:');
      const finalUrl = isBlobUrl ? audioUrl : `/api/proxy-audio?url=${encodeURIComponent(audioUrl)}`;

      // Ensure Tone.js context is started
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }

      // Create gain node for volume control
      this.gainNode = new Tone.Gain(0.9);

      // Create a low-pass filter to remove high-frequency artifacts
      // Use adaptive cutoff based on pitch shift amount to prevent aliasing
      const filterCutoff = this.getAdaptiveFilterCutoff(semitones);
      this.lowPassFilter = new Tone.Filter({
        type: 'lowpass',
        frequency: filterCutoff,
        rolloff: -12
      });

      // Create a limiter to prevent clipping
      this.limiter = new Tone.Limiter(-1);

      // SIGNAL CHAIN: GrainPlayer → LowPass → Gain → Limiter → Destination
      this.lowPassFilter.connect(this.gainNode);
      this.gainNode.connect(this.limiter);
      this.limiter.toDestination();

      // Create GrainPlayer with optimized settings
      //
      // GRAINPLAYER PARAMETERS (from official Tone.js documentation):
      // - grainSize: Duration of each audio grain (chunk)
      // - overlap: CROSSFADE DURATION between successive grains (NOT interval!)
      //   * overlap is the amount of time grains crossfade with each other
      //   * Grain start interval = grainSize - overlap
      // - detune: Pitch adjustment in cents (100 cents = 1 semitone)
      // - playbackRate: Speed multiplier (independent of pitch)
      //
      // CORRECTED IMPLEMENTATION:
      // Using Tone.js recommended defaults for smooth, artifact-free playback
      // - grainSize: 0.2s (200ms) - Standard grain duration
      // - overlap: 0.1s (100ms) - 50% crossfade for smooth transitions
      //
      // Grain timeline visualization:
      // Grain 1: [0ms ==================== 200ms]
      // Grain 2:           [100ms ==================== 300ms]
      // Grain 3:                     [200ms ==================== 400ms]
      //          ^^^^^^^^^^CROSSFADE^^^^^^^^^^CROSSFADE^^^^^^^^^^
      //          (100ms overlap)     (100ms overlap)
      //
      // Grain start interval = grainSize - overlap = 200ms - 100ms = 100ms
      const grainSize = 0.2;  // 200ms grains (Tone.js default)
      const overlap = 0.1;    // 100ms crossfade (50% overlap - industry standard)

      this.grainPlayer = new Tone.GrainPlayer({
        url: finalUrl,
        grainSize: grainSize,  // 200ms grains
        overlap: overlap,      // 100ms crossfade duration ✅
        detune: semitones * 100, // Convert semitones to cents
        playbackRate: this._playbackRate,
        loop: false,
        onload: () => {
          this.handlePlayerLoad();
        },
        onerror: (error: Error) => {
          console.error('❌ Tone.js GrainPlayer load error:', error);
          throw new Error('Failed to load audio file');
        }
      });

      // Connect GrainPlayer to signal chain
      this.grainPlayer.connect(this.lowPassFilter);

      this.currentSemitones = semitones;

      // Wait for audio to load
      await new Promise<void>((resolve, reject) => {
        const checkLoaded = setInterval(() => {
          if (this.grainPlayer && this.grainPlayer.loaded) {
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



    } catch (error) {
      console.error('❌ Failed to load audio:', error);
      throw error;
    }
  }

  /**
   * Calculate adaptive filter cutoff based on pitch shift amount
   *
   * When pitch shifting up, frequencies are multiplied by the pitch factor.
   * To prevent aliasing, we need to lower the filter cutoff accordingly.
   *
   * Example: +12 semitones (octave up) doubles all frequencies
   * - Original 15kHz content becomes 30kHz (above Nyquist)
   * - Filter cutoff should be halved to prevent aliasing
   */
  private getAdaptiveFilterCutoff(semitones: number): number {
    const baseCutoff = 16000; // 16kHz base cutoff

    // For pitch shift up, reduce cutoff to prevent aliasing
    if (semitones > 0) {
      const pitchFactor = Math.pow(2, semitones / 12);
      // Reduce cutoff by pitch factor, with minimum of 8kHz
      return Math.max(8000, Math.min(baseCutoff, baseCutoff / pitchFactor));
    }

    // For pitch shift down or no shift, use base cutoff
    return baseCutoff;
  }

  /**
   * Handle player load event
   */
  private handlePlayerLoad(): void {
    if (this.grainPlayer && this.grainPlayer.buffer) {
      this._duration = this.grainPlayer.buffer.duration;
      this.audioBuffer = this.grainPlayer.buffer.get() as AudioBuffer;


    }
  }

  /**
   * Update pitch shift amount without reloading audio
   *
   * GrainPlayer uses `detune` property (in cents) for pitch control.
   * This is INDEPENDENT of playbackRate - no compensation needed!
   *
   * Also updates the low-pass filter cutoff adaptively to prevent aliasing.
   */
  setPitch(semitones: number): void {
    if (this.grainPlayer) {
      // Store the user's desired semitones
      this.currentSemitones = semitones;

      // Convert semitones to cents (100 cents = 1 semitone)
      const cents = semitones * 100;

      // Apply pitch shift via detune (independent of playbackRate)
      this.grainPlayer.detune = cents;

      // Update filter cutoff adaptively based on pitch shift amount
      if (this.lowPassFilter) {
        const filterCutoff = this.getAdaptiveFilterCutoff(semitones);
        // Ramp to new cutoff over 100ms for smooth transition
        this.lowPassFilter.frequency.rampTo(filterCutoff, 0.1);
      }
    }
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(100, volume));
    if (this.gainNode) {
      // Convert 0-100 to 0-1 gain value
      const gain = this._volume / 100;
      this.gainNode.gain.rampTo(gain, 0.1);
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
    if (!this.grainPlayer || !this.grainPlayer.loaded) {
      console.warn('⚠️ [DEBUG] play() called but GrainPlayer not loaded');
      return;
    }

    try {
      if (!this._isPlaying) {
        // Start from current time position
        this.grainPlayer.start(undefined, this._currentTime);
        this._isPlaying = true;
        this.startTimeTracking();
      }
    } catch (error) {
      console.error('❌ Failed to start playback:', error);
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.grainPlayer) {
      console.warn('⚠️ [DEBUG] pause() called but no GrainPlayer exists');
      return;
    }

    try {
      if (this._isPlaying) {
        this.grainPlayer.stop();
        this._isPlaying = false;
        this.stopTimeTracking();

        // Call ended callback if at end of audio
        if (this._currentTime >= this._duration && this.onEndedCallback) {
          this.onEndedCallback();
        }
      }
    } catch (error) {
      console.error('❌ Failed to pause playback:', error);
    }
  }

  /**
   * Seek to specific time in seconds
   */
  seek(time: number): void {
    if (!this.grainPlayer || !this.grainPlayer.loaded) return;

    try {
      const wasPlaying = this._isPlaying;

      // Stop current playback and time tracking
      if (this._isPlaying) {
        this.grainPlayer.stop();
        this._isPlaying = false;
        this.stopTimeTracking();
      }

      // Update current time
      this._currentTime = Math.max(0, Math.min(time, this._duration));

      // Restart playback from new position if was playing
      if (wasPlaying) {
        this.grainPlayer.start(undefined, this._currentTime);
        this._isPlaying = true;
        this.startTimeTracking();
      }
    } catch (error) {
      console.error('❌ Failed to seek:', error);
    }
  }

  /**
   * Set playback rate (speed) for the GrainPlayer
   * 
   * GrainPlayer's `playbackRate` property is INDEPENDENT of pitch.
   * No compensation needed - this is the key advantage of GrainPlayer!
   */
  setPlaybackRate(rate: number): void {
    if (!this.grainPlayer) return;

    try {
      // Store the playback rate
      this._playbackRate = rate;

      // Apply playback rate to GrainPlayer (independent of pitch)
      this.grainPlayer.playbackRate = rate;



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
   * Set callback for time updates
   */
  setOnTimeUpdate(callback: ((time: number) => void) | null): void {
    this.onTimeUpdateCallback = callback;
  }

  /**
   * Set callback for playback ended
   */
  setOnEnded(callback: (() => void) | null): void {
    this.onEndedCallback = callback;
  }

  /**
   * Start time tracking
   */
  private async startTimeTracking(): Promise<void> {
    this.stopTimeTracking();

    // Lazy load Tone.js
    const Tone = await getTone();
    this.lastUpdateTime = Tone.now();

    this.timeTrackingInterval = setInterval(async () => {
      if (this._isPlaying && this.grainPlayer) {
        const Tone = await getTone();
        const now = Tone.now();
        const elapsed = (now - this.lastUpdateTime) * this._playbackRate;
        this._currentTime = Math.min(this._currentTime + elapsed, this._duration);
        this.lastUpdateTime = now;

        // Call time update callback if set
        if (this.onTimeUpdateCallback) {
          this.onTimeUpdateCallback(this._currentTime);
        }

        // Auto-stop at end
        if (this._currentTime >= this._duration) {
          this.pause();
        }
      }
    }, 50); // Update every 50ms
  }

  /**
   * Stop time tracking
   */
  private stopTimeTracking(): void {
    if (this.timeTrackingInterval) {
      clearInterval(this.timeTrackingInterval);
      this.timeTrackingInterval = null;
    }
  }

  /**
   * Dispose of the player and clean up resources
   */
  private disposePlayer(): void {
    this.stopTimeTracking();

    if (this.grainPlayer) {
      try {
        this.grainPlayer.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing GrainPlayer:', error);
      }
      this.grainPlayer = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing gain node:', error);
      }
      this.gainNode = null;
    }

    if (this.lowPassFilter) {
      try {
        this.lowPassFilter.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing low-pass filter:', error);
      }
      this.lowPassFilter = null;
    }

    if (this.limiter) {
      try {
        this.limiter.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing limiter:', error);
      }
      this.limiter = null;
    }

    this._isPlaying = false;
    this._currentTime = 0;
    this._duration = 0;
    this.audioBuffer = null;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.disposePlayer();
    this.isInitialized = false;
  }
}

/**
 * Singleton instance for global access
 */
let grainPlayerServiceInstance: GrainPlayerPitchShiftService | null = null;

/**
 * Factory function to create or get the singleton GrainPlayerPitchShiftService instance
 */
export function getGrainPlayerPitchShiftService(): GrainPlayerPitchShiftService {
  if (!grainPlayerServiceInstance) {
    grainPlayerServiceInstance = new GrainPlayerPitchShiftService();
  }
  return grainPlayerServiceInstance;
}

/**
 * Reset singleton instance (useful for cleanup)
 */
export function resetGrainPlayerPitchShiftService(): void {
  if (grainPlayerServiceInstance) {
    grainPlayerServiceInstance.dispose();
    grainPlayerServiceInstance = null;
  }
}

