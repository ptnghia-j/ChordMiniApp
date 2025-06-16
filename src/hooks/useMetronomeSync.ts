import { useEffect, useRef, useCallback } from 'react';
import { metronomeService } from '@/services/metronomeService';
import { BeatInfo } from '@/services/beatDetectionService';

interface UseMetronomeSyncProps {
  beats: BeatInfo[];
  downbeats?: number[];
  currentTime: number;
  isPlaying: boolean;
  timeSignature?: number; // Add time signature for proper beat position calculation
  beatTimeRangeStart?: number; // Beat detection timing offset for padding compensation
  shiftCount?: number; // Beat shifting count from chord grid calculation
  paddingCount?: number; // Padding count from chord grid calculation
  chordGridBeats?: (number | null)[]; // Use the same processed beats as chord grid
}

/**
 * Hook to synchronize metronome clicks with beat detection and playback
 */
export const useMetronomeSync = ({
  beats,
  downbeats: _downbeats = [], // eslint-disable-line @typescript-eslint/no-unused-vars
  currentTime,
  isPlaying,
  timeSignature = 4,
  beatTimeRangeStart = 0,
  shiftCount = 0,
  paddingCount = 0,
  chordGridBeats = []
}: UseMetronomeSyncProps) => {
  const lastScheduledBeatRef = useRef<number>(-1);
  const schedulingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lookAheadTime = 0.25; // Schedule clicks 250ms ahead
  const scheduleInterval = 25; // Check for new beats to schedule every 25ms

  /**
   * Check if a beat corresponds to a downbeat based on beat position
   * Uses the same logic as the UI for determining beat numbers, accounting for shift and padding
   */
  const isDownbeat = useCallback((beatIndex: number): boolean => {
    // Apply the same shifting logic as the chord grid
    // Account for shift and padding when determining beat position
    const adjustedIndex = beatIndex + shiftCount + paddingCount;

    // Calculate beat number using the same logic as the UI
    // Beat number = (adjustedIndex % timeSignature) + 1
    // Beat 1 is the downbeat, beats 2, 3, 4, etc. are regular beats
    const beatNum = (adjustedIndex % timeSignature) + 1;
    return beatNum === 1;
  }, [timeSignature, shiftCount, paddingCount]);

  /**
   * Schedule metronome clicks for upcoming beats using chord grid beat data
   */
  const scheduleUpcomingClicks = useCallback(() => {
    if (!isPlaying) {
      return;
    }

    // Use chord grid beats if available, otherwise fall back to raw beats
    const beatsToUse = chordGridBeats && chordGridBeats.length > 0 ? chordGridBeats : beats;

    if (!beatsToUse || beatsToUse.length === 0) {
      return;
    }

    const now = currentTime;
    const scheduleUntil = now + lookAheadTime;

    // Find beats that need to be scheduled
    for (let i = lastScheduledBeatRef.current + 1; i < beatsToUse.length; i++) {
      let beatTime: number;

      if (chordGridBeats && chordGridBeats.length > 0) {
        // Using chord grid beats (already processed with shifting/padding)
        const chordGridBeat = chordGridBeats[i];
        if (chordGridBeat === null || chordGridBeat === undefined) {
          continue; // Skip null beats (shift cells)
        }
        beatTime = chordGridBeat;
      } else {
        // Using raw beats (apply offset compensation)
        const beat = beats[i] as BeatInfo;
        beatTime = beat.time - beatTimeRangeStart;
      }

      // Stop if we've gone beyond our look-ahead window
      if (beatTime > scheduleUntil) {
        break;
      }

      // Only schedule if the beat is in the future (with better tolerance for timing precision)
      if (beatTime > now - 0.05) { // Increased tolerance to 50ms for better scheduling
        // For chord grid beats, the index already accounts for shifting, so use it directly
        const isDownbeatClick = chordGridBeats && chordGridBeats.length > 0
          ? isDownbeat(i) // Index already includes shift/padding
          : isDownbeat(i + shiftCount + paddingCount); // Apply shift/padding to raw beat index

        // Create unique beat ID to prevent duplicate scheduling
        const beatId = `beat_${i}_${beatTime.toFixed(3)}`;

        // Schedule the click with duplicate prevention
        metronomeService.scheduleClick(beatTime, isDownbeatClick, beatId);

        // Debug logging for metronome scheduling (reduced verbosity)
        if (i < 5) { // Only log first few beats to reduce console spam
          const beatNum = (i % timeSignature) + 1;
          const dataSource = chordGridBeats && chordGridBeats.length > 0 ? 'chordGrid' : 'raw';
          console.log(`Metronome: Scheduled ${isDownbeatClick ? 'downbeat' : 'regular'} click (beat ${beatNum}) at ${beatTime.toFixed(3)}s (source: ${dataSource}, index: ${i})`);
        }
      }

      lastScheduledBeatRef.current = i;
    }
  }, [beats, chordGridBeats, currentTime, isPlaying, isDownbeat, beatTimeRangeStart, timeSignature, shiftCount, paddingCount]); // Include all timing parameters in dependencies

  /**
   * Reset scheduling when playback starts or seeks
   */
  const resetScheduling = useCallback(() => {
    // Find the current beat index based on current time
    let currentBeatIndex = -1;

    // Use chord grid beats if available, otherwise fall back to raw beats
    const beatsToUse = chordGridBeats && chordGridBeats.length > 0 ? chordGridBeats : beats;

    if (beatsToUse && beatsToUse.length > 0) {
      if (chordGridBeats && chordGridBeats.length > 0) {
        // Using chord grid beats (already processed)
        currentBeatIndex = chordGridBeats.findIndex((beatTime, index) => {
          if (beatTime === null || beatTime === undefined) return false;
          const nextBeatTime = index < chordGridBeats.length - 1
            ? (chordGridBeats[index + 1] || beatTime + 1)
            : beatTime + 1;
          return currentTime >= beatTime && currentTime < nextBeatTime;
        });
      } else {
        // Using raw beats (apply offset compensation)
        currentBeatIndex = beats.findIndex((beat, index) => {
          const beatTime = beat.time - beatTimeRangeStart;
          const nextBeatTime = index < beats.length - 1
            ? (beats[index + 1].time - beatTimeRangeStart)
            : beatTime + 1;
          return currentTime >= beatTime && currentTime < nextBeatTime;
        });
      }
    }

    // Set last scheduled to one before current beat so we start scheduling from current beat
    lastScheduledBeatRef.current = Math.max(-1, currentBeatIndex - 1);

    // console.log(`Metronome: Reset scheduling from beat index ${lastScheduledBeatRef.current + 1} at time ${currentTime.toFixed(3)}s`);
  }, [beats, chordGridBeats, currentTime, beatTimeRangeStart]);

  /**
   * Start the scheduling interval
   */
  const startScheduling = useCallback(() => {
    if (schedulingIntervalRef.current) {
      clearInterval(schedulingIntervalRef.current);
    }

    resetScheduling();

    schedulingIntervalRef.current = setInterval(() => {
      scheduleUpcomingClicks();
    }, scheduleInterval);

    // console.log('Metronome: Started scheduling interval');
  }, [resetScheduling, scheduleUpcomingClicks]);

  /**
   * Stop the scheduling interval
   */
  const stopScheduling = useCallback(() => {
    if (schedulingIntervalRef.current) {
      clearInterval(schedulingIntervalRef.current);
      schedulingIntervalRef.current = null;
    }
    // console.log('Metronome: Stopped scheduling interval');
  }, []);

  // Effect to handle play/pause state changes
  useEffect(() => {
    if (isPlaying && metronomeService.isMetronomeEnabled()) {
      startScheduling();
    } else {
      stopScheduling();
    }

    return () => {
      stopScheduling();
    };
  }, [isPlaying, startScheduling, stopScheduling]);

  // Effect to handle seeking (significant time jumps)
  useEffect(() => {
    if (isPlaying && metronomeService.isMetronomeEnabled()) {
      // Reset scheduling when there's a significant time jump (seeking)
      resetScheduling();
    }
  }, [currentTime, resetScheduling, isPlaying]);

  // Note: Beat shift effects removed - direct alignment approach doesn't use shifting

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScheduling();
    };
  }, [stopScheduling]);

  return {
    resetScheduling,
    startScheduling,
    stopScheduling
  };
};
