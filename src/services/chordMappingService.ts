/**
 * Chord Mapping Service
 *
 * Maps ML model chord output to chord database format for guitar chord diagrams.
 * Handles chord name normalization, enharmonic equivalents, chord inversions, and fallback strategies.
 * Now uses the official @tombatossals/chords-db database for accurate chord fingerings.
 */

// Import the official chord database
import guitarChordsDb from '@tombatossals/chords-db/lib/guitar.json';

interface ChordPosition {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
  midi?: number[];
}

interface ChordData {
  key: string;
  suffix: string;
  positions: ChordPosition[];
}

interface ChordDatabase {
  main: {
    strings: number;
    fretsOnChord: number;
    name: string;
    numberOfChords: number;
  };
  tunings: {
    standard: string[];
  };
  keys: string[];
  suffixes: string[];
  chords: {
    [key: string]: ChordData[];
  };
}

// Use the official chord database
let guitarChords: ChordDatabase | null = null;

async function loadChordDatabase(): Promise<ChordDatabase> {
  if (!guitarChords) {
    // Load the official @tombatossals/chords-db database
    guitarChords = guitarChordsDb as ChordDatabase;
  }
  return guitarChords;
}

/**
 * Normalize chord names from ML model output to database format
 */
export class ChordMappingService {
  private static instance: ChordMappingService;

  // Enharmonic equivalents mapping to match the official database keys
  // The database uses 'Csharp' and 'Fsharp' instead of 'C#' and 'F#'
  private readonly enharmonicMap: Record<string, string> = {
    // ASCII format inputs
    'Db': 'Csharp',
    'C#': 'Csharp',
    'Csharp': 'Csharp',
    'Eb': 'Eb',
    'D#': 'Eb',
    'Gb': 'Fsharp',
    'F#': 'Fsharp',
    'Fsharp': 'Fsharp',
    'Ab': 'Ab',
    'G#': 'Ab',
    'Bb': 'Bb',
    'A#': 'Bb',
    // Rare enharmonic equivalents (theoretical but possible in ML output)
    'Cb': 'B',      // C-flat → B natural
    'Fb': 'E',      // F-flat → E natural
    'E#': 'F',      // E-sharp → F natural
    'B#': 'C',      // B-sharp → C natural
    // Unicode format inputs (for Gemini API corrections)
    'D♭': 'Csharp',
    'C♯': 'Csharp',
    'E♭': 'Eb',
    'D♯': 'Eb',
    'G♭': 'Fsharp',
    'F♯': 'Fsharp',
    'A♭': 'Ab',
    'G♯': 'Ab',
    'B♭': 'Bb',
    'A♯': 'Bb',
    // Rare enharmonic equivalents (Unicode format)
    'C♭': 'B',      // C-flat → B natural
    'F♭': 'E',      // F-flat → E natural
    'E♯': 'F',      // E-sharp → F natural
    'B♯': 'C'       // B-sharp → C natural
  };
  // Enhanced chord suffix mappings from ML model to database
  // Handles both colon notation (from ML models) and standard notation
  private readonly suffixMap: Record<string, string> = {
    // Standard notation
    '': 'major',
    'maj': 'major',
    'M': 'major',
    'm': 'minor',
    'min': 'minor',
    '-': 'minor',
    'dim': 'dim',
    'o': 'dim',
    'dim7': 'dim7',
    'aug': 'aug',
    '+': 'aug',
    'sus2': 'sus2',
    'sus4': 'sus4',
    'sus': 'sus4',
    '7': '7',
    'dom7': '7',
    'maj7': 'maj7',
    'M7': 'maj7',
    '△7': 'maj7',  // Triangle notation for major 7th
    '△': 'maj7',   // Triangle notation (shorthand for maj7)
    'Δ7': 'maj7',  // Alternative triangle symbol
    'Δ': 'maj7',   // Alternative triangle symbol (shorthand)
    'm7': 'm7',
    'min7': 'm7',
    '-7': 'm7',
    '6': '6',
    'm6': 'm6',
    '9': '9',
    'maj9': 'maj9',
    'M9': 'maj9',
    'm9': 'm9',
    '11': '11',
    '13': '13',
    'add9': 'add9',
    'madd9': 'madd9',
    // Colon notation (from ML models)
    'major': 'major',
    'minor': 'minor',
    'minor7': 'm7',
    'dominant7': '7',
    'diminished': 'dim',
    'augmented': 'aug'
  };


  public static getInstance(): ChordMappingService {
    if (!ChordMappingService.instance) {
      ChordMappingService.instance = new ChordMappingService();
    }
    return ChordMappingService.instance;
  }

  /**
   * Preprocesses chord names to handle inversions and normalize for guitar chord database compatibility
   * @param chordName - Raw chord name from ML model (e.g., "C/E", "Am/G", "F#m7/A")
   * @returns Normalized chord name without inversion (e.g., "C", "Am", "F#m7")
   */
  private preprocessChordName(chordName: string): string {
    if (!chordName || chordName === 'N.C.') {
      return chordName;
    }

    // Handle chord inversions by removing the bass note (everything after "/")
    // Examples: "C/E" → "C", "Am/G" → "Am", "F#m7/A" → "F#m7"
    const inversionMatch = chordName.match(/^([^/]+)\/(.+)$/);
    if (inversionMatch) {
      const rootChord = inversionMatch[1].trim();
      return rootChord;
    }

    return chordName;
  }

