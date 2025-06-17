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
  const lastCurrentTimeRef = useRef<number>(currentTime);
  const lookAheadTime = 0.25; // Schedule clicks 250ms ahead
  const scheduleInterval = 50; // Check for new beats to schedule every 50ms (reduced frequency)

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
   * FIXED: Handle gaps in beat arrays by generating synthetic beats for continuous metronome
   */
  const scheduleUpcomingClicks = useCallback(() => {
    if (!isPlaying) {
      console.log('Metronome: Not playing, skipping scheduling');
      return;
    }

    if (!metronomeService.isMetronomeEnabled()) {
      console.log('Metronome: Not enabled, skipping scheduling');
      return;
    }

    // Use chord grid beats if available, otherwise fall back to raw beats
    const beatsToUse = chordGridBeats && chordGridBeats.length > 0 ? chordGridBeats : beats;

    if (!beatsToUse || beatsToUse.length === 0) {
      console.log('Metronome: No beats available for scheduling');
      return;
    }

    const now = currentTime;
    const scheduleUntil = now + lookAheadTime;
    const startIndex = lastScheduledBeatRef.current + 1;

    console.log(`Metronome: Scheduling from beat ${startIndex} to ${beatsToUse.length - 1}, current time: ${now.toFixed(3)}s, schedule until: ${scheduleUntil.toFixed(3)}s`);

    let scheduledCount = 0;
    let skippedCount = 0;

    // IMPROVED: Generate continuous metronome clicks even when there are gaps in beat array
    // Calculate expected beat interval from BPM
    const bpm = 120; // Default BPM, could be passed from analysis results
    const beatInterval = 60 / bpm; // seconds per beat

    // Find the last valid beat time to establish timing reference
    let lastValidBeatTime = null;
    let lastValidBeatIndex = -1;

    for (let i = Math.max(0, startIndex - 10); i < startIndex; i++) {
      if (chordGridBeats && chordGridBeats.length > 0) {
        const chordGridBeat = chordGridBeats[i];
        if (chordGridBeat !== null && chordGridBeat !== undefined) {
          lastValidBeatTime = chordGridBeat;
          lastValidBeatIndex = i;
        }
      } else if (beats[i]) {
        const beat = beats[i] as BeatInfo;
        lastValidBeatTime = beat.time - beatTimeRangeStart;
        lastValidBeatIndex = i;
      }
    }

    // Find beats that need to be scheduled
    for (let i = startIndex; i < beatsToUse.length; i++) {
      let beatTime: number | null = null;

      if (chordGridBeats && chordGridBeats.length > 0) {
        // Using chord grid beats (already processed with shifting/padding)
        const chordGridBeat = chordGridBeats[i];
        if (chordGridBeat !== null && chordGridBeat !== undefined) {
          beatTime = chordGridBeat;
        }
      } else {
        // Using raw beats (apply offset compensation)
        const beat = beats[i] as BeatInfo;
        if (beat) {
          beatTime = beat.time - beatTimeRangeStart;
        }
      }

      // IMPROVED: If we have a null beat but we have a timing reference, generate synthetic beat
      if (beatTime === null && lastValidBeatTime !== null && lastValidBeatIndex >= 0) {
        const beatsSinceLastValid = i - lastValidBeatIndex;
        beatTime = lastValidBeatTime + (beatsSinceLastValid * beatInterval);
        console.log(`Metronome: Generated synthetic beat ${i} at ${beatTime.toFixed(3)}s (${beatsSinceLastValid} beats after last valid)`);
      }

      // Skip if we still don't have a valid beat time
      if (beatTime === null) {
        skippedCount++;
        continue;
      }

      // Update timing reference for future synthetic beats
      if (beatTime !== null) {
        lastValidBeatTime = beatTime;
        lastValidBeatIndex = i;
      }

      // Stop if we've gone beyond our look-ahead window
      if (beatTime > scheduleUntil) {
        console.log(`Metronome: Beat ${i} at ${beatTime.toFixed(3)}s is beyond schedule window, stopping`);
        break;
      }

      // Only schedule if the beat is in the future (with better tolerance for timing precision)
      if (beatTime > now - 0.05) { // Increased tolerance to 50ms for better scheduling
        // For chord grid beats, the index already accounts for shifting, so use it directly
        const isDownbeatClick = chordGridBeats && chordGridBeats.length > 0
          ? isDownbeat(i) // Index already includes shift/padding
          : isDownbeat(i + shiftCount + paddingCount); // Apply shift/padding to raw beat index

        // Create unique beat ID to prevent duplicate scheduling
        // Include data source to ensure uniqueness across different beat arrays
        const dataSource = chordGridBeats && chordGridBeats.length > 0 ? 'grid' : 'raw';
        const beatId = `${dataSource}_${i}_${beatTime.toFixed(3)}`;

        // Schedule the click with duplicate prevention
        // Pass the beat time relative to current playback time
        const relativeTime = beatTime - now;
        metronomeService.scheduleClick(relativeTime, isDownbeatClick, beatId);

        scheduledCount++;

        // Enhanced debug logging for metronome scheduling
        if (scheduledCount <= 10 || i % 20 === 0) { // Log first 10 beats and every 20th beat
          const beatNum = (i % timeSignature) + 1;
          const dataSource = chordGridBeats && chordGridBeats.length > 0 ? 'chordGrid' : 'raw';
          console.log(`Metronome: Scheduled ${isDownbeatClick ? 'downbeat' : 'regular'} click (beat ${beatNum}) at ${beatTime.toFixed(3)}s (source: ${dataSource}, index: ${i}, relative: ${relativeTime.toFixed(3)}s)`);
        }
      } else {
        console.log(`Metronome: Beat ${i} at ${beatTime.toFixed(3)}s is in the past (now: ${now.toFixed(3)}s), skipping`);
        skippedCount++;
      }

      lastScheduledBeatRef.current = i;
    }

    console.log(`Metronome: Scheduling complete - scheduled: ${scheduledCount}, skipped: ${skippedCount}, last scheduled beat: ${lastScheduledBeatRef.current}`);
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
      console.log('Metronome: Clearing existing scheduling interval');
      clearInterval(schedulingIntervalRef.current);
    }

    resetScheduling();

    schedulingIntervalRef.current = setInterval(() => {
      scheduleUpcomingClicks();
    }, scheduleInterval);

    console.log(`Metronome: Started scheduling interval (${scheduleInterval}ms)`);
  }, [resetScheduling, scheduleUpcomingClicks]);

  /**
   * Stop the scheduling interval
   */
  const stopScheduling = useCallback(() => {
    if (schedulingIntervalRef.current) {
      console.log('Metronome: Stopping scheduling interval');
      clearInterval(schedulingIntervalRef.current);
      schedulingIntervalRef.current = null;
    }
  }, []);

  // Effect to handle play/pause state changes
  useEffect(() => {
    console.log(`Metronome: Play/pause state changed - isPlaying: ${isPlaying}, metronomeEnabled: ${metronomeService.isMetronomeEnabled()}`);

    if (isPlaying && metronomeService.isMetronomeEnabled()) {
      console.log('Metronome: Starting scheduling due to play state');
      startScheduling();
    } else {
      console.log('Metronome: Stopping scheduling due to pause/disabled state');
      stopScheduling();
    }

    return () => {
      stopScheduling();
    };
  }, [isPlaying, startScheduling, stopScheduling]);

  // Effect to handle seeking (significant time jumps only)
  useEffect(() => {
    if (isPlaying && metronomeService.isMetronomeEnabled()) {
      const timeDifference = Math.abs(currentTime - lastCurrentTimeRef.current);

      // Only reset scheduling if there's a significant time jump (seeking)
      // Normal playback should have time differences < 0.1 seconds
      if (timeDifference > 0.5) {
        console.log(`Metronome: Detected seeking (time jump: ${timeDifference.toFixed(3)}s), resetting scheduling`);
        resetScheduling();
      }
    }

    lastCurrentTimeRef.current = currentTime;
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
