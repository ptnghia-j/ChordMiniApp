/**
 * Chord Transposition Utilities
 * 
 * Provides functions for transposing chords by semitones with proper enharmonic spelling.
 * Integrates with existing chord formatting utilities and enharmonic correction logic.
 * 
 * Features:
 * - Transpose chord root notes with context-aware enharmonic spelling
 * - Transpose slash chord bass notes independently
 * - Preserve chord quality (major, minor, diminished, augmented)
 * - Preserve chord extensions (7, maj7, sus4, etc.)
 * - Support for all 12 semitone transpositions (±12)
 */

import { parseChordNotation } from './chordUtils';

/**
 * Pitch shift range constants
 * Used throughout the application for consistent pitch shift limits
 */
export const MIN_SEMITONES = -6;
export const MAX_SEMITONES = 6;

/**
 * Chromatic scale with sharps (for sharp keys)
 */
const CHROMATIC_SCALE_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Chromatic scale with flats (for flat keys)
 */
const CHROMATIC_SCALE_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Keys that prefer flat notation
 */
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

/**
 * Enharmonic equivalents for rare notes (Fb = E, Cb = B, E# = F, B# = C)
 */
const ENHARMONIC_RARE_NOTES: Record<string, string> = {
  'Fb': 'E',
  'Cb': 'B',
  'E#': 'F',
  'B#': 'C'
};

/**
 * Determine if a key uses flat or sharp notation
 */
function usesFlats(key: string): boolean {
  // Check if key is in flat keys list
  if (FLAT_KEYS.includes(key)) return true;
  
  // Check if key contains 'b' or '♭'
  if (key.includes('b') || key.includes('♭')) return true;
  
  return false;
}

/**
 * Transpose a single note by semitones with proper enharmonic spelling
 */
export function transposeNote(
  note: string,
  semitones: number,
  targetKey: string
): string {
  // Handle empty or invalid notes
  if (!note || note === 'N' || note === 'X') return note;

  // Normalize note (handle Unicode symbols)
  let normalizedNote = note.replace(/♯/g, '#').replace(/♭/g, 'b');

  // Handle rare enharmonic equivalents
  if (ENHARMONIC_RARE_NOTES[normalizedNote]) {
    normalizedNote = ENHARMONIC_RARE_NOTES[normalizedNote];
  }

  // Determine which chromatic scale to use based on target key
  const useFlats = usesFlats(targetKey);
  const chromaticScale = useFlats ? CHROMATIC_SCALE_FLATS : CHROMATIC_SCALE_SHARPS;

  // Find current note index
  let currentIndex = chromaticScale.findIndex(n => n === normalizedNote);
  
  // If not found in current scale, try the other scale
  if (currentIndex === -1) {
    const alternateScale = useFlats ? CHROMATIC_SCALE_SHARPS : CHROMATIC_SCALE_FLATS;
    currentIndex = alternateScale.findIndex(n => n === normalizedNote);
    
    if (currentIndex === -1) {
      console.warn(`⚠️ Note not found in chromatic scale: ${note}`);
      return note; // Return original if not found
    }
  }

  // Calculate new index (handle negative semitones and wrap around)
  const newIndex = (currentIndex + semitones + 12) % 12;
  
  return chromaticScale[newIndex];
}

/**
 * Calculate target key after transposition
 */
export function calculateTargetKey(
  originalKey: string,
  semitones: number
): string {
  // Determine if original key uses flats
  const originalUsesFlats = usesFlats(originalKey);
  
  // Transpose the key note
  const transposedKey = transposeNote(originalKey, semitones, originalKey);
  
  // Determine if transposed key should use flats or sharps
  // Preserve the original preference unless it results in a double accidental
  const transposedUsesFlats = usesFlats(transposedKey);
  
  // If the transposed key naturally uses the same accidental type, use it
  if (originalUsesFlats === transposedUsesFlats) {
    return transposedKey;
  }
  
  // Otherwise, use the chromatic scale that matches the original preference
  const chromaticScale = originalUsesFlats ? CHROMATIC_SCALE_FLATS : CHROMATIC_SCALE_SHARPS;
  const originalIndex = chromaticScale.findIndex(n => n === originalKey);
  
  if (originalIndex !== -1) {
    const newIndex = (originalIndex + semitones + 12) % 12;
    return chromaticScale[newIndex];
  }
  
  return transposedKey;
}

/**
 * Transpose a chord by semitones with proper enharmonic spelling
 */
