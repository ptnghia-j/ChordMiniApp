// Types for chord grid processing
interface AnalysisResult {
  chords: Array<{chord: string, time?: number, start?: number}>;
  beats: Array<{time: number, beatNum?: number} | number>;
  downbeats: number[];
  downbeats_with_measures: number[];
  synchronizedChords: Array<{chord: string, beatIndex: number, beatNum?: number}>;
  beatModel: string;
  chordModel: string;
  audioDuration: number;
  beatDetectionResult: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
    beat_time_range_start?: number;
  };
}

interface ChordGridData {
  chords: (string | null)[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
  animationMapping?: Array<{
    timestamp: number;
    visualIndex: number;
    chord: string;
  }>;
}

interface ShiftResult {
  shift: number;
  chordChanges: number;
  downbeatPositions: number[];
  chordLabels: string[];
}

interface PaddingResult {
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount: number;
}

/**
 * Calculate optimal shift for chord alignment with downbeats
 * Lines 1194-1414 from original component
 */
export const calculateOptimalShift = (chords: string[], timeSignature: number, paddingCount: number = 0): number => {
  if (chords.length === 0) {
    return 0;
  }

  let bestShift = 0;
  let maxChordChanges = 0;
  const shiftResults: ShiftResult[] = [];

  // Test each possible shift value (0 to timeSignature-1)
  for (let shift = 0; shift < timeSignature; shift++) {
    let chordChangeCount = 0;
    const downbeatPositions: number[] = [];
    const chordLabels: string[] = [];

    // Check each beat position after applying the shift
    let previousDownbeatChord = '';

    for (let i = 0; i < chords.length; i++) {
      const currentChord = chords[i];

      // FIXED: Calculate beat position accounting for TOTAL padding offset
      // The music will start at position (paddingCount + shiftCount) in the final visual grid
      // So we need to calculate what beat position this chord will have in the final grid
      const totalPadding = paddingCount + shift; // Total offset before music starts
      const visualPosition = totalPadding + i; // Position in final visual grid
      const beatInMeasure = (visualPosition % timeSignature) + 1;
      const isDownbeat = beatInMeasure === 1;

      // Only check for chord changes on downbeats
      if (isDownbeat) {
        // FIXED: Only count chord changes, not repetitions
        // A chord change occurs when:
        // 1. Current chord is different from the previous downbeat chord
        // 2. Current chord is not empty/N.C.
        // 3. We have seen a previous downbeat chord (not the very first)
        const isValidChord = currentChord && currentChord !== '' &&
                            currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

        const isChordChange = isValidChord &&
                             previousDownbeatChord !== '' && // Must have a previous chord to compare
                             currentChord !== previousDownbeatChord; // Must be different

        // OPTION 2: Only count chord changes that START on downbeats
        // This ensures both musical alignment (on downbeats) and visual accuracy (where chords start)
        if (isChordChange) {
          // Check if this chord actually starts on this downbeat position
          const chordStartsHere = i === 0 || chords[i - 1] !== currentChord;

          if (chordStartsHere) {
            // This chord starts on this downbeat - count it!
            chordChangeCount++;
            downbeatPositions.push(i); // Record the downbeat position where chord starts
            chordLabels.push(currentChord);
          }
        }

        // FIXED: Update previous downbeat chord for ALL valid chords on downbeats
        // This ensures we track the last chord seen on any downbeat for comparison
        if (isValidChord) {
          previousDownbeatChord = currentChord;
        }
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
  }

  return bestShift;
};

/**
 * Calculate padding and shift for optimal chord alignment
 * Lines 1416-1489 from original component
 */
export const calculatePaddingAndShift = (firstDetectedBeatTime: number, bpm: number, timeSignature: number, chords: string[] = []): PaddingResult => {
  // DEBUG: Temporarily force padding for testing if first beat is > 0.05s
  if (firstDetectedBeatTime <= 0.05) {
    return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
  }

  // STEP 1: Calculate padding based on first detected beat time
  // Formula: Math.floor((first_detected_beat_time / 60) * bpm)
  const rawPaddingCount = Math.floor((firstDetectedBeatTime / 60) * bpm);

  // Enhanced padding calculation: if the gap is significant (>20% of a beat), add 1 beat of padding
  // IMPROVED: Round beat duration to 3 decimal places for consistent timing calculations
  const beatDuration = Math.round((60 / bpm) * 1000) / 1000; // Duration of one beat in seconds (rounded to ms precision)
  const gapRatio = firstDetectedBeatTime / beatDuration;
  const paddingCount = rawPaddingCount === 0 && gapRatio > 0.2 ? 1 : rawPaddingCount;

  // DEBUG: Force padding for testing if we have a reasonable first beat time
  let debugPaddingCount = paddingCount;
  if (paddingCount === 0 && firstDetectedBeatTime > 0.1) {
    debugPaddingCount = Math.max(1, Math.floor(gapRatio)); // Force at least 1 padding beat
  }

  // More reasonable limit: allow up to 4 measures of padding for long intros
  if (debugPaddingCount <= 0 || debugPaddingCount >= timeSignature * 4) {
    return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
  }

  // STEP 1.5: OPTIMIZE FULL MEASURE PADDING - Remove complete measures to reduce visual clutter
  // If we have a full measure or more of padding, remove one complete measure
  let optimizedPaddingCount = debugPaddingCount;
  if (debugPaddingCount >= timeSignature) {
    const fullMeasuresToRemove = Math.floor(debugPaddingCount / timeSignature);
    // Remove one full measure to reduce visual clutter, but keep any partial measure
    optimizedPaddingCount = debugPaddingCount - (fullMeasuresToRemove * timeSignature);

    // If we removed all padding, keep at least a partial measure if the original was significant
    if (optimizedPaddingCount === 0 && debugPaddingCount >= timeSignature) {
      optimizedPaddingCount = debugPaddingCount % timeSignature;
      if (optimizedPaddingCount === 0) {
        optimizedPaddingCount = timeSignature; // Keep one full measure if it was exactly divisible
      }
    }
  }

  // STEP 2: Calculate optimal shift using chord change analysis
  let shiftCount = 0;
  if (chords.length > 0) {
    // Use optimal chord-based shift calculation with optimized padding
    shiftCount = calculateOptimalShift(chords, timeSignature, optimizedPaddingCount);
  } else {
    // Fallback to position-based calculation if no chords available
    const beatPositionInMeasure = ((optimizedPaddingCount) % timeSignature) + 1;
    const finalBeatPosition = beatPositionInMeasure > timeSignature ? 1 : beatPositionInMeasure;
    shiftCount = finalBeatPosition === 1 ? 0 : (timeSignature - finalBeatPosition + 1);
  }

  const totalPaddingCount = optimizedPaddingCount + shiftCount;

  return { paddingCount: optimizedPaddingCount, shiftCount, totalPaddingCount };
};

/**
 * Multi-model chord grid construction with padding and shift optimization
 * Lines 1492-1847 from original component
 */
export const getChordGridData = (analysisResults: AnalysisResult | null): ChordGridData => {
  if (!analysisResults || !analysisResults.synchronizedChords) {
    return { chords: [], beats: [], hasPadding: false, paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
  }

  // Use first detected beat time for padding calculation
  const firstDetectedBeat = analysisResults.beats.length > 0 ? 
    (typeof analysisResults.beats[0] === 'object' ? analysisResults.beats[0].time : analysisResults.beats[0]) : 0;
  const bpm = analysisResults.beatDetectionResult?.bpm || 120;
  const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;

  // Extract chord data for optimal shift calculation
  const chordData = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);

  // Use first detected beat time for comprehensive padding and shifting calculation
  const { paddingCount, shiftCount } = calculatePaddingAndShift(firstDetectedBeat, bpm, timeSignature, chordData);

  // Apply comprehensive strategy if we have either padding OR shifting
  if (paddingCount > 0 || shiftCount > 0) {
    // Add only padding N.C. chords (based on first detected beat time)
    // Shifting will be handled in the frontend as greyed-out cells
    const paddingChords = Array(paddingCount).fill('N.C.');
    // FIXED: Create padding timestamps that start from 0.0s and are evenly distributed to first detected beat
    const paddingTimestamps = Array(paddingCount).fill(0).map((_, i) => {
      const paddingDuration = firstDetectedBeat;
      const paddingBeatDuration = paddingDuration / paddingCount;
      const timestamp = i * paddingBeatDuration; // Timestamps from 0.0s to (paddingCount-1) * paddingBeatDuration
      return timestamp;
    });

    // Combine padding with regular chords (no shift N.C. labels added here)
    // Extract original chord data without any corrections (corrections will be applied at display time)
    const regularChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
    // FIXED: Pass actual timestamps instead of beat indices for click navigation
    const regularBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
      const beatIndex = item.beatIndex;
      if (beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
        const beat = analysisResults.beats[beatIndex];
        return typeof beat === 'object' ? beat.time : beat; // Get actual timestamp
      }
      return 0; // Fallback for invalid indices
    });

    const shiftNullTimestamps = Array(shiftCount).fill(null); // Shift cells should not have timestamps

    // STAGE 5: Log final visual grid construction
    const finalChords = [...Array(shiftCount).fill(''), ...paddingChords, ...regularChords];
    const finalBeats = [...shiftNullTimestamps, ...paddingTimestamps, ...regularBeats];

    // Create original timestamp-to-chord mapping for audio sync (no shifting)
    const originalAudioMapping = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}, index) => {
      // Get the original timestamp from the raw beat detection results
      const beat = analysisResults.beats[index];
      const originalTimestamp = typeof beat === 'object' ? beat?.time || 0 : beat || 0;

      return {
        chord: item.chord,
        timestamp: originalTimestamp, // Use original timestamp from beat detection
        visualIndex: -1, // Will be populated below
        audioIndex: index // FIXED: Store the original audio index for accurate beat click handling
      };
    });

    // FIXED: Map original chords to their actual visual positions after shifting
    // Instead of using a formula, search the actual visual grid to find where each chord appears
    originalAudioMapping.forEach((audioItem, originalIndex) => {
      // Search through the final visual grid to find where this chord actually appears
      // We need to find the correct occurrence that corresponds to this original position

      let foundVisualIndex = -1;
      let occurrenceCount = 0;

      // Count occurrences of this chord up to the original position to handle duplicates
      for (let i = 0; i < originalIndex; i++) {
        if (originalAudioMapping[i].chord === audioItem.chord) {
          occurrenceCount++;
        }
      }

      // Now find the (occurrenceCount + 1)th occurrence of this chord in the visual grid
      let currentOccurrence = 0;
      for (let visualIndex = 0; visualIndex < finalChords.length; visualIndex++) {
        if (finalChords[visualIndex] === audioItem.chord && audioItem.chord !== '' && audioItem.chord !== 'N.C.') {
          if (currentOccurrence === occurrenceCount) {
            foundVisualIndex = visualIndex;
            break;
          }
          currentOccurrence++;
        }
      }

      audioItem.visualIndex = foundVisualIndex;
    });

    // FIXED: Create animation mapping that maps original timestamps to label positions
    // This ensures animation highlights where the chord LABELS appear, not where chords start
    const animationMapping: { timestamp: number; visualIndex: number; chord: string }[] = [];

    // For each unique chord, map its original timestamp to where its LABEL appears in the visual grid
    const processedChords = new Set<string>();

    originalAudioMapping.forEach((audioItem) => {
      if (!processedChords.has(audioItem.chord) && audioItem.chord !== '' && audioItem.chord !== 'N.C.') {
        // Find where this chord's LABEL appears in the visual grid (first occurrence with label)
        let labelVisualIndex = -1;

        // Search for the first position where this chord appears and would show a label
        for (let visualIndex = 0; visualIndex < finalChords.length; visualIndex++) {
          if (finalChords[visualIndex] === audioItem.chord) {
            // Check if this position would show a label (chord change detection)
            const prevChord = visualIndex > 0 ? finalChords[visualIndex - 1] : '';
            if (prevChord !== audioItem.chord) {
              labelVisualIndex = visualIndex;
              break;
            }
          }
        }

        if (labelVisualIndex !== -1) {
          animationMapping.push({
            timestamp: audioItem.timestamp, // Original timestamp
            visualIndex: labelVisualIndex, // Where the label appears
            chord: audioItem.chord
          });
        }

        processedChords.add(audioItem.chord);
      }
    });

    // FIXED: Replace shifted timestamps with original timestamps in the visual grid
    // This ensures animation and beat clicks use original timestamps for perfect sync
    const correctedBeats = [...finalBeats]; // Start with the shifted beats array

    originalAudioMapping.forEach((audioItem) => {
      const visualIndex = audioItem.visualIndex;
      const originalTimestamp = audioItem.timestamp;

      // Replace the shifted timestamp with the original timestamp
      if (visualIndex >= 0 && visualIndex < correctedBeats.length) {
        correctedBeats[visualIndex] = originalTimestamp;
      }
    });

    const chordCnnLstmResult = {
      chords: finalChords, // Add shift cells as empty strings
      beats: correctedBeats, // FIXED: Use corrected beats with original timestamps
      hasPadding: true,
      paddingCount: paddingCount,
      shiftCount: shiftCount,
      totalPaddingCount: paddingCount + shiftCount, // Total includes both padding and shift
      originalAudioMapping: originalAudioMapping, // NEW: Original timestamp-to-chord mapping for audio sync
      animationMapping: animationMapping // NEW: Maps original timestamps to label positions for animation
    };

    return chordCnnLstmResult;
  }

  // FIXED: BTC models should also use the comprehensive strategy for proper audio-visual sync
  // Apply the same shifting strategy as Chord-CNN-LSTM models for consistent behavior
  const btcChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
  const btcBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
    const beatIndex = item.beatIndex;
    if (beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
      const beat = analysisResults.beats[beatIndex];
      return typeof beat === 'object' ? beat.time : beat;
    }
    return 0;
  });

  // FIXED: Find the first MUSICAL chord (not "N/C") for proper shifting calculation
  let btcFirstDetectedBeatTime = 0;
  for (let i = 0; i < btcChords.length; i++) {
    const chord = btcChords[i];
    // Skip "N/C" (no chord) and empty chords to find first musical content
    if (chord && chord !== 'N/C' && chord !== '' && chord !== 'undefined') {
      btcFirstDetectedBeatTime = btcBeats[i] || 0;
      break;
    }
  }

  const btcBpm = analysisResults?.beatDetectionResult?.bpm || 120;
  const btcTimeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;

  const btcPaddingAndShift = calculatePaddingAndShift(btcFirstDetectedBeatTime, btcBpm, btcTimeSignature, btcChords);
  const btcPaddingCount = btcPaddingAndShift.paddingCount;
  const btcShiftCount = btcPaddingAndShift.shiftCount;

  // Apply padding and shifting to BTC model data
  const btcPaddingCells = Array(btcPaddingCount).fill('');
  const btcShiftCells = Array(btcShiftCount).fill('');
  const btcFinalChords = [...btcShiftCells, ...btcPaddingCells, ...btcChords];

  // Create beat timestamps for padding and shift cells
  const btcPaddingBeats = btcPaddingCells.map((_, index) => {
    const beatDuration = 60 / btcBpm;
    return index * beatDuration;
  });
  const btcShiftBeats = Array(btcShiftCount).fill(null); // Shift cells have null timestamps
  const btcFinalBeats = [...btcShiftBeats, ...btcPaddingBeats, ...btcBeats];

  // Create originalAudioMapping for BTC models with proper shifting
  const btcOriginalAudioMapping = btcChords.map((chord, index) => {
    const visualIndex = btcShiftCount + btcPaddingCount + index; // Account for shift and padding
    return {
      chord: chord,
      timestamp: btcBeats[index] || 0,
      visualIndex: visualIndex, // FIXED: Proper visual index accounting for shift and padding
      audioIndex: index // Original audio index
    };
  });

  // Apply original timestamps to visual grid (same as Chord-CNN-LSTM)
  const btcCorrectedBeats = [...btcFinalBeats];
  btcOriginalAudioMapping.forEach((audioItem) => {
    const visualIndex = audioItem.visualIndex;
    const originalTimestamp = audioItem.timestamp;
    if (visualIndex >= 0 && visualIndex < btcCorrectedBeats.length) {
      btcCorrectedBeats[visualIndex] = originalTimestamp;
    }
  });

  const btcResult = {
    chords: btcFinalChords,
    beats: btcCorrectedBeats,
    hasPadding: btcPaddingCount > 0,
    paddingCount: btcPaddingCount,
    shiftCount: btcShiftCount,
    totalPaddingCount: btcPaddingCount + btcShiftCount,
    originalAudioMapping: btcOriginalAudioMapping // FIXED: Proper originalAudioMapping with shifting
  };

  return btcResult;
};
