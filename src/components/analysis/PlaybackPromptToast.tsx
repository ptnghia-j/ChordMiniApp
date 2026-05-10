'use client';

import { useEffect, useRef } from 'react';
import { addToast, closeToast } from '@heroui/react';

/** Delay (ms) before showing the "press play" prompt. */
const PROMPT_DELAY_MS = 5_000;
const consumedPlaybackPromptIds = new Set<string>();

interface PlaybackPromptToastProps {
  /** Stable identifier for the current analysis page/song. */
  promptId?: string;
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
 *  - Once playback has started, the prompt is consumed and will not appear
 *    again after pauses or song end.
 */
const PlaybackPromptToast: React.FC<PlaybackPromptToastProps> = ({
  promptId = 'default',
  isAnalyzed,
  isPlaying,
}) => {
  const toastKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConsumedPromptRef = useRef(consumedPlaybackPromptIds.has(promptId));

  useEffect(() => {
    hasConsumedPromptRef.current = consumedPlaybackPromptIds.has(promptId);
  }, [promptId]);

  // Start/cancel the 5-second delay when analysis loads
  useEffect(() => {
    if (!isAnalyzed || isPlaying || hasConsumedPromptRef.current) {
      return;
    }

    // Start the delay timer
    timerRef.current = setTimeout(() => {
      // Double-check — the user could have pressed play during the delay
      if (hasConsumedPromptRef.current) return;

      consumedPlaybackPromptIds.add(promptId);
      hasConsumedPromptRef.current = true;
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
  }, [isAnalyzed, isPlaying, promptId]);

  // Auto-dismiss the toast when the user starts playback
  useEffect(() => {
    if (isPlaying) {
      consumedPlaybackPromptIds.add(promptId);
      hasConsumedPromptRef.current = true;
    }

    if (isPlaying && toastKeyRef.current) {
      closeToast(toastKeyRef.current);
      toastKeyRef.current = null;
    }
  }, [isPlaying, promptId]);

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
