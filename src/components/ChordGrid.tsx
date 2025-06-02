import React, { useEffect, useRef, useState } from 'react';
import {
  formatChordWithMusicalSymbols,
  getChordLabelStyles,
  getChordContainerStyles
} from '@/utils/chordFormatting';
import { useTheme } from '@/contexts/ThemeContext';


interface AudioMappingItem {
  chord: string;
  timestamp: number;
  visualIndex: number;
}

interface ChordGridProps {
  chords: string[]; // Array of chord labels (e.g., 'C', 'Am')
  beats: number[]; // Array of corresponding beat timestamps (in seconds) - FIXED: now contains actual timestamps
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
  // Visual indicator for corrected chords
  showCorrectedChords?: boolean; // Whether corrected chords are being displayed
  chordCorrections?: Record<string, string> | null; // Mapping of original chords to corrected chords (legacy)
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
}

const ChordGrid: React.FC<ChordGridProps> = ({
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
  showCorrectedChords = false,
  chordCorrections = null,
  sequenceCorrections = null
}) => {
  // Get theme for SVG selection
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  // Use simple time signature - no complex beat source logic
  const actualBeatsPerMeasure = timeSignature;

  // Function to apply chord corrections at display time
  const getDisplayChord = (originalChord: string, visualIndex?: number): { chord: string; wasCorrected: boolean } => {
    // Early return when corrections are disabled or chord is empty
    if (!showCorrectedChords || !originalChord) {
      return { chord: originalChord, wasCorrected: false };
    }



    // NEW: Try sequence-based corrections first (more accurate)
    if (sequenceCorrections && visualIndex !== undefined) {
      const { originalSequence, correctedSequence } = sequenceCorrections;

      // ENHANCED: Find the chord in the sequence corrections by matching the chord name
      // The sequence corrections are indexed by the original chord sequence from the API,
      // but the visual grid may have different indexing due to padding/shifting

      // Strategy 1: Try direct index mapping (works when no padding/shifting)
      let chordSequenceIndex = visualIndex;
      if (hasPadding) {
        // Remove shift and padding offset to get the actual chord sequence index
        chordSequenceIndex = visualIndex - (shiftCount + paddingCount);
      }

      // Strategy 2: If direct mapping fails, search for the chord in the sequence
      let foundCorrection = false;
      let correctedChord = originalChord;

      // Try direct index mapping first
      if (chordSequenceIndex >= 0 && chordSequenceIndex < originalSequence.length && chordSequenceIndex < correctedSequence.length) {
        const sequenceOriginal = originalSequence[chordSequenceIndex];
        const sequenceCorrected = correctedSequence[chordSequenceIndex];

        if (sequenceOriginal === originalChord && sequenceCorrected !== sequenceOriginal) {
          correctedChord = sequenceCorrected;
          foundCorrection = true;
        }
      }

      // If direct mapping didn't work, search for the chord in the sequence
      if (!foundCorrection) {
        for (let i = 0; i < originalSequence.length; i++) {
          const sequenceOriginal = originalSequence[i];
          const sequenceCorrected = correctedSequence[i];

          if (sequenceOriginal === originalChord && sequenceCorrected !== sequenceOriginal) {
            correctedChord = sequenceCorrected;
            foundCorrection = true;
            break; // Use the first match
          }
        }
      }

      if (foundCorrection) {
        return { chord: correctedChord, wasCorrected: true };
      }
    }

    // FALLBACK: Use legacy chord-by-chord corrections
    if (chordCorrections) {
      // Extract the root note from the chord (e.g., "C#:maj" -> "C#", "F#m" -> "F#")
      // Handle both formats: "C#:maj" and "C#m"
      let rootNote = originalChord;

      // For chords with colon notation (e.g., "C#:maj", "F#:min")
      if (originalChord.includes(':')) {
        rootNote = originalChord.split(':')[0];
      } else {
        // For chords without colon (e.g., "C#m", "F#", "Db7")
        // Extract root note (handle sharps and flats)
        const match = originalChord.match(/^([A-G][#b]?)/);
        if (match) {
          rootNote = match[1];
        }
      }

      // Check if we have a correction for this root note
      if (chordCorrections[rootNote]) {
        const correctedRoot = chordCorrections[rootNote];

        // Replace the root note in the original chord with the corrected one
        let correctedChord;
        if (originalChord.includes(':')) {
          // For "C#:maj" -> "Db:maj"
          correctedChord = originalChord.replace(rootNote, correctedRoot);
        } else {
          // For "C#m" -> "Dbm", "C#7" -> "Db7"
          correctedChord = originalChord.replace(rootNote, correctedRoot);
        }

        return { chord: correctedChord, wasCorrected: true };
      }
    }

    return { chord: originalChord, wasCorrected: false };
  };

  // UPDATED: Optimal beat shift calculation - detect chord changes from previous beat, score if on downbeat
  const calculateOptimalShift = (chords: string[], timeSignature: number): number => {
    // Use the shift count from backend if available, otherwise calculate
    if (hasPadding && shiftCount !== undefined) {
      // console.log(`Beat shift calculation: Using backend shift count: ${shiftCount}`);
      return shiftCount;
    }

    if (chords.length === 0) {
      // console.log('Beat shift calculation: No chords available, returning shift 0');
      return 0;
    }

    // console.log('\n=== BEAT SHIFT OPTIMIZATION DEBUG ===');
    // console.log(`Input: ${chords.length} chords, ${timeSignature}/4 time signature`);
    // console.log('First 12 chords:', chords.slice(0, 12));

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
        // Positive shift moves grid forward, negative shift moves grid backward (intuitive)
        const beatInMeasure = ((i + shift) % timeSignature) + 1;
        const isDownbeat = beatInMeasure === 1;

        // Debug logging for compound time signature issues
        // if (timeSignature === 3 && i < shift + 12) { // Log first 4 measures for 3/4 time
        //   console.log(`  Beat ${i}: chord="${currentChord}", prevChord="${previousChord}", beatInMeasure=${beatInMeasure}, isDownbeat=${isDownbeat}, isChordChange=${isChordChange}`);
        // }

        // Score: chord change that occurs on a downbeat
        if (isChordChange && isDownbeat) {
          chordChangeCount++;
          downbeatPositions.push(i);
          chordLabels.push(currentChord);
        }
      }

      shiftResults.push({
        shift,
        chordChanges: chordChangeCount,
        downbeatPositions,
        chordLabels
      });

      if (chordChangeCount > maxChordChanges) {
        maxChordChanges = chordChangeCount;
        bestShift = shift;
      }

      // console.log(`Shift ${shift}: ${chordChangeCount} chord changes on downbeats (NEW STRATEGY: compare with previous beat)`);
      // console.log(`  Downbeat positions: [${downbeatPositions.slice(0, 6).join(', ')}${downbeatPositions.length > 6 ? '...' : ''}]`);
      // console.log(`  Chord labels: [${chordLabels.slice(0, 6).join(', ')}${chordLabels.length > 6 ? '...' : ''}]`);
    }

    // console.log(`\n🎯 OPTIMAL SHIFT SELECTED: ${bestShift} (NEW STRATEGY)`);
    // console.log(`📊 RESULTS SUMMARY (chord changes from previous beat that land on downbeats):`);
    // shiftResults.forEach(result => {
    //   const isSelected = result.shift === bestShift;
    //   console.log(`  Shift ${result.shift}: ${result.chordChanges} chord changes on downbeats ${isSelected ? '← SELECTED' : ''}`);

    //   // Enhanced debugging for compound time signatures
    //   if (timeSignature === 3 && result.downbeatPositions.length > 0) {
    //     console.log(`    First few downbeat positions: [${result.downbeatPositions.slice(0, 6).join(', ')}]`);
    //     console.log(`    Corresponding chord labels: [${result.chordLabels.slice(0, 6).join(', ')}]`);

    //     // Verify beat positions are actually downbeats
    //     result.downbeatPositions.slice(0, 6).forEach(pos => {
    //       const beatInMeasure = ((pos - result.shift) % timeSignature) + 1;
    //       console.log(`      Position ${pos}: beatInMeasure=${beatInMeasure} ${beatInMeasure === 1 ? '✓ DOWNBEAT' : '✗ NOT DOWNBEAT'}`);
    //     });
    //   }
    // });

    // Show before/after comparison
    // const beforeDownbeats = shiftResults[0]; // Shift 0 (original)
    // const afterDownbeats = shiftResults[bestShift];
    // console.log(`\n📈 IMPROVEMENT: ${beforeDownbeats.chordChanges} → ${afterDownbeats.chordChanges} chord changes on downbeats (+${afterDownbeats.chordChanges - beforeDownbeats.chordChanges})`);

    // Additional debugging for compound time signatures
    // if (timeSignature === 3) {
    //   console.log(`\n🔍 COMPOUND TIME SIGNATURE (3/4) ANALYSIS:`);
    //   console.log(`  Time signature: ${timeSignature}/4`);
    //   console.log(`  Best shift: ${bestShift}`);
    //   console.log(`  Expected downbeat pattern: beat positions ${bestShift}, ${bestShift + 3}, ${bestShift + 6}, ${bestShift + 9}...`);

    //   // Verify the first few measures have correct downbeat alignment
    //   const expectedDownbeats = [];
    //   for (let measure = 0; measure < 4; measure++) {
    //     expectedDownbeats.push(bestShift + (measure * timeSignature));
    //   }
    //   console.log(`  Expected first 4 downbeats: [${expectedDownbeats.join(', ')}]`);
    //   console.log(`  Actual downbeats found: [${afterDownbeats.downbeatPositions.slice(0, 4).join(', ')}]`);
    // }

    // console.log('=== END BEAT SHIFT OPTIMIZATION DEBUG (NEW STRATEGY) ===\n');

    return bestShift;
  };

  // COMPREHENSIVE STRATEGY: Use backend-provided padding/shift data
  let shiftedChords: string[];
  let optimalShift: number;

  if (hasPadding) {
    // COMPREHENSIVE STRATEGY: Backend already provided correctly ordered chords with padding/shift
    // The chords prop already contains: [shift cells (''), padding cells ('N.C.'), regular chords]
    shiftedChords = chords; // Use as-is, no additional shifting needed
    optimalShift = 0; // No additional shift needed
  } else {
    // FALLBACK STRATEGY: Apply ChordGrid's own shift logic
    optimalShift = calculateOptimalShift(chords, actualBeatsPerMeasure);
    shiftedChords = chords.length > 0 ? [
      ...Array(optimalShift).fill(''), // Add k empty greyed-out cells at the beginning
      ...chords // Original chords follow after the shift
    ] : chords;
  }

  // Enhanced debug logging with shift verification
  // console.log(`\n🎼 CHORD GRID LAYOUT DEBUG:`);
  // console.log(`📊 Grid Info: ${chords.length} chords, ${timeSignature}/4 time signature`);
  // if (hasPadding && shiftCount !== undefined) {
  //   console.log(`🔄 Applied Shift: ${optimalShift} beats (using backend shift count)`);
  // } else {
  //   console.log(`🔄 Applied Shift: ${optimalShift} beats (calculated from NEW chord analysis strategy)`);
  // }

  // Verify the shift was applied correctly
  // if (optimalShift > 0 && chords.length > 0) {
  //   console.log(`✅ SHIFT VERIFICATION:`);
  //   console.log(`  Original first 6 chords: [${chords.slice(0, 6).join(', ')}]`);
  //   console.log(`  Shifted first 6 chords:  [${shiftedChords.slice(0, 6).join(', ')}]`);
  //   console.log(`  Expected shift pattern: Original[${optimalShift}:] + Original[0:${optimalShift}]`);

  //   // Verify downbeat alignment in shifted data - check for chord changes
  //   const shiftedDownbeatChords = [];
  //   for (let i = 0; i < shiftedChords.length; i += timeSignature) {
  //     shiftedDownbeatChords.push(shiftedChords[i] || 'empty');
  //   }
  //   console.log(`  Shifted downbeat chords: [${shiftedDownbeatChords.slice(0, 6).join(', ')}${shiftedDownbeatChords.length > 6 ? '...' : ''}]`);

  //   // Count chord changes in shifted data for verification
  //   let shiftedChordChanges = 0;
  //   let prevChord = '';
  //   for (const chord of shiftedDownbeatChords) {
  //     if (chord !== prevChord && chord !== 'empty' && chord !== 'N/C' && chord !== 'N.C.' && chord !== 'N') {
  //       shiftedChordChanges++;
  //     }
  //     prevChord = chord;
  //   }
  //   console.log(`  Chord changes on downbeats after forward shift: ${shiftedChordChanges}`);
  //   console.log(`  Note: Shift ${optimalShift} means chord labels moved ${optimalShift} beats forward`);
  // } else if (optimalShift === 0) {
  //   console.log(`ℹ️  No shift applied (optimal shift = 0)`);
  // }
  // console.log(`🎼 END CHORD GRID LAYOUT DEBUG\n`);

  // Helper to get the appropriate CSS grid columns class based on time signature
  const getGridColumnsClass = (beatsPerMeasure: number): string => {
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
  };

  // Removed complex debug logging
  // Reference to the grid container for measuring cell size
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState<number>(0);
  const [screenWidth, setScreenWidth] = useState<number>(1200); // Default for SSR



  // FIX 4: Dynamic font sizing system based on cell size
  const getDynamicFontSize = (cellSize: number, chordLength: number = 1): string => {
    if (cellSize === 0) return 'text-sm'; // Default fallback

    // Base font size calculation: scale with cell size
    // Smaller cells (mobile/complex time signatures) get smaller fonts
    // Larger cells (desktop/simple time signatures) get larger fonts
    let baseFontSize: number;

    if (cellSize < 60) {
      baseFontSize = 10; // Very small cells (mobile, complex time signatures)
    } else if (cellSize < 80) {
      baseFontSize = 12; // Small cells
    } else if (cellSize < 100) {
      baseFontSize = 14; // Medium cells
    } else if (cellSize < 120) {
      baseFontSize = 16; // Large cells
    } else {
      baseFontSize = 18; // Very large cells (wide screens)
    }

    // Adjust for chord complexity (longer chord names get slightly smaller fonts)
    if (chordLength > 4) {
      baseFontSize = Math.max(8, baseFontSize - 2);
    } else if (chordLength > 2) {
      baseFontSize = Math.max(8, baseFontSize - 1);
    }

    // Convert to Tailwind CSS classes
    if (baseFontSize <= 10) return 'text-xs';
    if (baseFontSize <= 12) return 'text-sm';
    if (baseFontSize <= 14) return 'text-base';
    if (baseFontSize <= 16) return 'text-lg';
    return 'text-xl';
  };

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

          // Debug: Log cell size changes for font sizing
          // console.log(`ChordGrid cell size updated: ${width}px, dynamic font class: ${getDynamicFontSize(width)}`);
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
  }, [chords.length, actualBeatsPerMeasure]); // Re-run when chord data or time signature changes


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

  // Handle beat cell clicks for navigation
  const handleBeatClick = (globalIndex: number) => {
    if (!onBeatClick || !beats || beats.length === 0) return;

    // FIXED: Use beat index matching instead of chord type matching
    // Map visual grid index to the corresponding beat index in originalAudioMapping

    // Check if this is a shift cell (not clickable)
    const isShiftCell = hasPadding && globalIndex < shiftCount;
    const isPaddingCell = hasPadding && globalIndex >= shiftCount && globalIndex < (shiftCount + paddingCount);

    if (isShiftCell) {
      // console.log(`Beat cell clicked: visual index ${globalIndex} -> not clickable (shift cell)`);
      return; // Don't allow clicking on shift cells
    }

    // Handle padding cells - calculate timestamps based on time range
    if (isPaddingCell) {
      const paddingIndex = globalIndex - shiftCount;

      // FIXED: Calculate padding timestamps based on beat_time_range_start
      // Padding cells represent time from 0.0s to beat_time_range_start
      const firstDetectedBeatTime = beats.length > 0 ? beats[0] : 0;
      const paddingDuration = beatTimeRangeStart > 0 ? beatTimeRangeStart : firstDetectedBeatTime;

      if (paddingCount > 0 && paddingDuration > 0) {
        // Calculate timestamp for this padding cell
        const paddingCellDuration = paddingDuration / paddingCount;
        const timestamp = paddingIndex * paddingCellDuration;

        // console.log(`Beat cell clicked: visual index ${globalIndex} -> padding cell ${paddingIndex} -> timestamp ${timestamp.toFixed(3)}s (calculated from ${paddingDuration.toFixed(3)}s range, beatTimeRangeStart=${beatTimeRangeStart})`);
        onBeatClick(globalIndex, timestamp); // Use globalIndex as beatIndex for padding cells
      } else {
        // console.warn(`Beat cell clicked: padding cell ${paddingIndex} -> cannot calculate timestamp (paddingCount=${paddingCount}, paddingDuration=${paddingDuration}, beatTimeRangeStart=${beatTimeRangeStart})`);
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
        finalTimestamp = beats[globalIndex];
      }
    } else {
      // Fallback to beats array if no audio mapping available
      finalTimestamp = beats[globalIndex];
    }

    // Validate timestamp and execute click
    if (typeof finalTimestamp === 'number' && finalTimestamp >= 0) {
      onBeatClick(globalIndex, finalTimestamp); // Use original timestamp for accurate audio sync
    } else {
      return;
    }
  };





  // Enhanced dynamic measures per row calculation with screen width awareness
  const getDynamicMeasuresPerRow = (timeSignature: number, chatbotOpen: boolean, lyricsPanelOpen: boolean, currentScreenWidth: number): number => {
    // Use the current screen width from state

    // Determine screen category
    const isMobile = currentScreenWidth < 768;
    const isTablet = currentScreenWidth >= 768 && currentScreenWidth < 1024;
    const isDesktop = currentScreenWidth >= 1024 && currentScreenWidth < 1440;
    // const isLargeDesktop = currentScreenWidth >= 1440;

    // Check if any panel is open
    const anyPanelOpen = chatbotOpen || lyricsPanelOpen;

    // Base calculation targeting optimal cell count per screen size
    let targetCellsPerRow: number;
    let maxMeasuresPerRow: number;

    if (isMobile) {
      targetCellsPerRow = anyPanelOpen ? 4 : 6; // More conservative when panels are open
      maxMeasuresPerRow = anyPanelOpen ? 1 : 2;
    } else if (isTablet) {
      targetCellsPerRow = anyPanelOpen ? 8 : 12; // Reduce when panels are open
      maxMeasuresPerRow = anyPanelOpen ? 3 : 4;
    } else if (isDesktop) {
      targetCellsPerRow = anyPanelOpen ? 12 : 18; // Significant reduction when panels are open
      maxMeasuresPerRow = anyPanelOpen ? 4 : 6;
    } else { // Large desktop
      targetCellsPerRow = anyPanelOpen ? 16 : 24; // Still reduce for large screens
      maxMeasuresPerRow = anyPanelOpen ? 6 : 8;
    }

    // Calculate base measures per row
    let measuresPerRow = Math.max(1, Math.floor(targetCellsPerRow / timeSignature));

    // Apply additional reduction if panels are open (more aggressive than before)
    if (anyPanelOpen) {
      measuresPerRow = Math.max(1, Math.floor(measuresPerRow * 0.8)); // Slightly less aggressive than before
    }

    // Apply time signature complexity limits
    if (timeSignature >= 7) {
      maxMeasuresPerRow = Math.min(maxMeasuresPerRow, anyPanelOpen ? 2 : 3); // Very complex: max 2-3 measures
    } else if (timeSignature >= 5) {
      maxMeasuresPerRow = Math.min(maxMeasuresPerRow, anyPanelOpen ? 3 : 4); // Moderate: max 3-4 measures
    }

    // Ensure we don't exceed screen-appropriate maximums
    measuresPerRow = Math.min(measuresPerRow, maxMeasuresPerRow);

    // console.log(`Screen-aware layout: width=${currentScreenWidth}px, timeSignature=${timeSignature}, chatbot=${chatbotOpen}, lyrics=${lyricsPanelOpen}, anyPanel=${anyPanelOpen}, targetCells=${targetCellsPerRow}, calculatedMeasures=${measuresPerRow}, maxAllowed=${maxMeasuresPerRow}, totalCells=${measuresPerRow * timeSignature}`);

    return measuresPerRow;
  };

  // Use dynamic measures per row with current screen width
  const dynamicMeasuresPerRow = getDynamicMeasuresPerRow(actualBeatsPerMeasure, isChatbotOpen, isLyricsPanelOpen, screenWidth);

  // Enhanced chord styling with pickup beat support and clickable behavior
  const getChordStyle = (chord: string, isCurrentBeat: boolean, beatIndex: number, isClickable: boolean = true) => {
    // Base classes for all cells - add cursor pointer and hover effects for clickable cells
    const baseClasses = `flex flex-col items-start justify-center aspect-square transition-all duration-200 border border-gray-300 dark:border-gray-600 rounded-sm overflow-hidden ${
      isClickable ? 'cursor-pointer hover:shadow-md hover:scale-105 active:scale-95' : ''
    }`;

    // Determine cell type
    const isEmpty = chord === '';
    const isPickupBeat = hasPickupBeats && beatIndex < timeSignature && beatIndex >= (timeSignature - pickupBeatsCount);

    // COMMENTED OUT: Complex padding/shift styling logic
    // const isShiftBeat = hasPadding && chord === '' && beatIndex < shiftCount;
    // const isPaddingBeat = hasPadding && chord === 'N.C.' && beatIndex >= shiftCount && beatIndex < (shiftCount + paddingCount);

    // DEBUG: Log styling decisions for first few cells
    // if (beatIndex < 5) {
    //   console.log(`🎨 STYLING DEBUG[${beatIndex}]: chord="${chord}" hasPadding=${hasPadding} shiftCount=${shiftCount} paddingCount=${paddingCount}`);
    //   console.log(`  isShiftBeat=${isShiftBeat} (chord==='${chord}' && beatIndex=${beatIndex} < shiftCount=${shiftCount})`);
    //   console.log(`  isPaddingBeat=${isPaddingBeat} (chord==='${chord}' && beatIndex=${beatIndex} >= ${shiftCount} && < ${shiftCount + paddingCount})`);
    //   console.log(`  isEmpty=${isEmpty} isPickupBeat=${isPickupBeat}`);
    // }

    // Default styling - improved dark mode contrast
    let classes = `${baseClasses} bg-white dark:bg-content-bg`;
    let textColor = "text-gray-800 dark:text-gray-100";

    // Add hover effects for clickable cells
    if (isClickable) {
      classes += " hover:bg-gray-50 dark:hover:bg-gray-600 hover:border-gray-400 dark:hover:border-gray-400";
    }

    // SIMPLIFIED: Only check basic cell types without complex padding/shift logic
    // Empty cell styling (greyed out) - improved dark mode contrast
    if (isEmpty) {
      classes = `${baseClasses} bg-gray-100 dark:bg-gray-600 border-gray-200 dark:border-gray-500`;
      textColor = "text-gray-400 dark:text-gray-400";

      if (isClickable) {
        classes += " hover:bg-gray-200 dark:hover:bg-gray-500 hover:border-gray-300 dark:hover:border-gray-400";
      }
    }
    // Pickup beat styling (slightly different background) - improved dark mode
    else if (isPickupBeat) {
      classes = `${baseClasses} bg-blue-50 dark:bg-blue-800 border-blue-200 dark:border-blue-600`;
      textColor = "text-blue-800 dark:text-blue-100";

      if (isClickable) {
        classes += " hover:bg-blue-100 dark:hover:bg-blue-700 hover:border-blue-300 dark:hover:border-blue-500";
      }
    }

    // Highlight current beat (overrides other styling) - much improved dark mode visibility
    if (isCurrentBeat) {
      if (isEmpty) {
        // Don't highlight empty cells as strongly but make them more visible in dark mode
        classes = `${baseClasses} bg-gray-200 dark:bg-gray-500 ring-2 ring-gray-400 dark:ring-gray-300`;
        textColor = "text-gray-600 dark:text-gray-200";
      } else {
        // Much brighter and more visible current beat highlighting
        classes = `${baseClasses} bg-blue-100 dark:bg-blue-600 ring-2 ring-blue-500 dark:ring-blue-300 shadow-lg`;
        textColor = "text-gray-800 dark:text-white";
      }

      // Current beat cells should still be clickable
      if (isClickable) {
        classes += " hover:ring-blue-600 dark:hover:ring-blue-200";
      }
    }

    return `${classes} ${textColor}`;
  };

  if (chords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-700 dark:text-gray-200 text-center p-4 bg-white dark:bg-content-bg rounded-lg border border-gray-200 dark:border-gray-600 w-full transition-colors duration-300">
          No chord data available for this song yet.
        </p>
      </div>
    );
  }

  // Enhanced measure grouping with proper pickup beat handling using shifted chords
  const groupedByMeasure: Array<{
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
      measure.beats.push(beats[currentIndex]);
      currentIndex++;
    }

    // Pad incomplete measures to maintain consistent grid layout
    while (measure.chords.length < actualBeatsPerMeasure) {
      measure.chords.push(''); // Empty cell for padding
      measure.beats.push(-1); // Invalid beat index for padding
    }

    groupedByMeasure.push(measure);
    measureNumber++;
  }

  // DEBUG: Show simplified measure grouping
  // console.log(`📊 SIMPLIFIED MEASURE GROUPING: ${groupedByMeasure.length} measures`);
  // groupedByMeasure.slice(0, 3).forEach((m, i) => {
  //   console.log(`  Measure ${i}: [${m.chords.join(', ')}]`);
  // });

  // COMMENTED OUT: Complex padding/shift measure grouping
  // const firstMusicBeatOffset = hasPadding ? (shiftCount + paddingCount) : 0;
  // console.log(`🎼 DOWNBEAT CALCULATION: firstMusicBeatOffset=${firstMusicBeatOffset}, timeSignature=${actualBeatsPerMeasure}`);
  // console.log(`   Expected downbeats (visual positions): [${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(i => ((i - firstMusicBeatOffset) % actualBeatsPerMeasure) === 0).slice(0, 6).join(', ')}]`);

  // BEAT/CHORD ALIGNMENT DEBUG - Enhanced debug output for measure grouping with shift verification
  // console.log(`\n🎵 BEAT/CHORD ALIGNMENT DEBUG:`);
  // console.log(`📊 Grid: ${groupedByMeasure.length} measures, ${actualBeatsPerMeasure}/4 time signature`);
  // console.log(`🔄 Applied shift: ${optimalShift} beats`);
  // console.log(`📈 Data lengths: chords=${chords.length}, beats=${beats.length}, shiftedChords=${shiftedChords.length}`);
  // console.log(`🎯 Padding info: hasPadding=${hasPadding}, shiftCount=${shiftCount}, paddingCount=${paddingCount}`);

  // Show first few measures with their chord content
  // console.log('📋 First 3 measures structure:');
  // groupedByMeasure.slice(0, 3).forEach((m, i) => {
  //   console.log(`  Measure ${i}: [${m.chords.join(', ')}] ${m.isPickupMeasure ? '(pickup)' : ''}`);
  //   console.log(`  Measure ${i} beats: [${m.beats.join(', ')}]`);
  // });

  // Debug: Verify sequential beat progression using shifted chords
  // const allShiftedBeats = groupedByMeasure.flatMap(m => m.chords);
  // console.log(`🎼 Shifted chord sequence (first 12): [${allShiftedBeats.slice(0, 12).join(', ')}]`);

  // Compare with original sequence for verification
  // console.log(`📊 Original chord sequence (first 12): [${chords.slice(0, 12).join(', ')}]`);
  // console.log(`✅ Shift verification: Original[${optimalShift}:] should match Shifted[0:]`);
  // console.log(`   Original[${optimalShift}:${optimalShift + 6}]: [${chords.slice(optimalShift, optimalShift + 6).join(', ')}]`);
  // console.log(`   Shifted[0:6]: [${allShiftedBeats.slice(0, 6).join(', ')}]`);

  // BEAT TIMING ANALYSIS
  // console.log(`\n🕐 BEAT TIMING ANALYSIS:`);
  // console.log(`📊 Comprehensive beats array (first 12): [${beats.slice(0, 12).map(b => typeof b === 'number' ? b.toFixed(3) : b).join(', ')}]`);

  // Show beat-to-chord mapping for first 12 positions
  // console.log(`\n🎯 BEAT-TO-CHORD MAPPING (first 12 visual positions):`);
  // for (let i = 0; i < Math.min(12, Math.max(shiftedChords.length, beats.length)); i++) {
  //   const chord = shiftedChords[i] || 'undefined';
  //   const beatTime = beats[i];
  //   const beatTimeStr = typeof beatTime === 'number' ? beatTime.toFixed(3) + 's' : String(beatTime);
  //   console.log(`  Visual[${i}]: chord="${chord}" -> beat=${beatTimeStr}`);
  // }

  // COMPLETE BEAT GRID PRINTOUT
  // console.log(`\n📋 COMPLETE BEAT GRID STRUCTURE:`);
  // console.log(`🎼 Total visual positions: ${Math.max(shiftedChords.length, beats.length)}`);
  // console.log(`📊 Grid layout: ${groupedByMeasure.length} measures × ${actualBeatsPerMeasure} beats/measure`);

  // Print complete grid with visual index, chord, and beat time
  // console.log(`\n🎯 COMPLETE BEAT-TO-CHORD MAPPING:`);
  // const maxLength = Math.max(shiftedChords.length, beats.length);
  // for (let i = 0; i < maxLength; i++) {
  //   const chord = shiftedChords[i] || 'undefined';
  //   const beatTime = beats[i];
  //   const beatTimeStr = typeof beatTime === 'number' ? beatTime.toFixed(3) + 's' : String(beatTime);

  //   // Determine cell type for context
  //   let cellType = 'model';
  //   if (hasPadding && i < shiftCount) {
  //     cellType = 'shift';
  //   } else if (hasPadding && i >= shiftCount && i < (shiftCount + paddingCount)) {
  //     cellType = 'padding';
  //   }

  //   // Calculate measure and beat position
  //   const measureNum = Math.floor(i / actualBeatsPerMeasure);
  //   const beatInMeasure = (i % actualBeatsPerMeasure) + 1;

  //   console.log(`  Visual[${i.toString().padStart(2)}]: chord="${chord.padEnd(8)}" beat=${beatTimeStr.padEnd(8)} type=${cellType.padEnd(7)} measure=${measureNum} beat=${beatInMeasure}/${actualBeatsPerMeasure}`);
  // }

  // CHORD DURATION ANALYSIS - Calculate actual durations vs expected
  // console.log(`\n⏱️ CHORD DURATION ANALYSIS:`);

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

  // Print chord duration analysis
  // console.log(`📊 Found ${chordDurations.length} chord segments:`);
  // chordDurations.forEach((segment, index) => {
  //   const startTimeStr = segment.startTime.toFixed(3) + 's';
  //   const endTimeStr = segment.endTime.toFixed(3) + 's';
  //   const durationStr = segment.duration.toFixed(3) + 's';
  //   console.log(`  ${index.toString().padStart(2)}: "${segment.chord.padEnd(8)}" beats[${segment.startBeat.toString().padStart(2)}-${segment.endBeat.toString().padStart(2)}] time[${startTimeStr.padEnd(8)}-${endTimeStr.padEnd(8)}] duration=${durationStr.padEnd(8)}`);
  // });

  // console.log(`🎵 END COMPLETE BEAT GRID DEBUG\n`);

  // Group measures into rows using the dynamic measures per row
  const rows: Array<typeof groupedByMeasure> = [];
  for (let i = 0; i < groupedByMeasure.length; i += dynamicMeasuresPerRow) {
    rows.push(groupedByMeasure.slice(i, i + dynamicMeasuresPerRow));
  }

  return (
    <div ref={gridContainerRef} className="chord-grid-container mx-auto px-1 sm:px-2 relative" style={{ maxWidth: "98%" }}>

      {/* Header section with improved layout - title left, tags right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors duration-300">
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
              Time: {timeSignature}/4
            </span>
          </div>

          {/* Key signature tag */}
          {keySignature && (
            <div className="bg-green-50 dark:bg-green-200 border border-green-200 dark:border-green-300 rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-green-800 dark:text-green-900">
                Key: {keySignature}
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

      {/* Render rows of measures */}
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} className="measure-row">
            {/* Grid of measures with aggressive responsive layout to prevent fall-through */}
            <div className={`grid gap-1 md:gap-2 ${
              // More aggressive responsive grid that reaches target measures per row faster
              dynamicMeasuresPerRow === 1 ? 'grid-cols-1' :
              dynamicMeasuresPerRow === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              dynamicMeasuresPerRow === 3 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' :
              dynamicMeasuresPerRow === 4 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4' :
              dynamicMeasuresPerRow === 5 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
              dynamicMeasuresPerRow === 6 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6' :
              dynamicMeasuresPerRow === 7 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7' :
              dynamicMeasuresPerRow === 8 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8' :
              dynamicMeasuresPerRow === 9 ? 'grid-cols-1 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9' :
              dynamicMeasuresPerRow === 10 ? 'grid-cols-1 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10' :
              'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' // Fallback
            }`}>
              {row.map((measure, measureIdx) => {
                return (
                <div
                  key={`measure-${rowIdx}-${measureIdx}`}
                  className="border-l-[3px] border-gray-600 dark:border-gray-300 transition-colors duration-300"
                  style={{
                    paddingLeft: '4px'
                  }}
                >
                  {/* Chord cells for this measure - consistent grid based on time signature */}
                  <div className={`grid gap-1 auto-rows-fr ${getGridColumnsClass(actualBeatsPerMeasure)}`}>
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

                      // BEAT ANIMATION DEBUG - Log current beat highlighting
                      // if (isCurrentBeat) {
                      //   const beatTime = beats[globalIndex];
                      //   const beatTimeStr = typeof beatTime === 'number' ? beatTime.toFixed(3) + 's' : String(beatTime);
                      //   console.log(`🎯 CURRENT BEAT HIGHLIGHT: Visual[${globalIndex}] chord="${chord}" beat=${beatTimeStr} (currentBeatIndex=${currentBeatIndex})`);
                      // }
                      const showChordLabel = shouldShowChordLabel(globalIndex);
                      const isEmpty = chord === '';

                      // SIMPLIFIED: Basic click logic without padding/shift complexity
                      let isClickable = false;
                      if (!!onBeatClick) {
                        // Simple check: cell is clickable if it has a valid timestamp
                        const timestamp = beats[globalIndex];
                        isClickable = typeof timestamp === 'number' && timestamp >= 0;
                      }

                      // COMMENTED OUT: Complex padding/shift click logic
                      // const isShiftCell = hasPadding && globalIndex < shiftCount;
                      // if (isShiftCell) {
                      //   isClickable = false; // Shift cells are not clickable
                      // }

                      return (
                        <div
                          id={`chord-${globalIndex}`}
                          key={`chord-${globalIndex}`}
                          className={`${getChordStyle(chord, isCurrentBeat, globalIndex, isClickable)} w-full h-full min-h-[3.75rem] chord-cell`}
                          onClick={isClickable ? () => handleBeatClick(globalIndex) : undefined}
                          role={isClickable ? "button" : undefined}
                          tabIndex={isClickable ? 0 : undefined}
                          onKeyDown={isClickable ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleBeatClick(globalIndex);
                            }
                          } : undefined}
                          aria-label={isClickable ? `Jump to beat ${globalIndex + 1}${chord ? `, chord ${chord}` : ''}` : undefined}
                        >
                          {/* Enhanced chord display with pickup beat support */}
                          <div style={getChordContainerStyles()}>
                            {!isEmpty && showChordLabel && chord ? (() => {
                              const { chord: displayChord, wasCorrected } = getDisplayChord(chord, globalIndex);



                              return (
                                <div
                                  className={`${getDynamicFontSize(cellSize, displayChord.length)} font-medium leading-tight ${
                                    wasCorrected ? 'text-purple-700 dark:text-purple-300' : ''
                                  }`}
                                  style={getChordLabelStyles(displayChord)}
                                  dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(displayChord, isDarkMode) }}
                                />
                              );
                            })() : isEmpty ? (
                              // Empty cell - no content
                              <div className="opacity-0" style={getChordLabelStyles('')}>·</div>
                            ) : (
                              // Non-empty cell but no label to show
                              <div className="opacity-0" style={getChordLabelStyles('')}>·</div>
                            )}
                          </div>
                        </div>
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
    </div>
  );
};

export default ChordGrid;