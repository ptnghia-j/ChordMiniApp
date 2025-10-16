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
  isPlaying: boolean;
}

export const useLoopPlayback = ({
  youtubePlayer,
  beats,
  currentTime,
  isPlaying
}: UseLoopPlaybackProps) => {
  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();

  // Track last loop time to prevent rapid looping
  const lastLoopTimeRef = useRef<number>(0);
  const LOOP_COOLDOWN_MS = 500; // Minimum time between loops

  useEffect(() => {
    if (!isLoopEnabled || !youtubePlayer || !isPlaying || beats.length === 0) {
      return;
    }

    // Validate loop range
    if (loopStartBeat < 0 || loopEndBeat >= beats.length || loopStartBeat > loopEndBeat) {
      return;
    }

    // Get timestamps for loop boundaries
    const startTimestamp = beats[loopStartBeat];
    const endTimestamp = beats[loopEndBeat];

    if (startTimestamp === null || endTimestamp === null) {
      return;
    }

    // Calculate end boundary with small buffer to account for timing precision
    // Use next beat's timestamp if available, otherwise add 2 seconds
    const nextBeatTimestamp = loopEndBeat + 1 < beats.length ? beats[loopEndBeat + 1] : null;
    const endBoundary = nextBeatTimestamp !== null ? nextBeatTimestamp : endTimestamp + 2.0;

    // Check if we've reached the end of the loop range
    if (currentTime >= endBoundary) {
      const now = Date.now();
      
      // Cooldown check to prevent rapid looping
      if (now - lastLoopTimeRef.current < LOOP_COOLDOWN_MS) {
        return;
      }

      // Loop back to start beat
      if (youtubePlayer.seekTo) {
        try {
          youtubePlayer.seekTo(startTimestamp, 'seconds');
          lastLoopTimeRef.current = now;
        } catch (error) {
          console.warn('Failed to loop playback:', error);
        }
      }
    }
  }, [isLoopEnabled, youtubePlayer, beats, currentTime, isPlaying, loopStartBeat, loopEndBeat]);
};

