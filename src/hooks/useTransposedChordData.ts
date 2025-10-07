/**
 * Custom hook for transposing chord data based on pitch shift state
 * 
 * Applies chord transposition when pitch shift is enabled,
 * ensuring proper enharmonic spelling based on target key.
 */

import { useMemo } from 'react';
import { useUI } from '@/contexts/UIContext';
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
}: UseTransposedChordDataProps): UseTransposedChordDataReturn => {
  const {
    isPitchShiftEnabled,
    pitchShiftSemitones,
    targetKey,
  } = useUI();

  // Determine if transposition should be applied
  const shouldTranspose = isPitchShiftEnabled && pitchShiftSemitones !== 0;

  // Apply transposition to chord grid data
  const transposedChordGridData = useMemo(() => {
    if (!chordGridData || !shouldTranspose) {
      return chordGridData;
    }

    console.log(`🎵 Transposing ${chordGridData.chords.length} chords by ${pitchShiftSemitones} semitones to key ${targetKey}`);

    // Transpose all chords in the grid
    const transposedChords = chordGridData.chords.map((chord, index) => {
      const transposed = transposeChord(chord, pitchShiftSemitones, targetKey);
      // Log real slash chords for debugging (exclude N/C and N.C.)
      if (chord.includes('/') && !chord.match(/^N[./]C$/i) && index < 10) {
        console.log(`  ${chord} → ${transposed}`);
      }
      return transposed;
    });

    return {
      ...chordGridData,
      chords: transposedChords,
    };
  }, [chordGridData, shouldTranspose, pitchShiftSemitones, targetKey]);

  return {
    transposedChordGridData,
    isTransposed: shouldTranspose,
  };
};

