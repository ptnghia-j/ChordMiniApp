'use client';

import React, { useEffect, useRef, useState, createElement } from 'react';
import { addToast, closeToast } from '@heroui/react';
import { useProcessing } from '@/contexts/ProcessingContext';

const EXTRACTION_ESTIMATE_SECONDS = 25;

interface DownloadingIndicatorProps {
  isVisible: boolean;
}

interface ExtractionCountdownDescriptionProps {
  estimateSeconds: number;
}

const ExtractionCountdownDescription: React.FC<ExtractionCountdownDescriptionProps> = ({
  estimateSeconds,
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(estimateSeconds);

  useEffect(() => {
    const startedAt = Date.now();
    const estimateMs = estimateSeconds * 1000;

    const interval = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const nextRemainingSeconds = Math.max(0, Math.ceil((estimateMs - elapsedMs) / 1000));
      setRemainingSeconds(nextRemainingSeconds);
    }, 250);

    return () => clearInterval(interval);
  }, [estimateSeconds]);

  if (remainingSeconds === 0) {
    return <span>Almost done. Finalizing the extracted audio...</span>;
  }

  return <span>Estimated time remaining: about {remainingSeconds}s.</span>;
};

function createCountdownProgressBar(durationMs: number, id: string) {
  const animName = `toast-countdown-${id}`;

  return createElement(
    'div',
    {
      key: id,
      className: 'absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-lg',
    },
    createElement('style', {
      key: 'style',
      dangerouslySetInnerHTML: {
        __html: `@keyframes ${animName} { from { transform: scaleX(1); } to { transform: scaleX(0); } }`,
      },
    }),
    createElement('div', {
      key: 'bar',
      style: {
        height: '100%',
        transformOrigin: 'left center',
        animation: `${animName} ${durationMs}ms linear forwards`,
      },
      className: 'bg-warning-500 dark:bg-warning-400 opacity-70',
    }),
  );
}

const DownloadingIndicator: React.FC<DownloadingIndicatorProps> = ({
  isVisible
}) => {
  // Get stage from the ProcessingContext
  const { stage } = useProcessing();
  const toastKeyRef = useRef<string | null>(null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) {
      // Show toast when becoming visible
      wasVisibleRef.current = true;
      const estimateMs = EXTRACTION_ESTIMATE_SECONDS * 1000;
      const key = addToast({
        title: stage === 'downloading' ? 'Downloading YouTube Video...' : 'Extracting Audio...',
        description: <ExtractionCountdownDescription estimateSeconds={EXTRACTION_ESTIMATE_SECONDS} />,
        color: 'warning',
        variant: 'flat',
        timeout: 0, // Don't auto-dismiss - wait until extraction completes
        hideCloseButton: true,
        endContent: createCountdownProgressBar(estimateMs, 'youtube-extraction'),
        classNames: { base: 'relative overflow-hidden' },
      });
      toastKeyRef.current = key;
    } else if (!isVisible && wasVisibleRef.current) {
      // Close toast when becoming hidden
      wasVisibleRef.current = false;
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
    }
  }, [isVisible, stage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
    };
  }, []);

  return null;
};

export default DownloadingIndicator;
