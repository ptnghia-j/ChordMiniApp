import { useEffect, useRef, useCallback } from 'react';
import { metronomeService } from '@/services/chord-playback/metronomeService';

interface UseMetronomeSyncProps {
  currentBeatIndex: number;
  chordGridBeats: (number | null)[];
  currentTime: number;
  isPlaying: boolean;
  timeSignature?: number;
}

export const useMetronomeSync = ({
  currentBeatIndex,
  chordGridBeats,
  currentTime,
  isPlaying,
  timeSignature = 4,
}: UseMetronomeSyncProps) => {
  const lastTriggeredBeatIndexRef = useRef<number>(-1);
  const isBackgroundRef = useRef<boolean>(false);
  const backgroundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep latest state in refs for background poller access without dependency cycles
  const currentTimeRef = useRef<number>(currentTime);
  const isPlayingRef = useRef<boolean>(isPlaying);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Foreground playback - identical to useChordPlayback
  // Watch `currentBeatIndex` directly. When it advances, play the metronome click immediately.
  useEffect(() => {
    if (!isPlaying || !metronomeService.isMetronomeEnabled() || isBackgroundRef.current) return;

    if (currentBeatIndex >= 0 && currentBeatIndex < chordGridBeats.length) {
      if (currentBeatIndex > lastTriggeredBeatIndexRef.current) {
        lastTriggeredBeatIndexRef.current = currentBeatIndex;
        const isDownbeat = currentBeatIndex % Math.max(1, timeSignature) === 0;
        
        // Schedule immediately (relativeTime = 0)
        metronomeService.scheduleClick(0, isDownbeat);
      }
    }
  }, [currentBeatIndex, isPlaying, timeSignature, chordGridBeats.length]);

  // Background poller
  const stopBackgroundPoller = useCallback(() => {
    if (backgroundIntervalRef.current !== null) {
      clearInterval(backgroundIntervalRef.current);
      backgroundIntervalRef.current = null;
    }
  }, []);

  const startBackgroundPoller = useCallback(() => {
    stopBackgroundPoller();
    
    // In background, intervals are throttled to 1000ms.
    // So we run every 1000ms and look ahead 1.5 seconds to schedule upcoming beats.
    backgroundIntervalRef.current = setInterval(() => {
      if (!isPlayingRef.current || !metronomeService.isMetronomeEnabled()) return;
      
      // In background we don't have accurate currentBeatIndex, so we rely on currentTime
      const songTime = currentTimeRef.current;
      const lookaheadSeconds = 1.5; 
      
      for (let i = lastTriggeredBeatIndexRef.current + 1; i < chordGridBeats.length; i++) {
        const beatTime = chordGridBeats[i];
        if (beatTime === null) continue;
        
        if (beatTime < songTime - 0.1) {
          lastTriggeredBeatIndexRef.current = i; // catch up if it's slightly past
          continue;
        }
        
        if (beatTime <= songTime + lookaheadSeconds) {
          const relativeTime = beatTime - songTime;
          const isDownbeat = i % Math.max(1, timeSignature) === 0;
          metronomeService.scheduleClick(relativeTime, isDownbeat);
          lastTriggeredBeatIndexRef.current = i;
        } else {
          break; // beats are ordered, if this one is too far in future, stop
        }
      }
    }, 1000); 
  }, [chordGridBeats, timeSignature, stopBackgroundPoller]);

  // Handle browser tab visibility changes
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        isBackgroundRef.current = true;
        if (isPlayingRef.current) startBackgroundPoller();
      } else {
        isBackgroundRef.current = false;
        stopBackgroundPoller();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopBackgroundPoller();
    };
  }, [startBackgroundPoller, stopBackgroundPoller]);

  // Clear clicks when stopped or paused
  useEffect(() => {
    if (!isPlaying) {
      metronomeService.clearScheduledClicks();
      // Reset index to just before current so it triggers immediately when resumed
      lastTriggeredBeatIndexRef.current = currentBeatIndex - 1;
    }
    
    if (!isBackgroundRef.current) return;
    if (isPlaying) {
      startBackgroundPoller();
    } else {
      stopBackgroundPoller();
    }
  }, [isPlaying, currentBeatIndex, startBackgroundPoller, stopBackgroundPoller]);

  const toggleMetronomeWithSync = useCallback(async (): Promise<boolean> => {
    const newEnabled = await metronomeService.toggleMetronome();
    if (newEnabled && isPlayingRef.current) {
      const isDownbeat = currentBeatIndex % Math.max(1, timeSignature) === 0;
      metronomeService.scheduleClick(0, isDownbeat);
      lastTriggeredBeatIndexRef.current = currentBeatIndex;
    }
    return newEnabled;
  }, [currentBeatIndex, timeSignature]);

  return { toggleMetronomeWithSync };
};
