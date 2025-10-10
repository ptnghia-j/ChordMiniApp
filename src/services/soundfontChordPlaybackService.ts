/**
 * Soundfont Chord Playback Service - Production
 *
 * Real instrument soundfont playback using smplr library
 * Supports Piano, Guitar, Violin, and Flute with lazy loading and error handling
 * Compatible with existing AudioMixerService interface
 */

import { Soundfont } from 'smplr';

/**
 * Options interface compatible with AudioMixerService
 */
export interface SoundfontChordPlaybackOptions {
  pianoVolume: number; // 0-100
  guitarVolume: number; // 0-100
  violinVolume: number; // 0-100
  fluteVolume: number; // 0-100
  enabled: boolean;
}

/**
 * Chord parsing utilities (imported from lightweight service logic)
 */
const NOTE_INDEX_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORD_STRUCTURES: Record<string, number[]> = {
  major:    [0, 4, 7],
  minor:    [0, 3, 7],
  dom7:     [0, 4, 7, 10],
  maj7:     [0, 4, 7, 11],
  min7:     [0, 3, 7, 10],
  sus2:     [0, 2, 7],
  sus4:     [0, 5, 7],
  dim:      [0, 3, 6],
  aug:      [0, 4, 8],
  dim7:     [0, 3, 6, 9],
  hdim7:    [0, 3, 6, 10],
  add9:     [0, 4, 7, 14],
  dom9:     [0, 4, 7, 10, 14],
  maj9:     [0, 4, 7, 11, 14],
  min9:     [0, 3, 7, 10, 14],
  dom11:    [0, 4, 7, 10, 14, 17],
  dom13:    [0, 4, 7, 10, 14, 21],
  six:      [0, 4, 7, 9],
  min6:     [0, 3, 7, 9]
};

const CHORD_TYPE_ALIASES: Record<string, string> = {
  '': 'major', 'maj': 'major', 'major': 'major',
  'm': 'minor', 'min': 'minor', 'minor': 'minor',
  '7': 'dom7', 'dom7': 'dom7',
  'M7': 'maj7', 'maj7': 'maj7', 'Maj7': 'maj7',
  'm7': 'min7', 'min7': 'min7',
  'sus2': 'sus2',
  'sus4': 'sus4',
  '°': 'dim', 'dim': 'dim',
  '+': 'aug', 'aug': 'aug',
  '°7': 'dim7', 'dim7': 'dim7',
  'ø7': 'hdim7', 'hdim7': 'hdim7', 'm7b5': 'hdim7',
  'add9': 'add9',
  '9': 'dom9', 'dom9': 'dom9',
  'M9': 'maj9', 'maj9': 'maj9', 'Maj9': 'maj9',
  'm9': 'min9', 'min9': 'min9',
  '11': 'dom11', 'dom11': 'dom11',
  '13': 'dom13', 'dom13': 'dom13',
  '6': 'six',
  'm6': 'min6', 'min6': 'min6'
};

/**
 * Parse chord name to get note names with octaves
 */
