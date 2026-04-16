import { useEffect, useMemo, useRef } from 'react';
import { DEFAULT_GUITAR_VOLUME } from '@/config/audioDefaults';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { mergeConsecutiveChordEvents } from '@/utils/instrumentNoteGeneration';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import { findChordEventForPlayback as findPlayableChordEvent } from '@/utils/chordEventLookup';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { SegmentationResult } from '@/types/chatbotTypes';

const PLAYBACK_EVENT_BOUNDARY_TOLERANCE = 0.08;
const PLAYBACK_EVENT_MISS_GRACE_PERIOD = 0.12;

function hasPlayableNotes(event: ChordEvent): boolean {
  return event.notes.length > 0;
}

export function useGuitarOnlyPlayback(
  chordEvents: ChordEvent[],
  currentTime: number,
  currentBeatIndex: number,
  isPlaying: boolean,
  isChordPlaybackEnabled: boolean,
  bpm: number,
  timeSignature: number = 4,
  dynamicsAnalyzer: DynamicsAnalyzer,
  segmentationData?: SegmentationResult | null,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string | null,
) {
  const lastPlayedChordRef = useRef<string | null>(null);
  const serviceRef = useRef(getSoundfontChordPlaybackService());
  const guitarOnlyActiveRef = useRef(false);
  const eventMissStartedAtRef = useRef<number | null>(null);

  const shouldActivate = !isChordPlaybackEnabled && isPlaying;

  const merged = useMemo(
    () => mergeConsecutiveChordEvents(chordEvents.filter(hasPlayableNotes)),
    [chordEvents],
  );
  const totalDuration = useMemo(
    () => (merged.length > 0 ? merged[merged.length - 1].endTime : undefined),
    [merged],
  );

  useEffect(() => {
    const service = serviceRef.current;

    if (shouldActivate) {
      service.updateOptions({
        enabled: true,
        pianoVolume: 0,
        guitarVolume: DEFAULT_GUITAR_VOLUME,
        violinVolume: 0,
        fluteVolume: 0,
        saxophoneVolume: 0,
        bassVolume: 0,
      });
      guitarOnlyActiveRef.current = true;
    } else if (guitarOnlyActiveRef.current) {
      service.stopInstruments(['guitar']);
      if (!isChordPlaybackEnabled) {
        service.updateOptions({ enabled: false });
      }
      guitarOnlyActiveRef.current = false;
      lastPlayedChordRef.current = null;
    }
  }, [shouldActivate, isChordPlaybackEnabled]);

  useEffect(() => {
    if (!shouldActivate || merged.length === 0) return;

    const currentChordEvent = findPlayableChordEvent(
      merged,
      currentTime,
      currentBeatIndex,
      PLAYBACK_EVENT_BOUNDARY_TOLERANCE,
    );

    if (!currentChordEvent) {
      if (lastPlayedChordRef.current !== null) {
        if (eventMissStartedAtRef.current === null) {
          eventMissStartedAtRef.current = currentTime;
          return;
        }

        if (currentTime - eventMissStartedAtRef.current < PLAYBACK_EVENT_MISS_GRACE_PERIOD) {
          return;
        }

        serviceRef.current.stopInstruments(['guitar']);
        lastPlayedChordRef.current = null;
        eventMissStartedAtRef.current = null;
      }
      return;
    }

    eventMissStartedAtRef.current = null;

    if (currentChordEvent.chordName === lastPlayedChordRef.current) return;

    const duration = currentChordEvent.endTime - currentChordEvent.startTime;
    const signalDynamics = dynamicsAnalyzer.getSignalDynamics(currentChordEvent.startTime, duration);
    const dynamicVelocity = dynamicsAnalyzer.getVelocityMultiplier(
      currentChordEvent.startTime,
      currentChordEvent.beatIndex,
      currentChordEvent.chordName,
      duration,
      signalDynamics,
    );

    serviceRef.current.playChord(
      currentChordEvent.chordName,
      duration,
      bpm,
      dynamicVelocity,
      {
        startTime: currentChordEvent.startTime,
        playbackTime: currentTime,
        totalDuration,
        beatCount: currentChordEvent.beatCount,
        segmentationData,
        signalDynamics,
      },
      timeSignature,
      guitarVoicing,
      targetKey as string | undefined,
    );
    lastPlayedChordRef.current = currentChordEvent.chordName;
  }, [
    bpm,
    currentBeatIndex,
    currentTime,
    dynamicsAnalyzer,
    guitarVoicing,
    merged,
    segmentationData,
    shouldActivate,
    targetKey,
    timeSignature,
    totalDuration,
  ]);

  useEffect(() => {
    const service = serviceRef.current;
    return () => {
      if (guitarOnlyActiveRef.current) {
        service.stopInstruments(['guitar']);
        service.updateOptions({ enabled: false });
        guitarOnlyActiveRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (!isPlaying && guitarOnlyActiveRef.current) {
      serviceRef.current.stopInstruments(['guitar']);
      lastPlayedChordRef.current = null;
      eventMissStartedAtRef.current = null;
    }
  }, [isPlaying]);
}