  /**
   * Parse chord name from ML model output
   * Handles both standard notation ("Am", "F#7", "Bbmaj7") and colon notation ("C:minor", "F#:maj7")
   */
  private parseChordName(chordName: string): { root: string; suffix: string } | null {
    // Handle "N.C." (No Chord) case
    if (chordName === 'N.C.' || chordName === 'NC' || chordName === '') {
      return null;
    }

    // Remove any whitespace
    const cleanChord = chordName.trim();

    // Check for colon notation first (from ML models like "C:minor", "F#:maj7")
    const colonMatch = cleanChord.match(/^([A-G][#b♯♭]?):(.+)$/);
    if (colonMatch) {
      const [, root, suffix] = colonMatch;
      return { root, suffix };
    }

    // Enhanced chord pattern for standard notation
    // Matches: Root note (A-G) + optional accidental (#/b/♯/♭) + suffix (everything else)
    const chordPattern = /^([A-G])([#b♯♭]?)(.*)$/;
    const match = cleanChord.match(chordPattern);

    if (!match) {
      return null;
    }

    const [, rootNote, accidental, suffix] = match;
    const root = rootNote + accidental; // Combine root note with accidental

    return { root, suffix };
  }

  /**
   * Normalize root note to database key format
   */
  private normalizeRoot(root: string): string {
    // Handle enharmonic equivalents
    if (this.enharmonicMap[root]) {
      return this.enharmonicMap[root];
    }
    
    // Handle natural notes
    return root;
  }

  /**
   * Normalize suffix to database format
   */
  private normalizeSuffix(suffix: string): string {
    // Handle empty suffix (major chord)
    if (!suffix || suffix === '') {
      return 'major';
    }

    // Direct mapping first
    if (this.suffixMap[suffix]) {
      return this.suffixMap[suffix];
    }

    // Handle complex suffixes by finding the best match
    // Sort by pattern length (longest first) to prioritize more specific matches
    const sortedPatterns = Object.entries(this.suffixMap)
      .filter(([pattern]) => pattern !== '') // Exclude empty pattern
      .sort(([a], [b]) => b.length - a.length);

    for (const [pattern, dbSuffix] of sortedPatterns) {
      if (suffix.includes(pattern)) {
        return dbSuffix;
      }
    }

    // If no pattern matches, return the original suffix
    return suffix;
  }

  /**
   * Get chord data from database
   */
  public async getChordData(chordName: string): Promise<ChordData | null> {
    // First preprocess the chord name to handle inversions
    const preprocessedChord = this.preprocessChordName(chordName);

    const parsed = this.parseChordName(preprocessedChord);
    if (!parsed) {
      return null;
    }

    const normalizedRoot = this.normalizeRoot(parsed.root);
    const normalizedSuffix = this.normalizeSuffix(parsed.suffix);

    // Load chord database
    const chordDb = await loadChordDatabase();

    // Look up in chord database
    const rootChords = chordDb.chords[normalizedRoot];
    if (!rootChords) {
      return null;
    }

    // Find matching suffix
    const chordData = rootChords.find(chord => chord.suffix === normalizedSuffix);
    if (chordData) {
      return chordData;
    }

    // Fallback: try major chord if suffix not found
    if (normalizedSuffix !== 'major') {
      const majorChord = rootChords.find(chord => chord.suffix === 'major');
      if (majorChord) {
        return majorChord;
      }
    }

    return null;
  }

  /**
   * Get available chord variations for a given chord name
   */
  public async getChordVariations(chordName: string): Promise<ChordData[]> {
    const parsed = this.parseChordName(chordName);
    if (!parsed) {
      return [];
    }

    const normalizedRoot = this.normalizeRoot(parsed.root);
    const chordDb = await loadChordDatabase();
    return chordDb.chords[normalizedRoot] || [];
  }

  /**
   * Check if a chord exists in the database
   */
  public async hasChord(chordName: string): Promise<boolean> {
    const result = await this.getChordData(chordName);
    return result !== null;
  }

  /**
   * Get all available keys in the database
   */
  public async getAvailableKeys(): Promise<string[]> {
    const chordDb = await loadChordDatabase();
    return chordDb.keys;
  }

  /**
   * Get all available suffixes in the database
   */
  public async getAvailableSuffixes(): Promise<string[]> {
    const chordDb = await loadChordDatabase();
    return chordDb.suffixes;
  }

  /**
   * Get chord statistics
   */
  public async getChordStats(): Promise<{ totalChords: number; keysCount: number; suffixesCount: number }> {
    const chordDb = await loadChordDatabase();
    return {
      totalChords: chordDb.main.numberOfChords,
      keysCount: chordDb.keys.length,
      suffixesCount: chordDb.suffixes.length
    };
  }
}

// Export singleton instance
export const chordMappingService = ChordMappingService.getInstance();

// Export the loadChordDatabase function for testing and verification
export { loadChordDatabase };
