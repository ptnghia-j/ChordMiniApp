/**
 * Custom hook for handling loop beat selection logic
 * Manages sequential selection pattern and range expansion
 */

import { useCallback, useRef } from 'react';
import {
  useIsLoopEnabled,
  useLoopStartBeat,
  useLoopEndBeat,
  useSetLoopRange
} from '@/stores/uiStore';

export const useLoopBeatSelection = () => {
  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();
  const setLoopRange = useSetLoopRange();

  // Track selection state: 'start' | 'end' | 'both'
  const selectionStateRef = useRef<'start' | 'end' | 'both'>('start');

  // Handle beat cell click for loop range selection
  const handleLoopBeatClick = useCallback((beatIndex: number) => {
    if (!isLoopEnabled) return;

    // Sequential selection pattern with range expansion logic
    if (selectionStateRef.current === 'start') {
      // First click: set start beat
      setLoopRange(beatIndex, beatIndex);
      selectionStateRef.current = 'end';
    } else if (selectionStateRef.current === 'end') {
      // Second click: set end beat
      if (beatIndex >= loopStartBeat) {
        // Normal case: end >= start
        setLoopRange(loopStartBeat, beatIndex);
      } else {
        // Reverse case: end < start, swap them
        setLoopRange(beatIndex, loopStartBeat);
      }
      selectionStateRef.current = 'both';
    } else {
      // Subsequent clicks: expand range or reset
      // Range expansion logic:
      // - If new beat < current start → expand backward
      // - If new beat > current end → expand forward
      // - Otherwise → reset to new start
      if (beatIndex < loopStartBeat) {
        // Expand range backward
        setLoopRange(beatIndex, loopEndBeat);
      } else if (beatIndex > loopEndBeat) {
        // Expand range forward
        setLoopRange(loopStartBeat, beatIndex);
      } else {
        // Reset to new start beat
        setLoopRange(beatIndex, beatIndex);
        selectionStateRef.current = 'end';
      }
    }
  }, [isLoopEnabled, loopStartBeat, loopEndBeat, setLoopRange]);

  // Check if a beat is in the loop range
  const isInLoopRange = useCallback((beatIndex: number) => {
    if (!isLoopEnabled) return false;
    return beatIndex >= loopStartBeat && beatIndex <= loopEndBeat;
  }, [isLoopEnabled, loopStartBeat, loopEndBeat]);

  return {
    isLoopEnabled,
    loopStartBeat,
    loopEndBeat,
    handleLoopBeatClick,
    isInLoopRange
  };
};

