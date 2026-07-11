import { getChordComparisonKey } from '@/utils/chordProcessing';

/**
 * Builds mapping from beat index to chord sequence index for Roman numerals
 */
export const buildBeatToChordSequenceMap = (
  chordsLength: number,
  shiftedChords: string[],
  romanNumeralData: { analysis: string[] } | null,
  sequenceCorrections: { correctedSequence: string[] } | null
): Record<number, number> => {
  if (chordsLength === 0 || !romanNumeralData?.analysis) return {};

  const map: Record<number, number> = {};

  // Use corrected sequence if available, otherwise use original chord sequence for mapping
  const referenceSequence = sequenceCorrections?.correctedSequence || shiftedChords;
  let sequenceIndex = 0;

  // Helper to identify No Chord / silence representation
  const isNoChord = (label: string): boolean => {
    if (!label) return true;
    const upper = label.trim().toUpperCase();
    return upper === 'N' || upper === 'N.C.' || upper === 'N/C' || upper === 'NC' || upper === 'NO CHORD' || upper === '' || upper === '-';
  };

  // Find the first non-empty chord in shiftedChords to initialize sequenceIndex properly.
  // This handles situations where a short leading N.C. is skipped in shiftedChords.
  let firstChordIndex = -1;
  for (let i = 0; i < shiftedChords.length; i++) {
    if (shiftedChords[i] && shiftedChords[i] !== '') {
      firstChordIndex = i;
      break;
    }
  }

  if (firstChordIndex !== -1) {
    const firstNormalized = getChordComparisonKey(shiftedChords[firstChordIndex]);
    if (sequenceCorrections?.correctedSequence) {
      // Find the first matching chord in the corrected sequence
      for (let i = 0; i < referenceSequence.length; i++) {
        if (getChordComparisonKey(referenceSequence[i]) === firstNormalized) {
          sequenceIndex = i;
          break;
        }
      }
    } else if (!isNoChord(shiftedChords[firstChordIndex])) {
      // Fallback: search for first non-No-Chord Roman numeral in the original analysis sequence
      for (let i = 0; i < romanNumeralData.analysis.length; i++) {
        if (!isNoChord(romanNumeralData.analysis[i])) {
          sequenceIndex = i;
          break;
        }
      }
    }
  }

  let lastNormalizedChord = '';

  for (let beatIndex = 0; beatIndex < shiftedChords.length; beatIndex++) {
    const currentChord = shiftedChords[beatIndex];

    if (!currentChord || currentChord === '') {
      continue;
    }

    const normalizedCurrent = getChordComparisonKey(currentChord);

    // Only advance the sequence index when the chord actually changes
    if (normalizedCurrent !== lastNormalizedChord) {
      if (sequenceCorrections?.correctedSequence) {
        // Using corrected sequence - find the next matching chord
        if (lastNormalizedChord !== '') {
          // Look for the next occurrence of this chord in the corrected sequence
          let found = false;
          for (let i = sequenceIndex + 1; i < referenceSequence.length; i++) {
            const correctedChord = getChordComparisonKey(referenceSequence[i]);
            if (correctedChord === normalizedCurrent) {
              sequenceIndex = i;
              found = true;
              break;
            }
          }

          // If not found ahead, increment by 1 (fallback)
          if (!found) {
            sequenceIndex = Math.min(sequenceIndex + 1, referenceSequence.length - 1);
          }
        }
      } else {
        // Using original sequence - simple mapping based on chord changes
        if (lastNormalizedChord !== '' && sequenceIndex < romanNumeralData.analysis.length - 1) {
          sequenceIndex++;
        }
      }
      lastNormalizedChord = normalizedCurrent;
    }

    // Map this beat to the current sequence index
    if (sequenceIndex < romanNumeralData.analysis.length) {
      map[beatIndex] = sequenceIndex;
    }
  }

  return map;
};
