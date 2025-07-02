/* eslint-disable @typescript-eslint/no-unused-vars */
// Timing utilities extracted from analyze page component

/**
 * Timestamp formatting and display utilities
 */
export const formatTimestamp = (seconds: number, includeMilliseconds: boolean = false): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  const formatted = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  
  if (includeMilliseconds) {
    return `${formatted}.${milliseconds.toString().padStart(3, '0')}`;
  }
  
  return formatted;
};

/**
 * Parse timestamp string to seconds
 */
export const parseTimestamp = (timestamp: string): number => {
  if (!timestamp) return 0;
  
  // Handle formats like "1:23.456", "0:45", "123.456"
  const parts = timestamp.split(':');
  
  if (parts.length === 1) {
    // Just seconds (possibly with decimals)
    return parseFloat(parts[0]) || 0;
  } else if (parts.length === 2) {
    // Minutes:seconds
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  
  return 0;
};

/**
 * Beat calculation utilities
 */
export const calculateBeatDuration = (bpm: number): number => {
  if (!bpm || bpm <= 0) return 0.5; // Default fallback
  return 60 / bpm; // Duration of one beat in seconds
};

/**
 * Calculate BPM from beat intervals
 */
export const calculateBPM = (beatTimes: number[]): number => {
  if (beatTimes.length < 2) return 120; // Default BPM
  
  // Calculate intervals between consecutive beats
  const intervals: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) {
    intervals.push(beatTimes[i] - beatTimes[i - 1]);
  }
  
  // Calculate average interval
  const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  
  // Convert to BPM
  return Math.round(60 / averageInterval);
};

/**
 * Time signature handling and beat position calculations
 */
export const calculateBeatPosition = (
  beatIndex: number,
  timeSignature: number = 4,
  paddingCount: number = 0
): {
  measureNumber: number;
  beatInMeasure: number;
  isDownbeat: boolean;
} => {
  // Account for padding offset
  const adjustedBeatIndex = beatIndex - paddingCount;
  
  if (adjustedBeatIndex < 0) {
    return {
      measureNumber: 0,
      beatInMeasure: 0,
      isDownbeat: false
    };
  }
  
  const measureNumber = Math.floor(adjustedBeatIndex / timeSignature) + 1;
  const beatInMeasure = (adjustedBeatIndex % timeSignature) + 1;
  const isDownbeat = beatInMeasure === 1;
  
  return {
    measureNumber,
    beatInMeasure,
    isDownbeat
  };
};

/**
 * Gap ratio calculations
 * Extracted from lines 1432-1433 of original component
 */
export const calculateGapRatio = (gapTime: number, beatDuration: number): number => {
  if (beatDuration <= 0) return 0;
  return gapTime / beatDuration;
};

/**
 * Virtual beat index calculations
 * Extracted from lines 2038-2042 of original component
 */
export const calculateVirtualBeatIndex = (
  currentTime: number,
  estimatedBeatDuration: number,
  shiftCount: number = 0
): number => {
  const rawVirtualBeatIndex = Math.floor(currentTime / estimatedBeatDuration);
  return rawVirtualBeatIndex + shiftCount;
};

/**
 * Time range validation
 */
export const isTimeInRange = (
  time: number,
  startTime: number,
  endTime: number,
  tolerance: number = 0.1
): boolean => {
  return time >= (startTime - tolerance) && time <= (endTime + tolerance);
};

/**
 * Beat synchronization utilities
 */
