/**
 * Custom hook for loop playback functionality
 * Monitors YouTube player progress and loops back to start beat when end beat is reached
 */

import { useEffect, useRef } from 'react';
import { YouTubePlayer } from '@/types/youtube';
import {
  useIsLoopEnabled,
  useLoopStartBeat,
  useLoopEndBeat
} from '@/stores/uiStore';

interface UseLoopPlaybackProps {
  youtubePlayer: YouTubePlayer | null;
  beats: (number | null)[];
  currentTime: number;
  duration: number; // Video duration for accurate end boundary calculation
  setLastClickInfo: (info: { visualIndex: number; timestamp: number; clickTime: number }) => void;
}

interface ResolvedLoopRange {
  resolvedStartBeat: number;
  startTimestamp: number;
  endBoundary: number;
}

export const resolveLoopRange = (
  beats: (number | null)[],
  loopStartBeat: number,
  loopEndBeat: number,
  duration: number
): ResolvedLoopRange | null => {
  if (
    loopStartBeat < 0 ||
    loopEndBeat < 0 ||
    loopStartBeat >= beats.length ||
    loopEndBeat >= beats.length ||
    loopStartBeat > loopEndBeat
  ) {
    return null;
  }

  let resolvedStartBeat = -1;
  for (let index = loopStartBeat; index <= loopEndBeat; index += 1) {
    if (typeof beats[index] === 'number') {
      resolvedStartBeat = index;
      break;
    }
  }

  let resolvedEndBeat = -1;
  for (let index = loopEndBeat; index >= loopStartBeat; index -= 1) {
    if (typeof beats[index] === 'number') {
      resolvedEndBeat = index;
      break;
    }
  }

  if (resolvedStartBeat === -1 || resolvedEndBeat === -1 || resolvedStartBeat > resolvedEndBeat) {
    return null;
  }

  const startTimestamp = beats[resolvedStartBeat] as number;
  const endTimestamp = beats[resolvedEndBeat] as number;

  let nextBeatTimestamp: number | null = null;
  for (let index = resolvedEndBeat + 1; index < beats.length; index += 1) {
    if (typeof beats[index] === 'number') {
      nextBeatTimestamp = beats[index] as number;
      break;
    }
  }

  const endBoundary = nextBeatTimestamp !== null
    ? nextBeatTimestamp
    : (duration > 0 ? Math.max(duration - 0.5, endTimestamp) : endTimestamp + 2.0);

  return {
    resolvedStartBeat,
    startTimestamp,
    endBoundary,
  };
};

export const useLoopPlayback = ({
  youtubePlayer,
  beats,
  currentTime,
  duration,
  setLastClickInfo
}: UseLoopPlaybackProps) => {
  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();

  // Track last loop time to prevent rapid looping
  const lastLoopTimeRef = useRef<number>(0);
  const LOOP_COOLDOWN_MS = 500; // Minimum time between loops

  useEffect(() => {
    if (!isLoopEnabled || !youtubePlayer || beats.length === 0) return;

    const resolvedLoopRange = resolveLoopRange(beats, loopStartBeat, loopEndBeat, duration);
    if (!resolvedLoopRange) return;

    const { resolvedStartBeat, startTimestamp, endBoundary } = resolvedLoopRange;

    // Check if we've reached the end of the loop range
    if (currentTime >= endBoundary) {
      const now = Date.now();
      // Cooldown check to prevent rapid looping
      if (now - lastLoopTimeRef.current < LOOP_COOLDOWN_MS) return;

      try {
        youtubePlayer.seekTo?.(startTimestamp, 'seconds');
        lastLoopTimeRef.current = now;
        // Trigger click-like positioning so the animation loop centrally updates both ref and state
        setLastClickInfo({ visualIndex: resolvedStartBeat, timestamp: startTimestamp, clickTime: Date.now() });
        // Ensure playback resumes if the player reached natural end
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (youtubePlayer as any)?.playVideo?.();
      } catch (error) {
        console.warn('Failed to loop playback:', error);
      }
    }
  }, [isLoopEnabled, youtubePlayer, beats, currentTime, duration, loopStartBeat, loopEndBeat, setLastClickInfo]);
};
