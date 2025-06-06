import { useEffect, useRef, useCallback } from 'react';
import { metronomeService } from '@/services/metronomeService';
import { BeatInfo } from '@/services/beatDetectionService';

interface UseMetronomeSyncProps {
  beats: BeatInfo[];
  downbeats?: number[];
  currentTime: number;
  isPlaying: boolean;
}

/**
 * Hook to synchronize metronome clicks with beat detection and playback
 */
export const useMetronomeSync = ({
  beats,
  downbeats = [],
  currentTime,
  isPlaying
}: UseMetronomeSyncProps) => {
  const lastScheduledBeatRef = useRef<number>(-1);
  const schedulingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lookAheadTime = 0.25; // Schedule clicks 250ms ahead
  const scheduleInterval = 25; // Check for new beats to schedule every 25ms

  /**
   * Check if a beat time corresponds to a downbeat
   */
  const isDownbeat = useCallback((beatTime: number): boolean => {
    if (!downbeats || downbeats.length === 0) return false;

    // Check if this beat time is close to any downbeat time (within 50ms tolerance)
    return downbeats.some(downbeatTime => Math.abs(beatTime - downbeatTime) < 0.05);
  }, [downbeats]);

  /**
   * Schedule metronome clicks for upcoming beats
   */
  const scheduleUpcomingClicks = useCallback(() => {
    if (!isPlaying || !beats || beats.length === 0) {
      return;
    }

    const now = currentTime;
    const scheduleUntil = now + lookAheadTime;

    // Find beats that need to be scheduled
    for (let i = lastScheduledBeatRef.current + 1; i < beats.length; i++) {
      const beat = beats[i];
      const beatTime = beat.time; // Use beat time directly - no shift compensation needed

      // Stop if we've gone beyond our look-ahead window
      if (beatTime > scheduleUntil) {
        break;
      }

      // Only schedule if the beat is in the future (with small tolerance for timing precision)
      if (beatTime > now - 0.01) {
        const isDownbeatClick = isDownbeat(beatTime);

        // Schedule the click
        metronomeService.scheduleClick(beatTime, isDownbeatClick);

        // Debug logging for metronome scheduling (reduced verbosity)
        if (i < 5) { // Only log first few beats to reduce console spam
          // console.log(`Metronome: Scheduled ${isDownbeatClick ? 'downbeat' : 'beat'} click at ${beatTime.toFixed(3)}s`);
        }
      }

      lastScheduledBeatRef.current = i;
    }
  }, [beats, currentTime, isPlaying, isDownbeat]); // beatShift removed - not used in direct alignment

  /**
   * Reset scheduling when playback starts or seeks
   */
  const resetScheduling = useCallback(() => {
    // Find the current beat index based on current time
    let currentBeatIndex = -1;
    if (beats && beats.length > 0) {
      currentBeatIndex = beats.findIndex((beat, index) => {
        const nextBeatTime = index < beats.length - 1 ? beats[index + 1].time : beat.time + 1;
        return currentTime >= beat.time && currentTime < nextBeatTime;
      });
    }

    // Set last scheduled to one before current beat so we start scheduling from current beat
    lastScheduledBeatRef.current = Math.max(-1, currentBeatIndex - 1);

    // console.log(`Metronome: Reset scheduling from beat index ${lastScheduledBeatRef.current + 1} at time ${currentTime.toFixed(3)}s`);
  }, [beats, currentTime]);

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
