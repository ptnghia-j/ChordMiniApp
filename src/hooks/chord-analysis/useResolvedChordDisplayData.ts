import { useMemo } from 'react';

import { useIsPitchShiftEnabled } from '@/stores/uiStore';
import { useTransposedChordData, type ChordGridData } from '@/hooks/chord-analysis/useTransposedChordData';
import {
  buildChordOccurrenceCorrectionMap,
  buildChordOccurrenceMap,
  buildChordSequenceIndexMap,
  getDisplayChord,
} from '@/utils/chordProcessing';

interface SequenceCorrections {
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

interface UseResolvedChordDisplayDataProps {
  chordGridData: ChordGridData | null;
  showCorrectedChords: boolean;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: SequenceCorrections | null;
}

interface UseResolvedChordDisplayDataReturn {
  resolvedChordGridData: ChordGridData | null;
  displayedChords: string[];
  isPitchShiftActive: boolean;
  effectiveShowCorrectedChords: boolean;
  effectiveChordCorrections: Record<string, string> | null;
  effectiveSequenceCorrections: SequenceCorrections | null;
}

const NO_CHORD_VALUES = new Set(['', 'N.C.', 'N', 'N/C', 'NC']);

export const useResolvedChordDisplayData = ({
  chordGridData,
  showCorrectedChords,
  chordCorrections = null,
  sequenceCorrections = null,
}: UseResolvedChordDisplayDataProps): UseResolvedChordDisplayDataReturn => {
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const { transposedChordGridData } = useTransposedChordData({
    chordGridData,
    correctedSequence: sequenceCorrections?.correctedSequence ?? null,
  });

  const resolvedChordGridData = transposedChordGridData ?? chordGridData;
  const isPitchShiftActive = isPitchShiftEnabled;
  const effectiveShowCorrectedChords = isPitchShiftActive ? false : showCorrectedChords;
  const effectiveChordCorrections = isPitchShiftActive ? null : chordCorrections;
  const effectiveSequenceCorrections = isPitchShiftActive ? null : sequenceCorrections;

  const displayedChords = useMemo(() => {
    if (!resolvedChordGridData) {
      return [];
    }

    const chords = resolvedChordGridData.chords;

    if (effectiveSequenceCorrections) {
      const chordGroupOccurrenceMap = buildChordOccurrenceMap(chords);
      const chordOccurrenceCorrectionMap = buildChordOccurrenceCorrectionMap(effectiveSequenceCorrections);
      const chordSequenceIndexMap = buildChordSequenceIndexMap(
        chords,
        effectiveSequenceCorrections.originalSequence,
        resolvedChordGridData.originalAudioMapping
      );

      return chords.map((chord, index) => getDisplayChord(
        chord,
        index,
        effectiveShowCorrectedChords,
        effectiveSequenceCorrections,
        chordGroupOccurrenceMap,
        chordOccurrenceCorrectionMap,
        chordSequenceIndexMap,
      ).chord);
    }

    if (effectiveShowCorrectedChords && effectiveChordCorrections) {
      return chords.map((chord) => {
        if (!chord || NO_CHORD_VALUES.has(chord)) {
          return chord;
        }

        const rootNote = chord.includes(':')
          ? chord.split(':')[0]
          : (chord.match(/^([A-G][#b]?)/)?.[1] || chord);
        const correction = effectiveChordCorrections[rootNote];

        return correction ? chord.replace(rootNote, correction) : chord;
      });
    }

    return chords;
  }, [
    resolvedChordGridData,
    effectiveSequenceCorrections,
    effectiveShowCorrectedChords,
    effectiveChordCorrections,
  ]);

  return {
    resolvedChordGridData,
    displayedChords,
    isPitchShiftActive,
    effectiveShowCorrectedChords,
    effectiveChordCorrections,
    effectiveSequenceCorrections,
  };
};
