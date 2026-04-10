import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { DEFAULT_MELODY_VOLUME } from '@/config/audioDefaults';
import { getAudioMixerService } from '@/services/chord-playback/audioMixerService';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import type { SheetSageResult } from '@/types/sheetSage';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { YouTubePlayer } from '@/types/youtube';
import { useIsPitchShiftEnabled, useIsPitchShiftReady, usePitchShiftSemitones } from '@/stores/uiStore';
import { buildPreparedSheetSageMelodyNotes, buildScheduledSheetSageMelodyNotes } from '@/utils/sheetSagePlayback';

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
  const preparedMelodyVersionRef = useRef(0);
  const lastScheduledPreparedVersionRef = useRef<number | null>(null);
  const [melodyVolume, setMelodyVolume] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_MELODY_VOLUME;
    }

    return getAudioMixerService().getEffectiveVolumes().melody;
  });

  const hasNotes = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
  const shouldActivate = isEnabled && isPlaying && hasNotes;
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const isPitchShiftReady = useIsPitchShiftReady();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const melodyPitchShiftSemitones = isPitchShiftEnabled && isPitchShiftReady ? pitchShiftSemitones : 0;
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
  const signalAnalysis = dynamicsAnalyzer.getSignalAnalysis();
  const preparedMelodyNotes = useMemo(
    () => {
      void signalAnalysis;
      return buildPreparedSheetSageMelodyNotes(
        sheetSageResult,
        dynamicsAnalyzer,
        melodyPitchShiftSemitones,
      );
    },
    [dynamicsAnalyzer, melodyPitchShiftSemitones, sheetSageResult, signalAnalysis],
  );

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

  const scheduleMelodyFromTime = useCallback((
    time: number,
    options?: {
      interruptExisting?: boolean;
    },
  ) => {
    const schedulingTime = resolvePreciseTransportTime();
    const scheduleAnchor = Math.max(time, schedulingTime);
    const scheduledNotes = buildScheduledSheetSageMelodyNotes(
      preparedMelodyNotes,
      scheduleAnchor,
    );

    if (options?.interruptExisting) {
      serviceRef.current.stopInstruments(['melodyViolin']);
    }

    void serviceRef.current.playScheduledInstrument('melodyViolin', scheduledNotes);
    lastScheduledStartRef.current = scheduleAnchor;
  }, [preparedMelodyNotes, resolvePreciseTransportTime]);

  const prepareAndScheduleMelodyFromCurrentTime = useCallback((
    options?: {
      interruptExisting?: boolean;
    },
  ) => {
    const service = serviceRef.current;
    const activationGeneration = activationGenerationRef.current + 1;
    activationGenerationRef.current = activationGeneration;

    if (options?.interruptExisting) {
      service.stopInstruments(['melodyViolin']);
      lastScheduledStartRef.current = null;
    }

    void (async () => {
      const prepared = await service.prepareInstrumentForPlayback('melodyViolin');
      if (
        !prepared
        || activationGenerationRef.current !== activationGeneration
        || !playbackActiveRef.current
      ) {
        return;
      }

      scheduleMelodyFromTime(resolvePreciseTransportTime());
    })();
  }, [resolvePreciseTransportTime, scheduleMelodyFromTime]);

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
    preparedMelodyVersionRef.current += 1;
  }, [preparedMelodyNotes]);

  useEffect(() => {
    const service = serviceRef.current;
    service.updateOptions({
      enabled: shouldActivate,
      melodyVolume: Math.max(0, melodyVolume),
    });

    if (shouldActivate) {
      const preparedMelodyVersion = preparedMelodyVersionRef.current;
      const isNewActivation = !playbackActiveRef.current;
      const sourceChangedWhileActive = lastScheduledPreparedVersionRef.current !== preparedMelodyVersion;
      playbackActiveRef.current = true;
      if (isNewActivation || sourceChangedWhileActive) {
        lastScheduledPreparedVersionRef.current = preparedMelodyVersion;
        prepareAndScheduleMelodyFromCurrentTime({
          interruptExisting: !isNewActivation && sourceChangedWhileActive,
        });
      }

      return;
    }

    if (playbackActiveRef.current) {
      stopMelodyPlayback();
    }

    lastScheduledStartRef.current = null;
    lastScheduledPreparedVersionRef.current = null;
  }, [melodyVolume, prepareAndScheduleMelodyFromCurrentTime, shouldActivate, stopMelodyPlayback]);

  useEffect(() => {
    const preciseCurrentTime = resolvePreciseTransportTime();
    const previousTime = lastObservedTimeRef.current;
    lastObservedTimeRef.current = preciseCurrentTime;
    latestCurrentTimeRef.current = preciseCurrentTime;

    if (!shouldActivate || isBackgroundRef.current) {
      return;
    }

    const jumpedBackward = preciseCurrentTime + 0.15 < previousTime;
    const jumpedForward = preciseCurrentTime - previousTime > 1.5;
    const timelineJumped = Math.abs(currentTime - previousTime) > 0.6;

    const shouldReschedule = lastScheduledStartRef.current === null
      || jumpedBackward
      || jumpedForward
      || Math.abs(preciseCurrentTime - currentTime) > 0.08;

    if (!shouldReschedule) {
      return;
    }

    scheduleMelodyFromTime(Math.max(preciseCurrentTime, currentTime), {
      interruptExisting: lastScheduledStartRef.current !== null && (timelineJumped || jumpedBackward || jumpedForward),
    });
  }, [currentTime, resolvePreciseTransportTime, scheduleMelodyFromTime, shouldActivate]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';
      isBackgroundRef.current = hidden;

      if (!hidden && shouldActivate) {
        scheduleMelodyFromTime(resolvePreciseTransportTime(), {
          interruptExisting: true,
        });
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
