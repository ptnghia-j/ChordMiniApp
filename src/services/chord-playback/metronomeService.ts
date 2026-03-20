/**
 * Metronome Service using Web Audio API for precise timing
 * Provides click sounds synchronized with beat detection results
 */
import { audioContextManager } from '../audio/audioContextManager';


export interface MetronomeOptions {
  volume: number; // 0.0 to 1.0
  soundStyle: 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long'; // Sound style selection
  trackMode: 'metronome' | 'drum';
  clickDuration: number; // Duration of each click in seconds
}

export class MetronomeService {
  private static readonly DRUM_TRACK_MASTER_GAIN = 1.0;
  private static readonly DRUM_TRACK_PLAYBACK_BOOST = 1.8;
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private isEnabled = false;
  private volume = 1.0; // Base volume (will be multiplied by gain boost)
  private volumeBoost = 3.0; // VOLUME BOOST: 3x gain multiplication for clear audibility over background music
  private soundStyle: 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long' = 'librosa_short';
  private trackMode: 'metronome' | 'drum' = 'metronome';
  private clickDuration = 0.06; // 60ms clicks for better separation

  // PRE-GENERATED TRACK APPROACH: Store complete metronome audio tracks
  private metronomeTrack: AudioBuffer | null = null;
  private metronomeAudioElement: HTMLAudioElement | null = null;
  private metronomeSource: AudioBufferSourceNode | null = null;
  private metronomeGainNode: GainNode | null = null;

