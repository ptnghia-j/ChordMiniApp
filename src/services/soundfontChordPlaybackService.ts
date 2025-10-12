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
  private audioContext: AudioContext | null = null;
  private instruments: Map<string, Soundfont> = new Map();
  private isInitialized = false;
  private isInitializing = false;
  private initializationError: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activeNotes: Map<string, any[]> = new Map(); // Track active note stop functions per instrument
  private scheduledTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled timeouts for cleanup
  private releaseTime = 0.3; // Release/fade-out time in seconds

  private options: SoundfontChordPlaybackOptions = {
    pianoVolume: 50,
    guitarVolume: 60,
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
   * - Piano (C3): Bass-first pattern for long chords (>=2 beats, full beat delay), cluster for short chords, bass notes 1.25x louder
   * - Guitar (C3): Dynamic arpeggiation patterns based on duration:
   *   * Short (<2 beats): Cluster at 0.75x volume
   *   * Medium (2-3 beats): Simple ascending (A → C# → E)
   *   * Long (3-5 beats): Circular ascending-descending (A → C# → E → C#)
   *   * Very Long (5-7 beats): Extended with octave jump (A3 → C#3 → E3 → A4 → C#4 → E4)
   *   * Extra Long (>=7 beats): Full circular loop (A3 → C#3 → E3 → A4 → C#4 → E4 → C#3 → A3 → E3)
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
   * Play notes on a specific instrument
   * Guitar uses arpeggiation (notes played sequentially), other instruments play as chords
   */
  private async playInstrument(
    instrumentName: string,
    notes: string[],
    duration: number,
    volume: number,
    octave: number,
    bpm: number = 120
  ): Promise<void> {
    const instrument = this.instruments.get(instrumentName);
    if (!instrument) return;

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
    const beatDuration = 60 / Math.max(1, bpm); // Prevent division by zero
    const halfBeatDelay = beatDuration / 2; // Half beat spacing for guitar arpeggiation
    const fullBeatDelay = beatDuration; // Full beat delay for piano bass-first pattern

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
        // Then sort by note name within same octave
        const noteOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const aNoteName = a.note.match(/^([A-G][#b]?)/)?.[1] || '';
        const bNoteName = b.note.match(/^([A-G][#b]?)/)?.[1] || '';
        const aIndex = noteOrder.indexOf(aNoteName);
        const bIndex = noteOrder.indexOf(bNoteName);
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

    // Enable looping for instruments that support it or for sustained instruments
    const shouldLoop = instrument.hasLoops === true || instrumentName === 'violin' || instrumentName === 'flute';

    // Get current audio context time for scheduling
    const baseTime = this.audioContext ? this.audioContext.currentTime : 0;

    // Determine playback pattern based on instrument and chord duration
    if (instrumentName === 'guitar' && isLongChord) {
      // GUITAR ARPEGGIATION with circular patterns based on duration
      let arpeggioPattern: typeof notesWithVelocity = [];

      if (isMediumChord) {
        // MEDIUM CHORDS (2-3 beats): Simple ascending pattern
        // Example: A → C# → E
        arpeggioPattern = [...notesWithVelocity];
      } else if (isLongCircularChord) {
        // LONG CHORDS (3-5 beats): Circular pattern - ascend then descend to second note
        // Example: A → C# → E → C#
        arpeggioPattern = [
          ...notesWithVelocity, // Ascending: A, C#, E
          ...notesWithVelocity.slice(1, -1).reverse() // Descending back to second note: C#
        ];
      } else if (isVeryLongChord) {
        // VERY LONG CHORDS (5-7 beats): Extended pattern - ascend, jump octave, continue
        // Example: A(3) → C#(3) → E(3) → A(4) → C#(4) → E(4)
        const higherOctaveNotes = notesWithVelocity.map(({ note, velocity, octaveNum }) => {
          const noteName = note.match(/^([A-G][#b]?)/)?.[1] || '';
          const newOctave = octaveNum + 1;
          return {
            note: `${noteName}${newOctave}`,
            velocity,
            octaveNum: newOctave
          };
        });
        arpeggioPattern = [
          ...notesWithVelocity, // Base octave: A(3), C#(3), E(3)
          ...higherOctaveNotes  // Higher octave: A(4), C#(4), E(4)
        ];
      } else if (isExtraLongChord) {
        // EXTRA LONG CHORDS (>= 7 beats): Full circular pattern
        // Example: A(3) → C#(3) → E(3) → A(4) → C#(4) → E(4) → C#(3) → A(3) → E(3)
        const higherOctaveNotes = notesWithVelocity.map(({ note, velocity, octaveNum }) => {
          const noteName = note.match(/^([A-G][#b]?)/)?.[1] || '';
          const newOctave = octaveNum + 1;
          return {
            note: `${noteName}${newOctave}`,
            velocity,
            octaveNum: newOctave
          };
        });
        arpeggioPattern = [
          ...notesWithVelocity,                           // Ascending base: A(3), C#(3), E(3)
          ...higherOctaveNotes,                           // Higher octave: A(4), C#(4), E(4)
          ...notesWithVelocity.slice(1, -1).reverse(),   // Descending middle: C#(3)
          notesWithVelocity[0],                           // Back to root: A(3)
          notesWithVelocity[notesWithVelocity.length - 1] // End on fifth: E(3)
        ];
      }

      // Play the arpeggiation pattern
      arpeggioPattern.forEach(({ note, velocity }, index) => {
        const timeOffset = index * halfBeatDelay;

        const stopFn = instrument.start({
          note,
          velocity,
          time: baseTime + timeOffset,
          duration: smplrDuration, // All notes sustain for full duration
          loop: shouldLoop,
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
          velocity: velocity * 0.75, // Reduced volume
          time: baseTime,
          duration: smplrDuration,
          loop: shouldLoop,
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
          duration: smplrDuration,
          loop: shouldLoop,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });

      // Play upper notes after full beat delay (0.5 seconds)
      pianoUpperNotes.forEach(({ note, velocity }) => {
        const stopFn = instrument.start({
          note,
          velocity,
          time: baseTime + fullBeatDelay, // 0.5s delay (full beat)
          duration: smplrDuration,
          loop: shouldLoop,
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
          velocity: velocity * 0.75, // Reduced volume
          time: baseTime,
          duration: smplrDuration,
          loop: shouldLoop,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
        }
      });
    } else {
      // DEFAULT PATTERN (violin, flute, or piano without bass notes)
      notesWithVelocity.forEach(({ note, velocity }) => {
        const stopFn = instrument.start({
          note,
          velocity,
          time: baseTime,
          duration: smplrDuration,
          loop: shouldLoop,
        });

        if (stopFn) {
          activeNotesForInstrument.push(stopFn);
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
    // Clear all scheduled timeouts
    this.scheduledTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.scheduledTimeouts.clear();

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
    this.scheduledTimeouts.clear();
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

