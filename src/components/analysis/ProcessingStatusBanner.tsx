'use client';

import React, { useEffect, useRef, createElement } from 'react';
import { addToast, closeToast } from '@heroui/react';

import { useProcessing } from '@/contexts/ProcessingContext';
import { getAudioDurationFromUrl } from '@/utils/audioDurationUtils';

// Processing time ratios (processing time as fraction of audio duration)
const PROCESSING_RATIOS: Record<string, number> = {
  'madmom': 0.35,
  'beat-transformer': 0.45,
  'auto': 0.35,
  'chord-recognition': 0.35,
};

const FALLBACK_DURATION = 180; // 3 minutes default

/**
 * Creates a custom CSS-animated progress bar that does NOT pause on hover.
 * Uses a unique animation name per instance to avoid conflicts.
 */
function createNonPausingProgressBar(durationMs: number, id: string) {
  const animName = `toast-progress-${id}`;
  return createElement('div', {
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

interface ProcessingStatusBannerProps {
  audioUrl?: string;
  fromCache?: boolean;
  fromFirestoreCache?: boolean;
  videoId?: string;
  beatDetector?: 'madmom' | 'beat-transformer' | 'auto';
}

const ProcessingStatusBanner: React.FC<ProcessingStatusBannerProps> = React.memo(({
  audioUrl,
  fromCache = false,
  fromFirestoreCache = false,
  videoId,
  beatDetector = 'madmom',
}) => {
  const { stage, statusMessage, getFormattedElapsedTime } = useProcessing();
  const chordToastKeyRef = useRef<string | null>(null);
  const beatToastKeyRef = useRef<string | null>(null);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStageRef = useRef<string>('idle');
  const audioDurationRef = useRef<number | null>(null);
  const durationFetchedRef = useRef(false);

  // Detect audio duration when processing starts
  useEffect(() => {
    if (
      (stage === 'beat-detection' || stage === 'chord-recognition') &&
      !durationFetchedRef.current &&
      audioUrl
    ) {
      durationFetchedRef.current = true;
      getAudioDurationFromUrl(audioUrl, videoId)
        .then((d) => { audioDurationRef.current = d; })
        .catch(() => { audioDurationRef.current = FALLBACK_DURATION; });
    }

    // Reset when back to idle
    if (stage === 'idle') {
      durationFetchedRef.current = false;
      audioDurationRef.current = null;
    }
  }, [stage, audioUrl, videoId]);

  useEffect(() => {
    const prevStage = prevStageRef.current;
    prevStageRef.current = stage;

    // Stage flow: chord-recognition (brief) → beat-detection (long wait)
    // When chord-recognition starts, show chord toast
    if (stage === 'chord-recognition' && !chordToastKeyRef.current) {
      const effectiveDuration = audioDurationRef.current || FALLBACK_DURATION;
      const beatRatio = PROCESSING_RATIOS[beatDetector] || 0.35;
      // Chord toast stays for 1/10 of the beat detection estimate
      const chordTimeoutMs = Math.ceil(effectiveDuration * beatRatio * 0.1) * 1000;

      const key = addToast({
        title: 'Recognizing Chords',
        description: statusMessage || 'Recognizing chords and synchronizing with beats...',
        color: 'primary',
        variant: 'flat',
        timeout: 0, // Disable HeroUI's default 6s auto-dismiss; we manage lifetime ourselves
        hideCloseButton: true,
        endContent: createNonPausingProgressBar(chordTimeoutMs, 'chord'),
        classNames: { base: 'relative overflow-hidden' },
      });
      chordToastKeyRef.current = key;
      // Manually close after duration (not paused by hover)
      chordTimerRef.current = setTimeout(() => {
        if (chordToastKeyRef.current) {
          closeToast(chordToastKeyRef.current);
          chordToastKeyRef.current = null;
        }
        chordTimerRef.current = null;
      }, chordTimeoutMs);
    }

    // When beat-detection starts, show beat toast (chord toast stays visible with its own timeout)
    if (stage === 'beat-detection' && !beatToastKeyRef.current) {
      const effectiveDuration = audioDurationRef.current || FALLBACK_DURATION;
      const beatRatio = PROCESSING_RATIOS[beatDetector] || 0.35;
      const beatTimeoutMs = Math.ceil(effectiveDuration * beatRatio) * 1000;

      const key = addToast({
        title: 'Detecting Beats',
        description: statusMessage || 'Analyzing beat patterns and timing...',
        color: 'primary',
        variant: 'flat',
        timeout: 0, // Disable HeroUI's default 6s auto-dismiss; we manage lifetime ourselves
        hideCloseButton: true,
        endContent: createNonPausingProgressBar(beatTimeoutMs, 'beat'),
        classNames: { base: 'relative overflow-hidden' },
      });
      beatToastKeyRef.current = key;
      // Manually close after duration (not paused by hover)
      beatTimerRef.current = setTimeout(() => {
        if (beatToastKeyRef.current) {
          closeToast(beatToastKeyRef.current);
          beatToastKeyRef.current = null;
        }
        beatTimerRef.current = null;
      }, beatTimeoutMs);
    }

    // Handle completion
    if (stage === 'complete' && (prevStage === 'beat-detection' || prevStage === 'chord-recognition')) {
      // Close both processing toasts and clear manual timers
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (beatTimerRef.current) { clearTimeout(beatTimerRef.current); beatTimerRef.current = null; }
      if (chordToastKeyRef.current) {
        closeToast(chordToastKeyRef.current);
        chordToastKeyRef.current = null;
      }
      if (beatToastKeyRef.current) {
        closeToast(beatToastKeyRef.current);
        beatToastKeyRef.current = null;
      }

      // Build description with cache badges
      const cacheInfo = [
        fromCache ? 'Audio Cache' : '',
        fromFirestoreCache ? 'Results Cache' : '',
      ].filter(Boolean).join(' · ');

      const description = `Beat and chord analysis completed in ${getFormattedElapsedTime()}${cacheInfo ? ` · ${cacheInfo}` : ''}`;

      addToast({
        title: 'Analysis Complete',
        description,
        color: 'success',
        variant: 'flat',
        timeout: 5000,
        shouldShowTimeoutProgress: true,
      });
    }

    // Handle error — close processing toasts but do NOT fire an error toast.
    // The inline UserFriendlyErrorDisplay already shows the error; adding a toast
    // produced the duplicate / excessive-popup problem.
    if (stage === 'error') {
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (beatTimerRef.current) { clearTimeout(beatTimerRef.current); beatTimerRef.current = null; }
      if (chordToastKeyRef.current) {
        closeToast(chordToastKeyRef.current);
        chordToastKeyRef.current = null;
      }
      if (beatToastKeyRef.current) {
        closeToast(beatToastKeyRef.current);
        beatToastKeyRef.current = null;
      }
    }

    // Handle idle - cleanup any lingering toasts and timers
    if (stage === 'idle') {
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (beatTimerRef.current) { clearTimeout(beatTimerRef.current); beatTimerRef.current = null; }
      if (chordToastKeyRef.current) {
        closeToast(chordToastKeyRef.current);
        chordToastKeyRef.current = null;
      }
      if (beatToastKeyRef.current) {
        closeToast(beatToastKeyRef.current);
        beatToastKeyRef.current = null;
      }
    }
  }, [stage, statusMessage, getFormattedElapsedTime, fromCache, fromFirestoreCache, beatDetector]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (beatTimerRef.current) { clearTimeout(beatTimerRef.current); beatTimerRef.current = null; }
      if (chordToastKeyRef.current) {
        closeToast(chordToastKeyRef.current);
        chordToastKeyRef.current = null;
      }
      if (beatToastKeyRef.current) {
        closeToast(beatToastKeyRef.current);
        beatToastKeyRef.current = null;
      }
    };
  }, []);

  return null;
});

ProcessingStatusBanner.displayName = 'ProcessingStatusBanner';

export default ProcessingStatusBanner;
