'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Varela_Round } from 'next/font/google'; // Import the new font
import {
  formatChordWithMusicalSymbols,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';
import { useTheme } from '@/contexts/ThemeContext';
import { SegmentationResult } from '@/types/chatbotTypes';
import { getSegmentationColorForBeat } from '@/utils/segmentationColors';

// Instantiate the Varela Round font
const varelaRound = Varela_Round({
  subsets: ['latin'],
  weight: '400', // Varela Round is designed for a single weight
});

/**
 * PERFORMANCE OPTIMIZATION: Memoized ChordCell Component
 *
 * This component is memoized to prevent unnecessary re-renders when only
 * the currentBeatIndex changes. Only cells that actually change state
 * (active/inactive) will re-render, reducing DOM updates from 1000+ to 2-3.
 *
 * Expected improvement: 80-90% reduction in render time
 */
interface ChordCellProps {
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

const ChordCell = React.memo<ChordCellProps>(({
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
    if (onChordEdit && editValue.trim()) {
      onChordEdit(globalIndex, editValue.trim());
    }
    setIsEditing(false);
  }, [onChordEdit, globalIndex, editValue]);

  // Handle edit cancel
  const handleEditCancel = useCallback(() => {
    setEditValue(editedChord || displayChord);
    setIsEditing(false);
  }, [editedChord, displayChord]);

  // Memoize keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEditSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEditCancel();
      }
    } else if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onBeatClick(globalIndex);
    }
  }, [isEditing, handleEditSave, handleEditCancel, isClickable, onBeatClick, globalIndex]);

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
                  className={`${varelaRound.className} text-xs leading-tight text-gray-600 dark:text-gray-400 mt-0.5 overflow-hidden max-w-full`}
                  style={{
                    fontSize: `${Math.max(8, cellSize * 0.15)}px`, // Responsive Roman numeral size
                    lineHeight: '1.2',
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


interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
  audioIndex: number; // Original audio index for accurate beat click handling
}

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: (number | null)[]; // Array of corresponding beat timestamps (in seconds) - Updated to match service type
  currentBeatIndex?: number; // Current beat index for highlighting, optional
  timeSignature?: number; // Time signature (beats per measure), defaults to 4
  keySignature?: string; // Key signature (e.g., 'C Major')
  isDetectingKey?: boolean; // Whether key detection is in progress
  isChatbotOpen?: boolean; // Whether the chatbot panel is open
  isLyricsPanelOpen?: boolean; // Whether the lyrics panel is open
  hasPickupBeats?: boolean; // Whether the grid includes pickup beats
  pickupBeatsCount?: number; // Number of pickup beats
  hasPadding?: boolean; // Whether the chords array already includes padding/shifting
  paddingCount?: number; // Number of padding beats (for visual distinction)
  shiftCount?: number; // Number of shift beats (for visual distinction)
  beatTimeRangeStart?: number; // Start time of beat detection range (for padding timestamp calculation)
  originalAudioMapping?: AudioMappingItem[]; // NEW: Original timestamp-to-chord mapping for audio sync
  onBeatClick?: (beatIndex: number, timestamp: number) => void; // Callback for beat cell clicks
  isUploadPage?: boolean; // Whether this is the upload audio file page (for different layout)
  // Visual indicator for corrected chords
  showCorrectedChords?: boolean; // Whether corrected chords are being displayed
  //chordCorrections?: Record<string, string> | null; // Mapping of original chords to corrected chords (legacy)
  // NEW: Enhanced sequence-based corrections
  sequenceCorrections?: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
  } | null;
  // NEW: Song segmentation data for color-coding
  segmentationData?: SegmentationResult | null; // Segmentation analysis results
  showSegmentation?: boolean; // Whether to show segmentation colors
  // Edit mode props
  isEditMode?: boolean; // Whether edit mode is active
  editedChords?: Record<number, string>; // Temporarily edited chord values
  onChordEdit?: (index: number, newChord: string) => void; // Callback for chord edits
  // Roman numeral analysis props
  showRomanNumerals?: boolean; // Whether to show Roman numeral analysis
  romanNumeralData?: {
    analysis: string[];
    keyContext: string;
    temporalShifts?: Array<{
      chordIndex: number;
      targetKey: string;
      romanNumeral: string;
    }>;
  } | null;
}

