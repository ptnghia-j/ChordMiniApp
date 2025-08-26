/**
 * Chord Simplification Utility
 * 
 * This module provides functionality to simplify chord labels to only 5 basic types:
 * - Major (C, F#, Bb)
 * - Minor (Cm, F#m, Bbm) 
 * - Augmented (Caug, F#aug, Bbaug)
 * - Diminished (Cdim, F#dim, Bbdim)
 * - Suspended (Csus, F#sus, Bbsus)
 * 
 * All inversions (e.g., C/E → C) and seventh chords (e.g., Cmaj7 → C, Dm7 → Dm) are removed.
 * This simplification is for display purposes only and does not affect underlying analysis.
 */

/**
 * Parse a chord string to extract root, quality, and bass note
 */
interface ParsedChord {
  root: string;
  quality: string;
  bassNote?: string;
  isValid: boolean;
}

/**
 * Parse chord notation to extract components
 */
function parseChordForSimplification(chordName: string): ParsedChord {
  if (!chordName || chordName === 'N.C.' || chordName === 'N/C' || chordName === 'N') {
    return { root: chordName, quality: '', isValid: false };
  }

  // Remove inversion (slash notation) - we'll ignore bass notes for simplification
  const chordWithoutInversion = chordName.split('/')[0];
  
  let root = '';
  let quality = '';

  // Handle colon notation (e.g., "C:maj", "F#:min")
  if (chordWithoutInversion.includes(':')) {
    const parts = chordWithoutInversion.split(':');
    root = parts[0];
    quality = parts[1] || '';
  } else {
    // Handle standard notation (e.g., "Cm", "F#dim", "Csus4")
    const rootMatch = chordWithoutInversion.match(/^([A-G][#b]?)/);
    if (rootMatch) {
      root = rootMatch[1];
      quality = chordWithoutInversion.substring(root.length);
    } else {
      return { root: chordName, quality: '', isValid: false };
    }
  }

  return { root, quality, isValid: true };
}

/**
 * Simplify a chord to one of the 5 basic types
 */
export function simplifyChord(chordName: string): string {
  if (!chordName || chordName === 'N.C.' || chordName === 'N/C' || chordName === 'N') {
    return chordName;
  }

  const parsed = parseChordForSimplification(chordName);
  if (!parsed.isValid) {
    return chordName;
  }

  const { root, quality } = parsed;
  
  // Convert flat symbols to proper Unicode
  const formattedRoot = root.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯');

  // Determine the basic chord type based on quality
  const lowerQuality = quality.toLowerCase();

  // Check diminished chords FIRST (before minor) since "dim" contains "m"
  if (lowerQuality.includes('dim') || lowerQuality.includes('°') || lowerQuality.includes('hdim')) {
    return `${formattedRoot}dim`;
  }

  // Augmented chords
  if (lowerQuality.includes('aug') || lowerQuality.includes('+')) {
    return `${formattedRoot}aug`;
  }

  // Suspended chords (sus2, sus4, sus)
  if (lowerQuality.includes('sus')) {
    return `${formattedRoot}sus`;
  }

  // Minor chords (any variation of minor) - check AFTER dim/aug/sus
  if ((lowerQuality.includes('min') || lowerQuality.includes('m')) && !lowerQuality.includes('maj')) {
    return `${formattedRoot}m`;
  }

  // Default to major (including maj7, maj9, 7, 9, 11, 13, add9, etc.)
  return formattedRoot;
}

/**
 * Apply chord simplification to an array of chords
 */
export function simplifyChordArray(chords: string[]): string[] {
  return chords.map(chord => simplifyChord(chord));
}

/**
 * Apply chord simplification to chord corrections object
 * IMPORTANT: This function ensures that corrections work properly with simplification
 * by creating mappings for both original and simplified chord forms
 */
export function simplifyChordCorrections(corrections: Record<string, string> | null): Record<string, string> | null {
  if (!corrections) return null;

  const simplifiedCorrections: Record<string, string> = {};

  for (const [originalChord, correctedChord] of Object.entries(corrections)) {
    const simplifiedOriginal = simplifyChord(originalChord);
    const simplifiedCorrected = simplifyChord(correctedChord);

    // Create mapping for simplified chord
    simplifiedCorrections[simplifiedOriginal] = simplifiedCorrected;

    // ALSO create mapping for the original chord form to handle cases where
    // the chord hasn't been simplified yet when the correction is applied
    if (originalChord !== simplifiedOriginal) {
      simplifiedCorrections[originalChord] = simplifiedCorrected;
    }
  }

  return simplifiedCorrections;
}

/**
 * Apply chord simplification to sequence corrections
 */
export function simplifySequenceCorrections(sequenceCorrections: {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: Array<{
      startIndex: number;
      endIndex: number;
      key: string;
      chords: string[];
    }>;
    modulations?: Array<{
      fromKey: string;
      toKey: string;
      atIndex: number;
      atTime?: number;
    }>;
  };
} | null): {
  originalSequence: string[];
  correctedSequence: string[];
  keyAnalysis?: {
    sections: Array<{
      startIndex: number;
      endIndex: number;
      key: string;
      chords: string[];
    }>;
    modulations?: Array<{
      fromKey: string;
      toKey: string;
      atIndex: number;
      atTime?: number;
    }>;
  };
} | null {
  if (!sequenceCorrections) return null;

  return {
    ...sequenceCorrections,
    originalSequence: sequenceCorrections.originalSequence.map((chord: string) => simplifyChord(chord)),
    correctedSequence: sequenceCorrections.correctedSequence.map((chord: string) => simplifyChord(chord)),
    keyAnalysis: sequenceCorrections.keyAnalysis ? {
      ...sequenceCorrections.keyAnalysis,
      sections: sequenceCorrections.keyAnalysis.sections.map((section) => ({
        ...section,
        chords: section.chords.map((chord: string) => simplifyChord(chord))
      })),
      modulations: sequenceCorrections.keyAnalysis.modulations
    } : undefined
  };
}

/**
 * Apply chord simplification to chord positions in lyrics
 */
export function simplifyChordPositions(chordPositions: Array<{ position: number; chord: string; time: number }>): Array<{ position: number; chord: string; time: number }> {
  return chordPositions.map(pos => ({
    ...pos,
    chord: simplifyChord(pos.chord)
  }));
}

/**
 * Test function to verify chord simplification works correctly
 */
export function testChordSimplification(): void {
  const testCases = [
    // Major chords
    { input: 'C', expected: 'C' },
    { input: 'C:maj', expected: 'C' },
    { input: 'Cmaj7', expected: 'C' },
    { input: 'C7', expected: 'C' },
    { input: 'Cadd9', expected: 'C' },
    { input: 'F#', expected: 'F♯' },
    { input: 'Bb:maj', expected: 'B♭' },
    
    // Minor chords
    { input: 'Cm', expected: 'Cm' },
    { input: 'C:min', expected: 'Cm' },
    { input: 'Dm7', expected: 'Dm' },
    { input: 'F#m', expected: 'F♯m' },
    { input: 'Bbmin', expected: 'B♭m' },
    
    // Augmented chords
    { input: 'Caug', expected: 'Caug' },
    { input: 'C+', expected: 'Caug' },
    { input: 'F#aug', expected: 'F♯aug' },
    
    // Diminished chords
    { input: 'Cdim', expected: 'Cdim' },
    { input: 'C°', expected: 'Cdim' },
    { input: 'Cdim7', expected: 'Cdim' },
    { input: 'Chdim7', expected: 'Cdim' },
    
    // Suspended chords
    { input: 'Csus4', expected: 'Csus' },
    { input: 'Csus2', expected: 'Csus' },
    { input: 'Csus', expected: 'Csus' },
    
    // Inversions (should be removed)
    { input: 'C/E', expected: 'C' },
    { input: 'Dm7/F', expected: 'Dm' },
    { input: 'F#aug/A#', expected: 'F♯aug' },
    
    // Special cases
    { input: 'N.C.', expected: 'N.C.' },
    { input: 'N', expected: 'N' },
    { input: '', expected: '' }
  ];

  console.log('Testing chord simplification...');
  let passed = 0;
  let failed = 0;

  testCases.forEach(({ input, expected }) => {
    const result = simplifyChord(input);
    if (result === expected) {
      console.log(`✓ ${input} → ${result}`);
      passed++;
    } else {
      console.error(`✗ ${input} → ${result} (expected: ${expected})`);
      failed++;
    }
  });

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
}
