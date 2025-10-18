import { useCallback } from 'react';

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
  hasPadding: boolean,
  shiftCount: number,
  paddingCount: number,
  chords: string[],
  originalAudioMapping?: AudioMappingItem[]
): ChordInteractions => {

  // Handle beat click with proper index mapping
  const handleBeatClick = useCallback((globalIndex: number) => {
    if (!onBeatClick) return;

    // Get timestamp for this beat
    let finalTimestamp: number = 0;

    if (originalAudioMapping && originalAudioMapping.length > 0) {
      const mappingEntry = originalAudioMapping.find(item => item.visualIndex === globalIndex);
      if (mappingEntry) {
        finalTimestamp = mappingEntry.timestamp;
      } else {
        const beatTime = beats[globalIndex];
        finalTimestamp = typeof beatTime === 'number' ? beatTime : 0;
      }
    } else {
      const beatTime = beats[globalIndex];
      finalTimestamp = typeof beatTime === 'number' ? beatTime : 0;
    }

    onBeatClick(globalIndex, finalTimestamp);
  }, [onBeatClick, beats, originalAudioMapping]);

  // Determine if a beat cell is clickable
  const isClickable = useCallback((globalIndex: number, chord: string): boolean => {
    if (!onBeatClick) return false;

    // Simple check: cell is clickable if it has a valid timestamp AND is not empty
    const timestamp = beats[globalIndex];
    const isEmptyCell = chord === '';
    return typeof timestamp === 'number' && timestamp >= 0 && !isEmptyCell;
  }, [onBeatClick, beats]);

  return {
    handleBeatClick,
    isClickable,
  };
};
