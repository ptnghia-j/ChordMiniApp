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
  getChordStyle: (chord: string, isCurrentBeat: boolean, globalIndex: number, isClickable: boolean) => string;
  getDynamicFontSize: (cellSize: number, chordLength: number) => string;
  isEditMode?: boolean;
  editedChord?: string;
  onChordEdit?: (index: number, newChord: string) => void;
  showRomanNumerals?: boolean;
  romanNumeral?: string | React.ReactElement;
}

/**
 * Individual chord cell component for the ChordGrid
 * Handles chord display, editing, Roman numerals, and user interactions
 */
export const ChordCell = React.memo<ChordCellProps>(({
  chord,
  globalIndex,
  isCurrentBeat,
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
  romanNumeral
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
    } else if (isClickable) {
      onBeatClick(globalIndex);
    }
  }, [isEditMode, isEmpty, isClickable, onBeatClick, globalIndex]);

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
      className={`${getChordStyle(chord, isCurrentBeat, globalIndex, isClickable)} w-full h-full ${
        showRomanNumerals
          ? 'min-h-[3.3rem] sm:min-h-[4.2rem]' // 20% increase when Roman numerals shown
          : 'min-h-[2.75rem] sm:min-h-[3.5rem]'
      } chord-cell`}
      style={
        // Only apply segmentation color if this is NOT the current beat
        // Current beat styling takes priority over segmentation colors
        !isCurrentBeat && segmentationColor ? { backgroundColor: segmentationColor } : undefined
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
                    : formatChordWithMusicalSymbols(displayChord, isDarkMode)
                }}
              />

              {/* Roman numeral display */}
              {showRomanNumerals && romanNumeral && (
                <div
                  className={`${varelaRound.className} font-semibold leading-tight text-blue-700 dark:text-blue-300 mt-1 overflow-hidden max-w-full`}
                  style={{
                    fontSize: `${Math.max(10, cellSize * 0.18)}px`, // Larger, more readable Roman numeral size
                    lineHeight: '1.1',
                  }}
                  title={`Roman numeral: ${typeof romanNumeral === 'string' ? romanNumeral : romanNumeral.toString()}`}
                >
                  {typeof romanNumeral === 'string'
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
});

ChordCell.displayName = 'ChordCell';

export default ChordCell;
