'use client';

import { useEffect, useRef } from 'react';
import { addToast, closeToast } from '@heroui/react';

/** Delay (ms) before showing the "press play" prompt. */
const PROMPT_DELAY_MS = 5_000;

interface PlaybackPromptToastProps {
  /** Whether analysis results have loaded and the chord grid is visible. */
  isAnalyzed: boolean;
  /** Whether the YouTube player is currently playing. */
  isPlaying: boolean;
}

/**
 * Renderless component that shows a blue informational toast prompting the
 * user to press play on the YouTube embedded video.
 *
 * Behaviour:
 *  - When `isAnalyzed` becomes `true`, a 5-second timer starts.
 *  - After 5 seconds, if the user has not started playback (`!isPlaying`),
 *    a persistent blue toast appears.
 *  - The toast auto-dismisses the moment `isPlaying` becomes `true`.
 *  - If the user starts playback within the 5 seconds, the toast never shows.
 */
const PlaybackPromptToast: React.FC<PlaybackPromptToastProps> = ({
  isAnalyzed,
  isPlaying,
}) => {
  const toastKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownRef = useRef(false);

  // Start/cancel the 5-second delay when analysis loads
  useEffect(() => {
    if (!isAnalyzed || isPlaying || hasShownRef.current) {
      return;
    }

    // Start the delay timer
    timerRef.current = setTimeout(() => {
      // Double-check — the user could have pressed play during the delay
      if (hasShownRef.current) return;

      hasShownRef.current = true;
      const key = addToast({
        title: '▶ Press Play to Start',
        description:
          'Click the play button on the YouTube video to begin playback. You can then click any chord cell to jump to that position.',
        color: 'primary',
        variant: 'flat',
        timeout: 0, // persistent until manually closed
        shouldShowTimeoutProgress: false,
      });
      toastKeyRef.current = key;
    }, PROMPT_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAnalyzed, isPlaying]);

  // Auto-dismiss the toast when the user starts playback
  useEffect(() => {
    if (isPlaying && toastKeyRef.current) {
      closeToast(toastKeyRef.current);
      toastKeyRef.current = null;
    }
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (toastKeyRef.current) {
      closeToast(toastKeyRef.current);
      toastKeyRef.current = null;
    }
  }, []);

  return null;
};

export default PlaybackPromptToast;
