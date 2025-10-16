/**
 * Pure utility functions for chord grid styling and layout
 * Extracted from ChordGrid component for reusability and testability
 */

export interface GridLayoutConfig {
  measuresPerRow: number;
  cellsPerRow: number;
  totalRows: number;
}

/**
 * Dynamic font sizing system based on cell size and chord complexity
 */
export const getDynamicFontSize = (cellSize: number, chordLength: number = 1): string => {
  if (cellSize === 0) return 'text-sm'; // Default fallback

  // Base font size calculation: scale with cell size
  let baseFontSize: number;

  if (cellSize < 50) {
    baseFontSize = 9; // Very small cells (mobile, complex time signatures)
  } else if (cellSize < 70) {
    baseFontSize = 11; // Small cells (mobile optimized)
  } else if (cellSize < 90) {
    baseFontSize = 13; // Medium cells
  } else if (cellSize < 110) {
    baseFontSize = 15; // Large cells
  } else {
    baseFontSize = 17; // Very large cells (wide screens)
  }

  // Adjust for chord complexity (longer chord names get slightly smaller fonts)
  if (chordLength > 4) {
    baseFontSize = Math.max(8, baseFontSize - 2);
  } else if (chordLength > 2) {
    baseFontSize = Math.max(8, baseFontSize - 1);
  }

  // Convert to Tailwind CSS classes
  if (baseFontSize <= 9) return 'text-xs';
  if (baseFontSize <= 11) return 'text-sm';
  if (baseFontSize <= 13) return 'text-base';
  if (baseFontSize <= 15) return 'text-lg';
  return 'text-xl';
};

/**
 * Generates CSS grid columns class based on beats per measure
 */
export const getGridColumnsClass = (beatsPerMeasure: number): string => {
  switch (beatsPerMeasure) {
    case 2: return 'grid-cols-2';
    case 3: return 'grid-cols-3';
    case 4: return 'grid-cols-4';
    case 5: return 'grid-cols-5';
    case 6: return 'grid-cols-6';
    case 7: return 'grid-cols-7';
    case 8: return 'grid-cols-8';
    case 9: return 'grid-cols-9';
    case 10: return 'grid-cols-10';
    case 11: return 'grid-cols-11';
    case 12: return 'grid-cols-12';
    default:
      // For unusual time signatures, fall back to a flexible grid
      return 'grid-cols-4'; // Default fallback
  }
};

/**
 * Generates chord cell styling classes
 */
export const getChordStyle = (
  chord: string,
  isCurrentBeat: boolean,
  beatIndex: number,
  isClickable: boolean,
  hasPickupBeats: boolean,
  timeSignature: number,
  pickupBeatsCount: number
): string => {
  // Clean base classes with minimal styling
  // CRITICAL: relative positioning required for absolute positioned beat number overlay
  const baseClasses = `relative flex flex-col items-start justify-center aspect-square transition-colors duration-150 border border-gray-300 dark:border-gray-600 rounded-sm overflow-hidden ${
    isClickable ? 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-500' : ''
  }`;

  // Determine cell type
  const isEmpty = chord === '';
  const isPickupBeat = hasPickupBeats && beatIndex < timeSignature && beatIndex >= (timeSignature - pickupBeatsCount);

  // Clean default styling
  let classes = `${baseClasses}`;
  let textColor = "text-gray-800 dark:text-gray-100";

  // Default colors
  classes += " bg-white dark:bg-content-bg";

  // Subtle hover effects for clickable cells
  if (isClickable) {
    classes += " hover:bg-gray-50 dark:hover:bg-gray-700";
  }

  // Ensure outline doesn't get clipped by parent overflow-hidden when highlighted
  classes += " outline-0 outline-offset-0";

  // Clean empty cell styling with solid colors
  if (isEmpty) {
    classes = `${baseClasses} bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600`;
    textColor = "text-gray-600 dark:text-gray-300";

    if (isClickable) {
      classes += " hover:bg-gray-150 dark:hover:bg-gray-650";
    }
  }
  // Clean pickup beat styling with solid colors
  else if (isPickupBeat) {
    classes = `${baseClasses} bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700`;
    textColor = "text-blue-800 dark:text-blue-100";

    if (isClickable) {
      classes += " hover:bg-blue-100 dark:hover:bg-blue-800";
    }
  }

  // Current beat: single border color and subtle background, no double borders
  if (isCurrentBeat) {
    const highlightBase = `${baseClasses} ${isEmpty ? '' : ''}`;
    if (isEmpty) {
      classes = `${highlightBase} bg-gray-200 dark:bg-gray-600 border-blue-600 dark:border-blue-400`;
      textColor = "text-gray-600 dark:text-gray-300";
    } else {
      classes = `${highlightBase} bg-blue-100 dark:bg-blue-800 border-blue-600 dark:border-blue-400`;
      textColor = "text-blue-900 dark:text-blue-100";
    }
  }

  return `${classes} ${textColor}`;
};

