import React, { useState, useEffect, useCallback } from 'react';
import {
  formatChordWithMusicalSymbols,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';
import AppTooltip from '@/components/common/AppTooltip';

export interface ChordCellProps {
  chord: string;
  globalIndex: number;

  isClickable: boolean;
  cellSize: number;
  isDarkMode: boolean;
  showChordLabel: boolean;
  isEmpty: boolean;
  displayChord: string;
  wasCorrected: boolean;
  segmentationClassName?: string;
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
  // ref callback to expose the root DOM element for this cell (used by BeatHighlighter)
  cellRef?: (el: HTMLDivElement | null) => void;
  /** Compact mode for use in scrolling chord strip — removes min-height constraints */
  compact?: boolean;
  /** Number of following cells this chord label may visually borrow space from */
  labelOverflowCells?: number;
  /** Additional pixel gap width to include when overflowing across neighboring cells */
  labelOverflowGapPx?: number;
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
  if (prevProps.segmentationClassName !== nextProps.segmentationClassName) return false;
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

  // Compact mode
  if (prevProps.compact !== nextProps.compact) return false;
  if (prevProps.labelOverflowCells !== nextProps.labelOverflowCells) return false;
  if (prevProps.labelOverflowGapPx !== nextProps.labelOverflowGapPx) return false;

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
  segmentationClassName,
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
  accidentalPreference,
  cellRef,
  compact = false,
  labelOverflowCells = 0,
  labelOverflowGapPx = 0
}) => {
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(editedChord || displayChord);

  // Update edit value when editedChord changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const getGridLabelFontSize = useCallback((labelLength: number) => {
    if (compact) {
      const minFontSize = showRomanNumerals ? 11 : 12;
      const maxFontSize = showRomanNumerals ? 13 : 14;
      const scale = showRomanNumerals ? 0.32 : 0.38;
      const penalty = labelLength > 8 ? 2 : labelLength > 4 ? 1 : 0;

      return `${Math.max(
        minFontSize,
        Math.min(maxFontSize, Math.round(cellSize * scale) - penalty)
      )}px`;
    }

    const minFontSize = showRomanNumerals ? 14 : 15;
    const maxFontSize = showRomanNumerals ? 17 : 19;
    const scale = showRomanNumerals ? 0.18 : 0.2;
    const penalty = labelLength > 4 ? 2 : labelLength > 2 ? 1 : 0;

    return `${Math.max(
      minFontSize,
      Math.min(maxFontSize, Math.round(cellSize * scale) - penalty)
    )}px`;
  }, [compact, showRomanNumerals, cellSize]);

  const canOverflowLabel = showChordLabel && !isEmpty && labelOverflowCells > 0;
  const labelOverflowWidth = canOverflowLabel
    ? `calc(${labelOverflowCells + 1} * 100% + ${labelOverflowGapPx}px)`
    : '100%';

  const stateClassName = isInLoopRange
    ? '!bg-blue-500/10 !border-blue-300/60 dark:!bg-blue-800/40 dark:!border-blue-400/35'
    : modulationInfo?.isModulation
      ? '!bg-green-300/20 dark:!bg-green-900/30 !border-green-500/50 dark:!border-green-500/70'
      : segmentationClassName || '';

  const modulationTooltip = modulationInfo?.isModulation
    ? `Key change: ${modulationInfo.fromKey} → ${modulationInfo.toKey}`
    : null;

  const chordCell = (
    <div
      ref={cellRef}
      id={`chord-${globalIndex}`}
      className={`${getChordStyle(chord, globalIndex, isClickable)} w-full h-full ${
        compact
          ? '' // No min-height in compact mode (strip cells)
          : showRomanNumerals
            ? 'min-h-[3.3rem] sm:min-h-[4.2rem]' // 20% increase when Roman numerals shown
            : 'min-h-[2.75rem] sm:min-h-[3.5rem]'
      } ${stateClassName} chord-cell`}
      data-beat-index={globalIndex}
      data-is-empty={isEmpty ? "true" : "false"}
      style={{
        overflow: canOverflowLabel ? 'visible' : undefined,
        zIndex: canOverflowLabel ? 2 : undefined,
      }}
      onClick={handleClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={handleKeyDown}
      aria-label={isClickable ? `Jump to beat ${globalIndex + 1}${chord ? `, chord ${chord}` : ''}` : undefined}
    >
      {/* Enhanced chord display with pickup beat support and Roman numerals */}
      <div style={{ ...getChordContainerStyles(), overflow: canOverflowLabel ? 'visible' : 'hidden' }}>
        {!isEmpty && showChordLabel && chord ? (
          isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSave}
              onKeyDown={handleKeyDown}
              className={`font-varela ${getDynamicFontSize(cellSize, editValue.length)} leading-tight bg-transparent border-none outline-none text-center w-full`}
              style={{
                ...getChordLabelStyles(),
                fontSize: getGridLabelFontSize(editValue.length),
                maxWidth: '100%',
              }}
              autoFocus
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full" style={{ overflow: canOverflowLabel ? 'visible' : 'hidden', width: '100%' }}>
              {/* Chord label */}
              <AppTooltip content={isEditMode ? `Click to edit: ${editedChord || displayChord}` : (editedChord || displayChord)}>
                <div
                  // ✅ APPLY FONT: Use font-varela Tailwind class
                  className={`font-varela ${
                    showRomanNumerals
                      ? getDynamicFontSize(cellSize * 0.7, (editedChord || displayChord).length) // 30% smaller when Roman numerals shown
                      : getDynamicFontSize(cellSize, (editedChord || displayChord).length)
                  } leading-tight whitespace-nowrap ${
                    wasCorrected ? 'text-purple-700 dark:text-purple-300' : ''
                  } ${canOverflowLabel ? 'overflow-visible' : 'overflow-hidden text-ellipsis max-w-full'} ${
                    isEditMode ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-1' : ''
                  }`}
                  style={{
                    ...getChordLabelStyles(),
                    fontSize: getGridLabelFontSize((editedChord || displayChord).length),
                    width: labelOverflowWidth,
                    maxWidth: labelOverflowWidth,
                    minWidth: '100%',
                    alignSelf: 'flex-start',
                    overflow: canOverflowLabel ? 'visible' : 'hidden',
                    textOverflow: canOverflowLabel ? 'clip' : 'ellipsis',
                    position: 'relative',
                    zIndex: canOverflowLabel ? 2 : 1,
                  }}
                  onClick={isEditMode ? handleClick : undefined}
                  dangerouslySetInnerHTML={{
                    __html: editedChord
                      ? editedChord // Show raw edited value without formatting
                      : formatChordWithMusicalSymbols(displayChord, isDarkMode, wasCorrected ? undefined : accidentalPreference)
                  }}
                />
              </AppTooltip>

              {/* FIXED: Roman numeral display with stable layout */}
              {showRomanNumerals && romanNumeral && (
                <AppTooltip content={`Roman numeral: ${typeof romanNumeral === 'string' ? romanNumeral : romanNumeral.toString()}`}>
                  <div
                    className={`font-varela font-semibold leading-tight text-blue-700 dark:text-blue-300 mt-1 max-w-full`}
                    style={{
                      fontSize: `${Math.max(11, cellSize * 0.18)}px`,
                      lineHeight: '1', // FIXED: Consistent line height to prevent layout shifts
                      overflow: 'visible', // Allow superscripts to extend beyond container
                      position: 'relative', // Ensure proper positioning context for absolute children
                      minHeight: '1.4em', // FIXED: More space for superscripts to prevent jitter
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {React.isValidElement(romanNumeral)
                      ? romanNumeral
                      : typeof romanNumeral === 'string'
                      ? romanNumeral.replace(/\|/g, '/')
                      : romanNumeral
                    }
                  </div>
                </AppTooltip>
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

  if (modulationTooltip) {
    return (
      <AppTooltip content={modulationTooltip}>
        {chordCell}
      </AppTooltip>
    );
  }

  return chordCell;
}, areChordCellPropsEqual);

ChordCell.displayName = 'ChordCell';

export default ChordCell;