const ChordGrid: React.FC<ChordGridProps> = React.memo(({
  chords,
  beats,
  currentBeatIndex = -1,
  timeSignature = 4,
  keySignature,
  isDetectingKey = false,
  isChatbotOpen = false,
  isLyricsPanelOpen = false,
  hasPickupBeats = false,
  pickupBeatsCount = 0,
  hasPadding = false,
  paddingCount = 0,
  shiftCount = 0,
  beatTimeRangeStart = 0,
  originalAudioMapping,
  onBeatClick,
  isUploadPage = false,
  showCorrectedChords = false,
  //chordCorrections = null,
  sequenceCorrections = null,
  segmentationData = null,
  showSegmentation = false,
  isEditMode = false,
  editedChords = {},
  onChordEdit,
  showRomanNumerals = false,
  romanNumeralData = null
}) => {



  // Get theme for SVG selection
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  // Use simple time signature - no complex beat source logic
  const actualBeatsPerMeasure = timeSignature;

  // Function to get segmentation color for a specific beat index using shared utility
  const getSegmentationColorForBeatIndex = (beatIndex: number): string | undefined => {
    // Try to get timestamp from originalAudioMapping first for accuracy
    let timestamp: number | null = null;

    if (originalAudioMapping) {
      const mappingEntry = originalAudioMapping.find(item => item.visualIndex === beatIndex);
      if (mappingEntry) {
        timestamp = mappingEntry.timestamp;
      }
    }

    // Fallback to beats array if no mapping found
    if (timestamp === null) {
      timestamp = beats[beatIndex];
    }

    // Use the enhanced segmentation function with direct timestamp
    return getSegmentationColorForBeat(beatIndex, beats, segmentationData, showSegmentation, timestamp);
  };


  // Function to apply chord corrections at display time
  const getDisplayChord = (originalChord: string, visualIndex?: number): { chord: string; wasCorrected: boolean } => {
    // Early return when corrections are disabled or chord is empty
    // console.log("currentChord:", originalChord);
    if (!showCorrectedChords || !originalChord) {
      return { chord: originalChord, wasCorrected: false };
    }
    
    // Duplicate-aware sequence-based corrections
    if (sequenceCorrections && visualIndex !== undefined) {
      const targetOccurrence = chordGroupOccurrenceMap[visualIndex] ?? 0;

      if (targetOccurrence > 0) {
        const corrected = chordOccurrenceCorrectionMap[originalChord]?.[targetOccurrence];
        if (corrected) {
          return { chord: corrected, wasCorrected: true };
        }
      }
    }

    // FALLBACK: Use legacy chord-by-chord corrections
    // if (chordCorrections) {
    //   // Extract the root note from the chord (e.g., "C#:maj" -> "C#", "F#m" -> "F#")
    //   // Handle both formats: "C#:maj" and "C#m"
    //   let rootNote = originalChord;

    //   // For chords with colon notation (e.g., "C#:maj", "F#:min")
    //   if (originalChord.includes(':')) {
    //     rootNote = originalChord.split(':')[0];
    //   } else {
    //     // For chords without colon (e.g., "C#m", "F#", "Db7")
    //     // Extract root note (handle sharps and flats)
    //     const match = originalChord.match(/^([A-G][#b]?)/);
    //     if (match) {
    //       rootNote = match[1];
    //     }
    //   }

    //   // Check if we have a correction for this root note
    //   if (chordCorrections[rootNote]) {
    //     const correctedRoot = chordCorrections[rootNote];

    //     // Replace the root note in the original chord with the corrected one
    //     let correctedChord;
    //     if (originalChord.includes(':')) {
    //       // For "C#:maj" -> "Db:maj"
    //       correctedChord = originalChord.replace(rootNote, correctedRoot);
    //     } else {
    //       // For "C#m" -> "Dbm", "C#7" -> "Db7"
    //       correctedChord = originalChord.replace(rootNote, correctedRoot);
    //     }


    //     return { chord: correctedChord, wasCorrected: true };
    //   }
    // }



    return { chord: originalChord, wasCorrected: false };
  };

  // UPDATED: Optimal beat shift calculation - detect chord changes from previous beat, score if on downbeat
  // PERFORMANCE OPTIMIZATION: Memoized to prevent useMemo dependency issues
  const calculateOptimalShift = useCallback((chords: string[], timeSignature: number): number => {
    // Use the shift count from backend if available, otherwise calculate
    if (hasPadding && shiftCount !== undefined) {
      // console.log(`🔧 Using backend shift count: ${shiftCount}`);
      return shiftCount;
    }

    if (chords.length === 0) {
      // console.log(`🔧 No chords available, returning shift 0`);
      return 0;
    }

    // console.log(`🔧 FRONTEND SHIFT CALCULATION DEBUG - Analyzing ${chords.length} chords with ${timeSignature}/4 time signature`);
    // console.log(`🔧 FRONTEND First 20 chords: [${chords.slice(0, 20).join(', ')}]`);

    // Test downbeat calculation logic
    // console.log(`🔧 DOWNBEAT CALCULATION TEST for timeSignature=${timeSignature}:`);
    // for (let testShift = 0; testShift < timeSignature; testShift++) {
    //   const testPositions = [];
    //   for (let testI = testShift; testI < testShift + 8; testI++) {
    //     const beatInMeasure = ((testI - testShift) % timeSignature) + 1;
    //     const isDownbeat = beatInMeasure === 1;
    //     testPositions.push(`i=${testI}→beat${beatInMeasure}${isDownbeat ? '(DB)' : ''}`);
    //   }
    //   console.log(`🔧   Shift ${testShift}: ${testPositions.join(', ')}`);
    // }

    let bestShift = 0;
    let maxChordChanges = 0;
    const shiftResults: Array<{shift: number, chordChanges: number, downbeatPositions: number[], chordLabels: string[]}> = [];

    // Test each possible shift value (0 to timeSignature-1)
    for (let shift = 0; shift < timeSignature; shift++) {
      let chordChangeCount = 0;
      const downbeatPositions: number[] = [];
      const chordLabels: string[] = [];

      // FIXED: Check each beat position after applying the shift with correct downbeat calculation
      for (let i = shift; i < chords.length; i++) {
        const currentChord = chords[i];
        const previousChord = i > shift ? chords[i - 1] : '';

        // Detect chord change: current chord differs from previous beat's chord
        const isChordChange = currentChord && currentChord !== '' &&
                             currentChord !== previousChord && previousChord !== '' &&
                             currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

        // FIXED: Correct downbeat calculation - beat position in the shifted sequence
        // The shift moves the starting point, so we need to calculate the beat position correctly
        // If shift=0: beats 0,1,2,3 map to measure positions 1,2,3,4
        // If shift=1: beats 1,2,3,4 map to measure positions 1,2,3,4 (beat 0 is skipped)
        // If shift=2: beats 2,3,4,5 map to measure positions 1,2,3,4 (beats 0,1 are skipped)
        const beatInMeasure = ((i + shift) % timeSignature) + 1;
        const isDownbeat = beatInMeasure === 1;

        // Score: chord change that occurs on a downbeat
        if (isChordChange && isDownbeat) {
          chordChangeCount++;
          downbeatPositions.push(i);
          chordLabels.push(currentChord);
          // console.log(`🔧     CHORD CHANGE ON DOWNBEAT: i=${i}, beat${beatInMeasure}, ${previousChord} → ${currentChord}`);
        } else if (isChordChange) {
          // console.log(`🔧     chord change (not downbeat): i=${i}, beat${beatInMeasure}, ${previousChord} → ${currentChord}`);
        }
      }

      shiftResults.push({
        shift,
        chordChanges: chordChangeCount,
        downbeatPositions,
        chordLabels
      });

      // console.log(`🔧 Shift ${shift}: ${chordChangeCount} chord changes on downbeats - positions: [${downbeatPositions.join(', ')}] - chords: [${chordLabels.join(', ')}]`);

      if (chordChangeCount > maxChordChanges) {
        maxChordChanges = chordChangeCount;
        bestShift = shift;
      } else if (chordChangeCount === maxChordChanges && shift < bestShift) {
        // When tied, prefer the smaller shift value (earliest alignment)
        bestShift = shift;
      }
    }

    // console.log(`🔧 FRONTEND SHIFT RESULT: Best shift = ${bestShift} with ${maxChordChanges} chord changes on downbeats`);
    // console.log(`🔧 All shift results:`, shiftResults);

    // Create a visual representation of what each shift would look like
    // console.log(`🔧 VISUAL REPRESENTATION OF SHIFTS:`);
    // for (let shift = 0; shift < timeSignature; shift++) {
    //   const visualGrid = [];
    //   for (let i = 0; i < Math.min(16, chords.length + shift); i++) {
    //     if (i < shift) {
    //       visualGrid.push('___'); // Empty shift cells
    //     } else {
    //       const chordIndex = i - shift;
    //       const chord = chords[chordIndex] || '';
    //       const beatInMeasure = ((chordIndex) % timeSignature) + 1;
    //       const isDownbeat = beatInMeasure === 1;
    //       const marker = isDownbeat ? '|' : ' ';
    //       visualGrid.push(`${marker}${chord.substring(0, 2).padEnd(2)}${marker}`);
    //     }
    //   }
    //   const result = shiftResults.find(r => r.shift === shift);
    //   console.log(`🔧   Shift ${shift} (${result?.chordChanges || 0} changes): ${visualGrid.join(' ')}`);
    // }

    return bestShift;
  }, [hasPadding, shiftCount]); // Dependencies: hasPadding and shiftCount affect the calculation

  // PERFORMANCE OPTIMIZATION: Memoized chord shift calculation
  // This prevents expensive recalculation of optimal shift on every render
  const shiftedChords = useMemo(() => {
    let computedShiftedChords: string[];

    if (hasPadding) {
      // COMPREHENSIVE STRATEGY: Backend already provided correctly ordered chords with padding/shift
      // The chords prop already contains: [shift cells (''), padding cells ('N.C.'), regular chords]
      computedShiftedChords = chords; // Use as-is, no additional shifting needed
    } else {
      // FALLBACK STRATEGY: Apply ChordGrid's own shift logic
      const computedOptimalShift = calculateOptimalShift(chords, actualBeatsPerMeasure);
      computedShiftedChords = chords.length > 0 ? [
        ...Array(computedOptimalShift).fill(''), // Add k empty greyed-out cells at the beginning
        ...chords // Original chords follow after the shift
      ] : chords;
    }
    return computedShiftedChords;
  }, [chords, hasPadding, actualBeatsPerMeasure, calculateOptimalShift]);

  // NEW: Map each visual beat index to the N-th occurrence of its chord group
  const chordGroupOccurrenceMap = useMemo(() => {
    const map: number[] = [];
    const occurrence: Record<string, number> = {};
    let lastChord: string | null = null;

    shiftedChords.forEach((ch, idx) => {
      const isRest = ch === '' || ch === 'N.C.' || ch === 'N/C' || ch === 'N';

      if (!isRest && ch !== lastChord) {
        occurrence[ch] = (occurrence[ch] || 0) + 1;
        lastChord = ch;
      }

      map[idx] = !isRest ? occurrence[ch] : 0; // 0 occurrence for rests
    });

    return map;
  }, [shiftedChords]);

  // NEW: Precompute corrections for each chord occurrence (O(n))
  const chordOccurrenceCorrectionMap = useMemo(() => {
    const map: Record<string, Record<number, string>> = {};

    if (!sequenceCorrections) return map;

    const { originalSequence, correctedSequence } = sequenceCorrections;
    const occCounter: Record<string, number> = {};

    for (let i = 0; i < originalSequence.length; i++) {
      const chord = originalSequence[i];
      const prev  = i > 0 ? originalSequence[i - 1] : null;
      // may be redundant but safe
      const isGroupStart = i === 0 || chord !== prev;

      if (isGroupStart) {
        occCounter[chord] = (occCounter[chord] || 0) + 1;
        const occ = occCounter[chord];
        const corrected = correctedSequence[i];
        if (corrected !== chord) {
          if (!map[chord]) map[chord] = {};
          map[chord][occ] = corrected;
        }
      }
    }

    return map;
  }, [sequenceCorrections]);


  // PERFORMANCE OPTIMIZATION: Memoized CSS grid columns class generator
  const getGridColumnsClass = useCallback((beatsPerMeasure: number): string => {
    switch (beatsPerMeasure) {
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-3';
      case 4:
        return 'grid-cols-4';
      case 5:
        return 'grid-cols-5';
      case 6:
        return 'grid-cols-6';
      case 7:
        return 'grid-cols-7';
      case 8:
        return 'grid-cols-8';
      case 9:
        return 'grid-cols-9';
      case 10:
        return 'grid-cols-10';
      case 11:
        return 'grid-cols-11';
      case 12:
        return 'grid-cols-12';
      default:
        // For unusual time signatures, fall back to a flexible grid
        // console.warn(`Unusual time signature: ${beatsPerMeasure}/4, using flexible grid`);
        return 'grid-cols-4'; // Default fallback
    }
  }, []);


  // Reference to the grid container for measuring cell size
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState<number>(0);
  const [screenWidth, setScreenWidth] = useState<number>(1200); // Default for SSR



  // FIX 4: Dynamic font sizing system based on cell size - Memoized for performance
  const getDynamicFontSize = useCallback((cellSize: number, chordLength: number = 1): string => {
    if (cellSize === 0) return 'text-sm'; // Default fallback

    // Base font size calculation: scale with cell size
    // Smaller cells (mobile/complex time signatures) get smaller fonts
    // Larger cells (desktop/simple time signatures) get larger fonts
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
  }, []); // No dependencies needed as function is pure

  // Set up resize observer to track cell size changes and screen width
  useEffect(() => {
    // Initialize screen width
    if (typeof window !== 'undefined') {
      setScreenWidth(window.innerWidth);
    }

    const updateSizes = () => {
      // Update screen width
      if (typeof window !== 'undefined') {
        setScreenWidth(window.innerWidth);
      }

      // Update cell size
      if (gridContainerRef.current) {
        const cells = gridContainerRef.current.querySelectorAll('.chord-cell');
        if (cells.length > 0) {
          const firstCell = cells[0] as HTMLElement;
          const width = firstCell.offsetWidth;
          setCellSize(width);


        }
      }
    };

    // Initial size calculation
    updateSizes();

    // Set up window resize listener for screen width
    const handleResize = () => {
      updateSizes();
    };

    window.addEventListener('resize', handleResize);

    // Set up resize observer for cell size
    let resizeObserver: ResizeObserver | null = null;
    if (gridContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateSizes();
      });
      resizeObserver.observe(gridContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []); // Only run once on mount - size calculations don't depend on chord data


  // FIXED: Helper to determine if this beat should show a chord label
  // This function now works on the shifted chord array but properly detects chord changes
  const shouldShowChordLabel = (index: number): boolean => {
    // Always show the first non-empty chord
    if (index === 0) {
      return shiftedChords[index] !== '';
    }

    // For shifted array, we need to check against the previous non-empty chord
    // to avoid showing duplicate labels for consecutive identical chords
    if (index < shiftedChords.length && index - 1 >= 0) {
      const currentChord = shiftedChords[index];
      const previousChord = shiftedChords[index - 1];

      // Don't show label for empty cells
      if (currentChord === '') {
        return false;
      }

      // FIXED: Special handling for N.C. (No Chord) to prevent duplicate rest symbols
      // Only show N.C. label if it's the first N.C. in a sequence or if previous chord was not N.C.
      if (currentChord === 'N.C.' || currentChord === 'N/C' || currentChord === 'N') {
        // Look back to find the last non-empty chord to avoid showing multiple rest symbols
        for (let i = index - 1; i >= 0; i--) {
          const prevChord = shiftedChords[i];
          if (prevChord !== '') {
            // Show N.C. label only if the previous non-empty chord was not also N.C.
            return prevChord !== 'N.C.' && prevChord !== 'N/C' && prevChord !== 'N';
          }
        }
        // If we reach here, this is the first chord in the sequence, show it
        return true;
      }

      // Show label only if chord changed from previous beat
      return currentChord !== previousChord;
    }

    // Default to showing the chord if we can't determine
    return shiftedChords[index] !== '';
  };

  // Memoized beat cell click handler for navigation
  const handleBeatClick = useCallback((globalIndex: number) => {
    if (!onBeatClick || !beats || beats.length === 0) return;



    // FIXED: Use beat index matching instead of chord type matching
    // Map visual grid index to the corresponding beat index in originalAudioMapping

    // Check if this is a shift cell (not clickable)
    const isShiftCell = hasPadding && globalIndex < shiftCount;
    const isPaddingCell = hasPadding && globalIndex >= shiftCount && globalIndex < (shiftCount + paddingCount);

    if (isShiftCell) {

      return; // Don't allow clicking on shift cells
    }

    // FIXED: Block clicking on empty cells (greyed-out cells)
    const chord = chords[globalIndex] || 'undefined';
    const isEmptyCell = chord === '';
    if (isEmptyCell) {
      return; // Don't allow clicking on empty cells
    }

    // Handle padding cells - use the actual timestamp from beats array
    if (isPaddingCell) {
      // FIXED: Use the actual timestamp from the beats array instead of calculating
      // This ensures consistency with the animation logic
      const timestamp = beats[globalIndex];

      if (timestamp !== null && timestamp !== undefined && timestamp >= 0) {

        onBeatClick(globalIndex, timestamp);
      } else {
        // Fallback calculation if timestamp is not available
        const paddingIndex = globalIndex - shiftCount;
        const firstDetectedBeatTime = beats.find(beat => beat !== null && beat !== undefined) || 0;
        const paddingDuration = beatTimeRangeStart > 0 ? beatTimeRangeStart : firstDetectedBeatTime;

        if (paddingCount > 0 && paddingDuration > 0) {
          const paddingCellDuration = paddingDuration / paddingCount;
          const fallbackTimestamp = paddingIndex * paddingCellDuration;

          onBeatClick(globalIndex, fallbackTimestamp);
        }
      }
      return;
    }

    // FIXED: Use original audio mapping for accurate timestamp lookup
    // Instead of using shifted timestamps from beats[globalIndex], find the corresponding original timestamp

    let finalTimestamp: number;

    if (originalAudioMapping && originalAudioMapping.length > 0) {
      // FIXED: Use reverse mapping - find which originalAudioMapping entry has this visualIndex
      // The originalAudioMapping already contains the correct visualIndex for each audio entry
      const mappingEntry = originalAudioMapping.find(item => item.visualIndex === globalIndex);

      if (mappingEntry) {
        finalTimestamp = mappingEntry.timestamp;


      } else {
        // Fallback to beats array if no mapping found for this visual index
        const beatTime = beats[globalIndex];
        finalTimestamp = typeof beatTime === 'number' ? beatTime : 0;

      }
    } else {
      // Fallback to beats array if no audio mapping available
      const beatTime = beats[globalIndex];
      finalTimestamp = typeof beatTime === 'number' ? beatTime : 0;

    }

    // Validate timestamp and execute click
    if (typeof finalTimestamp === 'number' && finalTimestamp >= 0) {
      onBeatClick(globalIndex, finalTimestamp); // FIXED: Use visual index for animation, timestamp for audio seeking
    } else {
      return;
    }
  }, [onBeatClick, beats, hasPadding, shiftCount, paddingCount, chords, originalAudioMapping, beatTimeRangeStart]);

  // PERFORMANCE OPTIMIZATION: Memoized grid layout calculations
  // This prevents expensive recalculations on every render
  const gridLayoutConfig = useMemo(() => {
    // Special case for upload page: use 4 measures (16 cells) per row for better spacing
    if (isUploadPage) {
      return {
        measuresPerRow: 4,
        cellsPerRow: 4 * actualBeatsPerMeasure,
        totalRows: Math.ceil(chords.length / (4 * actualBeatsPerMeasure))
      };
    }

    // Determine screen category with enhanced mobile breakpoints
    const isMobilePortrait = screenWidth < 568; // Very small screens
    const isMobileLandscape = screenWidth >= 568 && screenWidth < 768; // Mobile landscape
    const isTablet = screenWidth >= 768 && screenWidth < 1024;
    const isDesktop = screenWidth >= 1024 && screenWidth < 1440;

    // Check if any panel is open
    const anyPanelOpen = isChatbotOpen || isLyricsPanelOpen;

    // IMPROVED RESPONSIVE ALGORITHM: Consistent 16-20 cells per row target
    // This provides better visual balance across all time signatures
    let targetCellsPerRow: number;

    if (isMobilePortrait) {
      // Mobile portrait: 8-12 cells per row
      targetCellsPerRow = anyPanelOpen ? 8 : 12;
    } else if (isMobileLandscape) {
      // Mobile landscape: 12-16 cells per row
      targetCellsPerRow = anyPanelOpen ? 12 : 16;
    } else if (isTablet) {
      // Tablet: 16-20 cells per row
      targetCellsPerRow = anyPanelOpen ? 16 : 20;
    } else if (isDesktop) {
      // Desktop: 16-20 cells per row (consistent with tablet)
      targetCellsPerRow = anyPanelOpen ? 16 : 20;
    } else { // Large desktop
      // Large desktop: 20-24 cells per row
      targetCellsPerRow = anyPanelOpen ? 20 : 24;
    }

    // CORE ALGORITHM: Calculate measures per row based on target cells
    // This ensures consistent visual density across different time signatures
    let measuresPerRow = Math.max(1, Math.floor(targetCellsPerRow / timeSignature));

    // Apply time signature complexity limits for readability
    // Complex time signatures need fewer measures per row for clarity
    if (timeSignature >= 7) {
      // Very complex (7/8, 9/8, etc.): max 2-3 measures per row
      const maxMeasures = anyPanelOpen ? 2 : 3;
      measuresPerRow = Math.min(measuresPerRow, maxMeasures);
    } else if (timeSignature >= 5) {
      // Moderately complex (5/4, 6/8): max 3-4 measures per row
      const maxMeasures = anyPanelOpen ? 3 : 4;
      measuresPerRow = Math.min(measuresPerRow, maxMeasures);
    }
    // Simple time signatures (2/4, 3/4, 4/4) can use the full calculated amount

    // MINIMUM CELL SIZE CONSTRAINT: Never shrink below 70% of desktop size
    const DESKTOP_CELL_SIZE = 80; // Base desktop cell size in pixels
    const MIN_CELL_SIZE = DESKTOP_CELL_SIZE * 0.7; // 70% minimum = 56px
    const MIN_TOUCH_TARGET = 44; // Apple/Google minimum touch target
    const EFFECTIVE_MIN_SIZE = Math.max(MIN_CELL_SIZE, MIN_TOUCH_TARGET);

    // Calculate available width (accounting for gaps and padding)
    const availableWidth = anyPanelOpen
      ? screenWidth * 0.6  // Reduced width when panels are open
      : screenWidth * 0.95; // Full width with padding

    // Calculate maximum measures that fit with minimum cell size
    const gapSize = screenWidth < 640 ? 4 : 8; // sm:gap-2 vs gap-1
    const maxCellsWithMinSize = Math.floor(
      (availableWidth - (actualBeatsPerMeasure - 1) * gapSize) / EFFECTIVE_MIN_SIZE
    );
    const maxMeasuresWithMinSize = Math.floor(maxCellsWithMinSize / actualBeatsPerMeasure);

    // Apply minimum cell size constraint: reduce measures if cells would be too small
    if (maxMeasuresWithMinSize > 0 && maxMeasuresWithMinSize < measuresPerRow) {
      measuresPerRow = maxMeasuresWithMinSize;
    }

    // Final validation: ensure at least 1 measure per row
    const finalMeasuresPerRow = Math.max(1, measuresPerRow);

    return {
      measuresPerRow: finalMeasuresPerRow,
      cellsPerRow: finalMeasuresPerRow * actualBeatsPerMeasure,
      totalRows: Math.ceil(chords.length / (finalMeasuresPerRow * actualBeatsPerMeasure))
    };
  }, [isUploadPage, actualBeatsPerMeasure, isChatbotOpen, isLyricsPanelOpen, screenWidth, chords.length, timeSignature]);

  // PERFORMANCE OPTIMIZATION: Extract layout values from memoized config
  const { measuresPerRow: dynamicMeasuresPerRow } = gridLayoutConfig;

  // PERFORMANCE OPTIMIZATION: Memoized chord styling function
  // This prevents recreation of the styling function on every render
  const getChordStyle = useCallback((chord: string, isCurrentBeat: boolean, beatIndex: number, isClickable: boolean = true) => {
    // Clean base classes with minimal styling
    const baseClasses = `flex flex-col items-start justify-center aspect-square transition-colors duration-150 border border-gray-300 dark:border-gray-600 rounded-sm overflow-hidden ${
      isClickable ? 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-500' : ''
    }`;

    // Determine cell type
    const isEmpty = chord === '';
    const isPickupBeat = hasPickupBeats && beatIndex < timeSignature && beatIndex >= (timeSignature - pickupBeatsCount);

    // Clean default styling
    let classes = `${baseClasses}`;
    let textColor = "text-gray-800 dark:text-gray-100";

    // Note: Segmentation colors are now applied via inline styles in ChordCell component
    // Default colors
    classes += " bg-white dark:bg-content-bg";

    // Subtle hover effects for clickable cells
    if (isClickable) {
      classes += " hover:bg-gray-50 dark:hover:bg-gray-700";
    }

    // SIMPLIFIED: Only check basic cell types without complex padding/shift logic
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

    // Professional current beat highlighting with subtle, clean styling
    if (isCurrentBeat) {
      if (isEmpty) {
        // Subtle highlighting for empty current beats
        classes = `${baseClasses} bg-gray-200 dark:bg-gray-600 border-2 border-gray-400 dark:border-gray-400 relative z-10`;
        textColor = "text-gray-600 dark:text-gray-300";
      } else {
        // Clean current beat highlighting without animations
        classes = `${baseClasses} bg-blue-200/70 dark:bg-blue-700/70 border-2 border-blue-400 dark:border-blue-400 relative z-10`;
        textColor = "text-blue-900 dark:text-blue-100";
      }

      // Subtle hover effects for current beat cells
      if (isClickable) {
        classes += " hover:border-blue-500 dark:hover:border-blue-300";
      }
    }

    return `${classes} ${textColor}`;
  }, [hasPickupBeats, timeSignature, pickupBeatsCount]);

  // Memoized measure grouping with proper pickup beat handling using shifted chords
  const groupedByMeasure = useMemo(() => {
    if (chords.length === 0) {
      return [];
    }
    const measures: Array<{
      measureNumber: number;
      chords: string[];
      beats: number[];
      isPickupMeasure?: boolean;
    }> = [];

  // SIMPLIFIED: Basic measure grouping without padding/shift complexity
  let currentIndex = 0;
  let measureNumber = 0;

  while (currentIndex < shiftedChords.length) {
    const measure = {
      measureNumber: measureNumber,
      chords: [] as string[],
      beats: [] as number[],
      isPickupMeasure: false
    };

    // Simple measure grouping: exactly actualBeatsPerMeasure beats per measure
    for (let b = 0; b < actualBeatsPerMeasure && currentIndex < shiftedChords.length; b++) {
      measure.chords.push(shiftedChords[currentIndex]);
      const beatTime = beats[currentIndex];
      measure.beats.push(typeof beatTime === 'number' ? beatTime : 0);
      currentIndex++;
    }

    // FIXED: Only pad incomplete measures if they have actual content
    // This prevents trailing empty measures from beat-transformer-light
    if (measure.chords.length > 0) {
      // Pad incomplete measures to maintain consistent grid layout
      while (measure.chords.length < actualBeatsPerMeasure) {
        measure.chords.push(''); // Empty cell for padding
        measure.beats.push(-1); // Invalid beat index for padding
      }
      measures.push(measure);
      measureNumber++;
    }
  }

    return measures;
  }, [shiftedChords, beats, actualBeatsPerMeasure, chords.length]);

  // PERFORMANCE OPTIMIZATION: Memoized rows calculation
  // Group measures into rows using the dynamic measures per row
  const rows = useMemo(() => {
    const calculatedRows: Array<typeof groupedByMeasure> = [];
    for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
      calculatedRows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
    }
    return calculatedRows;
  }, [groupedByMeasure, dynamicMeasuresPerRow]);

  // Create mapping from beat index to chord sequence index for Roman numerals
  const beatToChordSequenceMap = useMemo(() => {
    if (chords.length === 0 || !romanNumeralData?.analysis || !sequenceCorrections?.correctedSequence) return {};

    const map: Record<number, number> = {};
    const normalizeChord = (chord: string) => {
      if (chord === 'N' || chord === 'N.C.' || chord === 'N/C' || chord === 'NC') {
        return 'N';
      }
      return chord;
    };

    // ROBUST APPROACH: Map UI beats directly to corrected sequence using chord matching
    // This handles sequence length mismatches by finding the best match for each UI chord

    let correctedSequenceIndex = 0;
    let lastNormalizedChord = '';

    for (let beatIndex = 0; beatIndex < shiftedChords.length; beatIndex++) {
      const currentChord = shiftedChords[beatIndex];

      if (!currentChord || currentChord === '') {
        continue;
      }

      const normalizedCurrent = normalizeChord(currentChord);

      // If chord changes, find the next matching chord in corrected sequence
      if (normalizedCurrent !== lastNormalizedChord) {
        if (lastNormalizedChord !== '') {
          // Look for the next occurrence of this chord in the corrected sequence
          let found = false;
          for (let i = correctedSequenceIndex + 1; i < sequenceCorrections.correctedSequence.length; i++) {
            const correctedChord = normalizeChord(sequenceCorrections.correctedSequence[i]);
            if (correctedChord === normalizedCurrent) {
              correctedSequenceIndex = i;
              found = true;
              break;
            }
          }

          // If not found ahead, increment by 1 (fallback)
          if (!found) {
            correctedSequenceIndex = Math.min(correctedSequenceIndex + 1, sequenceCorrections.correctedSequence.length - 1);
          }
        }
        lastNormalizedChord = normalizedCurrent;
      }

      // Map this beat to the current corrected sequence index
      if (correctedSequenceIndex < romanNumeralData.analysis.length) {
        map[beatIndex] = correctedSequenceIndex;
      }
    }



    return map;
  }, [chords.length, shiftedChords, romanNumeralData?.analysis, sequenceCorrections?.correctedSequence]);

  // Helper function to format Roman numerals with proper figure bass notation
  const formatRomanNumeral = (romanNumeral: string): React.ReactElement | string => {
    if (!romanNumeral) return '';

    // Handle figure bass notation (e.g., "I64", "ii6", "V7")
    const figureMatch = romanNumeral.match(/^([ivxIVX]+)(.*)$/);
    if (figureMatch) {
      const [, baseRoman, figures] = figureMatch;

      if (figures) {
        // Handle different figure bass patterns
        if (figures === '64') {
          return (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              {baseRoman}
              <span style={{
                position: 'absolute',
                left: '100%',
                top: '-0.3em',
                fontSize: '0.6em',
                lineHeight: '0.8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginLeft: '1px'
              }}>
                <span>6</span>
                <span>4</span>
              </span>
            </span>
          );
        } else if (figures === '43') {
          return (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              {baseRoman}
              <span style={{
                position: 'absolute',
                left: '100%',
                top: '-0.3em',
                fontSize: '0.6em',
                lineHeight: '0.8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginLeft: '1px'
              }}>
                <span>4</span>
                <span>3</span>
              </span>
            </span>
          );
        } else if (figures === '42') {
          return (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              {baseRoman}
              <span style={{
                position: 'absolute',
                left: '100%',
                top: '-0.3em',
                fontSize: '0.6em',
                lineHeight: '0.8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginLeft: '1px'
              }}>
                <span>4</span>
                <span>2</span>
              </span>
            </span>
          );
        } else if (figures === '65') {
          return (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              {baseRoman}
              <span style={{
                position: 'absolute',
                left: '100%',
                top: '-0.3em',
                fontSize: '0.6em',
                lineHeight: '0.8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginLeft: '1px'
              }}>
                <span>6</span>
                <span>5</span>
              </span>
            </span>
          );
        } else if (figures === '6') {
          return (
            <span>
              {baseRoman}
              <sup style={{ fontSize: '0.7em' }}>6</sup>
            </span>
          );
        } else if (figures === '7') {
          return (
            <span>
              {baseRoman}
              <sup style={{ fontSize: '0.7em' }}>7</sup>
            </span>
          );
        } else if (figures.includes('/')) {
          // Handle secondary dominants like "V7/vi"
          return <span>{romanNumeral}</span>;
        } else {
          // Handle other figure combinations
          return (
            <span>
              {baseRoman}
              <sup style={{ fontSize: '0.7em' }}>{figures}</sup>
            </span>
          );
        }
      }

      return baseRoman;
    }

    return romanNumeral;
  };

  // Early return if no chords available
  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-700 dark:text-gray-200 text-center p-4 bg-white dark:bg-content-bg rounded-md border border-gray-200 dark:border-gray-600 w-full transition-colors duration-300">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  // Group consecutive identical chords and calculate their durations
  const chordDurations: Array<{chord: string, startBeat: number, endBeat: number, startTime: number, endTime: number, duration: number}> = [];
  let currentChordGroup = { chord: shiftedChords[0] || 'undefined', startIndex: 0 };

  for (let i = 1; i <= shiftedChords.length; i++) {
    const currentChord = i < shiftedChords.length ? shiftedChords[i] : 'END';

    // If chord changes or we reach the end
    if (currentChord !== currentChordGroup.chord || i === shiftedChords.length) {
      const endIndex = i - 1;
      const startTime = beats[currentChordGroup.startIndex];
      const endTime = beats[endIndex];

      // Calculate duration
      let duration = 0;
      if (typeof startTime === 'number' && typeof endTime === 'number') {
        duration = endTime - startTime;
      } else if (typeof startTime === 'number' && i < beats.length) {
        // For last chord, estimate duration
        const nextTime = beats[i];
        if (typeof nextTime === 'number') {
          duration = nextTime - startTime;
        } else {
          duration = 0.5; // Default estimate
        }
      }

      chordDurations.push({
        chord: currentChordGroup.chord,
        startBeat: currentChordGroup.startIndex,
        endBeat: endIndex,
        startTime: typeof startTime === 'number' ? startTime : 0,
        endTime: typeof endTime === 'number' ? endTime : 0,
        duration: duration
      });

      // Start new group
      if (i < shiftedChords.length) {
        currentChordGroup = { chord: currentChord, startIndex: i };
      }
    }
  }

  return (
    <div ref={gridContainerRef} className="chord-grid-container mx-auto px-0.5 sm:px-1 relative" style={{ maxWidth: "99%" }}>
      {/* Clean card container with minimal styling */}
      <div className="bg-white dark:bg-content-bg rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">

        {/* Header section with clean layout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1 p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600">
        {/* Left side - Title */}
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Chord Progression
          </h3>
          {onBeatClick && (
            <div className="group relative">
              <svg
                className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-help"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap mb-1 z-10">
                Click any beat cell to jump to that timing
              </div>
            </div>
          )}
        </div>

        {/* Right side - Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time signature tag */}
          <div className="bg-blue-50 dark:bg-blue-200 border border-blue-200 dark:border-blue-300 rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-900">
              Time: {timeSignature === 6 ? '6/8' : `${timeSignature}/4`}
            </span>
          </div>

          {/* Key signature tag */}
          {keySignature && (
            <div className="bg-green-50 dark:bg-green-200 border border-green-200 dark:border-green-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-green-800 dark:text-green-900">
                Key: {keySignature.replace(/b/g, '♭').replace(/#/g, '♯')}
              </span>
            </div>
          )}

          {/* Key detection loading indicator */}
          {isDetectingKey && (
            <div className="bg-gray-50 dark:bg-gray-200 border border-gray-200 dark:border-gray-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-700">
                Detecting key...
              </span>
            </div>
          )}

          {/* Pickup beats indicator */}
          {hasPickupBeats && pickupBeatsCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-200 border border-blue-200 dark:border-blue-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-900">
                Pickup: {pickupBeatsCount} beat{pickupBeatsCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

        {/* Clean grid area with minimal background */}
        <div className="px-0 dark:bg-dark-bg bg-gray-50">
          {/* Render rows of measures */}
          <div className="space-y-0.5 overflow-x-auto">
        {rows.map((row, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="measure-row min-w-0"
          >
            {/* Grid of measures with consistent responsive layout */}
            <div className={`grid gap-1 sm:gap-1 w-full ${
              // Consistent grid that maintains complete measures per row across all screen sizes
              dynamicMeasuresPerRow === 1 ? 'grid-cols-1' :
              dynamicMeasuresPerRow === 2 ? 'grid-cols-2' :
              dynamicMeasuresPerRow === 3 ? 'grid-cols-3' :
              dynamicMeasuresPerRow === 4 ? 'grid-cols-4' :
              dynamicMeasuresPerRow === 5 ? 'grid-cols-5' :
              dynamicMeasuresPerRow === 6 ? 'grid-cols-6' :
              dynamicMeasuresPerRow === 7 ? 'grid-cols-7' :
              dynamicMeasuresPerRow === 8 ? 'grid-cols-8' :
              dynamicMeasuresPerRow === 9 ? 'grid-cols-9' :
              dynamicMeasuresPerRow === 10 ? 'grid-cols-10' :
              'grid-cols-4' // Fallback
            }`}>
              {row.map((measure, measureIdx) => {
                return (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="border-l-[3px] border-gray-600 dark:border-gray-400 min-w-0 flex-shrink-0"
                  style={{
                    paddingLeft: '2px'
                  }}
                >
                  {/* Chord cells for this measure - consistent grid based on time signature */}
                  <div className={`grid gap-0.5 auto-rows-fr ${getGridColumnsClass(actualBeatsPerMeasure)}`}>
                    {measure.chords.map((chord, beatIdx) => {
                      // Calculate global index with consistent measure layout
                      // Each measure always has exactly actualBeatsPerMeasure cells
                      let globalIndex = 0;

                      // Count beats from all previous rows (each measure has actualBeatsPerMeasure beats)
                      for (let r = 0; r < rowIdx; r++) {
                        globalIndex += rows[r].length * actualBeatsPerMeasure;
                      }

                      // Count beats from previous measures in current row
                      globalIndex += measureIdx * actualBeatsPerMeasure;

                      // Add current beat index within this measure
                      globalIndex += beatIdx;

                      // FIXED: Use currentBeatIndex directly - animation logic already accounts for shift/padding
                      // The analyze page animation logic handles shift and padding correctly
                      const isCurrentBeat = globalIndex === currentBeatIndex;


                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isEmpty = chord === '';

                      // SIMPLIFIED: Basic click logic without padding/shift complexity
                      let isClickable = false;
                      if (!!onBeatClick) {
                        // Simple check: cell is clickable if it has a valid timestamp AND is not empty
                        const timestamp = beats[globalIndex];
                        const isEmptyCell = chord === '';
                        isClickable = typeof timestamp === 'number' && timestamp >= 0 && !isEmptyCell;
                      }

                      // COMMENTED OUT: Complex padding/shift click logic
                      // const isShiftCell = hasPadding && globalIndex < shiftCount;
                      // if (isShiftCell) {
                      //   isClickable = false; // Shift cells are not clickable
                      // }

                      // PERFORMANCE OPTIMIZATION: Use memoized ChordCell component
                      // This prevents unnecessary re-renders when only currentBeatIndex changes
                      const { chord: displayChord, wasCorrected } = getDisplayChord(chord, globalIndex);

                      // Get segmentation color for this beat
                      const segmentationColor = getSegmentationColorForBeatIndex(globalIndex);

                      // Get Roman numeral for this chord using chord sequence mapping
                      // Only show Roman numeral when chord label is shown (chord changes)
                      const chordSequenceIndex = beatToChordSequenceMap[globalIndex];
                      const rawRomanNumeral = showRomanNumerals && showChordLabel && romanNumeralData?.analysis && chordSequenceIndex !== undefined
                        ? romanNumeralData.analysis[chordSequenceIndex] || ''
                        : '';
                      const romanNumeral = rawRomanNumeral ? formatRomanNumeral(rawRomanNumeral) : '';



                      return (
                        <ChordCell
                          key={`chord-${globalIndex}`}
                          chord={chord}
                          globalIndex={globalIndex}
                          isCurrentBeat={isCurrentBeat}
                          isClickable={isClickable}
                          cellSize={cellSize}
                          isDarkMode={isDarkMode}
                          showChordLabel={showChordLabel}
                          isEmpty={isEmpty}
                          displayChord={displayChord}
                          wasCorrected={wasCorrected}
                          segmentationColor={segmentationColor}
                          onBeatClick={handleBeatClick}
                          getChordStyle={getChordStyle}
                          getDynamicFontSize={getDynamicFontSize}
                          isEditMode={isEditMode}
                          editedChord={editedChords?.[globalIndex]}
                          onChordEdit={onChordEdit}
                          showRomanNumerals={showRomanNumerals}
                          romanNumeral={romanNumeral}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        ))}
          </div>
        </div> {/* Close grid area */}

      </div> {/* Close card container */}
    </div>
  );
});

ChordGrid.displayName = 'ChordGrid';

export default ChordGrid;
