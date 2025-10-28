"use client";

import React, { useEffect, useRef } from "react";
import { useCurrentBeatIndex } from "@/stores/playbackStore";

interface BeatHighlighterProps {
  cellRefsMap: React.RefObject<Map<number, HTMLElement>>;
  theme: string;
  isLoopEnabled: boolean;
}

/**
 * BeatHighlighter
 *
 * Lightweight side-effect component that subscribes to the global
 * currentBeatIndex via Zustand and updates DOM classes on the grid
 * without causing ChordGrid or ChordCell re-renders.
 */
const BeatHighlighter: React.FC<BeatHighlighterProps> = ({ cellRefsMap, theme, isLoopEnabled }) => {
  const currentBeatIndex = useCurrentBeatIndex();
  const previousBeatRef = useRef<number>(-1);

  useEffect(() => {
    if (currentBeatIndex === undefined || currentBeatIndex < 0) return;

    // Remove highlight from the previously tracked cell
    if (previousBeatRef.current >= 0 && previousBeatRef.current !== currentBeatIndex) {
      const prevCell = cellRefsMap.current?.get(previousBeatRef.current);
      if (prevCell) prevCell.classList.remove("current-beat-highlight");
    }

    // Highlight the current cell via direct ref lookup
    const currentCell = cellRefsMap.current?.get(currentBeatIndex);
    if (currentCell) {
      currentCell.classList.add("current-beat-highlight");
    }

    previousBeatRef.current = currentBeatIndex;
  }, [currentBeatIndex, theme, isLoopEnabled, cellRefsMap]);

  return null;
};

export default BeatHighlighter;