export const findClosestBeat = (
  targetTime: number,
  beatTimes: number[],
  maxDistance: number = 1.0
): {
  index: number;
  time: number;
  distance: number;
} | null => {
  let closestIndex = -1;
  let closestDistance = Infinity;
  
  for (let i = 0; i < beatTimes.length; i++) {
    const distance = Math.abs(targetTime - beatTimes[i]);
    if (distance < closestDistance && distance <= maxDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  
  if (closestIndex === -1) return null;
  
  return {
    index: closestIndex,
    time: beatTimes[closestIndex],
    distance: closestDistance
  };
};

/**
 * Tempo change detection
 */
export const detectTempoChanges = (
  beatTimes: number[],
  threshold: number = 0.1
): Array<{
  index: number;
  time: number;
  oldBPM: number;
  newBPM: number;
}> => {
  const changes: Array<{
    index: number;
    time: number;
    oldBPM: number;
    newBPM: number;
  }> = [];
  
  if (beatTimes.length < 4) return changes;
  
  for (let i = 2; i < beatTimes.length - 1; i++) {
    const prevInterval = beatTimes[i] - beatTimes[i - 1];
    const nextInterval = beatTimes[i + 1] - beatTimes[i];
    
    const prevBPM = 60 / prevInterval;
    const nextBPM = 60 / nextInterval;
    
    const bpmChange = Math.abs(nextBPM - prevBPM) / prevBPM;
    
    if (bpmChange > threshold) {
      changes.push({
        index: i,
        time: beatTimes[i],
        oldBPM: Math.round(prevBPM),
        newBPM: Math.round(nextBPM)
      });
    }
  }
  
  return changes;
};

/**
 * Quantize time to nearest beat
 */
export const quantizeToNearestBeat = (
  time: number,
  bpm: number,
  subdivision: number = 1
): number => {
  const beatDuration = 60 / bpm;
  const subdivisionDuration = beatDuration / subdivision;
  
  return Math.round(time / subdivisionDuration) * subdivisionDuration;
};

/**
 * Calculate swing ratio
 */
export const calculateSwingRatio = (beatTimes: number[]): number => {
  if (beatTimes.length < 4) return 0.5; // No swing
  
  const intervals: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) {
    intervals.push(beatTimes[i] - beatTimes[i - 1]);
  }
  
  // Separate odd and even intervals (assuming 8th note swing)
  const oddIntervals = intervals.filter((_, index) => index % 2 === 0);
  const evenIntervals = intervals.filter((_, index) => index % 2 === 1);
  
  if (oddIntervals.length === 0 || evenIntervals.length === 0) return 0.5;
  
  const avgOdd = oddIntervals.reduce((sum, val) => sum + val, 0) / oddIntervals.length;
  const avgEven = evenIntervals.reduce((sum, val) => sum + val, 0) / evenIntervals.length;
  
  const totalInterval = avgOdd + avgEven;
  return avgOdd / totalInterval;
};

/**
 * Time signature detection from beat patterns
 */
export const detectTimeSignature = (beatTimes: number[]): number => {
  if (beatTimes.length < 8) return 4; // Default to 4/4
  
  const intervals = [];
  for (let i = 1; i < beatTimes.length; i++) {
    intervals.push(beatTimes[i] - beatTimes[i - 1]);
  }
  
  const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
  
  // Look for patterns that suggest different time signatures
  const measureDuration = avgInterval * 4; // Assume 4/4 initially
  
  // Check for 3/4 patterns (waltz)
  let threeCount = 0;
  let fourCount = 0;
  
  for (let i = 0; i < beatTimes.length - 3; i++) {
    const duration3 = beatTimes[i + 3] - beatTimes[i];
    const duration4 = beatTimes[i + 4] - beatTimes[i];
    
    if (Math.abs(duration3 - avgInterval * 3) < Math.abs(duration4 - avgInterval * 4)) {
      threeCount++;
    } else {
      fourCount++;
    }
  }
  
  return threeCount > fourCount ? 3 : 4;
};

/**
 * Convert seconds to musical time notation
 */
export const secondsToMusicalTime = (
  seconds: number,
  bpm: number,
  timeSignature: number = 4
): {
  measure: number;
  beat: number;
  subdivision: number;
} => {
  const beatDuration = 60 / bpm;
  const measureDuration = beatDuration * timeSignature;
  
  const measure = Math.floor(seconds / measureDuration) + 1;
  const remainingTime = seconds % measureDuration;
  const beat = Math.floor(remainingTime / beatDuration) + 1;
  const subdivision = Math.round(((remainingTime % beatDuration) / beatDuration) * 4);
  
  return { measure, beat, subdivision };
};