export function transposeChord(
  originalChord: string,
  semitones: number,
  targetKey: string
): string {
  // Handle empty or rest chords
  if (!originalChord || originalChord === 'N.C.' || originalChord === 'N/C' || originalChord === 'N' || originalChord === 'X') {
    return originalChord;
  }

  // No transposition needed
  if (semitones === 0) {
    return originalChord;
  }

  // Parse the chord
  const parsed = parseChordNotation(originalChord);
  
  if (!parsed.isValid || !parsed.root) {
    console.warn(`⚠️ Invalid chord for transposition: ${originalChord}`);
    return originalChord;
  }

  // Transpose root note
  const transposedRoot = transposeNote(parsed.root, semitones, targetKey);

  // Transpose bass note if it's a slash chord
  let transposedBass: string | undefined;
  if (parsed.bass) {
    // Check if bass is a scale degree (e.g., "4", "b7", "#5") or a note name (e.g., "Bb", "C#")
    const isScaleDegree = /^[#b]?\d+$/.test(parsed.bass);

    if (isScaleDegree) {
      // For scale degrees, keep the same scale degree (it's relative to the chord root)
      // The actual bass note will be calculated by formatChordWithMusicalSymbols
      transposedBass = parsed.bass;
    } else {
      // For note names, transpose the bass note
      transposedBass = transposeNote(parsed.bass, semitones, targetKey);
    }
  }

  // Reconstruct the chord
  let result = transposedRoot;

  // Add quality
  if (parsed.quality === 'minor') {
    result += 'm';
  } else if (parsed.quality === 'diminished') {
    result += 'dim';
  } else if (parsed.quality === 'augmented') {
    result += 'aug';
  }
  // Major chords don't need a suffix

  // Add extensions
  if (parsed.extensions.length > 0) {
    result += parsed.extensions.join('');
  }

  // Add bass note for slash chords
  if (transposedBass) {
    result += '/' + transposedBass;
  }

  return result;
}

/**
 * Transpose an array of chords
 */
export function transposeChordProgression(
  chords: string[],
  semitones: number,
  originalKey: string
): {
  transposedChords: string[];
  targetKey: string;
} {
  // Calculate target key
  const targetKey = calculateTargetKey(originalKey, semitones);

  // Transpose each chord
  const transposedChords = chords.map(chord => 
    transposeChord(chord, semitones, targetKey)
  );

  return {
    transposedChords,
    targetKey
  };
}

/**
 * Get the interval name for a semitone shift
 */
export function getIntervalName(semitones: number): string {
  const absValue = Math.abs(semitones);
  const direction = semitones > 0 ? 'up' : 'down';
  
  const intervalNames: Record<number, string> = {
    0: 'Unison',
    1: 'Minor 2nd',
    2: 'Major 2nd',
    3: 'Minor 3rd',
    4: 'Major 3rd',
    5: 'Perfect 4th',
    6: 'Tritone',
    7: 'Perfect 5th',
    8: 'Minor 6th',
    9: 'Major 6th',
    10: 'Minor 7th',
    11: 'Major 7th',
    12: 'Octave'
  };

  const intervalName = intervalNames[absValue] || `${absValue} semitones`;
  
  if (semitones === 0) return intervalName;
  return `${intervalName} ${direction}`;
}

/**
 * Check if a semitone shift will result in quality degradation
 */
export function willDegradeQuality(semitones: number): boolean {
  const absValue = Math.abs(semitones);
  return absValue > 7; // Quality degrades significantly beyond ±7 semitones
}

/**
 * Get quality warning message for large shifts
 */
export function getQualityWarning(semitones: number): string | null {
  if (!willDegradeQuality(semitones)) return null;
  
  const absValue = Math.abs(semitones);
  
  if (absValue >= 10) {
    return 'Audio quality may be significantly degraded at this pitch shift amount.';
  } else if (absValue >= 8) {
    return 'Audio quality may be noticeably degraded at this pitch shift amount.';
  }
  
  return 'Audio quality may degrade at large pitch shifts.';
}

/**
 * Format semitone shift for display (e.g., "+2", "-5", "0")
 */
export function formatSemitones(semitones: number): string {
  if (semitones === 0) return '0';
  return semitones > 0 ? `+${semitones}` : `${semitones}`;
}

/**
 * Parse semitone value from string (e.g., "+2" -> 2, "-5" -> -5)
 */
export function parseSemitones(value: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return 0;

  // Clamp to valid range (-6 to +6)
  return Math.max(-6, Math.min(6, parsed));
}

