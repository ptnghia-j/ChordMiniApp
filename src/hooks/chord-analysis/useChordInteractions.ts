import { useCallback } from 'react';

export interface ChordInteractions {
  handleBeatClick: (globalIndex: number) => void;
  isClickable: (globalIndex: number, chord: string, showChordLabel?: boolean) => boolean;
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
  originalAudioMapping?: AudioMappingItem[],
  disabledCellIndices: ReadonlySet<number> = new Set()
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
  const isClickable = useCallback((globalIndex: number, _chord: string, _showChordLabel: boolean = true): boolean => {
    if (!onBeatClick) return false;

    if (disabledCellIndices.has(globalIndex)) return false;

    const timestamp = resolveTimestampForIndex(globalIndex);
    if (timestamp === null) return false;

    return timestamp >= 0;
  }, [onBeatClick, resolveTimestampForIndex, disabledCellIndices]);

  return {
    handleBeatClick,
    isClickable,
  };
};
