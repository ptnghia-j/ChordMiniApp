/**
 * Chord Mapping Service
 *
 * Maps ML model chord output to chord database format for guitar chord diagrams.
 * Handles chord name normalization, enharmonic equivalents, chord inversions, and fallback strategies.
 */

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

// Enhanced chord database with proper Unicode symbols and extended chord types
const FALLBACK_CHORD_DATABASE: ChordDatabase = {
  main: { strings: 6, fretsOnChord: 4, name: 'guitar', numberOfChords: 96 },
  tunings: { standard: ['E', 'A', 'D', 'G', 'B', 'E'] },
  keys: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
  suffixes: ['major', 'minor', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '9', 'm9', 'maj9', '11', '13'],
  chords: {
    'C': [
      { key: 'C', suffix: 'major', positions: [{ frets: [0, 1, 0, 2, 1, 0], fingers: [0, 1, 0, 3, 2, 0], baseFret: 1, barres: [] }] },
      { key: 'C', suffix: 'minor', positions: [{ frets: [0, 1, 3, 3, 1, 0], fingers: [0, 1, 3, 4, 2, 0], baseFret: 1, barres: [] }] },
      { key: 'C', suffix: '7', positions: [{ frets: [0, 1, 0, 2, 1, 1], fingers: [0, 1, 0, 3, 2, 4], baseFret: 1, barres: [] }] },
      { key: 'C', suffix: 'maj7', positions: [{ frets: [0, 1, 0, 2, 0, 0], fingers: [0, 1, 0, 2, 0, 0], baseFret: 1, barres: [] }] },
      { key: 'C', suffix: 'm7', positions: [{ frets: [0, 1, 3, 1, 1, 1], fingers: [0, 1, 3, 1, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'C', suffix: 'sus4', positions: [{ frets: [0, 1, 0, 0, 1, 1], fingers: [0, 1, 0, 0, 2, 3], baseFret: 1, barres: [] }] },
      { key: 'C', suffix: 'sus2', positions: [{ frets: [0, 1, 0, 0, 1, 3], fingers: [0, 1, 0, 0, 2, 4], baseFret: 1, barres: [] }] }
    ],
    'C♯': [
      { key: 'C♯', suffix: 'major', positions: [{ frets: [-1, -1, 1, 1, 1, 4], fingers: [0, 0, 1, 1, 1, 4], baseFret: 1, barres: [1] }] },
      { key: 'C♯', suffix: 'minor', positions: [{ frets: [-1, -1, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], baseFret: 1, barres: [] }] },
      { key: 'C♯', suffix: '7', positions: [{ frets: [-1, -1, 1, 1, 1, 2], fingers: [0, 0, 1, 1, 1, 2], baseFret: 1, barres: [1] }] },
      { key: 'C♯', suffix: 'maj7', positions: [{ frets: [-1, -1, 1, 1, 1, 1], fingers: [0, 0, 1, 1, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'C♯', suffix: 'm7', positions: [{ frets: [-1, -1, 2, 1, 2, 2], fingers: [0, 0, 2, 1, 3, 4], baseFret: 1, barres: [] }] },
      { key: 'C♯', suffix: 'sus4', positions: [{ frets: [-1, -1, 1, 1, 2, 4], fingers: [0, 0, 1, 1, 2, 4], baseFret: 1, barres: [1] }] }
    ],
    'D': [
      { key: 'D', suffix: 'major', positions: [{ frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1, barres: [] }] },
      { key: 'D', suffix: 'minor', positions: [{ frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1, barres: [] }] },
      { key: 'D', suffix: '7', positions: [{ frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 3, 1, 2], baseFret: 1, barres: [] }] },
      { key: 'D', suffix: 'maj7', positions: [{ frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1, barres: [] }] },
      { key: 'D', suffix: 'm7', positions: [{ frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'D', suffix: 'sus4', positions: [{ frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1, barres: [] }] },
      { key: 'D', suffix: 'sus2', positions: [{ frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1, barres: [] }] }
    ],
    'E♭': [
      { key: 'E♭', suffix: 'major', positions: [{ frets: [-1, -1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3], baseFret: 1, barres: [] }] },
      { key: 'E♭', suffix: 'minor', positions: [{ frets: [-1, -1, 1, 3, 4, 2], fingers: [0, 0, 1, 3, 4, 2], baseFret: 1, barres: [] }] },
      { key: 'E♭', suffix: '7', positions: [{ frets: [-1, -1, 1, 3, 2, 3], fingers: [0, 0, 1, 4, 2, 3], baseFret: 1, barres: [] }] },
      { key: 'E♭', suffix: 'maj7', positions: [{ frets: [-1, -1, 1, 3, 3, 3], fingers: [0, 0, 1, 2, 3, 4], baseFret: 1, barres: [] }] },
      { key: 'E♭', suffix: 'm7', positions: [{ frets: [-1, -1, 1, 3, 2, 2], fingers: [0, 0, 1, 4, 2, 3], baseFret: 1, barres: [] }] }
    ],
    'E': [
      { key: 'E', suffix: 'major', positions: [{ frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, barres: [] }] },
      { key: 'E', suffix: 'minor', positions: [{ frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, barres: [] }] },
      { key: 'E', suffix: '7', positions: [{ frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1, barres: [] }] },
      { key: 'E', suffix: 'maj7', positions: [{ frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0], baseFret: 1, barres: [] }] },
      { key: 'E', suffix: 'm7', positions: [{ frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], baseFret: 1, barres: [] }] },
      { key: 'E', suffix: 'sus4', positions: [{ frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0], baseFret: 1, barres: [] }] }
    ],
    'F': [
      { key: 'F', suffix: 'major', positions: [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'F', suffix: 'minor', positions: [{ frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'F', suffix: '7', positions: [{ frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'F', suffix: 'maj7', positions: [{ frets: [1, 3, 2, 2, 1, 1], fingers: [1, 3, 2, 4, 1, 1], baseFret: 1, barres: [1] }] },
      { key: 'F', suffix: 'm7', positions: [{ frets: [1, 3, 1, 1, 1, 1], fingers: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [1] }] }
    ],
    'F♯': [
      { key: 'F♯', suffix: 'major', positions: [{ frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barres: [2] }] },
      { key: 'F♯', suffix: 'minor', positions: [{ frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barres: [2] }] },
      { key: 'F♯', suffix: '7', positions: [{ frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [2] }] },
      { key: 'F♯', suffix: 'maj7', positions: [{ frets: [2, 4, 3, 3, 2, 2], fingers: [1, 3, 2, 4, 1, 1], baseFret: 1, barres: [2] }] },
      { key: 'F♯', suffix: 'm7', positions: [{ frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [2] }] }
    ],
    'G': [
      { key: 'G', suffix: 'major', positions: [{ frets: [3, 2, 0, 0, 3, 3], fingers: [3, 2, 0, 0, 4, 4], baseFret: 1, barres: [] }] },
      { key: 'G', suffix: 'minor', positions: [{ frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barres: [3] }] },
      { key: 'G', suffix: '7', positions: [{ frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1, barres: [] }] },
      { key: 'G', suffix: 'maj7', positions: [{ frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 4], baseFret: 1, barres: [] }] },
      { key: 'G', suffix: 'm7', positions: [{ frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [3] }] },
      { key: 'G', suffix: 'sus4', positions: [{ frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4], baseFret: 1, barres: [] }] }
    ],
    'A♭': [
      { key: 'A♭', suffix: 'major', positions: [{ frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barres: [4] }] },
      { key: 'A♭', suffix: 'minor', positions: [{ frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1, barres: [4] }] },
      { key: 'A♭', suffix: '7', positions: [{ frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [4] }] },
      { key: 'A♭', suffix: 'maj7', positions: [{ frets: [4, 6, 5, 5, 4, 4], fingers: [1, 3, 2, 4, 1, 1], baseFret: 1, barres: [4] }] },
      { key: 'A♭', suffix: 'm7', positions: [{ frets: [4, 6, 4, 4, 4, 4], fingers: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [4] }] }
    ],
    'A': [
      { key: 'A', suffix: 'major', positions: [{ frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, barres: [] }] },
      { key: 'A', suffix: 'minor', positions: [{ frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, barres: [] }] },
      { key: 'A', suffix: '7', positions: [{ frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], baseFret: 1, barres: [] }] },
      { key: 'A', suffix: 'maj7', positions: [{ frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 3, 1, 4, 0], baseFret: 1, barres: [] }] },
      { key: 'A', suffix: 'm7', positions: [{ frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1, barres: [] }] },
      { key: 'A', suffix: 'sus4', positions: [{ frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 4, 0], baseFret: 1, barres: [] }] },
      { key: 'A', suffix: 'sus2', positions: [{ frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1, barres: [] }] }
    ],
    'B♭': [
      { key: 'B♭', suffix: 'major', positions: [{ frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], baseFret: 1, barres: [1] }] },
      { key: 'B♭', suffix: 'minor', positions: [{ frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barres: [1] }] },
      { key: 'B♭', suffix: '7', positions: [{ frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], baseFret: 1, barres: [1] }] },
      { key: 'B♭', suffix: 'maj7', positions: [{ frets: [-1, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1], baseFret: 1, barres: [1] }] },
      { key: 'B♭', suffix: 'm7', positions: [{ frets: [-1, 1, 3, 1, 2, 1], fingers: [0, 1, 3, 1, 2, 1], baseFret: 1, barres: [1] }] }
    ],
    'B': [
      { key: 'B', suffix: 'major', positions: [{ frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 3, 4, 4, 2], baseFret: 1, barres: [2] }] },
      { key: 'B', suffix: 'minor', positions: [{ frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 1, barres: [2] }] },
      { key: 'B', suffix: '7', positions: [{ frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1, barres: [] }] },
      { key: 'B', suffix: 'maj7', positions: [{ frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1], baseFret: 1, barres: [2] }] },
      { key: 'B', suffix: 'm7', positions: [{ frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1], baseFret: 1, barres: [2] }] }
    ]
  }
};