  // Audio buffers for different sound styles (for click generation)
  private audioBuffers: Map<string, { downbeat: AudioBuffer; regular: AudioBuffer }> = new Map();
  private renderedTrackCache: Map<string, AudioBuffer> = new Map();
  private isLoadingBuffers = false;
  private settingsListeners: Set<() => void> = new Set();

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
   * Initialize Web Audio API context (shared via AudioContextManager)
   */
  private async initializeAudioContext(): Promise<void> {
    try {
      if (typeof window === 'undefined') return;
      this.audioContext = audioContextManager.getContext();
      await audioContextManager.resume();
      this.isInitialized = true;
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

      const buffer = isDownbeat ? buffers.downbeat : buffers.regular;

      // Create buffer source node
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      // Configure source
      source.buffer = buffer;

      // Configure gain with aggressive envelope for better separation
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(this.volume * this.volumeBoost, startTime + 0.002); // 2ms attack
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
  public async generateMetronomeTrack(duration: number, bpm: number, _timeSignature: number = 4): Promise<AudioBuffer | null> {  
    if (!await this.ensureAudioContext()) {
      console.error('Cannot generate metronome track: AudioContext not available');
      return null;
    }

    const timeSignature = Math.max(1, _timeSignature);
    const cacheKey = `${this.trackMode}:${this.soundStyle}:${duration.toFixed(3)}:${bpm}:${timeSignature}:${this.clickDuration.toFixed(3)}`;
    const cachedTrack = this.renderedTrackCache.get(cacheKey);
    if (cachedTrack) {
      this.metronomeTrack = cachedTrack;
      return cachedTrack;
    }

    let buffers: { downbeat: AudioBuffer; regular: AudioBuffer } | undefined;
    if (this.trackMode !== 'drum') {
      // Drum mode is procedural and should not block on metronome sample loading.
      await this.loadAudioBuffers(this.soundStyle);
      buffers = this.audioBuffers.get(this.soundStyle);
      if (!buffers) {
        console.error('Failed to load audio buffers for metronome track generation');
        return null;
      }
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

      const isDownbeat = beatIndex % timeSignature === 0;
      if (this.trackMode === 'drum') {
        this.renderDrumBeat(offlineContext, beatTime, beatInterval, isDownbeat, beatIndex, timeSignature);
      } else {
        const bufferToUse = isDownbeat ? buffers!.downbeat : buffers!.regular;
        const source = offlineContext.createBufferSource();
        const gainNode = offlineContext.createGain();

        source.buffer = bufferToUse;

        const clickVolume = this.volume * this.volumeBoost * (isDownbeat ? 1.08 : 0.92);
        gainNode.gain.setValueAtTime(0, beatTime);
        gainNode.gain.linearRampToValueAtTime(clickVolume, beatTime + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.001, beatTime + this.clickDuration * 0.8);

        source.connect(gainNode);
        gainNode.connect(offlineContext.destination);
        source.start(beatTime);
      }
    }

    try {
      // Render the complete track
      const renderedBuffer = await offlineContext.startRendering();
      // Track generated successfully

      // Store the generated track
      this.metronomeTrack = renderedBuffer;
      this.renderedTrackCache.set(cacheKey, renderedBuffer);
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
  public scheduleClick(relativeTime: number, isDownbeat: boolean = false, _beatId?: string): void {  
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
      const effectiveVolume = this.volume * this.getPlaybackGainBoost();
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
    // First, aggressively silence and cancel any gain automation (Chrome safety)
    if (this.metronomeGainNode && this.audioContext) {
      try {
        const now = this.audioContext.currentTime;
        this.metronomeGainNode.gain.cancelScheduledValues(now);
        this.metronomeGainNode.gain.setValueAtTime(0, now);
      } catch {
        // Ignore automation cancellation errors
      }
    }

    // Then, disconnect and stop the source node defensively
    if (this.metronomeSource) {
      try {
        // Prevent any pending end callbacks from re-mutating state
        this.metronomeSource.onended = null;
      } catch {}

      try {
        this.metronomeSource.disconnect();
      } catch {
        // Already disconnected or not connected
      }

      try {
        this.metronomeSource.stop(0);
      } catch {
        // Source may already be stopped
      }

      this.metronomeSource = null;
    }

    if (this.metronomeGainNode) {
      try {
        this.metronomeGainNode.disconnect();
      } catch {}
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
      const effectiveVolume = this.volume * this.getPlaybackGainBoost();
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
    this.metronomeTrack = null;
    this.notifySettingsChanged();

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

  public async setTrackMode(mode: 'metronome' | 'drum'): Promise<void> {
    if (this.trackMode === mode) return;

    // Stop the currently playing track immediately so switching modes never leaves
    // stale audio running while the replacement track is being generated.
    this.stopMetronomeTrack();
    this.trackMode = mode;
    this.metronomeTrack = null;
    this.notifySettingsChanged();
  }

  public getTrackMode(): 'metronome' | 'drum' {
    return this.trackMode;
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
    if (options.trackMode !== undefined) {
      await this.setTrackMode(options.trackMode);
    }
    if (options.clickDuration !== undefined) {
      this.clickDuration = options.clickDuration;
      this.metronomeTrack = null;
      this.notifySettingsChanged();
    }
  }

  /**
   * Get current settings
   */
  public getSettings(): MetronomeOptions {
    return {
      volume: this.volume,
      soundStyle: this.soundStyle,
      trackMode: this.trackMode,
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
    this.renderedTrackCache.clear();

    // Do not close the shared AudioContext; just release local references
    this.audioContext = null;

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

    if (this.trackMode !== 'drum') {
      // Sample-based metronome styles need buffers before previewing.
      if (!this.audioBuffers.has(this.soundStyle)) {
        await this.loadAudioBuffers(this.soundStyle);
      }

      const buffers = this.audioBuffers.get(this.soundStyle);
      if (!buffers) {
        return;
      }
    }

    const wasEnabled = this.isEnabled;
    this.isEnabled = true;

    const currentTime = this.audioContext!.currentTime;
    const testTime = currentTime + 0.1;
    if (this.trackMode === 'drum') {
      this.renderKick(this.audioContext!, testTime, isDownbeat ? 0.8 : 0.62);
      if (isDownbeat) {
        this.renderHiHat(this.audioContext!, testTime + 0.08, 0.24);
      } else {
        this.renderSnare(this.audioContext!, testTime, 0.58);
      }
    } else {
      this.createClick(isDownbeat, testTime);
    }

    // Restore previous state after a short delay
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

  private renderDrumBeat(
    offlineContext: OfflineAudioContext,
    beatTime: number,
    beatInterval: number,
    isDownbeat: boolean,
    beatIndex: number,
    timeSignature: number,
  ): void {
    const beatInBar = beatIndex % timeSignature;
    this.renderKick(offlineContext, beatTime, isDownbeat ? 0.28 : 0.2);

    const shouldAddSnare = timeSignature >= 4
      ? beatInBar === 1 || beatInBar === 3
      : beatInBar === Math.floor(timeSignature / 2);
    if (shouldAddSnare) {
      this.renderSnare(offlineContext, beatTime, 0.38);
    }

    this.renderHiHat(offlineContext, beatTime, 0.18);
    const offbeatTime = beatTime + beatInterval * 0.5;
    if (offbeatTime < offlineContext.length / offlineContext.sampleRate) {
      this.renderHiHat(offlineContext, offbeatTime, 0.14);
    }
  }

  private renderKick(context: BaseAudioContext, time: number, volume: number): void {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const targetGain = volume * this.volume * 0.36 * MetronomeService.DRUM_TRACK_MASTER_GAIN;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(targetGain, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private createNoiseBuffer(context: BaseAudioContext, durationSeconds: number): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
    const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < frameCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    return noiseBuffer;
  }

  private renderSnare(context: BaseAudioContext, time: number, volume: number): void {
    const noise = context.createBufferSource();
    const noiseHighpass = context.createBiquadFilter();
    const noiseLowpass = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const bodyOsc = context.createOscillator();
    const bodyGain = context.createGain();

    noise.buffer = this.createNoiseBuffer(context, 0.14);
    noiseHighpass.type = 'highpass';
    noiseHighpass.frequency.setValueAtTime(1900, time);
    noiseLowpass.type = 'lowpass';
    noiseLowpass.frequency.setValueAtTime(6200, time);

    const targetNoiseGain = volume * this.volume * 0.42 * MetronomeService.DRUM_TRACK_MASTER_GAIN;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.linearRampToValueAtTime(targetNoiseGain, time + 0.0025);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(210, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(135, time + 0.09);

    const targetBodyGain = volume * this.volume * 0.2 * MetronomeService.DRUM_TRACK_MASTER_GAIN;
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.linearRampToValueAtTime(targetBodyGain, time + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.085);

    noise.connect(noiseHighpass);
    noiseHighpass.connect(noiseLowpass);
    noiseLowpass.connect(noiseGain);
    noiseGain.connect(context.destination);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(context.destination);

    noise.start(time);
    noise.stop(time + 0.12);
    bodyOsc.start(time);
    bodyOsc.stop(time + 0.1);
  }

  private renderHiHat(context: BaseAudioContext, time: number, volume: number): void {
    const noise = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = this.createNoiseBuffer(context, 0.06);

    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(6800, time);
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(9000, time);
    bandpass.Q.setValueAtTime(0.6, time);

    const targetGain = volume * this.volume * 0.32 * MetronomeService.DRUM_TRACK_MASTER_GAIN;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(targetGain, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(context.destination);
    noise.start(time);
    noise.stop(time + 0.045);
  }

  private getPlaybackGainBoost(): number {
    return this.trackMode === 'drum'
      ? MetronomeService.DRUM_TRACK_PLAYBACK_BOOST
      : this.volumeBoost;
  }
}

// Create a singleton instance
export const metronomeService = new MetronomeService();
