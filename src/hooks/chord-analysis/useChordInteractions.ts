import { useCallback } from 'react';

const SILENT_CHORD_VALUES = new Set(['', 'N', 'N/C', 'N.C.', 'NC']);

export interface ChordInteractions {
  handleBeatClick: (globalIndex: number) => void;
  isClickable: (globalIndex: number, chord: string) => boolean;
}

export interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
  audioIndex: number;
}

/**
 * Custom hook for managing chord grid interactions
 * Handles beat clicking, clickability logic, and user interactions
 */
export const useChordInteractions = (
  onBeatClick: ((beatIndex: number, timestamp: number) => void) | null,
  beats: (number | null)[],
  originalAudioMapping?: AudioMappingItem[]
): ChordInteractions => {
  const resolveTimestampForIndex = useCallback((globalIndex: number): number | null => {
    const mappingEntry = originalAudioMapping?.find(item => item.visualIndex === globalIndex);
    if (mappingEntry && typeof mappingEntry.timestamp === 'number' && mappingEntry.timestamp >= 0) {
      return mappingEntry.timestamp;
    }

    const beatTime = beats[globalIndex];
    return typeof beatTime === 'number' && beatTime >= 0 ? beatTime : null;
  }, [beats, originalAudioMapping]);

  // Handle beat click with proper index mapping
  const handleBeatClick = useCallback((globalIndex: number) => {
    if (!onBeatClick) return;

    const finalTimestamp = resolveTimestampForIndex(globalIndex) ?? 0;
    onBeatClick(globalIndex, finalTimestamp);
  }, [onBeatClick, resolveTimestampForIndex]);

  // Determine if a beat cell is clickable
  const isClickable = useCallback((globalIndex: number, chord: string): boolean => {
    if (!onBeatClick) return false;

    const timestamp = resolveTimestampForIndex(globalIndex);
    if (timestamp === null) return false;

    const normalizedChord = chord.trim();
    const isSilentCell = SILENT_CHORD_VALUES.has(normalizedChord);

    // Silent/padded cells at the start are valid jump targets as long as they
    // resolve to a real timestamp through beat data or original audio mapping.
    return !isSilentCell || timestamp >= 0;
  }, [onBeatClick, resolveTimestampForIndex]);

  return {
    handleBeatClick,
    isClickable,
  };
};
