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
  private lowPassFilter: Tone.Filter | null = null; // Store as instance variable for proper disposal
  private limiter: Tone.Limiter | null = null; // Store as instance variable for proper disposal
  private audioBuffer: AudioBuffer | null = null;
  private isInitialized = false;
  private currentSemitones = 0;

  // Playback state
  private _isPlaying = false;
  private _currentTime = 0;
  private _duration = 0;
  private _playbackRate = 1;
  private _volume = 90; // 0-100 (start at 90% for good balance with simplified signal chain)

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
      // Clean up existing player if any
      this.disposePlayer();

      // Use proxy to avoid CORS issues (but not for blob URLs which are local)
      const isBlobUrl = audioUrl.startsWith('blob:');
      const finalUrl = isBlobUrl ? audioUrl : `/api/proxy-audio?url=${encodeURIComponent(audioUrl)}`;

      // Ensure Tone.js context is started with optimal settings
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }

      // Create gain node for volume control (start at 90% for better headroom with simplified chain)
      this.gainNode = new Tone.Gain(0.9);

      // Create pitch shift node with optimized settings for quality
      //
      // RESEARCH FINDINGS (Web Search Results - Updated):
      // 1. Tone.js PitchShift uses GRANULAR SYNTHESIS which inherently produces artifacts
      // 2. Phase vocoder algorithms (used in Rubber Band Library) are superior for pitch shifting
      // 3. Granular synthesis artifacts increase with larger pitch shifts (>3 semitones)
      // 4. **CRITICAL FINDING:** Overlapping grains during granular synthesis create audible artifacts
      //    at grain boundaries (joints where grains connect) - Source: DEGREE PROJECT research paper
      // 5. Window size controls grain length; delayTime controls grain overlap
      // 6. Alternative: rubberband-wasm or rubberband-web provide professional-grade quality
      //
      // CURRENT LIMITATIONS:
      // - Tone.js does not support phase vocoder algorithms
      // - Granular synthesis will always have some artifacts, especially at extreme shifts
      // - Grain boundary artifacts are inherent to the algorithm
      // - This implementation maximizes quality within Tone.js constraints
      //
      // PARAMETER OPTIMIZATION:
      // - windowSize: 0.05 (reduced from 0.1) to minimize grain overlap during rapid pitch changes
      //   * Smaller window = less overlap = cleaner transitions when sliding pitch
      //   * Trade-off: Slightly more grain boundary artifacts, but prevents "multiple audio sources" effect
      // - delayTime: 0 (no delay-based feedback which can cause echoing)
      // - feedback: 0 (no feedback loop which can cause instability)
      //
      // FUTURE IMPROVEMENT:
      // - Consider integrating rubberband-web (Audio Worklet) for production-grade quality
      this.pitchShift = new Tone.PitchShift({
        pitch: semitones,
        windowSize: 0.05, // Reduced to minimize grain overlap during rapid pitch changes
        delayTime: 0,
        feedback: 0
      });

      // Create a low-pass filter to remove high-frequency artifacts from pitch shifting
      // This helps reduce hissing, crackling, and aliasing artifacts
      // Using 16kHz cutoff (less aggressive than 14kHz to preserve audio quality)
      // FIXED: Store as instance variable for proper disposal (prevents memory leaks and audio artifacts)
      this.lowPassFilter = new Tone.Filter({
        type: 'lowpass',
        frequency: 16000, // Cut off frequencies above 16kHz (balanced artifact removal)
        rolloff: -12 // Gentle rolloff to avoid phase issues
      });

      // Create a limiter to prevent clipping and distortion
      // Using -1dB threshold for maximum headroom without over-limiting
      // FIXED: Store as instance variable for proper disposal (prevents memory leaks and audio artifacts)
      this.limiter = new Tone.Limiter(-1);

      // SIMPLIFIED SIGNAL CHAIN - Removed components that may cause artifacts:
      // - Removed high-pass filter (can cause phase issues)
      // - Removed noise gate (can cause clicks/pops at gate transitions)
      // - Removed compressor (can cause pumping/breathing artifacts)
      //
      // New chain: Player → PitchShift → LowPass → Gain → Limiter → Destination
      // This minimal chain reduces potential sources of crackling/popping
      //
      // CRITICAL FIX: All audio nodes now stored as instance variables and properly disposed
      // This prevents accumulation of orphaned nodes when using singleton pattern
      this.pitchShift.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.gainNode);
      this.gainNode.connect(this.limiter);
      this.limiter.toDestination();

      // Create player with optimized fade settings to prevent clicks/pops
      // Longer fades help smooth grain boundaries in pitch shifting
      this.player = new Tone.Player({
        url: finalUrl,
        fadeIn: 0.02, // 20ms fade-in to prevent clicks (increased from 10ms)
        fadeOut: 0.02, // 20ms fade-out to prevent clicks (increased from 10ms)
        onload: () => {
          this.handlePlayerLoad();
        },
        onerror: (error) => {
          console.error('❌ Tone.js player load error:', error);
          throw new Error('Failed to load audio file');
        }
      }).connect(this.pitchShift);

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
    } catch (error) {
      console.error('❌ Failed to load audio:', error);
      this.disposePlayer();
      throw error;
    }
  }

  /**
   * Update pitch shift amount without reloading audio
   *
   * CRITICAL: When playback rate is not 1.0, we need to compensate for the pitch
   * change caused by the playback rate to preserve the user's desired pitch.
   */
  setPitch(semitones: number): void {
    if (this.pitchShift) {
      // Store the user's desired semitones
      this.currentSemitones = semitones;

      // Calculate pitch change from playback rate
      const pitchChangeFromRate = 12 * Math.log2(this._playbackRate);

      // Apply compensated pitch: user's desired pitch - pitch change from rate
      const compensatedPitch = semitones - pitchChangeFromRate;
      this.pitchShift.pitch = compensatedPitch;

      console.log(`🎵 User pitch: ${semitones} semitones, Playback rate: ${this._playbackRate.toFixed(2)}x, Compensation: ${pitchChangeFromRate.toFixed(2)}, Total: ${compensatedPitch.toFixed(2)}`);
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
      // CRITICAL FIX: Always stop player first to prevent multiple overlapping playbacks
      // Tone.js player.start() creates a NEW playback instance each time
      // If we don't stop first, multiple instances will play simultaneously
      if (this.player.state === 'started') {
        this.player.stop();
      }

      // CRITICAL FIX: Start from current time position, not from beginning
      // This prevents audio from restarting at 0:00 when pitch changes trigger play()
      // Tone.js player.start() signature: start(time, offset, duration)
      // - time: when to start (undefined = immediately)
      // - offset: where in the buffer to start (this._currentTime)
      // - duration: how long to play (undefined = play to end)
      this.player.start(undefined, this._currentTime);
      this._isPlaying = true;
      this.startTimeTracking();
    } catch (error) {
      console.error('❌ Failed to start playback:', error);
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.player) {
      console.warn('⚠️ [DEBUG] pause() called but no player exists');
      return;
    }

    try {
      if (this._isPlaying) {
        this.player.stop();
        this._isPlaying = false;
        this.stopTimeTracking();
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

      // Stop current playback and time tracking
      if (this._isPlaying) {
        this.player.stop();
        this._isPlaying = false;
        this.stopTimeTracking();
      }

      // Update current time
      this._currentTime = time;

      // Restart from new position if was playing
      if (wasPlaying) {
        this.player.start(undefined, time);
        this._isPlaying = true;
        // CRITICAL FIX: Restart time tracking after seek
        // This ensures time continues from the new position
        this.startTimeTracking();
      }
    } catch (error) {
      console.error('❌ Failed to seek:', error);
    }
  }

  /**
   * Set playback rate (speed) while preserving pitch
   *
   * CRITICAL: Changing player.playbackRate affects both speed AND pitch.
   * To preserve pitch while changing speed, we need to compensate by adjusting
   * the pitch shift in the opposite direction.
   *
   * Formula: When playback rate increases by X%, pitch increases by X%.
   * To compensate: adjust pitch shift by -X% (in semitones).
   *
   * Example:
   * - Rate 1.5x = 50% faster = ~7 semitones higher
   * - To preserve pitch: shift down by ~7 semitones
   * - Conversion: semitones = 12 * log2(rate)
   */
  setPlaybackRate(rate: number): void {
    if (!this.player || !this.pitchShift) return;

    try {
      // Calculate the pitch change caused by playback rate change (in semitones)
      // Formula: semitones = 12 * log2(rate)
      // Example: rate=2.0 → 12 semitones higher, rate=0.5 → -12 semitones lower
      const pitchChangeFromRate = 12 * Math.log2(rate);

      // To preserve pitch, we need to compensate by shifting in the opposite direction
      // Total pitch shift = user's desired shift - pitch change from rate
      const compensatedPitch = this.currentSemitones - pitchChangeFromRate;

      // Apply the playback rate change
      this.player.playbackRate = rate;
      this._playbackRate = rate;

      // Apply the compensated pitch shift to preserve the original pitch
      this.pitchShift.pitch = compensatedPitch;

      console.log(`🎵 Playback rate: ${rate.toFixed(2)}x, Pitch compensation: ${pitchChangeFromRate.toFixed(2)} semitones, Total shift: ${compensatedPitch.toFixed(2)} semitones`);
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
    }
  }

  private handlePlayerEnded(): void {
    this._isPlaying = false;
    this.stopTimeTracking();

    if (this.onEnded) {
      this.onEnded();
    }
  }

  private startTimeTracking(): void {
    this.stopTimeTracking();

    // Store the start time and offset for accurate time tracking
    const startTime = Tone.now();
    const startOffset = this._currentTime;

    // Update time every 100ms
    this.timeUpdateInterval = setInterval(() => {
      if (this._isPlaying && this.player) {
        // CRITICAL FIX: Calculate current time based on elapsed time since playback started
        // This is more accurate than using Tone.Transport.seconds (which is global)
        const elapsed = (Tone.now() - startTime) * this._playbackRate;
        this._currentTime = Math.min(startOffset + elapsed, this._duration);

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
    // Dispose player
    if (this.player) {
      try {
        this.player.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing player:', error);
      }
      this.player = null;
    }

    // Dispose pitch shift
    if (this.pitchShift) {
      try {
        this.pitchShift.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing pitch shift:', error);
      }
      this.pitchShift = null;
    }

    // CRITICAL FIX: Dispose gain node to prevent memory leaks and audio artifacts
    // Previously this was not disposed, causing accumulation in singleton pattern
    if (this.gainNode) {
      try {
        this.gainNode.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing gain node:', error);
      }
      this.gainNode = null;
    }

    // CRITICAL FIX: Dispose low-pass filter to prevent memory leaks and audio artifacts
    // Previously this was a local variable and never disposed
    if (this.lowPassFilter) {
      try {
        this.lowPassFilter.dispose();
      } catch (error) {
        console.warn('⚠️ Error disposing low-pass filter:', error);
      }
      this.lowPassFilter = null;
    }

    // CRITICAL FIX: Dispose limiter to prevent memory leaks and audio artifacts
    // Previously this was a local variable and never disposed
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

