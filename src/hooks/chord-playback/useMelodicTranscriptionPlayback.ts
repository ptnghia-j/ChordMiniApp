import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { DEFAULT_MELODY_VOLUME } from '@/config/audioDefaults';
import { getAudioMixerService } from '@/services/chord-playback/audioMixerService';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import type { SheetSageResult } from '@/types/sheetSage';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { YouTubePlayer } from '@/types/youtube';
import { buildScheduledSheetSageMelodyNotes } from '@/utils/sheetSagePlayback';

interface UseMelodicTranscriptionPlaybackProps {
  sheetSageResult: SheetSageResult | null;
  audioUrl?: string | null;
  segmentationData?: SegmentationResult | null;
  audioRef?: RefObject<HTMLAudioElement | null>;
  youtubePlayer?: YouTubePlayer | null;
  currentTime: number;
  isPlaying: boolean;
  isEnabled: boolean;
}

export function useMelodicTranscriptionPlayback({
  sheetSageResult,
  audioUrl = null,
  segmentationData = null,
  audioRef,
  youtubePlayer = null,
  currentTime,
  isPlaying,
  isEnabled,
}: UseMelodicTranscriptionPlaybackProps): void {
  const serviceRef = useRef(getSoundfontChordPlaybackService());
  const playbackActiveRef = useRef(false);
  const lastObservedTimeRef = useRef(currentTime);
  const lastScheduledStartRef = useRef<number | null>(null);
  const latestCurrentTimeRef = useRef(currentTime);
  const activationGenerationRef = useRef(0);
  const isBackgroundRef = useRef(false);
  const [melodyVolume, setMelodyVolume] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_MELODY_VOLUME;
    }

    return getAudioMixerService().getEffectiveVolumes().melody;
  });

  const hasNotes = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
  const shouldActivate = isEnabled && isPlaying && hasNotes;
  const melodyTotalDuration = useMemo(
    () => sheetSageResult?.noteEvents?.[sheetSageResult.noteEvents.length - 1]?.offset
      ?? sheetSageResult?.beatTimes?.[sheetSageResult.beatTimes.length - 1]
      ?? undefined,
    [sheetSageResult],
  );
  const dynamicsParams = useMemo(
    () => ({
      bpm: sheetSageResult?.tempoBpm ?? 120,
      timeSignature: sheetSageResult?.beatsPerMeasure ?? 4,
      totalDuration: melodyTotalDuration,
      segmentationData,
    }),
    [melodyTotalDuration, segmentationData, sheetSageResult?.beatsPerMeasure, sheetSageResult?.tempoBpm],
  );
  const dynamicsAnalyzer = useSharedAudioDynamics(audioUrl, dynamicsParams);

  const resolvePreciseTransportTime = useCallback(() => {
    const youtubeTime = youtubePlayer?.getCurrentTime?.();
    if (typeof youtubeTime === 'number' && Number.isFinite(youtubeTime) && youtubeTime >= 0) {
      return youtubeTime;
    }

    const audioTime = audioRef?.current?.currentTime;
    if (typeof audioTime === 'number' && Number.isFinite(audioTime) && audioTime >= 0) {
      return audioTime;
    }

    return latestCurrentTimeRef.current;
  }, [audioRef, youtubePlayer]);

  const stopMelodyPlayback = useCallback(() => {
    activationGenerationRef.current += 1;
    playbackActiveRef.current = false;
    serviceRef.current.stopInstruments(['melodyViolin']);
    lastScheduledStartRef.current = null;
  }, []);

  const scheduleMelodyFromTime = useCallback((time: number) => {
    const schedulingTime = resolvePreciseTransportTime();
    const scheduledNotes = buildScheduledSheetSageMelodyNotes(
      sheetSageResult,
      Math.max(time, schedulingTime),
      dynamicsAnalyzer,
    );
    void serviceRef.current.playScheduledInstrument('melodyViolin', scheduledNotes);
    lastScheduledStartRef.current = Math.max(time, schedulingTime);
  }, [dynamicsAnalyzer, resolvePreciseTransportTime, sheetSageResult]);

  useEffect(() => {
    const mixer = getAudioMixerService();
    const syncVolume = () => {
      setMelodyVolume(mixer.getEffectiveVolumes().melody);
    };

    syncVolume();
    const unsubscribe = mixer.addListener(() => {
      syncVolume();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    latestCurrentTimeRef.current = resolvePreciseTransportTime();
  }, [currentTime, resolvePreciseTransportTime]);

  useEffect(() => {
    const service = serviceRef.current;

    if (shouldActivate) {
      const activationGeneration = activationGenerationRef.current + 1;
      activationGenerationRef.current = activationGeneration;
      service.updateOptions({
        enabled: true,
        melodyVolume: Math.max(0, melodyVolume),
      });
      playbackActiveRef.current = true;

      void (async () => {
        const prepared = await service.prepareInstrumentForPlayback('melodyViolin');
        if (
          !prepared
          || activationGenerationRef.current != activationGeneration
          || !playbackActiveRef.current
        ) {
          return;
        }

        scheduleMelodyFromTime(resolvePreciseTransportTime());
      })();

      return;
    }

    if (playbackActiveRef.current) {
      service.updateOptions({ melodyVolume: Math.max(0, melodyVolume) });
      stopMelodyPlayback();
    }

    lastScheduledStartRef.current = null;
  }, [melodyVolume, resolvePreciseTransportTime, scheduleMelodyFromTime, shouldActivate, stopMelodyPlayback]);

  useEffect(() => {
    const preciseCurrentTime = resolvePreciseTransportTime();
    const previousTime = lastObservedTimeRef.current;
    lastObservedTimeRef.current = preciseCurrentTime;
    latestCurrentTimeRef.current = preciseCurrentTime;

    if (!shouldActivate || isBackgroundRef.current) {
      return;
    }

    const shouldReschedule = lastScheduledStartRef.current === null
      || preciseCurrentTime + 0.15 < previousTime
      || preciseCurrentTime - previousTime > 1.5
      || Math.abs(preciseCurrentTime - currentTime) > 0.08;

    if (!shouldReschedule) {
      return;
    }

    scheduleMelodyFromTime(preciseCurrentTime);
  }, [currentTime, resolvePreciseTransportTime, scheduleMelodyFromTime, shouldActivate]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';
      isBackgroundRef.current = hidden;

      if (!hidden && shouldActivate) {
        scheduleMelodyFromTime(resolvePreciseTransportTime());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [resolvePreciseTransportTime, scheduleMelodyFromTime, shouldActivate]);

  useEffect(() => {
    if (!isPlaying && playbackActiveRef.current) {
      stopMelodyPlayback();
    }
  }, [isPlaying, stopMelodyPlayback]);

  useEffect(() => () => {
    stopMelodyPlayback();
  }, [stopMelodyPlayback]);
}
