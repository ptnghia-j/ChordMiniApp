'use client';

import React, { useEffect, useRef, useState, createElement } from 'react';
import { addToast, closeToast } from '@heroui/react';
import { mergeToastClassNames } from '@/utils/toastStyles';
import { useProcessing } from '@/contexts/ProcessingContext';

const EXTRACTION_ESTIMATE_SECONDS = 25;
const QUEUE_ESTIMATE_IMPROVEMENT_SECONDS = 10;

interface DownloadingIndicatorProps {
  isVisible: boolean;
  queueStatus?: 'queued' | 'active' | 'released' | 'cancelled' | 'expired' | null;
  queuePosition?: number | null;
  estimatedWaitSeconds?: number | null;
}

interface ExtractionCountdownDescriptionProps {
  estimateSeconds: number;
  queueStatus?: DownloadingIndicatorProps['queueStatus'];
  queuePosition?: number | null;
}

const ExtractionCountdownDescription: React.FC<ExtractionCountdownDescriptionProps> = ({
  estimateSeconds,
  queueStatus,
  queuePosition,
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

  if (queueStatus === 'queued') {
    const hasQueuePosition = Boolean(queuePosition && queuePosition > 0);
    if (remainingSeconds === 0) {
      return (
        <span className="block space-y-1 whitespace-normal break-words leading-relaxed">
          {hasQueuePosition && <span className="block">Queue position: {queuePosition}.</span>}
          <span className="block">Waiting for earlier extraction sessions to finish.</span>
        </span>
      );
    }

    return (
      <span className="block space-y-1 whitespace-normal break-words leading-relaxed">
        {hasQueuePosition && <span className="block">Queue position: {queuePosition}.</span>}
        <span className="block">Estimated wait: about {remainingSeconds}s.</span>
      </span>
    );
  }

  if (remainingSeconds === 0) {
    return (
      <span className="block whitespace-normal break-words leading-relaxed">
        Almost done.
        <br />
        Finalizing the extracted audio...
      </span>
    );
  }

  return (
    <span className="block whitespace-normal break-words leading-relaxed">
      Estimated time remaining:
      <br />
      about {remainingSeconds}s.
    </span>
  );
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
  isVisible,
  queueStatus,
  queuePosition,
  estimatedWaitSeconds,
}) => {
  // Get stage from the ProcessingContext
  const { stage } = useProcessing();
  const toastKeyRef = useRef<string | null>(null);
  const wasVisibleRef = useRef(false);
  const toastSignatureRef = useRef<string>('');
  const toastEstimateSecondsRef = useRef<number | null>(null);

  useEffect(() => {
    const effectiveEstimateSeconds = queueStatus === 'queued'
      ? Math.max(1, Math.ceil(estimatedWaitSeconds || EXTRACTION_ESTIMATE_SECONDS))
      : EXTRACTION_ESTIMATE_SECONDS;
    const signature = `${stage}:${queueStatus || 'none'}:${queuePosition || 0}`;
    const previousEstimateSeconds = toastEstimateSecondsRef.current;
    const hasMaterialEstimateImprovement = Boolean(
      queueStatus === 'queued' &&
      previousEstimateSeconds &&
      effectiveEstimateSeconds <= previousEstimateSeconds - QUEUE_ESTIMATE_IMPROVEMENT_SECONDS,
    );

    if (isVisible && (!wasVisibleRef.current || toastSignatureRef.current !== signature || hasMaterialEstimateImprovement)) {
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
      // Show toast when becoming visible
      wasVisibleRef.current = true;
      toastSignatureRef.current = signature;
      toastEstimateSecondsRef.current = effectiveEstimateSeconds;
      const estimateMs = effectiveEstimateSeconds * 1000;
      const key = addToast({
        title: queueStatus === 'queued'
          ? 'Waiting for Extraction Queue'
          : (stage === 'downloading' ? 'Downloading YouTube Video...' : 'Extracting Audio...'),
        description: (
          <ExtractionCountdownDescription
            estimateSeconds={effectiveEstimateSeconds}
            queueStatus={queueStatus}
            queuePosition={queuePosition}
          />
        ),
        color: 'default',
        timeout: 0, // Don't auto-dismiss - wait until extraction completes
        hideCloseButton: true,
        endContent: createCountdownProgressBar(estimateMs, 'youtube-extraction'),
        classNames: mergeToastClassNames({
          base: 'relative max-w-[min(92vw,26rem)] overflow-hidden',
          icon: 'text-warning-500',
          title: 'text-warning-600 dark:text-warning-400',
          description: 'whitespace-normal break-words',
          content: 'min-w-0',
        }),
      });
      toastKeyRef.current = key;
    } else if (!isVisible && wasVisibleRef.current) {
      // Close toast when becoming hidden
      wasVisibleRef.current = false;
      toastSignatureRef.current = '';
      toastEstimateSecondsRef.current = null;
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
    }
  }, [isVisible, stage, queueStatus, queuePosition, estimatedWaitSeconds]);

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
