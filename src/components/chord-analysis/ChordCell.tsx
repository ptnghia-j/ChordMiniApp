import React, { useState, useEffect, useCallback } from 'react';
import { Varela_Round } from 'next/font/google';
import {
  formatChordWithMusicalSymbols,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';

const varelaRound = Varela_Round({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export interface ChordCellProps {
  chord: string;
  globalIndex: number;
  isCurrentBeat: boolean;
  isClickable: boolean;
  cellSize: number;
  isDarkMode: boolean;
  showChordLabel: boolean;
  isEmpty: boolean;
  displayChord: string;
  wasCorrected: boolean;
  segmentationColor?: string;
  onBeatClick: (globalIndex: number) => void;
  getChordStyle: (chord: string, globalIndex: number, isClickable: boolean) => string;
  getDynamicFontSize: (cellSize: number, chordLength: number) => string;
  isEditMode?: boolean;
  editedChord?: string;
  onChordEdit?: (index: number, newChord: string) => void;
  showRomanNumerals?: boolean;
  romanNumeral?: string | React.ReactElement;
  modulationInfo?: {
    isModulation: boolean;
    fromKey?: string;
    toKey?: string;
  };
  isLoopEnabled?: boolean;
  isInLoopRange?: boolean;
  onLoopBeatClick?: (beatIndex: number) => void;
  accidentalPreference?: 'sharp' | 'flat';
}

/**
 * Custom comparison function for ChordCell memoization
 * Only re-render if props that actually affect the visual output change
 *
 * PERFORMANCE FIX #2: CSS-based beat highlighting
 * Removed isCurrentBeat from comparison - highlighting now handled by CSS
 * This prevents re-renders when currentBeatIndex changes (20 times/second)
 * Expected improvement: 80% reduction in React reconciliation overhead
 */
const areChordCellPropsEqual = (
  prevProps: ChordCellProps,
  nextProps: ChordCellProps
): boolean => {
  // Critical visual props that always trigger re-render if changed
  if (prevProps.displayChord !== nextProps.displayChord) return false;
  if (prevProps.editedChord !== nextProps.editedChord) return false;
  // PERFORMANCE FIX #2: Removed isCurrentBeat comparison - now handled by CSS
  // if (prevProps.isCurrentBeat !== nextProps.isCurrentBeat) return false;
  if (prevProps.globalIndex !== nextProps.globalIndex) return false;

  // Layout and styling props
  if (prevProps.cellSize !== nextProps.cellSize) return false;
  if (prevProps.isDarkMode !== nextProps.isDarkMode) return false;
  if (prevProps.showChordLabel !== nextProps.showChordLabel) return false;
  if (prevProps.isEmpty !== nextProps.isEmpty) return false;
  if (prevProps.wasCorrected !== nextProps.wasCorrected) return false;
  if (prevProps.segmentationColor !== nextProps.segmentationColor) return false;
  if (prevProps.accidentalPreference !== nextProps.accidentalPreference) return false;

  // Roman numerals and modulation
  if (prevProps.showRomanNumerals !== nextProps.showRomanNumerals) return false;
  if (prevProps.romanNumeral !== nextProps.romanNumeral) return false;

  // Modulation info comparison (deep comparison needed)
  const prevMod = prevProps.modulationInfo;
  const nextMod = nextProps.modulationInfo;
  if (prevMod?.isModulation !== nextMod?.isModulation) return false;
  if (prevMod?.fromKey !== nextMod?.fromKey) return false;
  if (prevMod?.toKey !== nextMod?.toKey) return false;

  // Edit mode state
  if (prevProps.isEditMode !== nextProps.isEditMode) return false;
  if (prevProps.isClickable !== nextProps.isClickable) return false;

  // Loop playback state
  if (prevProps.isLoopEnabled !== nextProps.isLoopEnabled) return false;
  if (prevProps.isInLoopRange !== nextProps.isInLoopRange) return false;

  // Ignore callback props (onBeatClick, getChordStyle, getDynamicFontSize, onChordEdit, onLoopBeatClick)
  // These are functions and shouldn't trigger re-renders if they're functionally equivalent

  // If all visual props are the same, skip re-render
  return true;
};

/**
 * Individual chord cell component for the ChordGrid
 * Handles chord display, editing, Roman numerals, and user interactions
 *
 * PERFORMANCE: Uses custom comparison function to prevent unnecessary re-renders
 * Expected improvement: 80-90% reduction in re-renders during playback
 */
export const ChordCell = React.memo<ChordCellProps>(({
  chord,
  globalIndex,
  isClickable,
  cellSize,
  isDarkMode,
  showChordLabel,
  isEmpty,
  displayChord,
  wasCorrected,
  segmentationColor,
  onBeatClick,
  getChordStyle,
  getDynamicFontSize,
  isEditMode = false,
  editedChord,
  onChordEdit,
  showRomanNumerals = false,
  romanNumeral,
  modulationInfo,
  isLoopEnabled = false,
  isInLoopRange = false,
  onLoopBeatClick,
  accidentalPreference
}) => {
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(editedChord || displayChord);

  // Update edit value when editedChord changes
  useEffect(() => {
    setEditValue(editedChord || displayChord);
  }, [editedChord, displayChord]);

  // Memoize click handler to prevent recreation on every render
  const handleClick = useCallback(() => {
    if (isEditMode && !isEmpty) {
      setIsEditing(true);
    } else if (isLoopEnabled && onLoopBeatClick) {
      // Loop mode: handle beat selection for loop range
      onLoopBeatClick(globalIndex);
    } else if (isClickable) {
      onBeatClick(globalIndex);
    }
  }, [isEditMode, isEmpty, isLoopEnabled, onLoopBeatClick, isClickable, onBeatClick, globalIndex]);

  // Handle edit save
  const handleEditSave = useCallback(() => {
    setIsEditing(false);
    if (onChordEdit && editValue !== (editedChord || displayChord)) {
      onChordEdit(globalIndex, editValue);
    }
  }, [onChordEdit, globalIndex, editValue, editedChord, displayChord]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        handleEditSave();
      } else if (e.key === 'Escape') {
        setEditValue(editedChord || displayChord);
        setIsEditing(false);
      }
    } else if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  }, [isEditing, handleEditSave, editedChord, displayChord, isClickable, handleClick]);

  return (
    <div
      id={`chord-${globalIndex}`}
      className={`${getChordStyle(chord, globalIndex, isClickable)} w-full h-full ${
        showRomanNumerals
          ? 'min-h-[3.3rem] sm:min-h-[4.2rem]' // 20% increase when Roman numerals shown
          : 'min-h-[2.75rem] sm:min-h-[3.5rem]'
      } chord-cell`}
      data-beat-index={globalIndex}
      data-is-empty={isEmpty ? "true" : "false"}
      style={{
        // Priority order: current beat (CSS class with !important) > loop range > modulation > segmentation
        // Current beat highlighting is handled purely via CSS (see chord-grid.css)
        // We still apply loop range inline styles even when the cell is the current beat;
        // the CSS class will visually override them while active, and when the beat moves away
        // the loop background remains without requiring a React re-render.
        ...(
          isInLoopRange ? {
            backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)', // Light blue with opacity (blue-500 base)
            border: isDarkMode ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(59, 130, 246, 0.3)'
          } :
          modulationInfo?.isModulation ? {
            backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)', // Light green with opacity (green-500 base)
            border: isDarkMode ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid rgba(34, 197, 94, 0.3)'
          } :
          segmentationColor ? { backgroundColor: segmentationColor } : {}
        )
      }}
      title={
        modulationInfo?.isModulation
          ? `Key change: ${modulationInfo.fromKey} → ${modulationInfo.toKey}`
          : undefined
      }
      onClick={handleClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={handleKeyDown}
      aria-label={isClickable ? `Jump to beat ${globalIndex + 1}${chord ? `, chord ${chord}` : ''}` : undefined}
    >
      {/* Enhanced chord display with pickup beat support and Roman numerals */}
      <div style={getChordContainerStyles()}>
        {!isEmpty && showChordLabel && chord ? (
          isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSave}
              onKeyDown={handleKeyDown}
              className={`${varelaRound.className} ${getDynamicFontSize(cellSize, editValue.length)} leading-tight bg-transparent border-none outline-none text-center w-full`}
              style={{
                ...getChordLabelStyles(),
                maxWidth: '100%',
              }}
              autoFocus
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              {/* Chord label */}
              <div
                // ✅ APPLY FONT: Add the varelaRound class and remove font-medium
                className={`${varelaRound.className} ${
                  showRomanNumerals
                    ? getDynamicFontSize(cellSize * 0.7, (editedChord || displayChord).length) // 30% smaller when Roman numerals shown
                    : getDynamicFontSize(cellSize, (editedChord || displayChord).length)
                } leading-tight ${
                  wasCorrected ? 'text-purple-700 dark:text-purple-300' : ''
                } overflow-hidden text-ellipsis whitespace-nowrap max-w-full ${
                  isEditMode ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-1' : ''
                }`}
                style={{
                  ...getChordLabelStyles(),
                  maxWidth: '100%',
                  textOverflow: 'ellipsis',
                }}
                onClick={isEditMode ? handleClick : undefined}
                title={isEditMode ? `Click to edit: ${editedChord || displayChord}` : (editedChord || displayChord)}
                dangerouslySetInnerHTML={{
                  __html: editedChord
                    ? editedChord // Show raw edited value without formatting
                    : formatChordWithMusicalSymbols(displayChord, isDarkMode, accidentalPreference)
                }}
              />

              {/* FIXED: Roman numeral display with stable layout */}
              {showRomanNumerals && romanNumeral && (
                <div
                  className={`${varelaRound.className} font-semibold leading-tight text-blue-700 dark:text-blue-300 mt-1 max-w-full`}
                  style={{
                    fontSize: `${Math.max(10, cellSize * 0.18)}px`, // Larger, more readable Roman numeral size
                    lineHeight: '1', // FIXED: Consistent line height to prevent layout shifts
                    overflow: 'visible', // Allow superscripts to extend beyond container
                    position: 'relative', // Ensure proper positioning context for absolute children
                    minHeight: '1.4em', // FIXED: More space for superscripts to prevent jitter
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={`Roman numeral: ${typeof romanNumeral === 'string' ? romanNumeral : romanNumeral.toString()}`}
                >
                  {React.isValidElement(romanNumeral)
                    ? romanNumeral
                    : typeof romanNumeral === 'string'
                    ? romanNumeral.replace(/\|/g, '/')
                    : romanNumeral
                  }
                </div>
              )}


            </div>
          )
        ) : isEmpty ? (
          <div className="opacity-0" style={getChordLabelStyles()}>·</div>
        ) : (
          <div className="opacity-0" style={getChordLabelStyles()}>·</div>
        )}
      </div>
    </div>
  );
}, areChordCellPropsEqual);

ChordCell.displayName = 'ChordCell';

export default ChordCell;
