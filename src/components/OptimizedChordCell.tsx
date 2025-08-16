'use client';

import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useChordGrid } from '@/contexts/ChordGridContext';

interface OptimizedChordCellProps {
  chord: string;
  globalIndex: number;
  cellSize: number;
  showChordLabel: boolean;
  isEmpty: boolean;
  displayChord: string;
  wasCorrected: boolean;
  segmentationColor?: string;
  romanNumeral?: string;
  editedChord?: string;
}

/**
 * Custom comparison function for React.memo
 * Only re-render if props that actually affect the visual output change
 */
const arePropsEqual = (
  prevProps: OptimizedChordCellProps,
  nextProps: OptimizedChordCellProps
): boolean => {
  // Critical props that always trigger re-render
  if (prevProps.displayChord !== nextProps.displayChord) return false;
  if (prevProps.editedChord !== nextProps.editedChord) return false;
  if (prevProps.globalIndex !== nextProps.globalIndex) return false;

  // Visual props that affect appearance
  if (prevProps.cellSize !== nextProps.cellSize) return false;
  if (prevProps.showChordLabel !== nextProps.showChordLabel) return false;
  if (prevProps.isEmpty !== nextProps.isEmpty) return false;
  if (prevProps.wasCorrected !== nextProps.wasCorrected) return false;
  if (prevProps.segmentationColor !== nextProps.segmentationColor) return false;
  if (prevProps.romanNumeral !== nextProps.romanNumeral) return false;

  // If all critical props are the same, don't re-render
  return true;
};

/**
 * Optimized ChordCell component with advanced memoization
 * Uses context for state management and custom comparison for minimal re-renders
 */
const OptimizedChordCellComponent: React.FC<OptimizedChordCellProps> = ({
  chord,
  globalIndex,
  cellSize,
  showChordLabel,
  isEmpty,
  displayChord,
  wasCorrected,
  segmentationColor,
  romanNumeral,
  editedChord,
}) => {
  // Get state and actions from context
  const {
    currentBeatIndex,
    isEditMode,
    showRomanNumerals,
    onBeatClick,
    onChordEdit,
  } = useChordGrid();

  // Derived state
  const isCurrentBeat = currentBeatIndex === globalIndex;
  const isClickable = !isEmpty && !isEditMode;

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(editedChord || displayChord);

  // Update edit value when editedChord changes
  useEffect(() => {
    setEditValue(editedChord || displayChord);
  }, [editedChord, displayChord]);

  // Memoized click handler
  const handleClick = useCallback(() => {
    if (!isClickable) return;
    
    if (isEditMode) {
      setIsEditing(true);
    } else {
      // Calculate timestamp for beat click
      const timestamp = globalIndex * 0.5; // Placeholder calculation
      onBeatClick(globalIndex, timestamp);
    }
  }, [isClickable, isEditMode, globalIndex, onBeatClick]);

  // Memoized edit handlers
  const handleEditSave = useCallback(() => {
    if (editValue !== displayChord) {
      onChordEdit(chord, editValue);
    }
    setIsEditing(false);
  }, [editValue, displayChord, chord, onChordEdit]);

  const handleEditCancel = useCallback(() => {
    setEditValue(editedChord || displayChord);
    setIsEditing(false);
  }, [editedChord, displayChord]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  // Memoized styles
  const cellStyles = useMemo(() => {
    const baseClasses = [
      'relative flex items-center justify-center',
      'border border-gray-300 dark:border-gray-600',
      'transition-all duration-200 ease-in-out',
      'select-none',
    ];

    // Size classes
    baseClasses.push('min-h-[44px]'); // Minimum touch target

    // State-based classes
    if (isCurrentBeat) {
      baseClasses.push(
        'bg-blue-500 text-white border-blue-600',
        'shadow-lg scale-105 z-10'
      );
    } else if (isEmpty) {
      baseClasses.push('bg-gray-100 dark:bg-gray-800');
    } else {
      baseClasses.push(
        'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100',
        'hover:bg-gray-50 dark:hover:bg-gray-600'
      );
    }

    // Clickable state
    if (isClickable) {
      baseClasses.push('cursor-pointer');
    }

    // Correction indicator
    if (wasCorrected) {
      baseClasses.push('ring-2 ring-green-400 ring-opacity-50');
    }

    // Segmentation color
    if (segmentationColor) {
      baseClasses.push(`border-l-4 border-l-[${segmentationColor}]`);
    }

    return baseClasses.join(' ');
  }, [isCurrentBeat, isEmpty, isClickable, wasCorrected, segmentationColor]);

  // Memoized font size calculation
  const fontSize = useMemo(() => {
    const chordLength = displayChord.length;
    if (cellSize < 60) return 'text-xs';
    if (chordLength > 6) return 'text-xs';
    if (chordLength > 4) return 'text-sm';
    return 'text-base';
  }, [cellSize, displayChord.length]);

  // Render edit mode
  if (isEditMode && isEditing) {
    return (
      <div
        className={cellStyles}
        style={{ width: cellSize, height: cellSize }}
      >
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleEditSave}
          className="w-full h-full text-center bg-transparent border-none outline-none text-inherit"
          autoFocus
        />
      </div>
    );
  }

  // Render normal mode
  return (
    <div
      className={cellStyles}
      style={{ width: cellSize, height: cellSize }}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={`Chord ${displayChord} at beat ${globalIndex + 1}`}
    >
      {showChordLabel && !isEmpty && (
        <div className="flex flex-col items-center justify-center w-full h-full">
          {/* Main chord display */}
          <span className={`font-medium ${fontSize} leading-tight`}>
            {displayChord}
          </span>
          
          {/* Roman numeral display */}
          {showRomanNumerals && romanNumeral && (
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {romanNumeral}
            </span>
          )}
          
          {/* Correction indicator */}
          {wasCorrected && (
            <div className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full" />
          )}
        </div>
      )}
    </div>
  );
};

// Apply memo with custom comparison
export const OptimizedChordCell = memo(OptimizedChordCellComponent, arePropsEqual);

OptimizedChordCell.displayName = 'OptimizedChordCell';
