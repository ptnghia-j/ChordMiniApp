import { useCallback, useEffect, useRef } from 'react';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useUIStore } from '@/stores/uiStore';
import type { UseAnalyzePageLifecycleResetParams } from '../_types/analyzePageViewModel';

export function useAnalyzePageLifecycleReset({
  videoId,
  resetSegmentation,
  setIsMelodicTranscriptionPlaybackEnabled,
  setIsFollowModeEnabled,
  setIsCountdownEnabled,
  cancelCountdown,
  countdownStateRef,
  chordPlayback,
  setIsMetronomeEnabled,
  disableMetronomeService,
}: UseAnalyzePageLifecycleResetParams) {
  const previousVideoIdRef = useRef<string | null>(null);

  const resetUtilityBarForVideoSwitch = useCallback(() => {
    useUIStore.getState().resetAnalysisUtilityBarState();
    usePlaybackStore.getState().setIsFollowModeEnabled(true);

    setIsMelodicTranscriptionPlaybackEnabled(false);
    resetSegmentation();
    setIsFollowModeEnabled(true);
    setIsCountdownEnabled(false);
    cancelCountdown();
    countdownStateRef.current.completed = false;

    if (chordPlayback.isEnabled) {
      chordPlayback.togglePlayback();
    }

    setIsMetronomeEnabled(false);
    disableMetronomeService();
  }, [
    cancelCountdown,
    chordPlayback,
    countdownStateRef,
    disableMetronomeService,
    resetSegmentation,
    setIsCountdownEnabled,
    setIsFollowModeEnabled,
    setIsMelodicTranscriptionPlaybackEnabled,
    setIsMetronomeEnabled,
  ]);

  useEffect(() => {
    if (previousVideoIdRef.current && previousVideoIdRef.current !== videoId) {
      resetUtilityBarForVideoSwitch();
    }

    previousVideoIdRef.current = videoId;
  }, [resetUtilityBarForVideoSwitch, videoId]);

  useEffect(() => {
    return () => {
      useUIStore.getState().resetAnalysisUtilityBarState();
      usePlaybackStore.getState().setIsFollowModeEnabled(true);
      disableMetronomeService();
    };
  }, [disableMetronomeService]);
}
