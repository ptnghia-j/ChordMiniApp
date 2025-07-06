// Chord Grid Calculation Service
// Extracted from src/app/analyze/[videoId]/page.tsx
// Handles complex chord grid data processing, padding, and shifting calculations

// Import the actual AnalysisResult type from the chord recognition service
import type { AnalysisResult as ChordRecognitionAnalysisResult } from './chordRecognitionService';

// Create a flexible type that can handle both formats
type AnalysisResult = ChordRecognitionAnalysisResult | {
  chords?: Array<{chord: string, time: number}>;
  beats: Array<{time: number, beatNum?: number}> | number[];
  downbeats?: number[];
  downbeats_with_measures?: number[];
  synchronizedChords: Array<{chord: string, beatIndex: number, beatNum?: number}>;
  beatModel?: string;
  chordModel?: string;
  audioDuration?: number;
  beatDetectionResult?: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
    beat_time_range_start?: number;
    paddingCount?: number;
    shiftCount?: number;
  };
};

interface ChordGridData {
  chords: string[];
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
}

/**
 * Calculate optimal shift for chord alignment with downbeats
 */
export const calculateOptimalShift = (chords: string[], timeSignature: number, paddingCount: number = 0): number => {
  if (chords.length === 0) {
    return 0;
  }

  const shiftResults: Array<{
    shift: number;
    chordChanges: number;
    downbeatPositions: number[];
    chordLabels: string[];
  }> = [];

  // Test all possible shift values (0 to timeSignature-1)
  for (let shift = 0; shift < timeSignature; shift++) {
    let chordChangeCount = 0;
    const downbeatPositions: number[] = [];
    const chordLabels: string[] = [];

    // Check each chord position after applying the shift
    let previousDownbeatChord = '';

    for (let i = 0; i < chords.length; i++) {
      const currentChord = chords[i];
      const totalPadding = paddingCount + shift;
      const visualPosition = totalPadding + i;
      const beatInMeasure = (visualPosition % timeSignature) + 1;
      const isDownbeat = beatInMeasure === 1;

      // Only check for chord changes on downbeats
      if (isDownbeat) {
        // FIXED: Restore original chord validation logic
        const isValidChord = currentChord && currentChord !== '' &&
                            currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

        const isChordChange = isValidChord &&
                             previousDownbeatChord !== '' && // Must have a previous chord to compare
                             currentChord !== previousDownbeatChord; // Must be different

        // FIXED: Only count chord changes that START on downbeats
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
  }

  // Find the shift with the most chord changes on downbeats
  const bestResult = shiftResults.reduce((best, current) => {
    if (current.chordChanges > best.chordChanges) {
      return current;
    }
    if (current.chordChanges === best.chordChanges && current.shift < best.shift) {
      return current; // Prefer smaller shift when tied
    }
    return best;
  });

  return bestResult.shift;
};

/**
 * Calculate padding and shift based on first detected beat time
 */
export const calculatePaddingAndShift = (
  firstDetectedBeatTime: number, 
  bpm: number, 
  timeSignature: number, 
  chords: string[] = []
): { paddingCount: number; shiftCount: number; totalPaddingCount: number } => {
  
  if (firstDetectedBeatTime <= 0.05) {
    return { paddingCount: 0, shiftCount: 0, totalPaddingCount: 0 };
  }

  // Calculate padding based on first detected beat time
  const rawPaddingCount = Math.floor((firstDetectedBeatTime / 60) * bpm);
  const beatDuration = Math.round((60 / bpm) * 1000) / 1000;
  const gapRatio = firstDetectedBeatTime / beatDuration;
  const paddingCount = rawPaddingCount === 0 && gapRatio > 0.2 ? 1 : rawPaddingCount;

  const debugPaddingCount = paddingCount;

  // Optimize padding to reduce visual clutter
  let optimizedPaddingCount = debugPaddingCount;
  if (debugPaddingCount >= timeSignature) {
    const fullMeasuresToRemove = Math.floor(debugPaddingCount / timeSignature);
    optimizedPaddingCount = debugPaddingCount - (fullMeasuresToRemove * timeSignature);

    if (optimizedPaddingCount === 0 && debugPaddingCount >= timeSignature) {
      optimizedPaddingCount = timeSignature - 1;
    }
  }

  // Calculate optimal shift
  let shiftCount = 0;
  if (chords.length > 0) {
    shiftCount = calculateOptimalShift(chords, timeSignature, optimizedPaddingCount);
  } else {
    const beatPositionInMeasure = ((optimizedPaddingCount) % timeSignature) + 1;
    const finalBeatPosition = beatPositionInMeasure > timeSignature ? 1 : beatPositionInMeasure;
    shiftCount = finalBeatPosition === 1 ? 0 : (timeSignature - finalBeatPosition + 1);
  }

  const totalPaddingCount = optimizedPaddingCount + shiftCount;

  return { paddingCount: optimizedPaddingCount, shiftCount, totalPaddingCount };
};

/**
 * Get comprehensive chord grid data with padding and shifting
 */
export const getChordGridData = (analysisResults: AnalysisResult | null): ChordGridData => {
  if (!analysisResults || !analysisResults.synchronizedChords || analysisResults.synchronizedChords.length === 0) {
    return {
      chords: [],
      beats: [],
      hasPadding: false,
      paddingCount: 0,
      shiftCount: 0,
      totalPaddingCount: 0,
      originalAudioMapping: []
    };
  }

  const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults.beatDetectionResult?.bpm || 120;

  // Handle both YouTube (object array) and upload (number array) beat formats
  let firstDetectedBeat = 0;
  if (analysisResults.beats && analysisResults.beats.length > 0) {
    const firstBeat = analysisResults.beats[0];
    if (typeof firstBeat === 'number') {
      // Upload workflow: beats is number[]
      firstDetectedBeat = firstBeat;
    } else if (typeof firstBeat === 'object' && firstBeat?.time) {
      // YouTube workflow: beats is BeatInfo[]
      firstDetectedBeat = firstBeat.time;
    }
  }

  // Extract chord data for optimal shift calculation
  const chordData = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);

  // Calculate padding and shifting
  const { paddingCount, shiftCount } = calculatePaddingAndShift(firstDetectedBeat, bpm, timeSignature, chordData);

  // Ensure padding and shift counts are non-negative and finite
  const safePaddingCount = Math.max(0, isFinite(paddingCount) ? Math.floor(paddingCount) : 0);
  const safeShiftCount = Math.max(0, isFinite(shiftCount) ? Math.floor(shiftCount) : 0);

  // Handle comprehensive strategy (Chord-CNN-LSTM and similar models)
  if (analysisResults.chordModel === 'chord-cnn-lstm' || safePaddingCount > 0 || safeShiftCount > 0) {
    // Add padding N.C. chords
    const paddingChords = Array(safePaddingCount).fill('N.C.');
    const paddingTimestamps = Array(safePaddingCount).fill(0).map((_, i) => {
      const paddingDuration = firstDetectedBeat;
      const paddingBeatDuration = safePaddingCount > 0 ? paddingDuration / safePaddingCount : 0;
      return i * paddingBeatDuration;
    });

    // Extract regular chord and beat data
    const regularChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
    const regularBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
      const beatIndex = item.beatIndex;
      if (analysisResults.beats && beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
        const beat = analysisResults.beats[beatIndex];
        if (typeof beat === 'number') {
          // Upload workflow: beats is number[]
          return beat;
        } else if (typeof beat === 'object' && beat?.time) {
          // YouTube workflow: beats is BeatInfo[]
          return beat.time;
        }
      }
      return 0;
    });

    const shiftNullTimestamps = Array(safeShiftCount).fill(null);

    // Construct final visual grid
    const finalChords = [...Array(safeShiftCount).fill(''), ...paddingChords, ...regularChords];
    const finalBeats = [...shiftNullTimestamps, ...paddingTimestamps, ...regularBeats];

    // Create original audio mapping for accurate sync
    const originalAudioMapping = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}, index) => {
      const beatIndex = item.beatIndex;
      let originalTimestamp = 0;
      if (analysisResults.beats && beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
        const beat = analysisResults.beats[beatIndex];
        if (typeof beat === 'number') {
          // Upload workflow: beats is number[]
          originalTimestamp = beat;
        } else if (typeof beat === 'object' && beat?.time) {
          // YouTube workflow: beats is BeatInfo[]
          originalTimestamp = beat.time;
        }
      }

      const visualIndex = safeShiftCount + safePaddingCount + index;
      
      return {
        chord: item.chord,
        timestamp: originalTimestamp,
        visualIndex: visualIndex,
        audioIndex: index
      };
    });

    return {
      chords: finalChords,
      beats: finalBeats,
      hasPadding: safePaddingCount > 0 || safeShiftCount > 0,
      paddingCount: safePaddingCount,
      shiftCount: safeShiftCount,
      totalPaddingCount: safePaddingCount + safeShiftCount,
      originalAudioMapping
    };
  }

  // Handle BTC models with comprehensive strategy
  const btcChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
  const btcBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
    const beatIndex = item.beatIndex;
    if (analysisResults.beats && beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
      const beat = analysisResults.beats[beatIndex];
      if (typeof beat === 'number') {
        // Upload workflow: beats is number[]
        return beat;
      } else if (typeof beat === 'object' && beat?.time) {
        // YouTube workflow: beats is BeatInfo[]
        return beat.time;
      }
    }
    return 0;
  });

  const btcFirstDetectedBeatTime = btcBeats.length > 0 ? btcBeats[0] : 0;
  const btcBpm = bpm;
  const btcTimeSignature = timeSignature;

  const btcPaddingAndShift = calculatePaddingAndShift(btcFirstDetectedBeatTime, btcBpm, btcTimeSignature, btcChords);
  const btcPaddingCount = Math.max(0, isFinite(btcPaddingAndShift.paddingCount) ? Math.floor(btcPaddingAndShift.paddingCount) : 0);
  const btcShiftCount = Math.max(0, isFinite(btcPaddingAndShift.shiftCount) ? Math.floor(btcPaddingAndShift.shiftCount) : 0);

  // Apply padding and shifting to BTC model data
  const btcPaddingCells = Array(btcPaddingCount).fill('');
  const btcShiftCells = Array(btcShiftCount).fill('');
  const btcFinalChords = [...btcShiftCells, ...btcPaddingCells, ...btcChords];

  // Create beat timestamps
  const btcPaddingBeats = btcPaddingCells.map((_, index) => {
    const beatDuration = 60 / btcBpm;
    return index * beatDuration;
  });
  const btcShiftBeats = Array(btcShiftCount).fill(null);
  const btcFinalBeats = [...btcShiftBeats, ...btcPaddingBeats, ...btcBeats];

  // Create original audio mapping for BTC models
  const btcOriginalAudioMapping = btcChords.map((chord, index) => {
    const visualIndex = btcShiftCount + btcPaddingCount + index;
    return {
      chord: chord,
      timestamp: btcBeats[index] || 0,
      visualIndex: visualIndex,
      audioIndex: index
    };
  });

  return {
    chords: btcFinalChords,
    beats: btcFinalBeats,
    hasPadding: btcPaddingCount > 0 || btcShiftCount > 0,
    paddingCount: btcPaddingCount,
    shiftCount: btcShiftCount,
    totalPaddingCount: btcPaddingCount + btcShiftCount,
    originalAudioMapping: btcOriginalAudioMapping
  };
};
