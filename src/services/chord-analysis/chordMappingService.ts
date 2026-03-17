/**
 * Chord Mapping Service
 *
 * Maps ML model chord output to chord database format for guitar chord diagrams.
 * Handles chord name normalization, enharmonic equivalents, chord inversions, and fallback strategies.
 * Now uses the official @tombatossals/chords-db database for accurate chord fingerings.
 */

// Import the official chord database
import guitarChordsDb from '@tombatossals/chords-db/lib/guitar.json';
import { getBassNoteFromInversion } from '@/utils/chordFormatting';

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

interface ParsedChordName {
  root: string;
  suffix: string;
  bass: string | null;
}

interface ChordLookupCandidate {
  displayName: string;
  normalizedRoot: string;
  normalizedSuffix: string;
  isExactInversion: boolean;
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

function getChordDatabaseSync(): ChordDatabase {
  if (!guitarChords) {
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
    '°': 'dim',
    'o': 'dim',
    'dim7': 'dim7',
    '°7': 'dim7',
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
    // Extended chords (explicit)
    '11': '11',
    '13': '13',
    'm11': 'm11',
    'min11': 'm11',
    // m13 often missing in DB; map but rely on fallbacks later
    'm13': 'm13',
    'min13': 'm13',
    'maj11': 'maj11',
    'maj13': 'maj13',
    // Add9 variants
    'add9': 'add9',
    'madd9': 'madd9',
    // Minor-major 7th variants
    'mMaj7': 'mMaj7',
    'mmaj7': 'mMaj7',
    'minmaj7': 'mMaj7',
    'mM7': 'mMaj7',
    'minMaj7': 'mMaj7',
    // Colon notation (from ML models)
    'major': 'major',
    'minor': 'minor',
    'minor7': 'm7',
    'dominant7': '7',
    'diminished': 'dim',
    'augmented': 'aug'
  };

  private readonly bassEnharmonicMap: Record<string, string> = {
    'Cb': 'B',
    'B': 'Cb',
    'C#': 'Db',
    'Db': 'C#',
    'D#': 'Eb',
    'Eb': 'D#',
    'E': 'Fb',
    'Fb': 'E',
    'E#': 'F',
    'F': 'E#',
    'F#': 'Gb',
    'Gb': 'F#',
    'G#': 'Ab',
    'Ab': 'G#',
    'A#': 'Bb',
    'Bb': 'A#',
    'B#': 'C',
    'C': 'B#'
  };


  public static getInstance(): ChordMappingService {
    if (!ChordMappingService.instance) {
      ChordMappingService.instance = new ChordMappingService();
    }
    return ChordMappingService.instance;
  }

  private normalizeNoteToken(note: string): string {
    return note.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  }

  private getAccidentalPreference(note: string): 'sharp' | 'flat' | undefined {
    if (/[b♭]/.test(note)) return 'flat';
    if (/[#♯]/.test(note)) return 'sharp';
    return undefined;
  }

  private getEnharmonicBassVariants(bass: string): string[] {
    const normalizedBass = this.normalizeNoteToken(bass);
    const variants = [normalizedBass];
    const enharmonic = this.bassEnharmonicMap[normalizedBass];

    if (enharmonic && enharmonic !== normalizedBass) {
      variants.push(enharmonic);
    }

    return Array.from(new Set(variants));
  }

  private normalizeBassNote(root: string, quality: string, bass: string): string {
    const normalizedBass = this.normalizeNoteToken(bass);

    if (/^[b#]?\d+$/.test(normalizedBass)) {
      return getBassNoteFromInversion(
        this.normalizeNoteToken(root),
        quality,
        normalizedBass,
        this.getAccidentalPreference(root)
      );
    }

    return normalizedBass;
  }

  private formatDisplayChord(root: string, normalizedSuffix: string, bass?: string | null): string {
    const normalizedRoot = this.normalizeNoteToken(root);
    const displaySuffix = normalizedSuffix === 'major'
      ? ''
      : normalizedSuffix === 'minor'
        ? 'm'
        : normalizedSuffix;

    return bass
      ? `${normalizedRoot}${displaySuffix}/${bass}`
      : `${normalizedRoot}${displaySuffix}`;
  }

  private formatSlashSuffix(normalizedSuffix: string, bass: string): string {
    const prefix = normalizedSuffix === 'major'
      ? ''
      : normalizedSuffix === 'minor'
        ? 'm'
        : normalizedSuffix;

    return `${prefix}/${bass}`;
  }

  private getFallbackOrder(normalizedSuffix: string): string[] {
    if (normalizedSuffix === 'm13' || normalizedSuffix === 'm11') {
      return ['m11', 'm9', 'm7', 'minor'];
    }

    if (normalizedSuffix === 'maj13' || normalizedSuffix === 'maj11') {
      return ['maj13', 'maj9', 'maj7', 'major'];
    }

    if (normalizedSuffix === '13' || normalizedSuffix === '11') {
      return [normalizedSuffix, '9', '7', 'major'];
    }

    if (normalizedSuffix === 'mMaj7' || normalizedSuffix === 'mmaj7') {
      return ['mMaj7', 'mmaj7', 'm7', 'minor'];
    }

    return [];
  }

  private findChordDataForCandidate(rootChords: ChordData[], candidate: ChordLookupCandidate): ChordData | null {
    const directMatch = rootChords.find(chord => chord.suffix === candidate.normalizedSuffix);
    if (directMatch) {
      return directMatch;
    }

    if (candidate.isExactInversion) {
      return null;
    }

    const tried = new Set<string>([candidate.normalizedSuffix]);
    const fallbackOrder = this.getFallbackOrder(candidate.normalizedSuffix);

    for (const suffix of fallbackOrder) {
      if (tried.has(suffix)) continue;

      const fallbackMatch = rootChords.find(chord => chord.suffix === suffix);
      if (fallbackMatch) {
        return fallbackMatch;
      }

      tried.add(suffix);
    }

    if (candidate.normalizedSuffix !== 'major') {
      const majorChord = rootChords.find(chord => chord.suffix === 'major');
      if (majorChord) {
        return majorChord;
      }
    }

    return null;
  }

  private buildLookupCandidates(chordName: string): ChordLookupCandidate[] {
    const parsed = this.parseChordName(chordName);
    if (!parsed) {
      return [];
    }

    const normalizedRoot = this.normalizeRoot(parsed.root);
    const normalizedSuffix = this.normalizeSuffix(parsed.suffix);
    const candidates: ChordLookupCandidate[] = [];

    if (parsed.bass) {
      const displayBass = this.normalizeBassNote(parsed.root, parsed.suffix, parsed.bass);
      const displayName = this.formatDisplayChord(parsed.root, normalizedSuffix, displayBass);

      for (const lookupBass of this.getEnharmonicBassVariants(displayBass)) {
        candidates.push({
          displayName,
          normalizedRoot,
          normalizedSuffix: this.formatSlashSuffix(normalizedSuffix, lookupBass),
          isExactInversion: true
        });
      }
    }

    candidates.push({
      displayName: this.formatDisplayChord(parsed.root, normalizedSuffix),
      normalizedRoot,
      normalizedSuffix,
      isExactInversion: false
    });

    return candidates.filter((candidate, index, allCandidates) => (
      index === allCandidates.findIndex(other =>
        other.displayName === candidate.displayName &&
        other.normalizedRoot === candidate.normalizedRoot &&
        other.normalizedSuffix === candidate.normalizedSuffix &&
        other.isExactInversion === candidate.isExactInversion
      )
    ));
  }

  /**
   * Parse chord name from ML model output
   * Handles both standard notation ("Am", "F#7", "Bbmaj7") and colon notation ("C:minor", "F#:maj7")
   */
  private parseChordName(chordName: string): ParsedChordName | null {
    // Handle "N.C." (No Chord) case
    if (!chordName || chordName === 'N.C.' || chordName === 'NC') {
      return null;
    }

    // Remove any whitespace
    const cleanChord = chordName.trim();
    const slashIndex = cleanChord.indexOf('/');
    const chordPart = slashIndex >= 0 ? cleanChord.slice(0, slashIndex).trim() : cleanChord;
    const bass = slashIndex >= 0 ? cleanChord.slice(slashIndex + 1).trim() : null;

    // Check for colon notation first (from ML models like "C:minor", "F#:maj7")
    const colonMatch = chordPart.match(/^([A-G][#b♯♭]?):(.+)$/);
    if (colonMatch) {
      const [, root, suffix] = colonMatch;
      return { root, suffix, bass };
    }

    // Enhanced chord pattern for standard notation
    // Matches: Root note (A-G) + optional accidental (#/b/♯/♭) + suffix (everything else)
    const chordPattern = /^([A-G])([#b♯♭]?)(.*)$/;
    const match = chordPart.match(chordPattern);

    if (!match) {
      return null;
    }

    const [, rootNote, accidental, suffix] = match;
    const root = rootNote + accidental; // Combine root note with accidental

    return { root, suffix, bass };
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
    const chordDb = await loadChordDatabase();
    const lookupCandidates = this.buildLookupCandidates(chordName);

    for (const candidate of lookupCandidates) {
      const rootChords = chordDb.chords[candidate.normalizedRoot];
      if (!rootChords) continue;

      const chordData = this.findChordDataForCandidate(rootChords, candidate);
      if (chordData) {
        return chordData;
      }
    }

    return null;
  }

  /**
   * Synchronous chord-data lookup for render-time voicing resolution.
   */
  public getChordDataSync(chordName: string): ChordData | null {
    const chordDb = getChordDatabaseSync();
    const lookupCandidates = this.buildLookupCandidates(chordName);

    for (const candidate of lookupCandidates) {
      const rootChords = chordDb.chords[candidate.normalizedRoot];
      if (!rootChords) continue;

      const chordData = this.findChordDataForCandidate(rootChords, candidate);
      if (chordData) {
        return chordData;
      }
    }

    return null;
  }

  /**
   * Resolve the canonical chord label used by guitar diagrams.
   * Prefers an exact slash-chord match when the database supports it, and
   * otherwise falls back to the root-position label that will actually render.
   */
  public getPreferredDiagramChordName(chordName: string): string {
    if (!chordName || chordName === 'N.C.' || chordName === 'N' || chordName === 'N/C' || chordName === 'NC') {
      return 'N.C.';
    }

    const chordDb = getChordDatabaseSync();
    const lookupCandidates = this.buildLookupCandidates(chordName);

    for (const candidate of lookupCandidates) {
      const rootChords = chordDb.chords[candidate.normalizedRoot];
      if (!rootChords) continue;

      if (this.findChordDataForCandidate(rootChords, candidate)) {
        return candidate.displayName;
      }
    }

    return chordName;
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