/**
 * Calculates responsive grid layout configuration
 */
export const calculateGridLayout = (
  isUploadPage: boolean,
  timeSignature: number,
  chordsLength: number,
  containerWidth: number,
  screenWidth: number,
  isChatbotOpen: boolean,
  isLyricsPanelOpen: boolean
): GridLayoutConfig => {
  // Special case for upload page: use 4 measures (16 cells) per row for better spacing
  if (isUploadPage) {
    return {
      measuresPerRow: 4,
      cellsPerRow: 4 * timeSignature,
      totalRows: Math.ceil(chordsLength / (4 * timeSignature))
    };
  }

  // Determine container size category based on actual container width
  const effectiveWidth = containerWidth > 0 ? containerWidth : screenWidth;
  const isMobilePortrait = effectiveWidth < 375;
  const isMobileLandscape = effectiveWidth >= 375 && effectiveWidth < 768;
  const isTablet = effectiveWidth >= 768 && effectiveWidth < 1024;
  const isDesktop = effectiveWidth >= 1024;

  // Check if any panel is open
  const anyPanelOpen = isChatbotOpen || isLyricsPanelOpen;

  // Responsive algorithm: Consistent 16-20 cells per row target
  let targetCellsPerRow: number;

  if (isMobilePortrait) {
    targetCellsPerRow = anyPanelOpen ? 8 : 12;
  } else if (isMobileLandscape) {
    targetCellsPerRow = anyPanelOpen ? 12 : 16;
  } else if (isTablet) {
    targetCellsPerRow = anyPanelOpen ? 16 : 20;
  } else if (isDesktop) {
    targetCellsPerRow = anyPanelOpen ? 16 : 20;
  } else { // Large desktop
    targetCellsPerRow = anyPanelOpen ? 20 : 24;
  }

  // Calculate measures per row based on target cells
  let measuresPerRow = Math.max(1, Math.floor(targetCellsPerRow / timeSignature));

  // Apply time signature complexity limits for readability
  if (timeSignature >= 7) {
    const maxMeasures = anyPanelOpen ? 2 : 3;
    measuresPerRow = Math.min(measuresPerRow, maxMeasures);
  } else if (timeSignature >= 5) {
    const maxMeasures = anyPanelOpen ? 3 : 4;
    measuresPerRow = Math.min(measuresPerRow, maxMeasures);
  }

  // Minimum cell size constraint
  const DESKTOP_CELL_SIZE = 80;
  const MIN_CELL_SIZE = DESKTOP_CELL_SIZE * 0.7;
  const MIN_TOUCH_TARGET = 44;
  const EFFECTIVE_MIN_SIZE = Math.max(MIN_CELL_SIZE, MIN_TOUCH_TARGET);

  const availableWidth = effectiveWidth * 0.95;
  const gapSize = effectiveWidth < 640 ? 4 : 8;
  const maxCellsWithMinSize = Math.floor(
    (availableWidth - (timeSignature - 1) * gapSize) / EFFECTIVE_MIN_SIZE
  );
  const maxMeasuresWithMinSize = Math.floor(maxCellsWithMinSize / timeSignature);

  // Apply minimum cell size constraint
  if (maxMeasuresWithMinSize > 0 && maxMeasuresWithMinSize < measuresPerRow) {
    measuresPerRow = maxMeasuresWithMinSize;
  }

  const finalMeasuresPerRow = Math.max(1, measuresPerRow);

  return {
    measuresPerRow: finalMeasuresPerRow,
    cellsPerRow: finalMeasuresPerRow * timeSignature,
    totalRows: Math.ceil(chordsLength / (finalMeasuresPerRow * timeSignature))
  };
};
