/**
 * Soundfont Mixer Service - POC
 *
 * Demonstrates real instrument soundfont playback using smplr library
 * Supports Piano, Guitar, and Violin with independent volume and octave controls
 */

import { Soundfont } from 'smplr';

export interface InstrumentSettings {
  volume: number; // 0-100
  octave: number; // 2-6
  enabled: boolean;
}

export interface MixerSettings {
  masterVolume: number; // 0-100
  piano: InstrumentSettings;
  guitar: InstrumentSettings;
  violin: InstrumentSettings;
}

export interface PerformanceMetrics {
  loadingTime: number; // milliseconds
  lastPlaybackLatency: number; // milliseconds
  instrumentsLoaded: string[];
}

export class SoundfontMixerService {
  private audioContext: AudioContext | null = null;
  private instruments: Map<string, Soundfont> = new Map();
  private isInitialized = false;
  private settings: MixerSettings = {
    masterVolume: 80,
    piano: { volume: 70, octave: 4, enabled: true },
    guitar: { volume: 50, octave: 3, enabled: true },
    violin: { volume: 60, octave: 5, enabled: true }
  };
  private metrics: PerformanceMetrics = {
    loadingTime: 0,
    lastPlaybackLatency: 0,
    instrumentsLoaded: []
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new AudioContext();
    }
  }

  /**
   * Initialize and load all instruments
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.audioContext) throw new Error('AudioContext not available');

    const startTime = performance.now();

    try {
      // Load all three instruments in parallel
      const [piano, guitar, violin] = await Promise.all([
        this.loadInstrument('piano', 'acoustic_grand_piano'),
        this.loadInstrument('guitar', 'acoustic_guitar_nylon'),
        this.loadInstrument('violin', 'violin')
      ]);

      this.instruments.set('piano', piano);
      this.instruments.set('guitar', guitar);
      this.instruments.set('violin', violin);

      this.metrics.loadingTime = performance.now() - startTime;
      this.metrics.instrumentsLoaded = ['piano', 'guitar', 'violin'];
      this.isInitialized = true;

      console.log(`✅ Soundfonts loaded in ${this.metrics.loadingTime.toFixed(0)}ms`);
    } catch (error) {
      console.error('❌ Failed to load soundfonts:', error);
      throw error;
    }
  }

  /**
   * Load a single instrument
   */
  private async loadInstrument(
    name: string,
    instrumentName: string
  ): Promise<Soundfont> {
    if (!this.audioContext) throw new Error('AudioContext not available');

    console.log(`🎵 Loading ${name}...`);
    const instrument = new Soundfont(this.audioContext, {
      instrument: instrumentName
    });

    await instrument.loaded();
    console.log(`✅ ${name} loaded`);

    return instrument;
  }

  /**
   * Play a chord with all enabled instruments
   */
  async playChord(chordName: string, duration: number = 2.0): Promise<void> {
    if (!this.isInitialized) {
      console.warn('⚠️ Instruments not loaded yet');
      return;
    }

    const startTime = performance.now();

    // Parse chord to get notes
    const notes = this.parseChord(chordName);
    if (notes.length === 0) {
      console.warn(`⚠️ Could not parse chord: ${chordName}`);
      return;
    }

    // Play chord on each enabled instrument
    const promises: Promise<void>[] = [];

    if (this.settings.piano.enabled) {
      promises.push(this.playChordOnInstrument('piano', notes, duration));
    }
    if (this.settings.guitar.enabled) {
      promises.push(this.playChordOnInstrument('guitar', notes, duration));
    }
    if (this.settings.violin.enabled) {
      promises.push(this.playChordOnInstrument('violin', notes, duration));
    }

    await Promise.all(promises);

    this.metrics.lastPlaybackLatency = performance.now() - startTime;
  }

  /**
   * Play chord on a specific instrument
   */
  private async playChordOnInstrument(
    instrumentName: string,
    notes: string[],
    duration: number
  ): Promise<void> {
    const instrument = this.instruments.get(instrumentName);
    if (!instrument) return;

    const settings = this.settings[instrumentName as keyof typeof this.settings] as InstrumentSettings;
    if (!settings) return;

    // Calculate volume (0-1 scale)
    const volume = (this.settings.masterVolume / 100) * (settings.volume / 100);

    // Transpose notes to the correct octave
    const transposedNotes = notes.map(note => {
      // Extract note name and octave
      const match = note.match(/^([A-G][#b]?)(\d)$/);
      if (!match) return note;

      const [, noteName, ] = match;
      return `${noteName}${settings.octave}`;
    });

    // Play all notes of the chord
    transposedNotes.forEach(note => {
      instrument.start({
        note,
        velocity: volume * 127, // Convert to MIDI velocity (0-127)
        duration
      });
    });
  }

  /**
   * Parse chord name to get notes
   * Simplified version for POC - supports major and minor chords
   */
  private parseChord(chordName: string): string[] {
    const chordMap: Record<string, string[]> = {
      'C': ['C4', 'E4', 'G4'],
      'Cmaj': ['C4', 'E4', 'G4'],
      'Cm': ['C4', 'Eb4', 'G4'],
      'Am': ['A3', 'C4', 'E4'],
      'Amin': ['A3', 'C4', 'E4'],
      'F': ['F4', 'A4', 'C5'],
      'Fmaj': ['F4', 'A4', 'C5'],
      'Fm': ['F4', 'Ab4', 'C5'],
      'G': ['G4', 'B4', 'D5'],
      'Gmaj': ['G4', 'B4', 'D5'],
      'Gm': ['G4', 'Bb4', 'D5'],
      'D': ['D4', 'F#4', 'A4'],
      'Dm': ['D4', 'F4', 'A4'],
      'E': ['E4', 'G#4', 'B4'],
      'Em': ['E4', 'G4', 'B4'],
      'A': ['A4', 'C#5', 'E5'],
      'B': ['B4', 'D#5', 'F#5'],
      'Bm': ['B3', 'D4', 'F#4']
    };

    return chordMap[chordName] || [];
  }

  /**
   * Update mixer settings
   */
  updateSettings(newSettings: Partial<MixerSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Update individual instrument settings
   */
  updateInstrument(
    instrumentName: 'piano' | 'guitar' | 'violin',
    settings: Partial<InstrumentSettings>
  ): void {
    this.settings[instrumentName] = {
      ...this.settings[instrumentName],
      ...settings
    };
  }

  /**
   * Get current settings
   */
  getSettings(): MixerSettings {
    return { ...this.settings };
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Stop all playing notes
   */
  stopAll(): void {
    this.instruments.forEach(instrument => {
      instrument.stop();
    });
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAll();
    this.instruments.clear();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.isInitialized = false;
  }
}

// Singleton instance
let instance: SoundfontMixerService | null = null;

export function getSoundfontMixerService(): SoundfontMixerService {
  if (!instance) {
    instance = new SoundfontMixerService();
  }
  return instance;
}

