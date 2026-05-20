"use client";

import React, { useEffect, useRef } from "react";
import { usePlaybackStore } from "@/stores/playbackStore";

interface BeatHighlighterProps {
  cellRefsMap: React.RefObject<Map<number, HTMLElement>>;
}

/**
 * BeatHighlighter
 *
 * Lightweight side-effect component that subscribes to the global
 * currentBeatIndex via Zustand and updates DOM classes on the grid
 * without causing ChordGrid or ChordCell re-renders.
 */
const BeatHighlighter: React.FC<BeatHighlighterProps> = ({ cellRefsMap }) => {
  const previousBeatRef = useRef<number>(-1);
  const releaseTimersRef = useRef<Map<HTMLElement, number>>(new Map());

  useEffect(() => {
    const releaseTimers = releaseTimersRef.current;
    const cellRefs = cellRefsMap.current;

    const clearReleaseTimer = (cell: HTMLElement) => {
      const releaseTimer = releaseTimers.get(cell);
      if (releaseTimer !== undefined) {
        window.clearTimeout(releaseTimer);
        releaseTimers.delete(cell);
      }
    };

    const applyBeatHighlight = (currentBeatIndex: number) => {
      const previousBeatIndex = previousBeatRef.current;

      if (currentBeatIndex < 0) {
        if (previousBeatIndex >= 0) {
          const prevCell = cellRefsMap.current?.get(previousBeatIndex);
          if (prevCell) {
            clearReleaseTimer(prevCell);
            prevCell.classList.remove("current-beat-highlight", "beat-highlight-releasing");
          }
        }
        previousBeatRef.current = -1;
        return;
      }

      // Remove highlight from the previously tracked cell
      if (previousBeatIndex >= 0 && previousBeatIndex !== currentBeatIndex) {
        const prevCell = cellRefsMap.current?.get(previousBeatIndex);
        if (prevCell) {
          clearReleaseTimer(prevCell);
          prevCell.classList.remove("current-beat-highlight");
          prevCell.classList.add("beat-highlight-releasing");

          const releaseTimer = window.setTimeout(() => {
            prevCell.classList.remove("beat-highlight-releasing");
            releaseTimers.delete(prevCell);
          }, 1100);
          releaseTimers.set(prevCell, releaseTimer);
        }
      }

      // Highlight the current cell via direct ref lookup
      const currentCell = cellRefsMap.current?.get(currentBeatIndex);
      if (currentCell) {
        clearReleaseTimer(currentCell);
        currentCell.classList.remove("beat-highlight-releasing");
        currentCell.classList.add("current-beat-highlight");
      }

      previousBeatRef.current = currentBeatIndex;
    };

    applyBeatHighlight(usePlaybackStore.getState().currentBeatIndex);

    const unsubscribe = usePlaybackStore.subscribe((state, previousState) => {
      if (state.currentBeatIndex !== previousState.currentBeatIndex) {
        applyBeatHighlight(state.currentBeatIndex);
      }
    });

    return () => {
      unsubscribe();
      releaseTimers.forEach((timerId) => window.clearTimeout(timerId));
      releaseTimers.clear();

      const previousBeatIndex = previousBeatRef.current;
      if (previousBeatIndex >= 0) {
        const prevCell = cellRefs?.get(previousBeatIndex);
        prevCell?.classList.remove("current-beat-highlight", "beat-highlight-releasing");
      }
      previousBeatRef.current = -1;
    };
  }, [cellRefsMap]);

  return null;
};

export default BeatHighlighter;