// Use fallback database for now - can be enhanced later with actual chord database
let guitarChords: ChordDatabase | null = null;

async function loadChordDatabase(): Promise<ChordDatabase> {
  if (!guitarChords) {
    // For now, use the fallback database
    // TODO: Implement proper chord database loading
    guitarChords = FALLBACK_CHORD_DATABASE;
  }
  return guitarChords;
}

/**
 * Normalize chord names from ML model output to database format
 */
export class ChordMappingService {
  private static instance: ChordMappingService;
  
  // Enharmonic equivalents mapping with proper Unicode symbols
  // Supports both ASCII and Unicode input formats
  private readonly enharmonicMap: Record<string, string> = {
    // ASCII format inputs
    'Db': 'C♯',
    'C#': 'C♯',
    'Csharp': 'C♯', // Legacy support
    'Eb': 'E♭',
    'D#': 'E♭',
    'Gb': 'F♯',
    'F#': 'F♯',
    'Fsharp': 'F♯', // Legacy support
    'Ab': 'A♭',
    'G#': 'A♭',
    'Bb': 'B♭',
    'A#': 'B♭',
    // Unicode format inputs (for Gemini API corrections)
    'D♭': 'C♯',
    'C♯': 'C♯',
    'E♭': 'E♭',
    'D♯': 'E♭',
    'G♭': 'F♯',
    'F♯': 'F♯',
    'A♭': 'A♭',
    'G♯': 'A♭',
    'B♭': 'B♭',
    'A♯': 'B♭'
  };

  // Enhanced chord suffix mappings from ML model to database
  private readonly suffixMap: Record<string, string> = {
    '': 'major',
    'maj': 'major',
    'M': 'major',
    'm': 'minor',
    'min': 'minor',
    '-': 'minor',
    'dim': 'dim',
    'o': 'dim',
    'dim7': 'dim',
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
    'add9': '9', // Simplify to 9 for guitar chord compatibility
    'madd9': 'm9'
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
   * Examples: "C", "Am", "F#7", "Bb", "N.C.", "C#m", "Bbmaj7"
   */
  private parseChordName(chordName: string): { root: string; suffix: string } | null {
    // Handle "N.C." (No Chord) case
    if (chordName === 'N.C.' || chordName === 'NC' || chordName === '') {
      return null;
    }

    // Remove any whitespace
    const cleanChord = chordName.trim();

    // Enhanced chord pattern to better handle accidentals and suffixes
    // Matches: Root note (A-G) + optional accidental (#/b) + suffix (everything else)
    const chordPattern = /^([A-G])([#b]?)(.*)$/;
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
