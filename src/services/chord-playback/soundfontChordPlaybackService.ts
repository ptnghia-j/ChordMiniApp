/**
 * Soundfont Chord Playback Service - Production
 *
 * Real instrument soundfont playback using smplr library
 * Supports Piano, Guitar, Violin, and Flute with lazy loading and error handling
 * Compatible with existing AudioMixerService interface
 * Lazy loads smplr library (~100KB) for better initial bundle size
 */

import { audioContextManager } from '../audio/audioContextManager';

// Lazy load smplr to reduce initial bundle size
let SmplrModule: typeof import('smplr') | null = null;

async function getSmplr() {
  if (!SmplrModule) {
    SmplrModule = await import('smplr');
  }
  return SmplrModule;
}

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
 * Convert interval notation to semitones
 * The Python backend uses delta notation where numbers represent semitone intervals:
 * delta_dict=['1','b2','2','b3','3','4','b5','5','b6','6','b7','7']
 * This maps to: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] semitones
 *
 * Examples:
 * - "1" = 0 semitones (root)
 * - "b2" = 1 semitone
 * - "2" = 2 semitones
 * - "3" = 4 semitones (major third)
 * - "4" = 5 semitones (perfect fourth)
 * - "5" = 7 semitones (perfect fifth)
 * - "b7" = 10 semitones (minor seventh)
 * - "7" = 11 semitones (major seventh)
 */
