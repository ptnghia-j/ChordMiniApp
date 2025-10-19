/**
 * Custom hook for transposing chord data based on pitch shift state
 * 
 * Applies chord transposition when pitch shift is enabled,
 * ensuring proper enharmonic spelling based on target key.
 */

import { useMemo } from 'react';
import { useIsPitchShiftEnabled, usePitchShiftSemitones, useTargetKey } from '@/stores/uiStore';
import { transposeChord } from '@/utils/chordTransposition';

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number;
  hasPickupBeats?: boolean;
  pickupBeatsCount?: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

export interface UseTransposedChordDataProps {
  chordGridData: ChordGridData | null;
  correctedSequence?: string[] | null; // Gemini-corrected chords to use as source when available
}

export interface UseTransposedChordDataReturn {
  transposedChordGridData: ChordGridData | null;
  isTransposed: boolean;
}

/**
 * Hook to transpose chord grid data based on pitch shift settings
 */
export const useTransposedChordData = ({
  chordGridData,
  correctedSequence,
}: UseTransposedChordDataProps): UseTransposedChordDataReturn => {
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const targetKey = useTargetKey();

  // Determine if transposition should be applied
  const shouldTranspose = isPitchShiftEnabled && pitchShiftSemitones !== 0;

  // Apply transposition to chord grid data
  const transposedChordGridData = useMemo(() => {
    if (!chordGridData || !shouldTranspose) {
      return chordGridData;
    }

    // Choose source chords: prefer Gemini-corrected sequence when available
    const sourceChords = Array.isArray(correctedSequence) && correctedSequence.length === chordGridData.chords.length
      ? correctedSequence
      : chordGridData.chords;

    // Transpose all chords in the grid
    const transposedChords = sourceChords.map((chord) => {
      return transposeChord(chord, pitchShiftSemitones, targetKey);
    });

    return {
      ...chordGridData,
      chords: transposedChords,
    };
  }, [chordGridData, correctedSequence, shouldTranspose, pitchShiftSemitones, targetKey]);

  return {
    transposedChordGridData,
    isTransposed: shouldTranspose,
  };
};

