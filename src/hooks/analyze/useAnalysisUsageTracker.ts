import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { incrementTranscriptionUsage } from '@/services/firebase/firestoreService';
import { safeSessionStorage } from '@/utils/clientOnlyFirebase';

const USAGE_COUNT_STORAGE_PREFIX = 'chordmini_analysis_usage_counted:';
const DEFAULT_USAGE_THRESHOLD_SECONDS = 45;
const RETRY_COOLDOWN_MS = 5000;

interface UseAnalysisUsageTrackerParams {
  videoId: string;
  beatDetector: string;
  chordDetector: string;
  isAnalyzed: boolean;
  isPlaying: boolean;
  duration: number;
  hasPersistedTranscription: boolean;
  onUsageCountIncrement?: () => void;
}

function getIsPageActive(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.visibilityState === 'visible' && document.hasFocus();
}

function getUsageThresholdMs(durationSeconds: number): number {
  const validDurationSeconds =
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : DEFAULT_USAGE_THRESHOLD_SECONDS;

  return Math.min(validDurationSeconds, DEFAULT_USAGE_THRESHOLD_SECONDS) * 1000;
}

export function useAnalysisUsageTracker({
  videoId,
  beatDetector,
  chordDetector,
  isAnalyzed,
  isPlaying,
  duration,
  hasPersistedTranscription,
  onUsageCountIncrement,
}: UseAnalysisUsageTrackerParams): void {
  const docId = useMemo(() => (
    videoId && beatDetector && chordDetector
      ? `${videoId}_${beatDetector}_${chordDetector}`
      : null
  ), [beatDetector, chordDetector, videoId]);
  const thresholdMs = useMemo(() => getUsageThresholdMs(duration), [duration]);
  const [isPageActive, setIsPageActive] = useState<boolean>(() => getIsPageActive());
  const [sessionCountRefreshNonce, setSessionCountRefreshNonce] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  void sessionCountRefreshNonce;

  const hasCountedInSession = (
    docId
      ? safeSessionStorage().getItem(`${USAGE_COUNT_STORAGE_PREFIX}${docId}`) === '1'
      : false
  );

  const accumulatedMsRef = useRef(0);
  const activeStartMsRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incrementInFlightRef = useRef(false);
  const retryAllowedAtMsRef = useRef(0);
  const latestActiveRef = useRef(false);
  const latestDocIdRef = useRef<string | null>(null);
  const latestSessionCountedRef = useRef(false);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const finalizeActiveWindow = useCallback(() => {
    if (activeStartMsRef.current !== null) {
      accumulatedMsRef.current += Date.now() - activeStartMsRef.current;
      activeStartMsRef.current = null;
    }

    clearPendingTimeout();
  }, [clearPendingTimeout]);

  useEffect(() => {
    latestDocIdRef.current = docId;
  }, [docId]);

  useEffect(() => {
    latestSessionCountedRef.current = hasCountedInSession;
  }, [hasCountedInSession]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const updatePageActivity = () => {
      setIsPageActive(getIsPageActive());
    };

    updatePageActivity();

    document.addEventListener('visibilitychange', updatePageActivity);
    window.addEventListener('focus', updatePageActivity);
    window.addEventListener('blur', updatePageActivity);
    window.addEventListener('pageshow', updatePageActivity);

    return () => {
      document.removeEventListener('visibilitychange', updatePageActivity);
      window.removeEventListener('focus', updatePageActivity);
      window.removeEventListener('blur', updatePageActivity);
      window.removeEventListener('pageshow', updatePageActivity);
    };
  }, []);

  useEffect(() => {
    finalizeActiveWindow();
    accumulatedMsRef.current = 0;
    retryAllowedAtMsRef.current = 0;
    incrementInFlightRef.current = false;
  }, [docId, finalizeActiveWindow]);

  const activeEngagementEligible =
    Boolean(docId) &&
    isAnalyzed &&
    hasPersistedTranscription &&
    isPlaying &&
    isPageActive &&
    !hasCountedInSession;

  useEffect(() => {
    latestActiveRef.current = activeEngagementEligible;
  }, [activeEngagementEligible]);

  const scheduleThresholdCheck = useCallback(() => {
    if (!docId || hasCountedInSession || incrementInFlightRef.current || !latestActiveRef.current) {
      return;
    }

    const now = Date.now();
    const remainingThresholdMs = Math.max(0, thresholdMs - accumulatedMsRef.current);
    const retryDelayMs = Math.max(0, retryAllowedAtMsRef.current - now);
    const waitMs = Math.max(remainingThresholdMs, retryDelayMs);

    if (activeStartMsRef.current === null) {
      activeStartMsRef.current = now;
    }

    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => {
      finalizeActiveWindow();

      if (!latestActiveRef.current || incrementInFlightRef.current || !latestDocIdRef.current || latestSessionCountedRef.current) {
        return;
      }

      incrementInFlightRef.current = true;
      const targetDocId = latestDocIdRef.current;
      const sessionStorageKey = `${USAGE_COUNT_STORAGE_PREFIX}${targetDocId}`;

      void incrementTranscriptionUsage(videoId, beatDetector, chordDetector)
        .then((success) => {
          if (!success) {
            retryAllowedAtMsRef.current = Date.now() + RETRY_COOLDOWN_MS;
            return;
          }

          safeSessionStorage().setItem(sessionStorageKey, '1');
          setSessionCountRefreshNonce((current) => current + 1);
          onUsageCountIncrement?.();
        })
        .finally(() => {
          incrementInFlightRef.current = false;

          if (
            latestDocIdRef.current === targetDocId &&
            latestActiveRef.current &&
            !latestSessionCountedRef.current
          ) {
            setRetryNonce((current) => current + 1);
          }
        });
    }, waitMs);
  }, [
    beatDetector,
    chordDetector,
    clearPendingTimeout,
    docId,
    finalizeActiveWindow,
    hasCountedInSession,
    onUsageCountIncrement,
    thresholdMs,
    videoId,
  ]);

  useEffect(() => {
    if (!activeEngagementEligible) {
      finalizeActiveWindow();
      return;
    }

    scheduleThresholdCheck();

    return () => {
      clearPendingTimeout();
    };
  }, [activeEngagementEligible, clearPendingTimeout, finalizeActiveWindow, retryNonce, scheduleThresholdCheck]);

  useEffect(() => () => {
    finalizeActiveWindow();
  }, [finalizeActiveWindow]);
}