function parseChordToNotes(chordName: string): string[] {
  // Handle slash chords (e.g., "C/G", "Am/E")
  const parts = chordName.split('/');
  const baseChord = parts[0];
  const bassNote = parts[1];

  // Extract root note and chord type
  const match = baseChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return [];

  const [, root, chordType] = match;
  const rootIndex = NOTE_INDEX_MAP[root];
  if (rootIndex === undefined) return [];

  // Normalize chord type
  const cleanedType = chordType.replace(/^[^A-Za-z0-9#b]+/, '').replace(/\s+/g, '');
  const normalizedChordType = CHORD_TYPE_ALIASES[cleanedType.toLowerCase()] || 'major';
  const intervals = CHORD_STRUCTURES[normalizedChordType];
  if (!intervals) return [];

  // Generate chord notes
  const notes: string[] = [];
  const isRootPosition = !bassNote || bassNote === root;

  if (!isRootPosition && bassNote) {
    // Add bass note in lower octave (C2-B2 range)
    notes.push(`${bassNote}2`);
  }

  // Add chord tones in C4-C6 range
  intervals.forEach(interval => {
    const noteIndex = (rootIndex + interval) % 12;
    const noteName = CHROMATIC_SCALE[noteIndex];
    // Skip bass note if it's already added
    if (!isRootPosition && noteName === bassNote) return;
    
    // Determine octave based on interval
    const octave = interval < 12 ? 4 : 5;
    notes.push(`${noteName}${octave}`);
  });

  return notes;
}

export class SoundfontChordPlaybackService {
  private audioContext: AudioContext | null = null;
  private instruments: Map<string, Soundfont> = new Map();
  private isInitialized = false;
  private isInitializing = false;
  private initializationError: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activeNotes: Map<string, any[]> = new Map(); // Track active note stop functions per instrument
  private releaseTime = 0.3; // Release/fade-out time in seconds
  
  private options: SoundfontChordPlaybackOptions = {
    pianoVolume: 70,
    guitarVolume: 50,
    violinVolume: 60,
    fluteVolume: 50,
    enabled: false
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new AudioContext();
    }
  }

  /**
   * Initialize and load all instruments (lazy loading)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.isInitializing) {
      // Wait for ongoing initialization
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;
    this.initializationError = null;

    if (!this.audioContext) {
      this.initializationError = new Error('AudioContext not available');
      this.isInitializing = false;
      throw this.initializationError;
    }

    const startTime = performance.now();

    try {
      console.log('🎵 Loading soundfonts...');

      // Load all four instruments in parallel
      const [piano, guitar, violin, flute] = await Promise.all([
        this.loadInstrument('piano', 'acoustic_grand_piano'),
        this.loadInstrument('guitar', 'acoustic_guitar_nylon'),
        this.loadInstrument('violin', 'violin'),
        this.loadInstrument('flute', 'flute')
      ]);

      this.instruments.set('piano', piano);
      this.instruments.set('guitar', guitar);
      this.instruments.set('violin', violin);
      this.instruments.set('flute', flute);

      this.isInitialized = true;
      const loadingTime = performance.now() - startTime;

      console.log(`✅ Soundfonts loaded in ${loadingTime.toFixed(0)}ms`);
    } catch (error) {
      this.initializationError = error as Error;
      console.error('❌ Failed to load soundfonts:', error);
      throw error;
    } finally {
      this.isInitializing = false;
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
   * Compatible with existing chord playback interface
   *
   * Instrument behavior:
   * - Piano (C3): Plays full chord with inversions
   * - Guitar (C3): Plays full chord with inversions
   * - Violin (C5): Plays only the chord root (before slash in C/E)
   * - Flute (C4): Plays only the bass note (after slash in C/E, or root if no slash)
   */
  async playChord(chordName: string, duration: number = 2.0): Promise<void> {
    // Lazy initialization on first playback
    if (!this.isInitialized && !this.isInitializing && this.options.enabled) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('❌ Soundfont initialization failed, skipping playback:', error);
        return;
      }
    }

    if (!this.isInitialized || !this.options.enabled) {
      return;
    }

    // Parse chord to get notes
    const notes = parseChordToNotes(chordName);
    if (notes.length === 0) {
      console.warn(`⚠️ Could not parse chord: ${chordName}`);
      return;
    }

    // Extract chord root and bass note for single-note instruments
    const parts = chordName.split('/');
    const baseChord = parts[0];
    const bassNote = parts[1];

    // Get chord root (the note before slash, or the root of the chord)
    const rootMatch = baseChord.match(/^([A-G][#b]?)/);
    const chordRoot = rootMatch ? rootMatch[1] : null;

    // Play chord on each instrument with volume > 0
    const promises: Promise<void>[] = [];

    // Piano and Guitar: Play full chord (all notes including inversions)
    if (this.options.pianoVolume > 0) {
      promises.push(this.playInstrument('piano', notes, duration, this.options.pianoVolume, 3));
    }
    if (this.options.guitarVolume > 0) {
      promises.push(this.playInstrument('guitar', notes, duration, this.options.guitarVolume, 3));
    }

    // Violin: Play only the chord root (note before slash)
    if (this.options.violinVolume > 0 && chordRoot) {
      const violinNote = [`${chordRoot}5`]; // Single note at octave 5
      promises.push(this.playInstrument('violin', violinNote, duration, this.options.violinVolume, 5));
    }

    // Flute: Play only the bass note (note after slash, or root if no slash)
    if (this.options.fluteVolume > 0) {
      const fluteNoteRoot = bassNote || chordRoot;
      if (fluteNoteRoot) {
        const fluteNote = [`${fluteNoteRoot}4`]; // Single note at octave 4
        promises.push(this.playInstrument('flute', fluteNote, duration, this.options.fluteVolume, 4));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Play notes on a specific instrument
   */
  private async playInstrument(
    instrumentName: string,
    notes: string[],
    duration: number,
    volume: number,
    octave: number
  ): Promise<void> {
    const instrument = this.instruments.get(instrumentName);
    if (!instrument) return;

    // Stop previous notes on this instrument with fade-out
    this.stopInstrumentNotes(instrumentName);

    // Calculate volume (0-1 scale)
    const velocity = (volume / 100) * 127; // Convert to MIDI velocity (0-127)

    // Transpose notes to the correct octave
    const transposedNotes = notes.map(note => {
      const match = note.match(/^([A-G][#b]?)(\d)$/);
      if (!match) return note;
      const [, noteName] = match;
      return `${noteName}${octave}`;
    });

    // Track active notes for this instrument
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeNotesForInstrument: any[] = [];

    // Play all notes of the chord with sustain (no duration = infinite sustain)
    // Notes will be stopped when next chord plays or when stopAll() is called
    transposedNotes.forEach(note => {
      const stopFn = instrument.start({
        note,
        velocity,
        // No duration parameter = note sustains indefinitely until stopped
      });

      if (stopFn) {
        activeNotesForInstrument.push(stopFn);
      }
    });

    // Store active notes for later cleanup
    this.activeNotes.set(instrumentName, activeNotesForInstrument);
  }

  /**
   * Stop all notes on a specific instrument with fade-out
   */
  private stopInstrumentNotes(instrumentName: string): void {
    const activeNotesForInstrument = this.activeNotes.get(instrumentName);

    if (!activeNotesForInstrument || activeNotesForInstrument.length === 0) {
      return;
    }

    // Stop each note with release time for natural fade-out
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeNotesForInstrument.forEach((stopFn: any) => {
      // Call stop function with fade-out time
      // smplr stop function accepts a time parameter for fade-out
      stopFn(this.releaseTime);
    });

    // Clear the active notes for this instrument
    this.activeNotes.set(instrumentName, []);
  }

  /**
   * Update options (compatible with AudioMixerService interface)
   */
  updateOptions(options: Partial<SoundfontChordPlaybackOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Lazy initialization when enabled
    if (options.enabled && !this.isInitialized && !this.isInitializing) {
      this.initialize().catch(error => {
        console.error('❌ Failed to initialize soundfonts:', error);
      });
    }
  }

  /**
   * Get current options
   */
  getOptions(): SoundfontChordPlaybackOptions {
    return { ...this.options };
  }

  /**
   * Check if ready to play
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Stop all playing notes with fade-out
   */
  stopAll(): void {
    // Stop notes on each instrument with fade-out
    this.instruments.forEach((instrument, instrumentName) => {
      this.stopInstrumentNotes(instrumentName);
    });
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAll();
    this.activeNotes.clear();
    this.instruments.clear();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.isInitialized = false;
    this.isInitializing = false;
  }
}

// Singleton instance
let instance: SoundfontChordPlaybackService | null = null;

export const getSoundfontChordPlaybackService = (): SoundfontChordPlaybackService => {
  if (!instance) {
    instance = new SoundfontChordPlaybackService();
  }
  return instance;
};