function intervalToSemitones(interval: string): number {
  // Parse the interval string to extract accidental and number
  const match = interval.match(/^([#b]?)(\d+)$/);
  if (!match) return 0;

  const [, accidental, intervalNum] = match;
  const intervalNumber = parseInt(intervalNum);

  // Map interval numbers to semitones (based on major scale intervals)
  // 1=0, 2=2, 3=4, 4=5, 5=7, 6=9, 7=11, 9=14, 11=17, 13=21
  const intervalMap: Record<number, number> = {
    1: 0,   // Root
    2: 2,   // Major second
    3: 4,   // Major third
    4: 5,   // Perfect fourth
    5: 7,   // Perfect fifth
    6: 9,   // Major sixth
    7: 11,  // Major seventh
    9: 14,  // Major ninth (octave + major second)
    11: 17, // Perfect eleventh (octave + perfect fourth)
    13: 21  // Major thirteenth (octave + major sixth)
  };

  let semitones = intervalMap[intervalNumber] || 0;

  // Apply accidental
  if (accidental === '#') semitones += 1;
  if (accidental === 'b') semitones -= 1;

  return semitones;
}

/**
 * Parse chord name to get note names with octaves
 */
function parseChordToNotes(chordName: string): string[] {
  // Handle slash chords (e.g., "C/G", "Am/E", "Eb:maj/4")
  const parts = chordName.split('/');
  const baseChord = parts[0];
  const bassSpecifier = parts[1]; // Could be note name (E, G) or interval (3, 4, b7)

  // Extract root note and chord type
  const match = baseChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) {
    return [];
  }

  const [, root, chordType] = match;
  const rootIndex = NOTE_INDEX_MAP[root];
  if (rootIndex === undefined) {
    return [];
  }

  // Normalize chord type
  const cleanedType = chordType.replace(/^[^A-Za-z0-9#b]+/, '').replace(/\s+/g, '');
  const normalizedChordType = CHORD_TYPE_ALIASES[cleanedType.toLowerCase()] || 'major';
  const intervals = CHORD_STRUCTURES[normalizedChordType];
  if (!intervals) {
    return [];
  }

  // Convert bass specifier to actual note name
  let bassNoteName: string | undefined;

  if (bassSpecifier) {
    // Check if it's a note name (A-G with optional #/b) or an interval (number with optional #/b)
    const isNoteName = /^[A-G][#b]?$/.test(bassSpecifier);
    const isInterval = /^[#b]?\d+$/.test(bassSpecifier);

    if (isNoteName) {
      // It's already a note name (e.g., "E", "G", "Bb")
      bassNoteName = bassSpecifier;
    } else if (isInterval) {
      // It's an interval (e.g., "3", "4", "b7") - convert to note name
      const semitones = intervalToSemitones(bassSpecifier);
      const bassNoteIndex = (rootIndex + semitones) % 12;
      bassNoteName = CHROMATIC_SCALE[bassNoteIndex];
    }
  }

  // Generate chord notes
  const notes: string[] = [];
  const isRootPosition = !bassNoteName || bassNoteName === root;

  if (!isRootPosition && bassNoteName) {
    // Add bass note in lower octave (C2-B2 range)
    notes.push(`${bassNoteName}2`);
  }

  // Add chord tones in C4-C6 range
  intervals.forEach(interval => {
    const noteIndex = (rootIndex + interval) % 12;
    const noteName = CHROMATIC_SCALE[noteIndex];
    // Skip bass note if it's already added
    if (!isRootPosition && noteName === bassNoteName) {
      return;
    }

    // Determine octave based on interval
    const octave = interval < 12 ? 4 : 5;
    notes.push(`${noteName}${octave}`);
  });

  return notes;
}

export class SoundfontChordPlaybackService {
  // Constants for chord playback
  private static readonly CLUSTER_VOLUME_REDUCTION = 0.75; // Volume reduction for short chord clusters
  private static readonly NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; // Chromatic scale for sorting
  private static readonly DEFAULT_BPM = 120; // Default BPM fallback
  private static readonly SAMPLE_DURATION = 3.5; // Estimated soundfont sample duration in seconds
  private static readonly LOOP_OVERLAP = 0.1; // Overlap time for seamless looping (100ms crossfade)

  private audioContext: AudioContext | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private instruments: Map<string, any> = new Map(); // Type will be Soundfont after lazy load
  private loadedInstruments: Set<string> = new Set(); // Track which instruments are loaded
  private loadingInstruments: Set<string> = new Set(); // Track which instruments are currently loading
  private instrumentLoadPromises: Map<string, Promise<void>> = new Map(); // Track in-flight instrument loads
  private isInitialized = false;
  private isInitializing = false;
  private initializationError: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activeNotes: Map<string, any[]> = new Map(); // Track active note stop functions per instrument
  private scheduledTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled timeouts for cleanup
  private releaseTime = 0.3; // Release/fade-out time in seconds
  private loopIntervals: Map<string, NodeJS.Timeout> = new Map(); // Track loop intervals for cleanup
  private unloadTimers: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled instrument unloads
  private readonly UNLOAD_DELAY_MS = 30000; // 30 seconds before unloading unused instrument

  private options: SoundfontChordPlaybackOptions = {
    pianoVolume: 50,
    guitarVolume: 60,
    violinVolume: 60,
    fluteVolume: 50,
    enabled: false
  };

  constructor() {
    // AudioContext will be acquired lazily via AudioContextManager during initialize()
  }

  /**
   * Initialize AudioContext only (instruments loaded on-demand)
   * PERFORMANCE FIX #4: Changed from loading all instruments upfront to lazy per-instrument loading
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
      try {
        this.audioContext = audioContextManager.getContext();
        await audioContextManager.resume();
      } catch (e) {
        this.initializationError = e as Error;
        this.isInitializing = false;
        throw this.initializationError;
      }
    }

    try {
      console.log('🎵 AudioContext initialized (instruments will load on-demand)');
      this.isInitialized = true;
    } catch (error) {
      this.initializationError = error as Error;
      console.error('❌ Failed to initialize AudioContext:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Load a single instrument (lazy loads smplr library)
   * PERFORMANCE FIX #4: Now called on-demand when instrument is first needed
   */
  private async loadInstrument(
    name: string,
    instrumentName: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    if (!this.audioContext) throw new Error('AudioContext not available');

    // Lazy load smplr
    const { Soundfont } = await getSmplr();

    const startTime = performance.now();
    console.log(`🎵 Loading ${name}...`);
    const instrument = new Soundfont(this.audioContext, {
      instrument: instrumentName
    });

    await instrument.loaded();
    const loadTime = performance.now() - startTime;
    console.log(`✅ ${name} loaded in ${loadTime.toFixed(0)}ms`);

    return instrument;
  }

  /**
   * Ensure an instrument is loaded before use
   * PERFORMANCE FIX #4: Per-instrument lazy loading
   */
  private async ensureInstrumentLoaded(instrumentName: string): Promise<void> {
    // Already loaded
    if (this.loadedInstruments.has(instrumentName)) {
      // Cancel any pending unload
      const unloadTimer = this.unloadTimers.get(instrumentName);
      if (unloadTimer) {
        clearTimeout(unloadTimer);
        this.unloadTimers.delete(instrumentName);
      }
      return;
    }

    // If a load is already in-flight, await it
    const existingPromise = this.instrumentLoadPromises.get(instrumentName);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    // Begin a new load and store the in-flight promise
    const loadPromise = (async () => {
      this.loadingInstruments.add(instrumentName);
      try {
        const instrumentMap: Record<string, string> = {
          'piano': 'acoustic_grand_piano',
          'guitar': 'acoustic_guitar_nylon',
          'violin': 'violin',
          'flute': 'flute'
        };

        const smplrInstrumentName = instrumentMap[instrumentName];
        if (!smplrInstrumentName) {
          throw new Error(`Unknown instrument: ${instrumentName}`);
        }

        const instrument = await this.loadInstrument(instrumentName, smplrInstrumentName);
        this.instruments.set(instrumentName, instrument);
        this.loadedInstruments.add(instrumentName);
      } finally {
        this.loadingInstruments.delete(instrumentName);
        this.instrumentLoadPromises.delete(instrumentName);
      }
    })();

    this.instrumentLoadPromises.set(instrumentName, loadPromise);
    await loadPromise;
  }

  /**
   * Unload an instrument to free memory
   * PERFORMANCE FIX #4: Unload unused instruments after delay
   */
  private unloadInstrument(instrumentName: string): void {
    if (!this.loadedInstruments.has(instrumentName)) return;

    console.log(`🗑️ Unloading ${instrumentName} to free memory`);

    // Stop any active notes
    this.stopInstrumentNotes(instrumentName);

    // Remove from maps
    this.instruments.delete(instrumentName);
    this.loadedInstruments.delete(instrumentName);
    this.activeNotes.delete(instrumentName);
  }

  /**
   * Schedule instrument unload after delay if volume is 0
   * PERFORMANCE FIX #4: Automatic memory management
   */
  private scheduleInstrumentUnload(instrumentName: string): void {
    // Cancel any existing unload timer
    const existingTimer = this.unloadTimers.get(instrumentName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new unload
    const timer = setTimeout(() => {
      this.unloadInstrument(instrumentName);
      this.unloadTimers.delete(instrumentName);
    }, this.UNLOAD_DELAY_MS);

    this.unloadTimers.set(instrumentName, timer);
  }

  /**
   * Play a chord with all enabled instruments
   * Compatible with existing chord playback interface
   *
   * Instrument behavior:
   * - Piano (C3): Bass-first pattern for long chords (>=2 beats, full beat delay), cluster for short chords, bass notes 1.25x louder
   * - Guitar (C3): Octave-aware arpeggiation patterns based on duration:
   *   * Short (<2 beats): Cluster at 0.75x volume
   *   * Medium (2-3 beats): Root(2) → Fifth(3) → Third(4) - e.g., A2 → E3 → C#4
   *   * Long (3-5 beats): Root(2) → Fifth(3) → Third(4) → Root(3) - e.g., A2 → E3 → C#4 → A3
   *   * Very Long (5-7 beats): Root(2) → Fifth(3) → Third(4) → Fifth(4) → Root(4) - e.g., A2 → E3 → C#4 → E4 → A4
   *   * Extra Long (>=7 beats): Ascend then descend - Root(2) → Fifth(3) → Third(4) → Fifth(4) → Root(4) → Fifth(4) → Third(4) → Root(3) → Root(2)
   *   Bass notes 1.25x louder, all notes sustain for full duration
   * - Violin (C5): Plays only the chord root (before slash in C/E)
   * - Flute (C4): Plays the bass note for inverted chords (e.g., E for C/E), or root for root position
   *
   * @param chordName - Chord symbol (e.g., "C", "Am", "G7", "C/E")
   * @param duration - Duration in seconds (default: 2.0)
   * @param bpm - Beats per minute for timing calculations (default: 120)
   */
  async playChord(chordName: string, duration: number = 2.0, bpm: number = 120): Promise<void> {
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

    // Extract chord root for single-note instruments
    const parts = chordName.split('/');
    const baseChord = parts[0];

    // Get chord root (the note before slash, or the root of the chord)
    const rootMatch = baseChord.match(/^([A-G][#b]?)/);
    const chordRoot = rootMatch ? rootMatch[1] : null;

    // Detect if chord is inverted by checking for bass note at octave 2
    const bassNoteMatch = notes.find(note => note.match(/^([A-G][#b]?)2$/));
    const bassNoteName = bassNoteMatch ? bassNoteMatch.match(/^([A-G][#b]?)2$/)![1] : null;

    // Play chord on each instrument with volume > 0
    const promises: Promise<void>[] = [];

    // Piano and Guitar: Play full chord (all notes including inversions)
    if (this.options.pianoVolume > 0) {
      promises.push(this.playInstrument('piano', notes, duration, this.options.pianoVolume, 3, bpm));
    }
    if (this.options.guitarVolume > 0) {
      promises.push(this.playInstrument('guitar', notes, duration, this.options.guitarVolume, 3, bpm));
    }

    // Violin: Play only the chord root (note before slash)
    if (this.options.violinVolume > 0 && chordRoot) {
      const violinNote = [`${chordRoot}5`]; // Single note at octave 5
      promises.push(this.playInstrument('violin', violinNote, duration, this.options.violinVolume, 5, bpm));
    }

    // Flute: Play the bass note for inverted chords, or root for root position
    if (this.options.fluteVolume > 0) {
      const fluteNoteRoot = bassNoteName || chordRoot;
      if (fluteNoteRoot) {
        const fluteNote = [`${fluteNoteRoot}4`]; // Single note at octave 4
        promises.push(this.playInstrument('flute', fluteNote, duration, this.options.fluteVolume, 4, bpm));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Schedule seamless looping for sustained notes (violin and flute only)
   * Re-triggers notes before they end to create gapless playback
   *
   * NOTE: This is NOT used for guitar/piano because their arpeggiation and bass-first
   * patterns already fill the duration. Only sustained single-note instruments need looping.
   */
  private scheduleSeamlessLoop(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    instrument: any, // Type will be Soundfont after lazy load
    instrumentName: string,
    noteData: { note: string; velocity: number; octaveNum: number },
    startTime: number,
    totalDuration: number,
    smplrDuration: number
  ): void {
    const { note, velocity } = noteData;
    const sampleDuration = SoundfontChordPlaybackService.SAMPLE_DURATION;
    const overlap = SoundfontChordPlaybackService.LOOP_OVERLAP;

    // Only loop if total duration exceeds sample duration
    if (totalDuration <= sampleDuration) return;

    const loopIterationDuration = sampleDuration - overlap;
    let currentTime = startTime + loopIterationDuration;
    const endTime = startTime + totalDuration;

    // Schedule loop iterations
    const scheduleNextIteration = () => {
      if (!this.audioContext || currentTime >= endTime) return;

      const remainingDuration = endTime - currentTime;
      const iterationDuration = Math.min(smplrDuration, remainingDuration + overlap);

      // Start next iteration with overlap for seamless transition
      const stopFn = instrument.start({
        note,
        velocity,
        time: currentTime,
        duration: iterationDuration,
        loop: false, // Disable smplr's loop to avoid gaps
      });

      if (stopFn) {
        const activeNotesForInstrument = this.activeNotes.get(instrumentName) || [];
        activeNotesForInstrument.push(stopFn);
        this.activeNotes.set(instrumentName, activeNotesForInstrument);
      }

      currentTime += loopIterationDuration;

      // Schedule next iteration if needed
      if (currentTime < endTime) {
        const delay = (currentTime - this.audioContext.currentTime) * 1000;
        if (delay > 0) {
          const timeoutId = setTimeout(scheduleNextIteration, delay);
          this.loopIntervals.set(`${instrumentName}-${note}-${currentTime}`, timeoutId);
        }
      }
    };

    // Start the loop scheduling
    const initialDelay = (currentTime - (this.audioContext?.currentTime || 0)) * 1000;
    if (initialDelay > 0) {
      const timeoutId = setTimeout(scheduleNextIteration, initialDelay);
      this.loopIntervals.set(`${instrumentName}-${note}-initial`, timeoutId);
    }
  }

  /**
   * Play notes on a specific instrument
   * Guitar uses arpeggiation (notes played sequentially), other instruments play as chords
   * PERFORMANCE FIX #4: Ensures instrument is loaded before playing
   */
  private async playInstrument(
    instrumentName: string,
    notes: string[],
    duration: number,
    volume: number,
    octave: number,
    bpm: number = 120
  ): Promise<void> {
    // PERFORMANCE FIX #4: Ensure instrument is loaded on-demand
    await this.ensureInstrumentLoaded(instrumentName);

    const instrument = this.instruments.get(instrumentName);
    if (!instrument) return;

    // Validate BPM to prevent invalid values and unrealistic high values
    const MAX_BPM = 400;
    if (bpm <= 0 || !isFinite(bpm) || bpm > MAX_BPM) {
      console.error(`❌ Invalid BPM value: ${bpm}. Using default ${SoundfontChordPlaybackService.DEFAULT_BPM} BPM. (Allowed range: 1-${MAX_BPM})`);
      bpm = SoundfontChordPlaybackService.DEFAULT_BPM;
    }

    // Clear any existing scheduled timeout for this instrument
    const existingTimeout = this.scheduledTimeouts.get(instrumentName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.scheduledTimeouts.delete(instrumentName);
    }

    // Stop previous notes on this instrument with fade-out
    this.stopInstrumentNotes(instrumentName);

    // Calculate base velocity (0-127 MIDI scale)
    const baseVelocity = (volume / 100) * 127;

    // Transpose notes to the correct octave, preserving bass notes (octave 2)
    // and tracking which notes are bass notes for velocity boost
    interface NoteWithVelocity {
      note: string;
      velocity: number;
      octaveNum: number; // Track octave for sorting
    }

    const notesWithVelocity: NoteWithVelocity[] = notes.map(note => {
      const match = note.match(/^([A-G][#b]?)(\d)$/);
      if (!match) return { note, velocity: baseVelocity, octaveNum: 4 };

      const [, noteName, originalOctave] = match;
      const octaveNum = parseInt(originalOctave);

      // Bass notes (octave 2) are preserved and get 1.25x velocity boost
      if (octaveNum === 2) {
        return {
          note: `${noteName}${originalOctave}`, // Preserve bass octave
          velocity: Math.min(baseVelocity * 1.25, 127), // 1.25x louder, capped at 127
          octaveNum: octaveNum
        };
      }

      // Chord tones (octave 4+) are transposed to instrument octave
      return {
        note: `${noteName}${octave}`,
        velocity: baseVelocity,
        octaveNum: octave
      };
    });

    // Beat duration for timing calculations (dynamic based on BPM)
    // Formula: 60 seconds / BPM = seconds per beat
    // Examples: 60 BPM = 1.0s, 120 BPM = 0.5s, 180 BPM = 0.33s
    const beatDuration = 60 / bpm; // BPM already validated above
    const halfBeatDelay = beatDuration / 2; // Half beat spacing for guitar arpeggiation
    const fullBeatDelay = beatDuration; // Full beat delay for piano bass-first pattern (varies with BPM)

    // Determine chord duration categories for different arpeggiation patterns
    const isLongChord = duration >= (2 * beatDuration); // >= 2 beats
    const isMediumChord = duration >= (2 * beatDuration) && duration < (3 * beatDuration); // 2-3 beats
    const isLongCircularChord = duration >= (3 * beatDuration) && duration < (5 * beatDuration); // 3-5 beats
    const isVeryLongChord = duration >= (5 * beatDuration) && duration < (7 * beatDuration); // 5-7 beats
    const isExtraLongChord = duration >= (7 * beatDuration); // >= 7 beats

    // Sort notes by pitch (ascending) for guitar arpeggiation and piano bass-first
    // Bass notes (octave 2) come first, then chord tones sorted by note name
    if (instrumentName === 'guitar' || instrumentName === 'piano') {
      notesWithVelocity.sort((a, b) => {
        // First sort by octave
        if (a.octaveNum !== b.octaveNum) {
          return a.octaveNum - b.octaveNum;
        }
        // Then sort by note name within same octave using chromatic scale
        const aNoteName = a.note.match(/^([A-G][#b]?)/)?.[1] || '';
        const bNoteName = b.note.match(/^([A-G][#b]?)/)?.[1] || '';
        const aIndex = SoundfontChordPlaybackService.NOTE_ORDER.indexOf(aNoteName);
        const bIndex = SoundfontChordPlaybackService.NOTE_ORDER.indexOf(bNoteName);
        return aIndex - bIndex;
      });
    }

    // Separate bass and upper notes for piano bass-first pattern
    // For piano: treat the lowest note as bass, regardless of octave
    let pianoBassNotes: typeof notesWithVelocity = [];
    let pianoUpperNotes: typeof notesWithVelocity = [];

    if (instrumentName === 'piano' && notesWithVelocity.length > 0) {
      // After sorting, the first note is the lowest (bass note)
      pianoBassNotes = [notesWithVelocity[0]];
      pianoUpperNotes = notesWithVelocity.slice(1);
    }

    // Track active notes for this instrument
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeNotesForInstrument: any[] = [];

    // Calculate smplr duration with buffer to prevent race conditions
    const smplrDuration = duration + 0.2;

    // Determine if we need seamless looping
    // Only for violin and flute (sustained instruments), NOT for guitar/piano (which have patterns)
    const isSustainedInstrument = instrumentName === 'violin' || instrumentName === 'flute';
    const needsSeamlessLoop = isSustainedInstrument && duration > SoundfontChordPlaybackService.SAMPLE_DURATION;
    const singleNoteDuration = needsSeamlessLoop
      ? SoundfontChordPlaybackService.SAMPLE_DURATION
      : smplrDuration;

    // Get current audio context time for scheduling
    const baseTime = this.audioContext ? this.audioContext.currentTime : 0;

    // Determine playback pattern based on instrument and chord duration
    if (instrumentName === 'guitar' && isLongChord) {
      // GUITAR ARPEGGIATION with octave-aware patterns based on duration
      // Pre-allocate array for better performance
      let arpeggioPattern: typeof notesWithVelocity;

      // Helper function to create note at specific octave
      const createNoteAtOctave = (noteIndex: number, targetOctave: number) => {
        const { note, velocity } = notesWithVelocity[noteIndex];
        const noteName = note.match(/^([A-G][#b]?)/)?.[1] || '';
        return {
          note: `${noteName}${targetOctave}`,
          velocity,
          octaveNum: targetOctave
        };
      };

      // Identify chord tones: root (index 0), third, fifth
      // For triads: [root, third, fifth] = [0, 1, 2]
      // For 7th chords: [root, third, fifth, seventh] = [0, 1, 2, 3]
      const noteCount = notesWithVelocity.length;
      const rootIdx = 0;
      const thirdIdx = noteCount >= 2 ? 1 : 0;
      const fifthIdx = noteCount >= 3 ? 2 : (noteCount >= 2 ? 1 : 0);

      if (isMediumChord) {
        // MEDIUM CHORDS (2-3 beats): Root(2) → Fifth(3) → Third(4)
        // Example: A2 → E3 → C#4
        arpeggioPattern = [
          createNoteAtOctave(rootIdx, 2),   // Root at octave 2
          createNoteAtOctave(fifthIdx, 3),  // Fifth at octave 3
          createNoteAtOctave(thirdIdx, 4),  // Third at octave 4
        ];
      } else if (isLongCircularChord) {
        // LONG CHORDS (3-5 beats): Root(2) → Fifth(3) → Third(4) → Root(3)
        // Example: A2 → E3 → C#4 → A3
        arpeggioPattern = [
          createNoteAtOctave(rootIdx, 2),   // Root at octave 2
          createNoteAtOctave(fifthIdx, 3),  // Fifth at octave 3
          createNoteAtOctave(thirdIdx, 4),  // Third at octave 4
          createNoteAtOctave(rootIdx, 3),   // Root at octave 3
        ];
      } else if (isVeryLongChord) {
        // VERY LONG CHORDS (5-7 beats): Root(2) → Fifth(3) → Third(4) → Fifth(4) → Root(4)
        // Example: A2 → E3 → C#4 → E4 → A4
        arpeggioPattern = [
          createNoteAtOctave(rootIdx, 2),   // Root at octave 2
          createNoteAtOctave(fifthIdx, 3),  // Fifth at octave 3
          createNoteAtOctave(thirdIdx, 4),  // Third at octave 4
          createNoteAtOctave(fifthIdx, 4),  // Fifth at octave 4
          createNoteAtOctave(rootIdx, 4),   // Root at octave 4
        ];
      } else if (isExtraLongChord) {
        // EXTRA LONG CHORDS (>=7 beats): Ascend then descend
        // Root(2) → Fifth(3) → Third(4) → Fifth(4) → Root(4) → Fifth(4) → Third(4) → Root(3) → Root(2)
        // Example: A2 → E3 → C#4 → E4 → A4 → E4 → C#4 → A3 → A2
        arpeggioPattern = [
          createNoteAtOctave(rootIdx, 2),   // Root at octave 2 (start)
          createNoteAtOctave(fifthIdx, 3),  // Fifth at octave 3 (ascending)
          createNoteAtOctave(thirdIdx, 4),  // Third at octave 4 (ascending)
          createNoteAtOctave(fifthIdx, 4),  // Fifth at octave 4 (ascending)
          createNoteAtOctave(rootIdx, 4),   // Root at octave 4 (peak)
          createNoteAtOctave(fifthIdx, 4),  // Fifth at octave 4 (descending)
          createNoteAtOctave(thirdIdx, 4),  // Third at octave 4 (descending)
          createNoteAtOctave(rootIdx, 3),   // Root at octave 3 (descending)
          createNoteAtOctave(rootIdx, 2),   // Root at octave 2 (end)
        ];
      } else {
        // Fallback (should not reach here due to conditions above)
        arpeggioPattern = notesWithVelocity;
      }

      // Play the arpeggiation pattern
      arpeggioPattern.forEach(({ note, velocity }, index) => {
        const timeOffset = index * halfBeatDelay;
        const noteStartTime = baseTime + timeOffset;

        const stopFn = instrument.start({
          note,
          velocity,
          time: noteStartTime,
          duration: smplrDuration, // Use full duration - guitar notes sustain naturally
          loop: false,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });
    } else if (instrumentName === 'guitar' && !isLongChord) {
      // GUITAR CLUSTER (short chords) - reduced volume for balance
      notesWithVelocity.forEach(({ note, velocity }) => {
        const stopFn = instrument.start({
          note,
          velocity: velocity * SoundfontChordPlaybackService.CLUSTER_VOLUME_REDUCTION,
          time: baseTime,
          duration: smplrDuration, // Use full duration - guitar notes sustain naturally
          loop: false,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });
    } else if (instrumentName === 'piano' && isLongChord) {
      // PIANO BASS-FIRST PATTERN (all long chords)
      // Play bass note (lowest note) first
      pianoBassNotes.forEach(({ note, velocity }) => {
        const stopFn = instrument.start({
          note,
          velocity,
          time: baseTime,
          duration: smplrDuration, // Use full duration - piano notes sustain naturally
          loop: false,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });

      // Play upper notes after full beat delay (varies with BPM: 1.0s at 60 BPM, 0.5s at 120 BPM, 0.33s at 180 BPM)
      pianoUpperNotes.forEach(({ note, velocity }) => {
        const stopFn = instrument.start({
          note,
          velocity,
          time: baseTime + fullBeatDelay, // Full beat delay (60/BPM seconds)
          duration: smplrDuration, // Use full duration - piano notes sustain naturally
          loop: false,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });
    } else if (instrumentName === 'piano' && !isLongChord) {
      // PIANO CLUSTER (short chords) - reduced volume for balance
      notesWithVelocity.forEach(({ note, velocity }) => {
        const stopFn = instrument.start({
          note,
          velocity: velocity * SoundfontChordPlaybackService.CLUSTER_VOLUME_REDUCTION,
          time: baseTime,
          duration: smplrDuration, // Use full duration - piano notes sustain naturally
          loop: false,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });
    } else {
      // DEFAULT PATTERN (violin, flute, or other instruments)
      notesWithVelocity.forEach(({ note, velocity, octaveNum }) => {
        const stopFn = instrument.start({
          note,
          velocity,
          time: baseTime,
          duration: singleNoteDuration,
          loop: false,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }

        // Schedule seamless looping if needed (important for violin and flute sustained notes)
        if (needsSeamlessLoop) {
          this.scheduleSeamlessLoop(
            instrument,
            instrumentName,
            { note, velocity, octaveNum },
            baseTime,
            duration,
            singleNoteDuration
          );
        }
      });
    }

    // Store active notes for later cleanup
    this.activeNotes.set(instrumentName, activeNotesForInstrument);

    // Schedule safety timeout (fires slightly before smplr's internal timeout)
    if (duration > 0) {
      const timeoutDuration = duration + 0.15;
      const timeoutId = setTimeout(() => {
        this.scheduledTimeouts.delete(instrumentName);
        const currentActiveNotes = this.activeNotes.get(instrumentName);
        if (currentActiveNotes === activeNotesForInstrument) {
          this.stopInstrumentNotes(instrumentName);
        }
      }, timeoutDuration * 1000);

      this.scheduledTimeouts.set(instrumentName, timeoutId);
    }
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
   * PERFORMANCE FIX #4: Schedule instrument unload when volume is set to 0
   */
  updateOptions(options: Partial<SoundfontChordPlaybackOptions>): void {
    this.options = { ...this.options, ...options };

    // Lazy initialization when enabled
    if (options.enabled && !this.isInitialized && !this.isInitializing) {
      this.initialize().catch(error => {
        console.error('❌ Failed to initialize soundfonts:', error);
      });
    }

    // PERFORMANCE FIX #4: Schedule unload for instruments with volume = 0
    if (options.pianoVolume === 0 && this.loadedInstruments.has('piano')) {
      this.scheduleInstrumentUnload('piano');
    }
    if (options.guitarVolume === 0 && this.loadedInstruments.has('guitar')) {
      this.scheduleInstrumentUnload('guitar');
    }
    if (options.violinVolume === 0 && this.loadedInstruments.has('violin')) {
      this.scheduleInstrumentUnload('violin');
    }
    if (options.fluteVolume === 0 && this.loadedInstruments.has('flute')) {
      this.scheduleInstrumentUnload('flute');
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
    // Clear all scheduled timeouts
    this.scheduledTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.scheduledTimeouts.clear();

    // Clear all loop intervals
    this.loopIntervals.forEach((intervalId) => {
      clearTimeout(intervalId);
    });
    this.loopIntervals.clear();

    // Stop notes on each instrument with fade-out
    this.instruments.forEach((instrument, instrumentName) => {
      this.stopInstrumentNotes(instrumentName);
    });
  }

  /**
   * Cleanup resources
   * PERFORMANCE FIX #4: Also clear unload timers and tracking sets
   */
  dispose(): void {
    this.stopAll();

    // PERFORMANCE FIX #4: Clear unload timers
    this.unloadTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.unloadTimers.clear();

    this.activeNotes.clear();
    this.scheduledTimeouts.clear();
    this.instruments.clear();
    this.loadedInstruments.clear();
    this.loadingInstruments.clear();
    this.instrumentLoadPromises.clear();

    // Do not close the shared AudioContext; just release local reference
    this.audioContext = null;
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

