/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
// Chord utilities extracted from analyze page component

/**
 * Chord notation parsing and validation
 */
export const parseChordNotation = (chord: string): {
  root: string;
  quality: string;
  extensions: string[];
  bass?: string;
  isValid: boolean;
} => {
  if (!chord || chord === 'N.C.' || chord === 'N/C' || chord === 'N') {
    return {
      root: '',
      quality: '',
      extensions: [],
      isValid: chord === 'N.C.' || chord === 'N/C' || chord === 'N'
    };
  }

  // Basic chord pattern: Root + Quality + Extensions + /Bass
  // Bass can be either a note name (A-G with optional #/b) OR a scale degree (number with optional #/b)
  const chordPattern = /^([A-G][#b]?)([^/]*?)(?:\/([A-G][#b]?|[#b]?\d+))?$/;
  const match = chord.match(chordPattern);

  if (!match) {
    return {
      root: chord,
      quality: '',
      extensions: [],
      isValid: false
    };
  }

  const [, root, qualityAndExtensions, bass] = match;
  
  // Parse quality and extensions
  let quality = '';
  let extensions: string[] = [];
  
  if (qualityAndExtensions) {
    // Common chord qualities
    if (qualityAndExtensions.startsWith('maj') || qualityAndExtensions.startsWith('M')) {
      quality = 'major';
      extensions = [qualityAndExtensions.replace(/^(maj|M)/, '')].filter(Boolean);
    } else if (qualityAndExtensions.startsWith('min') || qualityAndExtensions.startsWith('m')) {
      quality = 'minor';
      extensions = [qualityAndExtensions.replace(/^(min|m)/, '')].filter(Boolean);
    } else if (qualityAndExtensions.includes('dim')) {
      quality = 'diminished';
      extensions = [qualityAndExtensions.replace('dim', '')].filter(Boolean);
    } else if (qualityAndExtensions.includes('aug')) {
      quality = 'augmented';
      extensions = [qualityAndExtensions.replace('aug', '')].filter(Boolean);
    } else if (qualityAndExtensions.includes('sus')) {
      quality = 'suspended';
      extensions = [qualityAndExtensions];
    } else {
      // Default to major if no quality specified
      quality = 'major';
      extensions = [qualityAndExtensions].filter(Boolean);
    }
  } else {
    quality = 'major';
  }

  return {
    root,
    quality,
    extensions,
    bass,
    isValid: true
  };
};

/**
 * Enharmonic corrections and chord spelling
 */
export const getEnharmonicEquivalent = (note: string, preferSharps: boolean = false): string => {
  const enharmonicMap: Record<string, string[]> = {
    'C#': ['C#', 'Db'],
    'Db': ['Db', 'C#'],
    'D#': ['D#', 'Eb'],
    'Eb': ['Eb', 'D#'],
    'F#': ['F#', 'Gb'],
    'Gb': ['Gb', 'F#'],
    'G#': ['G#', 'Ab'],
    'Ab': ['Ab', 'G#'],
    'A#': ['A#', 'Bb'],
    'Bb': ['Bb', 'A#']
  };

  if (!enharmonicMap[note]) return note;

  const equivalents = enharmonicMap[note];
  return preferSharps ? 
    equivalents.find(n => n.includes('#')) || note :
    equivalents.find(n => n.includes('b')) || note;
};

/**
 * Apply enharmonic corrections to chord
 */
export const applyEnharmonicCorrection = (
  chord: string,
  corrections: Record<string, string>
): string => {
  if (!chord || !corrections) return chord;
  
  // Direct chord correction
  if (corrections[chord]) {
    return corrections[chord];
  }
  
  // Parse chord and apply corrections to root and bass
  const parsed = parseChordNotation(chord);
  if (!parsed.isValid) return chord;
  
  let correctedRoot = corrections[parsed.root] || parsed.root;
  let correctedBass = parsed.bass ? (corrections[parsed.bass] || parsed.bass) : undefined;
  
  // Reconstruct chord
  let result = correctedRoot;
  
  // Add quality and extensions
  if (parsed.quality === 'minor') {
    result += 'm';
  } else if (parsed.quality === 'diminished') {
    result += 'dim';
  } else if (parsed.quality === 'augmented') {
    result += 'aug';
  }
  
  // Add extensions
  if (parsed.extensions.length > 0) {
    result += parsed.extensions.join('');
  }
  
  // Add bass note
  if (correctedBass) {
    result += '/' + correctedBass;
  }
  
  return result;
};

/**
 * Key signature detection integration
 */
export const detectKeyFromChords = (chords: string[]): {
  key: string;
  confidence: number;
  mode: 'major' | 'minor';
} => {
  if (chords.length === 0) {
    return { key: 'C', confidence: 0, mode: 'major' };
  }

  // Count chord roots
  const rootCounts: Record<string, number> = {};
  const qualityCounts: Record<string, number> = {};

  chords.forEach(chord => {
    const parsed = parseChordNotation(chord);
    if (parsed.isValid && parsed.root) {
      rootCounts[parsed.root] = (rootCounts[parsed.root] || 0) + 1;
      qualityCounts[parsed.quality] = (qualityCounts[parsed.quality] || 0) + 1;
    }
  });

  // Find most common root
  const mostCommonRoot = Object.entries(rootCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'C';

  // Determine mode based on chord qualities
  const majorCount = qualityCounts['major'] || 0;
  const minorCount = qualityCounts['minor'] || 0;
  const mode = minorCount > majorCount ? 'minor' : 'major';

  // Calculate confidence based on how dominant the key is
  const totalChords = chords.length;
  const keyChordCount = rootCounts[mostCommonRoot] || 0;
  const confidence = keyChordCount / totalChords;

  return {
    key: mostCommonRoot,
    confidence,
    mode
  };
};

/**
 * Chord progression analysis and change detection
 */
export const analyzeChordProgression = (chords: string[]): {
  changes: Array<{
    index: number;
    from: string;
    to: string;
  }>;
  uniqueChords: string[];
  progressionPattern: string;
} => {
  const changes: Array<{ index: number; from: string; to: string }> = [];
  const uniqueChords = Array.from(new Set(chords));
  
  for (let i = 1; i < chords.length; i++) {
    if (chords[i] !== chords[i - 1]) {
      changes.push({
        index: i,
        from: chords[i - 1],
        to: chords[i]
      });
    }
  }
  
  // Create a simplified progression pattern
  const progressionPattern = chords
    .reduce((acc, chord, index) => {
      if (index === 0 || chord !== chords[index - 1]) {
        acc.push(chord);
      }
      return acc;
    }, [] as string[])
    .join(' - ');
  
  return {
    changes,
    uniqueChords,
    progressionPattern
  };
};

/**
 * Chord data mapping utilities
 * Extracted from lines 1505, 1539, 1701 of original component
 */
export const mapChordData = (
  chords: Array<{ chord: string; beatIndex: number; beatNum?: number }>,
  extractionType: 'chord' | 'beatIndex' | 'beatNum' = 'chord'
): any[] => {
  return chords.map(item => {
    switch (extractionType) {
      case 'chord':
        return item.chord;
      case 'beatIndex':
        return item.beatIndex;
      case 'beatNum':
        return item.beatNum;
      default:
        return item;
    }
  });
};

/**
 * Chord quality analysis
 */
export const analyzeChordQualities = (chords: string[]): {
  majorCount: number;
  minorCount: number;
  diminishedCount: number;
  augmentedCount: number;
  suspendedCount: number;
  otherCount: number;
  dominantCount: number;
} => {
  const counts = {
    majorCount: 0,
    minorCount: 0,
    diminishedCount: 0,
    augmentedCount: 0,
    suspendedCount: 0,
    otherCount: 0,
    dominantCount: 0
  };

  chords.forEach(chord => {
    const parsed = parseChordNotation(chord);
    if (!parsed.isValid) {
      counts.otherCount++;
      return;
    }

    switch (parsed.quality) {
      case 'major':
        // Check for dominant 7th
        if (parsed.extensions.some(ext => ext.includes('7'))) {
          counts.dominantCount++;
        } else {
          counts.majorCount++;
        }
        break;
      case 'minor':
        counts.minorCount++;
        break;
      case 'diminished':
        counts.diminishedCount++;
        break;
      case 'augmented':
        counts.augmentedCount++;
        break;
      case 'suspended':
        counts.suspendedCount++;
        break;
      default:
        counts.otherCount++;
    }
  });

  return counts;
};

/**
 * Chord simplification for display
 */
export const simplifyChordNotation = (chord: string): string => {
  if (!chord || chord === 'N.C.' || chord === 'N/C' || chord === 'N') {
    return chord;
  }

  const parsed = parseChordNotation(chord);
  if (!parsed.isValid) return chord;

  let simplified = parsed.root;

  // Simplify quality notation
  if (parsed.quality === 'minor') {
    simplified += 'm';
  }
  // Major chords don't need 'maj' suffix in simplified notation

  // Keep important extensions but simplify
  const importantExtensions = parsed.extensions.filter(ext => 
    ext.includes('7') || ext.includes('9') || ext.includes('sus')
  );
  
  if (importantExtensions.length > 0) {
    simplified += importantExtensions.join('');
  }

  // Add bass note if present
  if (parsed.bass) {
    simplified += '/' + parsed.bass;
  }

  return simplified;
};

/**
 * Validate chord sequence
 */
export const validateChordSequence = (chords: string[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (chords.length === 0) {
    errors.push('Empty chord sequence');
    return { isValid: false, errors, warnings };
  }

  // Check for invalid chords
  chords.forEach((chord, index) => {
    const parsed = parseChordNotation(chord);
    if (!parsed.isValid && chord !== 'N.C.' && chord !== 'N/C' && chord !== 'N') {
      errors.push(`Invalid chord at position ${index + 1}: ${chord}`);
    }
  });

  // Check for unusual patterns
  if (chords.every(chord => chord === chords[0])) {
    warnings.push('All chords are the same');
  }

  const uniqueChords = new Set(chords);
  if (uniqueChords.size === 1) {
    warnings.push('Only one unique chord in sequence');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};
