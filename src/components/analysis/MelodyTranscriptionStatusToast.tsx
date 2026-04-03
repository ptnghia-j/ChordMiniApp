'use client';

import React, { useEffect, useRef, createElement } from 'react';
import { addToast, closeToast } from '@heroui/react';

const DEFAULT_REFERENCE_DURATION_SECONDS = 240;
const DEFAULT_ESTIMATED_MELODY_SECONDS = 100;

function createNonPausingProgressBar(durationMs: number, id: string) {
  const animName = `toast-progress-${id}`;
  return createElement(
    'div',
    {
      key: id,
      className: 'absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-lg',
    },
    createElement('style', {
      key: 'style',
      dangerouslySetInnerHTML: {
        __html: `@keyframes ${animName} { from { width: 0%; } to { width: 100%; } }`,
      },
    }),
    createElement('div', {
      key: 'bar',
      style: {
        height: '100%',
        animation: `${animName} ${durationMs}ms linear forwards`,
      },
      className: 'bg-primary-400 dark:bg-primary-500 opacity-60',
    }),
  );
}

function estimateMelodyWaitSeconds(durationSeconds: number | null | undefined): number {
  const safeDuration = durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : DEFAULT_REFERENCE_DURATION_SECONDS;

  return Math.max(
    1,
    Math.round((DEFAULT_ESTIMATED_MELODY_SECONDS * safeDuration) / DEFAULT_REFERENCE_DURATION_SECONDS),
  );
}

interface MelodyTranscriptionStatusToastProps {
  isComputing: boolean;
  durationSeconds?: number | null;
  hasResult?: boolean;
  errorMessage?: string | null;
}

const MelodyTranscriptionStatusToast: React.FC<MelodyTranscriptionStatusToastProps> = ({
  isComputing,
  durationSeconds,
  hasResult = false,
  errorMessage = null,
}) => {
  const toastKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevComputingRef = useRef(false);

  useEffect(() => {
    const wasComputing = prevComputingRef.current;
    prevComputingRef.current = isComputing;

    if (isComputing && !toastKeyRef.current) {
      const estimateSeconds = estimateMelodyWaitSeconds(durationSeconds);
      const durationMs = estimateSeconds * 1000;
      const key = addToast({
        title: 'Transcribing Melody',
        description: `Estimated wait: about ${estimateSeconds}s for this song.`,
        color: 'primary',
        variant: 'flat',
        timeout: 0,
        hideCloseButton: true,
        endContent: createNonPausingProgressBar(durationMs, 'melody'),
        classNames: { base: 'relative overflow-hidden' },
      });
      toastKeyRef.current = key;
      timerRef.current = setTimeout(() => {
        if (toastKeyRef.current) {
          closeToast(toastKeyRef.current);
          toastKeyRef.current = null;
        }
        timerRef.current = null;
      }, durationMs);
      return;
    }

    if (!isComputing && wasComputing) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }

      if (!errorMessage && hasResult) {
        addToast({
          title: 'Melody Ready',
          description: 'Melody transcription finished and is ready in Piano Visualizer.',
          color: 'success',
          variant: 'flat',
          timeout: 4000,
          shouldShowTimeoutProgress: true,
        });
      }
    }
  }, [durationSeconds, errorMessage, hasResult, isComputing]);

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

export default MelodyTranscriptionStatusToast;
