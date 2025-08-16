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
  if (chord === 'N' || chord === 'N.C.' || chord === 'N/C' || chord === 'NC') {
    return 'N';
  }
  return chord;
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
  chordOccurrenceCorrectionMap: Record<string, Record<number, string>>
): { chord: string; wasCorrected: boolean } => {
  // Early return when corrections are disabled or chord is empty
  if (!showCorrectedChords || !originalChord) {
    return { chord: originalChord, wasCorrected: false };
  }
  
  // Duplicate-aware sequence-based corrections
  if (sequenceCorrections && visualIndex !== undefined) {
    const targetOccurrence = chordGroupOccurrenceMap[visualIndex] ?? 0;

    if (targetOccurrence > 0) {
      const corrected = chordOccurrenceCorrectionMap[originalChord]?.[targetOccurrence];
      if (corrected) {
        return { chord: corrected, wasCorrected: true };
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
    const isRest = ch === '' || ch === 'N.C.' || ch === 'N/C' || ch === 'N';

    if (!isRest && ch !== lastChord) {
      occurrence[ch] = (occurrence[ch] || 0) + 1;
      lastChord = ch;
    }

    map[idx] = !isRest ? occurrence[ch] : 0; // 0 occurrence for rests
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

  for (let i = 0; i < originalSequence.length; i++) {
    const chord = originalSequence[i];
    const prev = i > 0 ? originalSequence[i - 1] : null;
    const isGroupStart = i === 0 || chord !== prev;

    if (isGroupStart) {
      occCounter[chord] = (occCounter[chord] || 0) + 1;
      const occ = occCounter[chord];
      const corrected = correctedSequence[i];
      if (corrected !== chord) {
        if (!map[chord]) map[chord] = {};
        map[chord][occ] = corrected;
      }
    }
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
