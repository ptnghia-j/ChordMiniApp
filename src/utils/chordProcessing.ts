/**
 * Pure utility functions for chord processing and analysis
 * Extracted from ChordGrid component for reusability and testability
 */

export interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
  audioIndex: number;
}

export interface SequenceCorrections {
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
}

/**
 * Normalizes chord notation for consistent comparison
 */
export const normalizeChord = (chord: string): string => {
  if (!chord) return '';

  const normalizedChord = chord.trim().replace(/♯/g, '#').replace(/♭/g, 'b');

  if (normalizedChord === 'N' || normalizedChord === 'N.C.' || normalizedChord === 'N/C' || normalizedChord === 'NC') {
    return 'N';
  }

  const [rawChordPart, rawBassPart] = normalizedChord.split('/');
  const rootMatch = rawChordPart.match(/^([A-G](?:##|bb|#|b)?)(.*)$/);

  if (!rootMatch) {
    return normalizedChord;
  }

  const [, root, rawQuality = ''] = rootMatch;
  let quality = rawQuality;

  if (quality.startsWith(':')) {
    quality = quality.slice(1);
  }

  if (quality === '' || quality === 'maj' || quality === 'major') {
    quality = '';
  } else if (quality === 'm') {
    quality = 'min';
  } else if (quality.startsWith('m') && !quality.startsWith('maj') && !quality.startsWith('min')) {
    quality = `min${quality.slice(1)}`;
  } else if (quality.startsWith('minor')) {
    quality = `min${quality.slice('minor'.length)}`;
  } else if (quality.startsWith('min')) {
    quality = `min${quality.slice('min'.length)}`;
  }

  const canonicalBass = rawBassPart
    ? rawBassPart.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
    : '';

  const canonicalChord = quality ? `${root}:${quality}` : root;
  return canonicalBass ? `${canonicalChord}/${canonicalBass}` : canonicalChord;
};

const NOTE_BASE_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SEMITONE_TO_CANONICAL_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const getCanonicalPitchClass = (note: string): string => {
  const normalizedNote = note.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = normalizedNote.match(/^([A-G])([#b]*)$/);

  if (!match) {
    return normalizedNote;
  }

  const [, letter, accidentals = ''] = match;
  let semitone = NOTE_BASE_SEMITONES[letter];

  for (const accidental of accidentals) {
    if (accidental === '#') {
      semitone += 1;
    } else if (accidental === 'b') {
      semitone -= 1;
    }
  }

  return SEMITONE_TO_CANONICAL_NOTE[((semitone % 12) + 12) % 12];
};

/**
 * Canonical comparison key that treats enharmonic spellings as equivalent
 * while preserving chord quality information.
 */
export const getChordComparisonKey = (chord: string): string => {
  const normalizedChord = normalizeChord(chord);

  if (!normalizedChord || normalizedChord === 'N') {
    return normalizedChord;
  }

  const [rawChordPart, rawBassPart] = normalizedChord.split('/');
  const rootMatch = rawChordPart.match(/^([A-G](?:##|bb|#|b)?)(.*)$/);

  if (!rootMatch) {
    return normalizedChord;
  }

  const [, root, quality = ''] = rootMatch;
  const canonicalRoot = getCanonicalPitchClass(root);
  const canonicalBass = rawBassPart ? getCanonicalPitchClass(rawBassPart) : '';
  const canonicalChord = `${canonicalRoot}${quality}`;

  return canonicalBass ? `${canonicalChord}/${canonicalBass}` : canonicalChord;
};

/**
 * Builds a map from each visual beat index to the aligned chord-group index.
 *
 * When an authoritative reference sequence is provided, this performs a monotonic
 * forward alignment so visible chord groups can skip over cached sequence groups
 * that do not appear in the rendered grid. This keeps original/corrected toggles
 * stable even when the cached sequence contains extra groups.
 */
export const buildChordSequenceIndexMap = (
  shiftedChords: string[],
  referenceSequence?: string[]
): number[] => {
  const map = Array.from({ length: shiftedChords.length }, () => -1);

  const groups: Array<{ start: number; end: number; normalizedChord: string }> = [];
  let groupStart = -1;
  let lastChord: string | null = null;

  shiftedChords.forEach((chord, index) => {
    const normalizedChord = getChordComparisonKey(chord);
    const isPadding = normalizedChord === '';

    if (isPadding) {
      if (groupStart >= 0 && lastChord !== null) {
        groups.push({ start: groupStart, end: index, normalizedChord: lastChord });
      }
      groupStart = -1;
      lastChord = null;
      return;
    }

    if (normalizedChord !== lastChord) {
      if (groupStart >= 0 && lastChord !== null) {
        groups.push({ start: groupStart, end: index, normalizedChord: lastChord });
      }
      groupStart = index;
      lastChord = normalizedChord;
    }
  });

  if (groupStart >= 0 && lastChord !== null) {
    groups.push({ start: groupStart, end: shiftedChords.length, normalizedChord: lastChord });
  }

  if (!referenceSequence?.length) {
    groups.forEach((group, sequenceIndex) => {
      const mappedIndex = group.normalizedChord === 'N' ? -1 : sequenceIndex;
      for (let i = group.start; i < group.end; i += 1) {
        map[i] = mappedIndex;
      }
    });
    return map;
  }

  const normalizedReference = referenceSequence.map(getChordComparisonKey);
  let referenceIndex = -1;

  groups.forEach((group) => {
    let matchedIndex = -1;

    for (let i = referenceIndex + 1; i < normalizedReference.length; i += 1) {
      if (normalizedReference[i] === group.normalizedChord) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      matchedIndex = referenceIndex + 1 < normalizedReference.length ? referenceIndex + 1 : referenceIndex;
    }

    if (matchedIndex >= 0) {
      referenceIndex = matchedIndex;
    }

    const mappedIndex = group.normalizedChord === 'N' ? -1 : matchedIndex;
    for (let i = group.start; i < group.end; i += 1) {
      map[i] = mappedIndex;
    }
  });

  return map;
};

/**
 * Calculates optimal beat shift for chord alignment with downbeats
 * Uses scoring algorithm to find shift that maximizes chord changes on downbeats
 */
export const calculateOptimalShift = (
  chords: string[], 
  timeSignature: number,
  hasPadding: boolean = false,
  shiftCount: number = 0
): number => {
  // Use the shift count from backend if available, otherwise calculate
  if (hasPadding && shiftCount !== undefined) {
    return shiftCount;
  }

  if (chords.length === 0) {
    return 0;
  }

  let bestShift = 0;
  let maxChordChanges = 0;

  // Test each possible shift value (0 to timeSignature-1)
  for (let shift = 0; shift < timeSignature; shift++) {
    let chordChangeCount = 0;

    // Check each beat position after applying the shift
    for (let i = shift; i < chords.length; i++) {
      const currentChord = chords[i];
      const previousChord = i > shift ? chords[i - 1] : '';

      // Detect chord change: current chord differs from previous beat's chord
      const isChordChange = currentChord && currentChord !== '' &&
                           currentChord !== previousChord && previousChord !== '' &&
                           currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

      // Calculate beat position in measure after shift
      const beatInMeasure = ((i + shift) % timeSignature) + 1;
      const isDownbeat = beatInMeasure === 1;

      // Score: chord change that occurs on a downbeat
      if (isChordChange && isDownbeat) {
        chordChangeCount++;
      }
    }

    if (chordChangeCount > maxChordChanges) {
      maxChordChanges = chordChangeCount;
      bestShift = shift;
    } else if (chordChangeCount === maxChordChanges && shift < bestShift) {
      // When tied, prefer the smaller shift value (earliest alignment)
      bestShift = shift;
    }
  }

  return bestShift;
};

/**
 * Applies chord corrections at display time
 */
export const getDisplayChord = (
  originalChord: string,
  visualIndex: number | undefined,
  showCorrectedChords: boolean,
  sequenceCorrections: SequenceCorrections | null,
  chordGroupOccurrenceMap: number[],
  chordOccurrenceCorrectionMap: Record<string, Record<number, string>>,
  chordSequenceIndexMap?: number[]
): { chord: string; wasCorrected: boolean } => {
  if (!originalChord) {
    return { chord: originalChord, wasCorrected: false };
  }

  if (sequenceCorrections && visualIndex !== undefined && chordSequenceIndexMap) {
    const sequenceIndex = chordSequenceIndexMap[visualIndex] ?? -1;

    if (sequenceIndex >= 0) {
      const sequenceOriginal = sequenceCorrections.originalSequence[sequenceIndex];
      const sequenceCorrected = sequenceCorrections.correctedSequence[sequenceIndex];

      if (!showCorrectedChords) {
        return {
          chord: sequenceOriginal ?? originalChord,
          wasCorrected: false,
        };
      }

      if (sequenceCorrected) {
        return {
          chord: sequenceCorrected,
          wasCorrected: normalizeChord(sequenceCorrected) !== normalizeChord(sequenceOriginal ?? originalChord),
        };
      }
    }
  }

  // Early return when corrections are disabled and no authoritative sequence override is available
  if (!showCorrectedChords) {
    return { chord: originalChord, wasCorrected: false };
  }
  
  // Duplicate-aware sequence-based corrections
  if (sequenceCorrections && visualIndex !== undefined) {
    const targetOccurrence = chordGroupOccurrenceMap[visualIndex] ?? 0;
    const normalizedOriginalChord = getChordComparisonKey(originalChord);

    if (targetOccurrence > 0) {
      const corrected = chordOccurrenceCorrectionMap[normalizedOriginalChord]?.[targetOccurrence];
      if (corrected) {
        return {
          chord: corrected,
          wasCorrected: normalizeChord(corrected) !== normalizeChord(originalChord),
        };
      }
    }
  }

  return { chord: originalChord, wasCorrected: false };
};

/**
 * Determines if a beat should show a chord label (avoids duplicate labels)
 */
export const shouldShowChordLabel = (index: number, shiftedChords: string[]): boolean => {
  // Always show the first non-empty chord
  if (index === 0) {
    return shiftedChords[index] !== '';
  }

  // For shifted array, check against the previous non-empty chord
  if (index < shiftedChords.length && index - 1 >= 0) {
    const currentChord = shiftedChords[index];
    const previousChord = shiftedChords[index - 1];

    // Don't show label for empty cells
    if (currentChord === '') {
      return false;
    }

    // Special handling for N.C. (No Chord) to prevent duplicate rest symbols
    if (currentChord === 'N.C.' || currentChord === 'N/C' || currentChord === 'N') {
      // Look back to find the last non-empty chord
      for (let i = index - 1; i >= 0; i--) {
        const prevChord = shiftedChords[i];
        if (prevChord !== '') {
          // Show N.C. label only if the previous non-empty chord was not also N.C.
          return prevChord !== 'N.C.' && prevChord !== 'N/C' && prevChord !== 'N';
        }
      }
      return true;
    }

    // Show label only if chord changed from previous beat
    return currentChord !== previousChord;
  }

  return shiftedChords[index] !== '';
};

/**
 * Builds a map of each visual beat index to the N-th occurrence of its chord group
 */
export const buildChordOccurrenceMap = (shiftedChords: string[]): number[] => {
  const map: number[] = [];
  const occurrence: Record<string, number> = {};
  let lastChord: string | null = null;

  shiftedChords.forEach((ch, idx) => {
    const normalizedChord = getChordComparisonKey(ch);
    const isRest = normalizedChord === '' || normalizedChord === 'N';

    if (isRest) {
      lastChord = null;
      map[idx] = 0;
      return;
    }

    if (normalizedChord !== lastChord) {
      occurrence[normalizedChord] = (occurrence[normalizedChord] || 0) + 1;
      lastChord = normalizedChord;
    }

    map[idx] = occurrence[normalizedChord];
  });

  return map;
};

/**
 * Precomputes corrections for each chord occurrence
 */
export const buildChordOccurrenceCorrectionMap = (
  sequenceCorrections: SequenceCorrections | null
): Record<string, Record<number, string>> => {
  const map: Record<string, Record<number, string>> = {};

  if (!sequenceCorrections) return map;

  const { originalSequence, correctedSequence } = sequenceCorrections;
  const occCounter: Record<string, number> = {};
  let previousNormalizedChord: string | null = null;

  for (let i = 0; i < originalSequence.length; i++) {
    const chord = getChordComparisonKey(originalSequence[i]);
    const corrected = correctedSequence[i];
    const isRest = chord === '' || chord === 'N';

    if (isRest) {
      previousNormalizedChord = null;
      continue;
    }

    const isGroupStart = chord !== previousNormalizedChord;

    if (isGroupStart) {
      occCounter[chord] = (occCounter[chord] || 0) + 1;
      const occ = occCounter[chord];
      if (corrected) {
        if (!map[chord]) map[chord] = {};
        map[chord][occ] = corrected;
      }
    }

    previousNormalizedChord = chord;
  }

  return map;
};

/**
 * Creates shifted chord array with optimal alignment
 */
export const createShiftedChords = (
  chords: string[],
  hasPadding: boolean,
  timeSignature: number,
  shiftCount: number = 0
): string[] => {
  if (hasPadding) {
    // Backend already provided correctly ordered chords with padding/shift
    return chords;
  } else {
    // Apply ChordGrid's own shift logic
    const computedOptimalShift = calculateOptimalShift(chords, timeSignature, hasPadding, shiftCount);
    return chords.length > 0 ? [
      ...Array(computedOptimalShift).fill(''), // Add empty cells at the beginning
      ...chords // Original chords follow after the shift
    ] : chords;
  }
};
