import { useState, useEffect, useCallback } from 'react';

export interface ChordGridState {
  cellSize: number;
  containerWidth: number;
  screenWidth: number;
  containerRef: (node: HTMLDivElement | null) => void;
}

/**
 * Custom hook for managing ChordGrid component state
 * Handles container dimensions, cell sizing, and resize observers
 */
export const useChordGridState = (): ChordGridState => {
  const [cellSize] = useState<number>(80);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [screenWidth, setScreenWidth] = useState<number>(0);

  // Initialize screen width
  useEffect(() => {
    const updateScreenWidth = () => {
      setScreenWidth(window.innerWidth);
    };

    // Set initial value
    updateScreenWidth();

    // Add event listener
    window.addEventListener('resize', updateScreenWidth);

    // Cleanup
    return () => window.removeEventListener('resize', updateScreenWidth);
  }, []);

  // Container resize observer
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setContainerWidth(width);
      }
    });

    resizeObserver.observe(node);

    // Return cleanup function
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return {
    cellSize,
    containerWidth,
    screenWidth,
    containerRef,
  };
};
