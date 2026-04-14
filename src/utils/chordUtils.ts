/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
// Chord utilities extracted from analyze page component

import { canonicalizeKeySignature } from '@/utils/keySignatureUtils';

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
  // Regex explanation for scale degree pattern [#b]?\d+:
  //   [#b]? - Optional accidental (sharp or flat)
  //   \d+   - One or more digits representing the scale degree
  //   Examples: 'b7' (flat 7th), '#4' (sharp 4th), '5' (perfect 5th)
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
    } else if (qualityAndExtensions.includes('°')) {
      quality = 'diminished';
      extensions = [qualityAndExtensions.replace(/°/g, '')].filter(Boolean);
    } else if (qualityAndExtensions.includes('dim')) {
      quality = 'diminished';
      extensions = [qualityAndExtensions.replace('dim', '')].filter(Boolean);
    } else if (qualityAndExtensions.includes('+')) {
      quality = 'augmented';
      extensions = [qualityAndExtensions.replace(/\+/g, '')].filter(Boolean);
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
  type KeyHeuristicChordQuality =
    | 'major'
    | 'minor'
    | 'dominant'
    | 'diminished'
    | 'augmented'
    | 'suspended'
    | 'other';

  type KeyHeuristicChord = {
    root: string;
    rootPitchClass: number;
    quality: KeyHeuristicChordQuality;
    pitchClasses: number[];
  };

  type KeyCandidate = {
    root: string;
    rootPitchClass: number;
    mode: 'major' | 'minor';
    primaryScalePitchClasses: Set<number>;
    notePitchClasses: Set<number>;
  };

  const NOTE_TO_PITCH_CLASS: Record<string, number> = {
    C: 0,
    'B#': 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    F: 5,
    'E#': 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
    Cb: 11,
  };

  const KEY_CANDIDATE_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
  const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
  const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;
  const HARMONIC_MINOR_EXTRA_INTERVALS = [11] as const;

  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

  const getPitchClass = (note: string): number | null => {
    const normalized = note
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b')
      .trim();
    if (!normalized) {
      return null;
    }

    const formatted = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    return NOTE_TO_PITCH_CLASS[formatted] ?? null;
  };

  const buildPitchClasses = (rootPitchClass: number, intervals: number[]): number[] => (
    Array.from(new Set(intervals.map((interval) => (rootPitchClass + interval) % 12)))
  );

  const buildScalePitchClasses = (rootPitchClass: number, intervals: readonly number[]): Set<number> => (
    new Set(intervals.map((interval) => (rootPitchClass + interval) % 12))
  );

  const buildCandidate = (root: string, mode: 'major' | 'minor'): KeyCandidate => {
    const rootPitchClass = getPitchClass(root) ?? 0;
    const primaryScalePitchClasses = buildScalePitchClasses(
      rootPitchClass,
      mode === 'major' ? MAJOR_SCALE_INTERVALS : NATURAL_MINOR_INTERVALS
    );
    const notePitchClasses = new Set(primaryScalePitchClasses);

    if (mode === 'minor') {
      for (const interval of HARMONIC_MINOR_EXTRA_INTERVALS) {
        notePitchClasses.add((rootPitchClass + interval) % 12);
      }
    }

    return {
      root,
      rootPitchClass,
      mode,
      primaryScalePitchClasses,
      notePitchClasses,
    };
  };

  const CANDIDATE_KEYS: KeyCandidate[] = KEY_CANDIDATE_ROOTS.flatMap((root) => ([
    buildCandidate(root, 'major'),
    buildCandidate(root, 'minor'),
  ]));

  const parseChordForKeyHeuristic = (chord: string): KeyHeuristicChord | null => {
    if (!chord || chord === 'N.C.' || chord === 'N/C' || chord === 'N') {
      return null;
    }

    const normalized = chord
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b')
      .trim();
    const match = normalized.match(/^([A-G][#b]?)(?:(?::)?([^/]+))?(?:\/([A-G][#b]?|[#b]?\d+))?$/);
    if (!match) {
      return null;
    }

    const [, root, rawDescriptor = ''] = match;
    const rootPitchClass = getPitchClass(root);
    if (rootPitchClass === null) {
      return null;
    }

    const descriptor = rawDescriptor.trim().toLowerCase();
    let quality: KeyHeuristicChordQuality = 'major';
    let intervals = [0, 4, 7];

    if (!descriptor) {
      return {
        root,
        rootPitchClass,
        quality,
        pitchClasses: buildPitchClasses(rootPitchClass, intervals),
      };
    }

    const isMinorDescriptor = descriptor.startsWith('min') || /^m(?!aj)/.test(descriptor);
    const isMinorMajorSeventh = descriptor.startsWith('minmaj') || /^mmaj/.test(descriptor);
    const isMajorSeventhDescriptor = descriptor.startsWith('maj7') || descriptor.startsWith('maj9') || descriptor.startsWith('maj13');
    const isDominantDescriptor = (
      descriptor.startsWith('dom')
      || /^(7|9|11|13)/.test(descriptor)
      || (
        (descriptor.includes('7') || descriptor.includes('9') || descriptor.includes('11') || descriptor.includes('13'))
        && !descriptor.startsWith('add')
        && !descriptor.includes('maj')
        && !isMinorDescriptor
      )
    );

    if (descriptor.includes('hdim')) {
      quality = 'diminished';
      intervals = descriptor.includes('7') ? [0, 3, 6, 10] : [0, 3, 6];
    } else if (descriptor.includes('dim') || descriptor.includes('°')) {
      quality = 'diminished';
      intervals = descriptor.includes('7') ? [0, 3, 6, 9] : [0, 3, 6];
    } else if (descriptor.includes('aug') || descriptor.includes('+')) {
      quality = 'augmented';
      intervals = [0, 4, 8];
    } else if (descriptor.includes('sus')) {
      quality = 'suspended';
      intervals = descriptor.includes('2') && !descriptor.includes('4') ? [0, 2, 7] : [0, 5, 7];
      if (descriptor.includes('7') || descriptor.includes('9') || descriptor.includes('11') || descriptor.includes('13')) {
        intervals = [...intervals, 10];
      }
    } else if (isMinorMajorSeventh) {
      quality = 'minor';
      intervals = [0, 3, 7, 11];
    } else if (isMinorDescriptor) {
      quality = 'minor';
      intervals = descriptor.includes('7') || descriptor.includes('9') || descriptor.includes('11') || descriptor.includes('13')
        ? [0, 3, 7, 10]
        : [0, 3, 7];
    } else if (isDominantDescriptor) {
      quality = 'dominant';
      intervals = [0, 4, 7, 10];
    } else if (isMajorSeventhDescriptor) {
      quality = 'major';
      intervals = [0, 4, 7, 11];
    } else if (descriptor.startsWith('add')) {
      quality = 'major';
      intervals = [0, 4, 7];
    }

    return {
      root,
      rootPitchClass,
      quality,
      pitchClasses: buildPitchClasses(rootPitchClass, intervals),
    };
  };

  const getScaleDegree = (chordPitchClass: number, keyRootPitchClass: number): number => (
    (chordPitchClass - keyRootPitchClass + 12) % 12
  );

  const getFunctionalChordWeight = (chord: KeyHeuristicChord, candidate: KeyCandidate): number => {
    const degree = getScaleDegree(chord.rootPitchClass, candidate.rootPitchClass);

    if (candidate.mode === 'major') {
      switch (degree) {
        case 0:
          return chord.quality === 'major' ? 1.9 : 0.2;
        case 2:
          return chord.quality === 'minor' ? 1.4 : 0.1;
        case 4:
          return chord.quality === 'minor' ? 1.25 : 0.1;
        case 5:
          return chord.quality === 'major' || chord.quality === 'suspended' ? 1.45 : 0.1;
        case 7:
          if (chord.quality === 'dominant') return 1.8;
          if (chord.quality === 'major' || chord.quality === 'suspended') return 1.45;
          return 0.1;
        case 9:
          return chord.quality === 'minor' ? 1.35 : 0.1;
        case 11:
          return chord.quality === 'diminished' || chord.quality === 'other' ? 1.15 : 0.1;
        default:
          return candidate.primaryScalePitchClasses.has(chord.rootPitchClass) ? 0.25 : 0;
      }
    }

    switch (degree) {
      case 0:
        return chord.quality === 'minor' ? 1.9 : 0.2;
      case 2:
        return chord.quality === 'diminished' || chord.quality === 'other' ? 1.05 : 0.1;
      case 3:
        return chord.quality === 'major' ? 1.45 : 0.1;
      case 5:
        return chord.quality === 'minor' ? 1.35 : 0.1;
      case 7:
        if (chord.quality === 'dominant') return 1.85;
        if (chord.quality === 'major') return 1.55;
        if (chord.quality === 'minor') return 0.9;
        return 0.1;
      case 8:
        return chord.quality === 'major' ? 1.35 : 0.1;
      case 10:
        return chord.quality === 'major' || chord.quality === 'dominant' ? 1.1 : 0.1;
      default:
        return candidate.primaryScalePitchClasses.has(chord.rootPitchClass) ? 0.25 : 0;
    }
  };

  const isTonicChord = (chord: KeyHeuristicChord, candidate: KeyCandidate): boolean => {
    if (chord.rootPitchClass !== candidate.rootPitchClass) {
      return false;
    }

    return candidate.mode === 'major'
      ? chord.quality === 'major'
      : chord.quality === 'minor';
  };

  const isDominantResolution = (
    chord: KeyHeuristicChord,
    nextChord: KeyHeuristicChord | null,
    candidate: KeyCandidate
  ): boolean => {
    if (!nextChord) {
      return false;
    }

    const targetPitchClass = (chord.rootPitchClass + 5) % 12;
    return (
      nextChord.rootPitchClass === targetPitchClass
      && targetPitchClass === candidate.rootPitchClass
      && (chord.quality === 'dominant' || chord.quality === 'major' || chord.quality === 'suspended')
    );
  };

  const getSecondaryDominantWeight = (
    chord: KeyHeuristicChord,
    nextChord: KeyHeuristicChord | null,
    candidate: KeyCandidate
  ): number => {
    if (!nextChord) {
      return 0;
    }

    if (chord.quality !== 'dominant' && chord.quality !== 'major') {
      return 0;
    }

    const targetPitchClass = (chord.rootPitchClass + 5) % 12;
    const targetIsDiatonic = candidate.primaryScalePitchClasses.has(targetPitchClass);
    const chordRootIsDiatonic = candidate.primaryScalePitchClasses.has(chord.rootPitchClass);

    if (!targetIsDiatonic || chordRootIsDiatonic || nextChord.rootPitchClass !== targetPitchClass) {
      return 0;
    }

    return chord.quality === 'dominant' ? 1.35 : 0.95;
  };

  if (chords.length === 0) {
    return { key: 'C', confidence: 0, mode: 'major' };
  }

  const parsedChords = chords
    .map((chord) => parseChordForKeyHeuristic(chord))
    .filter((chord): chord is KeyHeuristicChord => chord !== null);

  if (parsedChords.length === 0) {
    return { key: 'C', confidence: 0, mode: 'major' };
  }

  const scoredCandidates = CANDIDATE_KEYS.map((candidate) => {
    let score = 0;
    let matchedChordCount = 0;

    parsedChords.forEach((chord, index) => {
      const nextChord = parsedChords[index + 1] ?? null;
      const functionalWeight = getFunctionalChordWeight(chord, candidate);
      const inKeyNoteCount = chord.pitchClasses.filter((pitchClass) => candidate.notePitchClasses.has(pitchClass)).length;
      const noteFit = inKeyNoteCount / Math.max(chord.pitchClasses.length, 1);
      const secondaryDominantWeight = getSecondaryDominantWeight(chord, nextChord, candidate);
      const isRootInKey = candidate.primaryScalePitchClasses.has(chord.rootPitchClass);
      const chordMatchesKey = functionalWeight >= 1 || noteFit >= 0.75 || secondaryDominantWeight > 0;

      if (chordMatchesKey) {
        matchedChordCount += 1;
      }

      score += functionalWeight;
      score += noteFit * 1.35;

      if (isRootInKey) {
        score += 0.2;
      } else if (secondaryDominantWeight === 0) {
        score -= 0.85;
      }

      if (noteFit < 0.5 && secondaryDominantWeight === 0) {
        score -= 0.45;
      }

      score += secondaryDominantWeight;

      if (isTonicChord(chord, candidate)) {
        if (index === 0) {
          score += 0.85;
        }
        if (index === parsedChords.length - 1) {
          score += 1.25;
        }
      }

      if (isDominantResolution(chord, nextChord, candidate)) {
        score += 0.75;
      }
    });

    score += (matchedChordCount / parsedChords.length) * 1.5;

    return {
      ...candidate,
      score,
      matchedChordCount,
    };
  }).sort((left, right) => right.score - left.score || right.matchedChordCount - left.matchedChordCount);

  const bestCandidate = scoredCandidates[0] ?? buildCandidate('C', 'major');
  const runnerUpScore = scoredCandidates[1]?.score ?? 0;
  const scoreMargin = bestCandidate.score - runnerUpScore;
  const confidence = clamp(
    0.35
      + (bestCandidate.matchedChordCount / parsedChords.length) * 0.35
      + clamp(scoreMargin / Math.max(parsedChords.length * 1.5, 1), 0, 0.3),
    0,
    1
  );

  return {
    key: bestCandidate.root,
    confidence,
    mode: bestCandidate.mode
  };
};

export function estimateKeySignatureFromChords(chords: string[]): {
  keySignature: string;
  confidence: number;
  mode: 'major' | 'minor';
} {
  const { key, confidence, mode } = detectKeyFromChords(chords);
  const accidentalPreference = computeAccidentalPreference(chords);
  const preferredKeyRoot = accidentalPreference
    ? getEnharmonicEquivalent(key, accidentalPreference === 'sharp')
    : key;
  const keySignature = canonicalizeKeySignature(`${preferredKeyRoot} ${mode}`) ?? `${preferredKeyRoot} ${mode}`;

  return {
    keySignature,
    confidence,
    mode,
  };
}

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


/**
 * Analyze a list of chord labels and decide an overall accidental preference.
 * Counts sharp vs flat occurrences on note tokens like A#, Bb, etc.
 */
export function computeAccidentalPreference(chords: string[]): 'sharp' | 'flat' | null {
  if (!Array.isArray(chords) || chords.length === 0) return null;
  let sharpCount = 0;
  let flatCount = 0;
  const noteTokenRegex = /[A-G](?:#|b)/g; // matches A#, Bb, etc.

  for (const ch of chords) {
    if (!ch) continue;
    const tokens = ch.match(noteTokenRegex);
    if (!tokens) continue;
    for (const t of tokens) {
      if (t.includes('#')) sharpCount++;
      if (t.includes('b')) flatCount++;
    }
  }

  if (sharpCount > flatCount) return 'sharp';
  if (flatCount > sharpCount) return 'flat';
  return null;
}

// ─── Key-based accidental preference ─────────────────────────────────────────

/** Keys whose scales are conventionally spelled with flats. */
const FLAT_KEY_ROOTS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm',
  // Unicode variants
  'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭',
  'B♭m', 'E♭m', 'A♭m',
]);

/**
 * Derive the accidental preference directly from the detected key signature.
 *
 * This is more authoritative than `computeAccidentalPreference` (which counts
 * sharps vs flats in chord labels).  When the Gemini key-detection result is
 * available (e.g. "Db major"), the key *defines* the correct enharmonic
 * spelling for every accidental in the piece.
 *
 * @param keySignature  e.g. "Db major", "F# minor", "C Major", "E♭"
 * @returns 'sharp', 'flat', or null if the key is natural / unrecognised
 */
export function getAccidentalPreferenceFromKey(
  keySignature: string | null | undefined,
): 'sharp' | 'flat' | null {
  if (!keySignature) return null;

  // Normalise unicode accidentals to ASCII
  const normalised = (
    canonicalizeKeySignature(keySignature)
    ?? keySignature
  )
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .trim();

  // Extract root note (with optional accidental) before any quality word
  const rootMatch = normalised.match(/^([A-G][#b]?)/i);
  if (!rootMatch) return null;

  let root = rootMatch[1];
  // Capitalise root letter
  root = root.charAt(0).toUpperCase() + root.slice(1);

  // Detect minor quality for the lookup set
  const isMinor = /minor|min\b|m$/i.test(normalised.slice(root.length));
  const lookupKey = isMinor ? root + 'm' : root;

  if (FLAT_KEY_ROOTS.has(lookupKey)) return 'flat';

  // If the root itself contains a sharp, it's a sharp key
  if (root.includes('#')) return 'sharp';

  // Natural keys (C, G, D, A, E, B / Am, Em, Bm, F#m, C#m, G#m)
  // For natural-root major keys (C, G, D, A, E, B) — they use sharps
  // (except F which is flat and already caught above)
  // For natural-root minor keys (Am, Em, Bm, etc.) — they use sharps already
  return null;
}

/**
 * Determine the accidental preference to use for display formatting.
 * If a sequence correction payload is present, preserve that payload's exact
 * enharmonic spelling instead of coercing it to the detected key signature.
 */
export function getDisplayAccidentalPreference(params: {
  chords: string[];
  keySignature?: string | null;
  preserveExactSpelling?: boolean;
}): 'sharp' | 'flat' | undefined {
  const { chords, keySignature, preserveExactSpelling = false } = params;

  if (preserveExactSpelling) {
    return undefined;
  }

  const keyPref = getAccidentalPreferenceFromKey(keySignature);
  if (keyPref) return keyPref;

  return computeAccidentalPreference(chords) || undefined;
}
