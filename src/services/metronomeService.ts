/**
 * Metronome Service using Web Audio API for precise timing
 * Provides click sounds synchronized with beat detection results
 */

export interface MetronomeOptions {
  volume: number; // 0.0 to 1.0
  soundStyle: 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long'; // Sound style selection
  clickDuration: number; // Duration of each click in seconds
}

export class MetronomeService {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private isEnabled = false;
  private volume = 1.0; // Base volume (will be multiplied by gain boost)
  private volumeBoost = 3.0; // VOLUME BOOST: 3x gain multiplication for clear audibility over background music
  private soundStyle: 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long' = 'librosa_short';
  private clickDuration = 0.06; // 60ms clicks for better separation

  // PRE-GENERATED TRACK APPROACH: Store complete metronome audio tracks
  private metronomeTrack: AudioBuffer | null = null;
  private metronomeAudioElement: HTMLAudioElement | null = null;
  private metronomeSource: AudioBufferSourceNode | null = null;
  private metronomeGainNode: GainNode | null = null;

  // Audio buffers for different sound styles (for click generation)
  private audioBuffers: Map<string, { downbeat: AudioBuffer; regular: AudioBuffer }> = new Map();
  private isLoadingBuffers = false;

  constructor() {
    // Defer AudioContext initialization until first use to avoid autoplay policy issues
    // this.initializeAudioContext();
  }

