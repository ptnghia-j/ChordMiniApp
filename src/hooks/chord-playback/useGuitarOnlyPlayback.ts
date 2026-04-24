import { useEffect, useMemo, useRef } from 'react';
import { DEFAULT_GUITAR_VOLUME } from '@/config/audioDefaults';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { mergeConsecutiveChordEvents } from '@/utils/instrumentNoteGeneration';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import { findChordEventIndexForPlayback } from '@/utils/chordEventLookup';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { SegmentationResult } from '@/types/chatbotTypes';

const PLAYBACK_EVENT_BOUNDARY_TOLERANCE = 0.08;
const PLAYBACK_EVENT_MISS_GRACE_PERIOD = 0.12;

function hasPlayableNotes(event: ChordEvent): boolean {
  return event.notes.length > 0;
}

function findPlayableChordEventIndex(
  events: ChordEvent[],
  currentTime: number,
  currentBeatIndex: number,
  cursorIndex: number,
): number {
  const cursorEvent = cursorIndex >= 0 ? events[cursorIndex] : null;
  if (cursorEvent) {
    const isWithinCursorWindow = currentTime >= cursorEvent.startTime - PLAYBACK_EVENT_BOUNDARY_TOLERANCE
      && currentTime < cursorEvent.endTime + PLAYBACK_EVENT_BOUNDARY_TOLERANCE;
    if (isWithinCursorWindow) {
      return cursorIndex;
    }

    const nextCursorEvent = events[cursorIndex + 1];
    if (nextCursorEvent) {
      const nextStartsSoon = nextCursorEvent.startTime >= currentTime
        && nextCursorEvent.startTime - currentTime <= PLAYBACK_EVENT_BOUNDARY_TOLERANCE;
      const nextAlreadyStarted = currentTime >= nextCursorEvent.startTime
        && currentTime < nextCursorEvent.endTime + PLAYBACK_EVENT_BOUNDARY_TOLERANCE;
      const beatAdvancesToNext = currentBeatIndex >= nextCursorEvent.beatIndex
        && nextCursorEvent.startTime - currentTime <= PLAYBACK_EVENT_BOUNDARY_TOLERANCE;

      if (nextStartsSoon || nextAlreadyStarted || beatAdvancesToNext) {
        return cursorIndex + 1;
      }
    }
  }

  return findChordEventIndexForPlayback(
    events,
    currentTime,
    currentBeatIndex,
    PLAYBACK_EVENT_BOUNDARY_TOLERANCE,
  );
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
  const lastPlayedEventIndexRef = useRef(-1);
  const lookupCursorIndexRef = useRef(-1);
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
      lastPlayedEventIndexRef.current = -1;
      lookupCursorIndexRef.current = -1;
    }
  }, [shouldActivate, isChordPlaybackEnabled]);

  useEffect(() => {
    if (!shouldActivate || merged.length === 0) return;

    const currentEventIndex = findPlayableChordEventIndex(
      merged,
      currentTime,
      currentBeatIndex,
      lookupCursorIndexRef.current,
    );
    lookupCursorIndexRef.current = currentEventIndex;
    const currentChordEvent = currentEventIndex >= 0
      ? merged[currentEventIndex]
      : null;
    const nextChordName = currentEventIndex >= 0
      ? merged[currentEventIndex + 1]?.chordName
      : undefined;

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
        lastPlayedEventIndexRef.current = -1;
        lookupCursorIndexRef.current = -1;
        eventMissStartedAtRef.current = null;
      }
      return;
    }

    eventMissStartedAtRef.current = null;

    if (currentEventIndex === lastPlayedEventIndexRef.current
      && currentChordEvent.chordName === lastPlayedChordRef.current) return;

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
        nextChordName,
      },
      timeSignature,
      guitarVoicing,
      targetKey as string | undefined,
    );
    lastPlayedChordRef.current = currentChordEvent.chordName;
    lastPlayedEventIndexRef.current = currentEventIndex;
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
        lastPlayedEventIndexRef.current = -1;
        lookupCursorIndexRef.current = -1;
      }
    };
  }, []);

  useEffect(() => {
    if (!isPlaying && guitarOnlyActiveRef.current) {
      serviceRef.current.stopInstruments(['guitar']);
      lastPlayedChordRef.current = null;
      lastPlayedEventIndexRef.current = -1;
      lookupCursorIndexRef.current = -1;
      eventMissStartedAtRef.current = null;
    }
  }, [isPlaying]);
}
