import { useState, useEffect, useMemo, useCallback } from 'react';
import { calculateGridLayout, getDynamicFontSize, getGridColumnsClass, GridLayoutConfig } from '@/utils/chordStyling';

/**
 * Custom hook for managing ChordGrid layout and sizing
 * Consolidates layout calculations, responsive behavior, and sizing logic
 */
export const useChordGridLayout = (
  isUploadPage: boolean,
  timeSignature: number,
  chordsLength: number,
  isChatbotOpen: boolean,
  isLyricsPanelOpen: boolean
) => {
  // Container and screen dimensions
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [screenWidth, setScreenWidth] = useState<number>(0);
  const [cellSize, setCellSize] = useState<number>(80);

  // Initialize screen width
  useEffect(() => {
    const updateScreenWidth = () => {
      setScreenWidth(window.innerWidth);
    };

    updateScreenWidth();
    window.addEventListener('resize', updateScreenWidth);
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
    return () => resizeObserver.disconnect();
  }, []);

  // Grid layout configuration
  const gridLayoutConfig = useMemo((): GridLayoutConfig => {
    return calculateGridLayout(
      isUploadPage,
      timeSignature,
      chordsLength,
      containerWidth,
      screenWidth,
      isChatbotOpen,
      isLyricsPanelOpen
    );
  }, [isUploadPage, timeSignature, chordsLength, containerWidth, screenWidth, isChatbotOpen, isLyricsPanelOpen]);

  // Calculate cell size based on layout
  const calculatedCellSize = useMemo(() => {
    if (containerWidth === 0) return 80; // Default fallback

    const { measuresPerRow } = gridLayoutConfig;
    const totalCells = measuresPerRow * timeSignature;
    const gapSize = screenWidth < 640 ? 4 : 8; // sm:gap-2 vs gap-1
    const totalGaps = (totalCells - 1) * gapSize;
    const availableWidth = containerWidth * 0.95; // Account for padding
    const cellWidth = Math.floor((availableWidth - totalGaps) / totalCells);

    // Ensure minimum cell size for touch targets
    const MIN_CELL_SIZE = 44;
    return Math.max(cellWidth, MIN_CELL_SIZE);
  }, [containerWidth, screenWidth, gridLayoutConfig, timeSignature]);

  // Update cell size when calculated size changes
  useEffect(() => {
    setCellSize(calculatedCellSize);
  }, [calculatedCellSize]);

  // Memoized utility functions
  const getDynamicFontSizeLocal = useCallback((chordLength: number = 1): string => {
    return getDynamicFontSize(cellSize, chordLength);
  }, [cellSize]);

  const getGridColumnsClassLocal = useCallback((): string => {
    return getGridColumnsClass(timeSignature);
  }, [timeSignature]);

  // Grouped measures calculation
  const groupedByMeasure = useMemo(() => {
    if (chordsLength === 0) return [];

    const { measuresPerRow } = gridLayoutConfig;
    const groups = [];
    
    for (let i = 0; i < chordsLength; i += timeSignature) {
      const measureChords = [];
      for (let j = 0; j < timeSignature; j++) {
        measureChords.push(i + j);
      }
      groups.push({
        measureIndex: Math.floor(i / timeSignature),
        chordIndices: measureChords,
        rowIndex: Math.floor(groups.length / measuresPerRow)
      });
    }
    
    return groups;
  }, [chordsLength, timeSignature, gridLayoutConfig]);

  return {
    // Layout state
    containerWidth,
    screenWidth,
    cellSize,
    gridLayoutConfig,
    groupedByMeasure,
    
    // Utility functions
    getDynamicFontSize: getDynamicFontSizeLocal,
    getGridColumnsClass: getGridColumnsClassLocal,
    
    // Refs and handlers
    containerRef,
  };
};
