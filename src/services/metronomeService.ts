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
  private volume = 0.3;
  private soundStyle: 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long' = 'librosa_short';
  private clickDuration = 0.06; // 60ms clicks for better separation
  private scheduledClicks: Set<string> = new Set(); // Store scheduled beat IDs to prevent duplicates
  private activeSources: AudioBufferSourceNode[] = []; // Track active audio sources for cleanup

  // Audio buffers for different sound styles
  private audioBuffers: Map<string, { downbeat: AudioBuffer; regular: AudioBuffer }> = new Map();
  private isLoadingBuffers = false;

  constructor() {
    this.initializeAudioContext();
  }

  /**
   * Load external audio file and convert to AudioBuffer
   */
  private async loadExternalAudioFile(url: string): Promise<AudioBuffer | null> {
    if (!this.audioContext) return null;

    try {
      console.log(`Loading external audio file: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      console.log(`Successfully loaded external audio file: ${url}`);
      return audioBuffer;
    } catch (error) {
      console.error(`Error loading external audio file ${url}:`, error);
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

      data[i] = sample * envelope * 0.7;
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
      console.log(`Loading metronome audio buffers for style: ${style}`);

      let downbeatBuffer: AudioBuffer | null = null;
      let regularBuffer: AudioBuffer | null = null;

      if (this.isExternalAudioStyle(style)) {
        // Load external audio files for librosa styles
        const baseUrl = '/audio/metronome';
        const downbeatUrl = `${baseUrl}/${style}_downbeat.wav`;
        const regularUrl = `${baseUrl}/${style}_regular.wav`;

        console.log(`Loading librosa audio files: ${downbeatUrl}, ${regularUrl}`);

        // Load both files in parallel
        const [downbeatResult, regularResult] = await Promise.all([
          this.loadExternalAudioFile(downbeatUrl),
          this.loadExternalAudioFile(regularUrl)
        ]);

        downbeatBuffer = downbeatResult;
        regularBuffer = regularResult;
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
        console.log(`Successfully loaded metronome buffers for style: ${style}`);
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
        console.log('Metronome: Skipping AudioContext initialization (SSR environment)');
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
      console.log('Metronome AudioContext initialized successfully');

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
      await this.initializeAudioContext();
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
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
    if (!this.audioContext || !this.isEnabled) return;

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

      // Select appropriate buffer
      const buffer = isDownbeat ? buffers.downbeat : buffers.regular;

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

      // Track active source for cleanup
      this.activeSources.push(source);

      // Set up automatic cleanup when source ends
      source.onended = () => {
        this.activeSources = this.activeSources.filter(s => s !== source);
      };

      // Schedule the click with precise timing
      source.start(startTime);
      source.stop(startTime + this.clickDuration); // Stop exactly at click duration for better separation

    } catch (error) {
      console.error('Error creating metronome click:', error);
    }
  }

  /**
   * Schedule a click at a specific time with duplicate prevention
   */
  public scheduleClick(time: number, isDownbeat: boolean = false, beatId?: string): void {
    if (!this.audioContext || !this.isEnabled) return;

    // Prevent duplicate scheduling for the same beat
    if (beatId) {
      if (this.scheduledClicks.has(beatId)) {
        return; // Already scheduled
      }
      this.scheduledClicks.add(beatId);

      // Clean up the beat ID after the click duration with extra buffer
      setTimeout(() => {
        this.scheduledClicks.delete(beatId);
      }, (this.clickDuration + 0.2) * 1000); // Increased buffer to 200ms
    }

    const audioTime = this.audioContext.currentTime + Math.max(0, time - Date.now() / 1000);

    // Only schedule if the audio time is in the future
    if (audioTime > this.audioContext.currentTime) {
      this.createClick(isDownbeat, audioTime);
    }
  }

  /**
   * Enable/disable the metronome
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    if (enabled && !await this.ensureAudioContext()) {
      console.error('Cannot enable metronome: AudioContext not available');
      return;
    }

    this.isEnabled = enabled;

    if (!enabled) {
      this.clearScheduledClicks();
    }

    console.log(`Metronome ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set metronome volume (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
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
   * Clear all scheduled clicks and stop active audio sources
   */
  private clearScheduledClicks(): void {
    // Stop all active audio sources to prevent overlap
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch {
        // Source may already be stopped, ignore error
      }
    });
    this.activeSources = [];
    this.scheduledClicks.clear(); // Clear the Set

    console.log('Metronome: Cleared all scheduled clicks and active sources');
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

    console.log(`Metronome sound style changed to: ${style}`);
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
   * Cleanup resources
   */
  public dispose(): void {
    this.setEnabled(false);
    this.clearScheduledClicks();

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
    if (!await this.ensureAudioContext()) {
      // AudioContext not available for metronome test
      return;
    }

    const wasEnabled = this.isEnabled;
    this.isEnabled = true;

    this.scheduleClick(Date.now() / 1000, isDownbeat);

    // Restore previous state after a short delay
    setTimeout(() => {
      this.isEnabled = wasEnabled;
    }, 200);
  }
}

// Create a singleton instance
export const metronomeService = new MetronomeService();
