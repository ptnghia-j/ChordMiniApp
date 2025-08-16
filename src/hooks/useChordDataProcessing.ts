import { useMemo } from 'react';
import {
  createShiftedChords,
  buildChordOccurrenceMap,
  buildChordOccurrenceCorrectionMap,
  getDisplayChord,
  shouldShowChordLabel,
  SequenceCorrections
} from '@/utils/chordProcessing';

export interface ChordDataProcessing {
  shiftedChords: string[];
  chordGroupOccurrenceMap: number[];
  chordOccurrenceCorrectionMap: Record<string, Record<number, string>>;
  getDisplayChord: (originalChord: string, visualIndex?: number) => { chord: string; wasCorrected: boolean };
  shouldShowChordLabel: (index: number) => boolean;
}

/**
 * Custom hook for processing chord data and corrections
 * Handles chord shifting, occurrence mapping, and display logic
 */
export const useChordDataProcessing = (
  chords: string[],
  hasPadding: boolean,
  timeSignature: number,
  shiftCount: number,
  showCorrectedChords: boolean,
  sequenceCorrections: SequenceCorrections | null
): ChordDataProcessing => {
  
  // Create shifted chord array with optimal alignment
  const shiftedChords = useMemo(() => {
    return createShiftedChords(chords, hasPadding, timeSignature, shiftCount);
  }, [chords, hasPadding, timeSignature, shiftCount]);

  // Build chord occurrence mapping for corrections
  const chordGroupOccurrenceMap = useMemo(() => {
    return buildChordOccurrenceMap(shiftedChords);
  }, [shiftedChords]);

  // Build chord occurrence correction mapping
  const chordOccurrenceCorrectionMap = useMemo(() => {
    return buildChordOccurrenceCorrectionMap(sequenceCorrections);
  }, [sequenceCorrections]);

  // Chord display function with corrections
  const getDisplayChordLocal = useMemo(() => {
    return (originalChord: string, visualIndex?: number) => {
      return getDisplayChord(
        originalChord,
        visualIndex,
        showCorrectedChords,
        sequenceCorrections,
        chordGroupOccurrenceMap,
        chordOccurrenceCorrectionMap
      );
    };
  }, [showCorrectedChords, sequenceCorrections, chordGroupOccurrenceMap, chordOccurrenceCorrectionMap]);

  // Chord label display logic
  const shouldShowChordLabelLocal = useMemo(() => {
    return (index: number) => {
      return shouldShowChordLabel(index, shiftedChords);
    };
  }, [shiftedChords]);

  return {
    shiftedChords,
    chordGroupOccurrenceMap,
    chordOccurrenceCorrectionMap,
    getDisplayChord: getDisplayChordLocal,
    shouldShowChordLabel: shouldShowChordLabelLocal,
  };
};
