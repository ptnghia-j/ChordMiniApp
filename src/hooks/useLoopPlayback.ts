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

    // Validate loop range
    if (loopStartBeat < 0 || loopEndBeat >= beats.length || loopStartBeat > loopEndBeat) return;

    // Get timestamps for loop boundaries
    const startTimestamp = beats[loopStartBeat];
    const endTimestamp = beats[loopEndBeat];
    if (startTimestamp == null || endTimestamp == null) return;

    // Calculate end boundary with small buffer to account for timing precision
    // Use next beat's timestamp if available
    // For the final beat, use video duration to handle very long final beats (6-8+ seconds)
    const nextBeatTimestamp = loopEndBeat + 1 < beats.length ? beats[loopEndBeat + 1] : null;
    const endBoundary = nextBeatTimestamp !== null
      ? nextBeatTimestamp
      : (duration > 0 ? Math.max(duration - 0.5, endTimestamp) : endTimestamp + 2.0);

    // Check if we've reached the end of the loop range
    if (currentTime >= endBoundary) {
      const now = Date.now();
      // Cooldown check to prevent rapid looping
      if (now - lastLoopTimeRef.current < LOOP_COOLDOWN_MS) return;

      try {
        youtubePlayer.seekTo?.(startTimestamp, 'seconds');
        lastLoopTimeRef.current = now;
        // Trigger click-like positioning so the animation loop centrally updates both ref and state
        setLastClickInfo({ visualIndex: loopStartBeat, timestamp: startTimestamp, clickTime: Date.now() });
        // Ensure playback resumes if the player reached natural end
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (youtubePlayer as any)?.playVideo?.();
      } catch (error) {
        console.warn('Failed to loop playback:', error);
      }
    }
  }, [isLoopEnabled, youtubePlayer, beats, currentTime, duration, loopStartBeat, loopEndBeat, setLastClickInfo]);
};