  /**
   * Load external audio file and convert to AudioBuffer
   */
  private async loadExternalAudioFile(url: string): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      console.warn('AudioContext not available for loading external audio file:', url);
      return null;
    }

    const tryFetch = async (target: string) => {
      const res = await fetch(target, { cache: 'force-cache' });
      return res.ok ? res : null;
    };

    try {
      // First attempt: as-is (absolute path from public/)
      let response = await tryFetch(url);

      // Retry with explicit origin if first attempt fails (defensive for edge cases)
      if (!response && typeof window !== 'undefined') {
        const absolute = new URL(url, window.location.origin).toString();
        response = await tryFetch(absolute);
      }

      if (!response) {
        console.warn(`Metronome sample not found (404): ${url}`);
        return null; // Let caller fall back to procedural generation
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.warn(`Error loading external audio file ${url}:`, error);
      return null;
    }
  }

  /**
   * Check if a sound style uses external audio files (librosa styles)
   */
  private isExternalAudioStyle(style: string): boolean {
    return style.startsWith('librosa_');
  }

  /**
   * Generate high-quality audio buffer for metronome clicks
   */
  private generateClickBuffer(isDownbeat: boolean, style: string): AudioBuffer | null {
    if (!this.audioContext) return null;

    // For librosa styles, we'll load external files in loadAudioBuffers instead
    if (this.isExternalAudioStyle(style)) {
      return null; // External files are loaded separately
    }

    const sampleRate = this.audioContext.sampleRate;
    const duration = this.clickDuration;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    switch (style) {
      case 'traditional':
        this.generateTraditionalClick(data, sampleRate, isDownbeat);
        break;
      case 'digital':
        this.generateDigitalClick(data, sampleRate, isDownbeat);
        break;
      case 'wood':
        this.generateWoodClick(data, sampleRate, isDownbeat);
        break;
      case 'bell':
        this.generateBellClick(data, sampleRate, isDownbeat);
        break;
      default:
        this.generateTraditionalClick(data, sampleRate, isDownbeat);
    }

    return buffer;
  }

  /**
   * Generate traditional metronome click (tick-tock style)
   */
  private generateTraditionalClick(data: Float32Array, sampleRate: number, isDownbeat: boolean): void {
    const length = data.length;
    const baseFreq = isDownbeat ? 1800 : 1200;
    const attackTime = 0.001; // 1ms attack for sharpness

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const phase = 2 * Math.PI * baseFreq * t;

      // Single clean sine wave tone
      const sample = Math.sin(phase);

      // Sharp attack with exponential decay for clean single click
      let envelope = 1;
      if (t < attackTime) {
        envelope = t / attackTime;
      } else {
        envelope = Math.exp(-t * 25); // Quick exponential decay
      }

      data[i] = sample * envelope * 0.9; // Increased from 0.7 to 0.9 for better audibility
    }
  }

  /**
   * Generate digital metronome click (clean electronic sound)
   */
  private generateDigitalClick(data: Float32Array, sampleRate: number, isDownbeat: boolean): void {
    const length = data.length;
    const baseFreq = isDownbeat ? 1400 : 900;
    const attackTime = 0.001; // 1ms attack

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const phase = 2 * Math.PI * baseFreq * t;

      // Clean sine wave with slight harmonic content
      let sample = Math.sin(phase) * 0.8;
      sample += Math.sin(phase * 2) * 0.15;

      // Sharp attack and exponential decay
      let envelope = 1;
      if (t < attackTime) {
        envelope = t / attackTime;
      } else {
        envelope = Math.exp(-t * 15); // Exponential decay
      }

      data[i] = sample * envelope;
    }
  }

  /**
   * Generate wood block click (percussive sound)
   */
  private generateWoodClick(data: Float32Array, sampleRate: number, isDownbeat: boolean): void {
    const length = data.length;
    const baseFreq = isDownbeat ? 800 : 600;
    const attackTime = 0.001; // 1ms attack

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Generate noise burst with filtering for wood-like sound
      let sample = (Math.random() * 2 - 1) * 0.4;

      // Add resonant frequencies for wood character
      const phase1 = 2 * Math.PI * baseFreq * t;
      const phase2 = 2 * Math.PI * (baseFreq * 1.5) * t;
      const phase3 = 2 * Math.PI * (baseFreq * 2.2) * t;

      sample += Math.sin(phase1) * 0.3 * Math.exp(-t * 20);
      sample += Math.sin(phase2) * 0.2 * Math.exp(-t * 25);
      sample += Math.sin(phase3) * 0.1 * Math.exp(-t * 30);

      // Sharp attack and quick decay
      let envelope = 1;
      if (t < attackTime) {
        envelope = t / attackTime;
      } else {
        envelope = Math.exp(-t * 25); // Quick decay
      }

      data[i] = sample * envelope;
    }
  }

  /**
   * Generate bell click (metallic resonant sound)
   */
  private generateBellClick(data: Float32Array, sampleRate: number, isDownbeat: boolean): void {
    const length = data.length;
    const baseFreq = isDownbeat ? 1600 : 1200;
    const attackTime = 0.003; // 3ms attack
    const sustainTime = 0.02; // 20ms sustain
    const releaseTime = 0.055; // 55ms release

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Bell-like harmonic series
      const phase1 = 2 * Math.PI * baseFreq * t;
      const phase2 = 2 * Math.PI * (baseFreq * 2.76) * t; // Bell harmonic
      const phase3 = 2 * Math.PI * (baseFreq * 5.4) * t; // Bell harmonic
      const phase4 = 2 * Math.PI * (baseFreq * 8.93) * t; // Bell harmonic

      let sample = Math.sin(phase1) * 0.5;
      sample += Math.sin(phase2) * 0.25 * Math.exp(-t * 8);
      sample += Math.sin(phase3) * 0.15 * Math.exp(-t * 12);
      sample += Math.sin(phase4) * 0.1 * Math.exp(-t * 16);

      // Bell-like envelope
      let envelope = 1;
      if (t < attackTime) {
        envelope = Math.sin((t / attackTime) * Math.PI / 2); // Smooth attack
      } else if (t < attackTime + sustainTime) {
        envelope = 1;
      } else {
        const releaseProgress = (t - attackTime - sustainTime) / releaseTime;
        envelope = Math.exp(-releaseProgress * 4); // Gradual release
      }

      data[i] = sample * envelope;
    }
  }

  /**
   * Load audio buffers for a specific sound style
   */
  private async loadAudioBuffers(style: string): Promise<void> {
    if (!this.audioContext || this.audioBuffers.has(style) || this.isLoadingBuffers) {
      return;
    }

    this.isLoadingBuffers = true;

    try {
      let downbeatBuffer: AudioBuffer | null = null;
      let regularBuffer: AudioBuffer | null = null;

      if (this.isExternalAudioStyle(style)) {
        // Load external audio files for librosa styles
        const baseUrl = '/audio/metronome';
        const downbeatUrl = `${baseUrl}/${style}_downbeat.wav`;
        const regularUrl = `${baseUrl}/${style}_regular.wav`;

        // Load both files in parallel
        const [downbeatResult, regularResult] = await Promise.all([
          this.loadExternalAudioFile(downbeatUrl),
          this.loadExternalAudioFile(regularUrl)
        ]);

        downbeatBuffer = downbeatResult;
        regularBuffer = regularResult;

        // Fallback to traditional generation if external files failed
        if (!downbeatBuffer || !regularBuffer) {
          console.warn(`External audio files failed for ${style}, falling back to traditional generation`);
          downbeatBuffer = this.generateClickBuffer(true, 'traditional');
          regularBuffer = this.generateClickBuffer(false, 'traditional');
        }
      } else {
        // Generate buffers for traditional styles
        downbeatBuffer = this.generateClickBuffer(true, style);
        regularBuffer = this.generateClickBuffer(false, style);
      }

      if (downbeatBuffer && regularBuffer) {
        this.audioBuffers.set(style, {
          downbeat: downbeatBuffer,
          regular: regularBuffer
        });
      } else {
        throw new Error(`Failed to load audio buffers for style: ${style}`);
      }
    } catch (error) {
      console.error(`Error loading metronome buffers for style ${style}:`, error);
    } finally {
      this.isLoadingBuffers = false;
    }
  }

  /**
   * Initialize Web Audio API context
   */
  private async initializeAudioContext(): Promise<void> {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        return;
      }

      // Create AudioContext with optimal settings for metronome
      this.audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        latencyHint: 'interactive', // Low latency for precise timing
        sampleRate: 44100
      });

      // Resume context if it's suspended (required by browser autoplay policies)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.isInitialized = true;

      // Load default sound style buffers
      await this.loadAudioBuffers(this.soundStyle);
    } catch (error) {
      console.error('Failed to initialize metronome AudioContext:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Ensure AudioContext is ready for use
   */
  private async ensureAudioContext(): Promise<boolean> {
    if (!this.audioContext) {
      // Initialize AudioContext if not available
      await this.initializeAudioContext();
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      // Resume suspended AudioContext
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
        return false;
      }
    }

    return this.isInitialized && this.audioContext !== null;
  }

  /**
   * Create a click sound using pre-generated audio buffers
   */
  private async createClick(isDownbeat: boolean, startTime: number): Promise<void> {
    // Create metronome click sound

    if (!this.audioContext || !this.isEnabled) {
      return;
    }

    try {
      // Ensure buffers are loaded for current sound style
      if (!this.audioBuffers.has(this.soundStyle)) {
        await this.loadAudioBuffers(this.soundStyle);
      }

      const buffers = this.audioBuffers.get(this.soundStyle);
      if (!buffers) {
        console.error(`No audio buffers available for sound style: ${this.soundStyle}`);
        return;
      }

      // Create audio nodes for click playback

      // Use regular buffer for all beats (no downbeat emphasis)
      const buffer = buffers.regular;

      // Create buffer source node
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      // Configure source
      source.buffer = buffer;

      // Configure gain with aggressive envelope for better separation
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(this.volume, startTime + 0.002); // 2ms attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + this.clickDuration * 0.8); // Faster decay for better separation

      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Set up automatic cleanup when source ends
      source.onended = () => {
        // Clean up completed audio source
      };

      // Schedule the click with precise timing
      source.start(startTime);
      source.stop(startTime + this.clickDuration); // Stop exactly at click duration for better separation

      // Click scheduled successfully

    } catch (error) {
      console.error('Error creating metronome click:', error);
    }
  }

  /**
   * PRE-GENERATED TRACK APPROACH: Generate complete metronome audio track
   * @param duration - Total duration of the track in seconds
   * @param bpm - Beats per minute for click spacing
   * @param timeSignature - Time signature for downbeat emphasis (default: 4)
   * @returns Promise<AudioBuffer> - Complete metronome track
   */
  public async generateMetronomeTrack(duration: number, bpm: number, _timeSignature: number = 4): Promise<AudioBuffer | null> { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!await this.ensureAudioContext()) {
      console.error('Cannot generate metronome track: AudioContext not available');
      return null;
    }

    // Load audio buffers for the current sound style
    await this.loadAudioBuffers(this.soundStyle);
    const buffers = this.audioBuffers.get(this.soundStyle);
    if (!buffers) {
      console.error('Failed to load audio buffers for metronome track generation');
      return null;
    }

    // Create offline audio context for rendering the complete track
    const sampleRate = this.audioContext!.sampleRate;
    const offlineContext = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);

    // Calculate beat interval and total beats
    const beatInterval = 60 / bpm; // seconds per beat
    const totalBeats = Math.floor(duration / beatInterval);

    // Calculate beats and intervals

    // Generate clicks for each beat
    for (let beatIndex = 0; beatIndex < totalBeats; beatIndex++) {
      const beatTime = beatIndex * beatInterval;

      // Skip beats that would extend beyond the track duration
      if (beatTime >= duration) break;

      // Use regular beat sound for all beats (no downbeat emphasis)
      const bufferToUse = buffers.regular;

      // Create audio source for this click
      const source = offlineContext.createBufferSource();
      const gainNode = offlineContext.createGain();

      source.buffer = bufferToUse;

      // Apply uniform volume for all beats (no downbeat emphasis)
      const baseVolume = this.volume * this.volumeBoost;
      const clickVolume = baseVolume;
      gainNode.gain.setValueAtTime(0, beatTime);
      gainNode.gain.linearRampToValueAtTime(clickVolume, beatTime + 0.002); // 2ms attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, beatTime + this.clickDuration * 0.8); // Decay

      // Connect and schedule
      source.connect(gainNode);
      gainNode.connect(offlineContext.destination);
      source.start(beatTime);
    }

    try {
      // Render the complete track
      const renderedBuffer = await offlineContext.startRendering();
      // Track generated successfully

      // Store the generated track
      this.metronomeTrack = renderedBuffer;
      return renderedBuffer;
    } catch (error) {
      console.error('Failed to render metronome track:', error);
      return null;
    }
  }

  /**
   * DEPRECATED: Legacy scheduling method - replaced by pre-generated track approach
   * @param relativeTime - Time relative to current playback time when the click should occur (in seconds)
   * @param isDownbeat - Whether this is a downbeat click
   * @param beatId - Unique identifier to prevent duplicate scheduling
   */
  public scheduleClick(relativeTime: number, isDownbeat: boolean = false, _beatId?: string): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    // DEPRECATED: This method is no longer used with the pre-generated track approach
    console.log('scheduleClick called - deprecated in favor of pre-generated track approach');

    // For compatibility, we could still create a single click if needed
    if (!this.audioContext || !this.isEnabled) {
      return;
    }

    if (relativeTime >= -0.01) {
      const audioTime = this.audioContext.currentTime + Math.max(0.01, relativeTime);
      this.createClick(isDownbeat, audioTime);
    }
  }

  /**
   * Enable/disable the metronome (PRE-GENERATED TRACK APPROACH)
   * @param enabled - Whether to enable or disable the metronome
   * @param currentTime - Current playback time for synchronization (CRITICAL for proper sync)
   */
  public async setEnabled(enabled: boolean, currentTime: number = 0): Promise<void> {
    if (enabled && !await this.ensureAudioContext()) {
      console.error('Cannot enable metronome: AudioContext not available');
      return;
    }

    const wasEnabled = this.isEnabled;
    this.isEnabled = enabled;

    if (enabled && !wasEnabled && this.metronomeTrack) {
      // FIXED: Start metronome track from current playback position for perfect sync
      this.startMetronomeTrack(currentTime);
    } else if (!enabled && wasEnabled) {
      // Stop metronome track playback
      this.stopMetronomeTrack();
    }

    // Metronome state updated
  }

  /**
   * Set metronome volume (0.0 to 1.0) - PRE-GENERATED TRACK APPROACH
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    // Update volume of currently playing track
    this.updateMetronomeVolume();
  }

  /**
   * Get current volume
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Check if metronome is enabled
   */
  public isMetronomeEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * ENHANCED: Toggle metronome with current time for perfect synchronization
   * This method should be used instead of setEnabled when toggling from UI
   * @param currentTime - Current playback time for synchronization
   */
  public async toggleMetronome(currentTime: number = 0): Promise<boolean> {
    const newEnabled = !this.isEnabled;
    await this.setEnabled(newEnabled, currentTime);
    return newEnabled;
  }

  /**
   * PRE-GENERATED TRACK: Start metronome track playback
   * @param currentTime - Current playback time to sync with main audio
   */
  public startMetronomeTrack(currentTime: number = 0): void {
    if (!this.metronomeTrack || !this.audioContext || !this.isEnabled) {
      return;
    }

    // Stop any existing playback
    this.stopMetronomeTrack();

    try {
      // Create new source and gain nodes
      this.metronomeSource = this.audioContext.createBufferSource();
      this.metronomeGainNode = this.audioContext.createGain();

      // Configure the source
      this.metronomeSource.buffer = this.metronomeTrack;
      this.metronomeSource.loop = false;

      // Set volume with boost for clear audibility over background music
      const effectiveVolume = this.volume * this.volumeBoost;
      this.metronomeGainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime);

      // Connect audio graph
      this.metronomeSource.connect(this.metronomeGainNode);
      this.metronomeGainNode.connect(this.audioContext.destination);

      // Start playback from the specified time
      const startTime = Math.max(0, currentTime);
      const when = this.audioContext.currentTime;

      if (startTime > 0 && startTime < this.metronomeTrack.duration) {
        // Start from specific position
        this.metronomeSource.start(when, startTime);
      } else {
        // Start from beginning
        this.metronomeSource.start(when);
      }

      // Track started

      // Handle track end
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

  /**
   * PRE-GENERATED TRACK: Stop metronome track playback
   */
  public stopMetronomeTrack(): void {
    if (this.metronomeSource) {
      try {
        this.metronomeSource.stop();
      } catch {
        // Source may already be stopped
      }
      this.metronomeSource = null;
    }

    if (this.metronomeGainNode) {
      this.metronomeGainNode.disconnect();
      this.metronomeGainNode = null;
    }
  }

  /**
   * PRE-GENERATED TRACK: Seek metronome track to specific time
   * @param currentTime - Time to seek to in seconds
   */
  public seekMetronomeTrack(currentTime: number): void {
    if (!this.metronomeTrack || !this.isEnabled) {
      return;
    }

    // Restart playback from the new position
    this.startMetronomeTrack(currentTime);
  }

  /**
   * PRE-GENERATED TRACK: Update metronome track volume with boost
   */
  public updateMetronomeVolume(): void {
    if (this.metronomeGainNode && this.audioContext) {
      const effectiveVolume = this.volume * this.volumeBoost;
      this.metronomeGainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime);
    }
  }

  /**
   * PRE-GENERATED TRACK: Check if metronome track is available
   */
  public hasMetronomeTrack(): boolean {
    return this.metronomeTrack !== null;
  }

  /**
   * PRE-GENERATED TRACK: Get metronome track duration
   */
  public getMetronomeTrackDuration(): number {
    return this.metronomeTrack?.duration || 0;
  }

  /**
   * DEPRECATED: Clear all scheduled clicks (legacy method for compatibility)
   */
  public clearScheduledClicks(): void {
    // Legacy method - no longer needed with pre-generated track approach
  }

  /**
   * Set sound style and load corresponding buffers
   */
  public async setSoundStyle(style: 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long'): Promise<void> {
    if (this.soundStyle === style) return;

    this.soundStyle = style;

    if (this.audioContext && this.isInitialized) {
      await this.loadAudioBuffers(style);
    }

    // Sound style updated
  }

  /**
   * Get current sound style
   */
  public getSoundStyle(): string {
    return this.soundStyle;
  }

  /**
   * Get available sound styles
   */
  public getAvailableSoundStyles(): string[] {
    return ['traditional', 'digital', 'wood', 'bell', 'librosa_default', 'librosa_pitched', 'librosa_short', 'librosa_long'];
  }

  /**
   * Update metronome settings
   */
  public async updateSettings(options: Partial<MetronomeOptions>): Promise<void> {
    if (options.volume !== undefined) {
      this.setVolume(options.volume);
    }
    if (options.soundStyle !== undefined) {
      await this.setSoundStyle(options.soundStyle);
    }
    if (options.clickDuration !== undefined) {
      this.clickDuration = options.clickDuration;
    }
  }

  /**
   * Get current settings
   */
  public getSettings(): MetronomeOptions {
    return {
      volume: this.volume,
      soundStyle: this.soundStyle,
      clickDuration: this.clickDuration
    };
  }

  /**
   * Cleanup resources - PRE-GENERATED TRACK APPROACH
   */
  public dispose(): void {
    this.setEnabled(false);

    // Stop and clean up metronome track
    this.stopMetronomeTrack();
    this.metronomeTrack = null;

    // Clean up HTML audio element if used
    if (this.metronomeAudioElement) {
      this.metronomeAudioElement.pause();
      this.metronomeAudioElement.src = '';
      this.metronomeAudioElement = null;
    }

    // Clear audio buffers
    this.audioBuffers.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isInitialized = false;
  }

  /**
   * Test the metronome with a single click
   */
  public async testClick(isDownbeat: boolean = false): Promise<void> {
    // Test metronome click functionality

    if (!await this.ensureAudioContext()) {
      console.error('Metronome: AudioContext not available for test click');
      return;
    }

    // AudioContext ready for test click

    // Ensure buffers are loaded for current sound style
    if (!this.audioBuffers.has(this.soundStyle)) {
      await this.loadAudioBuffers(this.soundStyle);
    }

    const buffers = this.audioBuffers.get(this.soundStyle);
    if (!buffers) {
      return;
    }

    const wasEnabled = this.isEnabled;
    this.isEnabled = true;

    // Use immediate scheduling for test click
    const currentTime = this.audioContext!.currentTime;
    this.createClick(isDownbeat, currentTime + 0.1); // Schedule 100ms in the future

    // Restore previous state after a short delay
    setTimeout(() => {
      this.isEnabled = wasEnabled;
    }, 200);
  }
}

// Create a singleton instance
export const metronomeService = new MetronomeService();
