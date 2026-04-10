import type { SheetSageNoteEvent } from '@/types/sheetSage';
import { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import type { ChordEvent } from '@/utils/chordToMidi';
import {
  beatDurationFromBpm,
  generateNotesForInstrument,
  mergeConsecutiveChordEvents,
} from '@/utils/instrumentNoteGeneration';
import {
  DEFAULT_BPM,
  GENERIC_MIN_NOTE_SECONDS,
  GENERIC_NOTATION_ONSET_GROUPING_SECONDS,
} from './constants';
import type {
  AbsoluteNoteEvent,
  BuildPianoNotationNoteEventsOptions,
} from './types';

const MELODY_SHORT_RETRIGGER_SECONDS = 0.14;
const MELODY_RETRIGGER_MERGE_GAP_SECONDS = 0.05;
const MELODY_RETRIGGER_MERGE_OVERLAP_SECONDS = 0.01;

function secondsToBeatPosition(seconds: number, beatTimes?: Array<number | null>): number | null {
  if (!beatTimes || beatTimes.length === 0) {
    return null;
  }

  const knownBeats = beatTimes
    .map((time, index) => (
      Number.isFinite(time)
        ? { index, time: Number(time) }
        : null
    ))
    .filter((beat): beat is { index: number; time: number } => beat !== null);

  if (knownBeats.length === 0) {
    return null;
  }

  if (knownBeats.length === 1) {
    return knownBeats[0].index;
  }

  const getInterval = (
    left: { index: number; time: number },
    right: { index: number; time: number },
  ): { time: number; beats: number } => ({
    time: Math.max(0.001, right.time - left.time),
    beats: Math.max(1, right.index - left.index),
  });

  if (seconds <= knownBeats[0].time) {
    const interval = getInterval(knownBeats[0], knownBeats[1]);
    return knownBeats[0].index + (((seconds - knownBeats[0].time) / interval.time) * interval.beats);
  }

  for (let index = 0; index < knownBeats.length - 1; index += 1) {
    const current = knownBeats[index];
    const next = knownBeats[index + 1];

    if (seconds <= next.time) {
      const interval = getInterval(current, next);
      return current.index + (((seconds - current.time) / interval.time) * interval.beats);
    }
  }

  const previous = knownBeats[knownBeats.length - 2];
  const last = knownBeats[knownBeats.length - 1];
  const interval = getInterval(previous, last);
  return last.index + (((seconds - last.time) / interval.time) * interval.beats);
}

export function beatPositionToSeconds(
  beatPosition: number,
  beatTimes?: Array<number | null>,
): number | null {
  if (!Number.isFinite(beatPosition) || !beatTimes || beatTimes.length === 0) {
    return null;
  }

  const knownBeats = beatTimes
    .map((time, index) => (
      Number.isFinite(time)
        ? { index, time: Number(time) }
        : null
    ))
    .filter((beat): beat is { index: number; time: number } => beat !== null);

  if (knownBeats.length === 0) {
    return null;
  }

  if (knownBeats.length === 1) {
    return knownBeats[0].time;
  }

  const getInterval = (
    left: { index: number; time: number },
    right: { index: number; time: number },
  ): { time: number; beats: number } => ({
    time: Math.max(0.001, right.time - left.time),
    beats: Math.max(1, right.index - left.index),
  });

  if (beatPosition <= knownBeats[0].index) {
    const interval = getInterval(knownBeats[0], knownBeats[1]);
    return knownBeats[0].time + (((beatPosition - knownBeats[0].index) / interval.beats) * interval.time);
  }

  for (let index = 0; index < knownBeats.length - 1; index += 1) {
    const current = knownBeats[index];
    const next = knownBeats[index + 1];

    if (beatPosition <= next.index) {
      const interval = getInterval(current, next);
      return current.time + (((beatPosition - current.index) / interval.beats) * interval.time);
    }
  }

  const previous = knownBeats[knownBeats.length - 2];
  const last = knownBeats[knownBeats.length - 1];
  const interval = getInterval(previous, last);
  return last.time + (((beatPosition - last.index) / interval.beats) * interval.time);
}

export function buildMelodyAbsoluteNoteEvents(
  noteEvents: SheetSageNoteEvent[],
  beatTimes?: Array<number | null>,
): AbsoluteNoteEvent[] {
  const sanitized = noteEvents
    .map((note) => ({
      onset: Math.max(0, note.onset),
      offset: Math.max(note.onset, note.offset),
      pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
      velocity: Math.max(1, Math.min(127, Math.round(note.velocity))),
    }))
    .sort((left, right) => (
      left.onset - right.onset
      || left.offset - right.offset
      || left.pitch - right.pitch
    ));

  const normalized: Array<{
    onset: number;
    offset: number;
    pitch: number;
    velocity: number;
  }> = [];

  sanitized.forEach((note) => {
    const previous = normalized[normalized.length - 1];
    if (previous) {
      const gap = note.onset - previous.offset;
      const previousDuration = previous.offset - previous.onset;
      const currentDuration = note.offset - note.onset;
      const shouldMergeShortRetrigger = (
        note.pitch === previous.pitch
        && gap >= -MELODY_RETRIGGER_MERGE_OVERLAP_SECONDS
        && gap <= MELODY_RETRIGGER_MERGE_GAP_SECONDS
        && (
          previousDuration <= MELODY_SHORT_RETRIGGER_SECONDS
          || currentDuration <= MELODY_SHORT_RETRIGGER_SECONDS
        )
      );

      if (shouldMergeShortRetrigger) {
        previous.offset = Math.max(previous.offset, note.offset);
        previous.velocity = Math.max(previous.velocity, note.velocity);
        return;
      }

      if (note.onset < previous.offset) {
        previous.offset = Math.max(previous.onset, note.onset);
        if (previous.offset - previous.onset < GENERIC_MIN_NOTE_SECONDS) {
          normalized.pop();
        }
      }
    }

    normalized.push({ ...note });
  });

  return normalized
    .filter((note) => note.offset - note.onset >= GENERIC_MIN_NOTE_SECONDS)
    .map((note) => {
      const beatOnset = secondsToBeatPosition(note.onset, beatTimes) ?? undefined;
      const beatOffset = secondsToBeatPosition(note.offset, beatTimes) ?? undefined;

      return {
        pitch: note.pitch,
        onset: note.onset,
        offset: note.offset,
        velocity: note.velocity,
        chordStartTime: note.onset,
        chordEndTime: note.offset,
        beatIndex: Math.max(0, Math.floor(beatOnset ?? 0)),
        beatOnset,
        beatOffset,
        chordStartBeat: beatOnset,
        chordEndBeat: beatOffset,
        source: 'melody' as const,
        staffHint: 1 as const,
      };
    });
}

function trimPitchOverlaps<T extends AbsoluteNoteEvent>(events: T[]): T[] {
  const byPitch = new Map<number, T[]>();

  for (const event of events) {
    const bucket = byPitch.get(event.pitch) ?? [];
    bucket.push({ ...event });
    byPitch.set(event.pitch, bucket);
  }

  const trimmed: T[] = [];

  byPitch.forEach((bucket) => {
    const ordered = bucket.sort((left, right) => (
      left.onset - right.onset
      || left.offset - right.offset
    ));

    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];

      if (next && current.offset > next.onset) {
        current.offset = Math.max(current.onset, next.onset);
      }

      if (current.offset - current.onset >= GENERIC_MIN_NOTE_SECONDS) {
        trimmed.push(current);
      }
    }
  });

  return trimmed.sort((left, right) => (
    left.onset - right.onset
    || left.offset - right.offset
    || left.pitch - right.pitch
  ));
}

function trimHandOverlapsForPianoNotation<T extends AbsoluteNoteEvent>(events: T[]): T[] {
  const byHand = new Map<string, T[]>();

  for (const event of events) {
    const handKey = event.handHint === 'left' || event.staffHint === 2 ? 'left' : 'right';
    const bucket = byHand.get(handKey) ?? [];
    bucket.push({ ...event });
    byHand.set(handKey, bucket);
  }

  const trimmed: T[] = [];

  byHand.forEach((bucket) => {
    const ordered = bucket.sort((left, right) => (
      left.onset - right.onset
      || left.offset - right.offset
      || left.pitch - right.pitch
    ));

    for (let index = 0; index < ordered.length;) {
      const groupOnset = ordered[index].onset;
      let nextIndex = index + 1;

      while (
        nextIndex < ordered.length
        && Math.abs(ordered[nextIndex].onset - groupOnset) <= GENERIC_NOTATION_ONSET_GROUPING_SECONDS
      ) {
        nextIndex += 1;
      }

      const nextOnset = ordered[nextIndex]?.onset ?? Number.POSITIVE_INFINITY;

      for (let groupIndex = index; groupIndex < nextIndex; groupIndex += 1) {
        const current = ordered[groupIndex];

        if (Number.isFinite(nextOnset) && current.offset > nextOnset) {
          current.offset = Math.max(current.onset, nextOnset);
        }

        if (current.offset - current.onset >= GENERIC_MIN_NOTE_SECONDS) {
          trimmed.push(current);
        }
      }

      index = nextIndex;
    }
  });

  return trimmed.sort((left, right) => (
    left.onset - right.onset
    || left.offset - right.offset
    || left.pitch - right.pitch
  ));
}

export function buildPianoNotationNoteEvents(
  events: ChordEvent[],
  options?: BuildPianoNotationNoteEventsOptions,
): AbsoluteNoteEvent[] {
  const bpm = options?.bpm ?? DEFAULT_BPM;
  const timeSignature = options?.timeSignature ?? 4;
  const playableEvents = mergeConsecutiveChordEvents(events.filter((event) => event.notes.length > 0));

  if (playableEvents.length === 0) {
    return [];
  }

  const totalDuration = playableEvents[playableEvents.length - 1]?.endTime;
  const dynamics = new DynamicsAnalyzer();
  dynamics.setParams({
    bpm,
    timeSignature,
    totalDuration,
    segmentationData: options?.segmentationData ?? null,
  });
  dynamics.setSignalAnalysis(options?.signalAnalysis ?? null);

  const absoluteNotes: AbsoluteNoteEvent[] = [];
  const baseVelocity = 80;
  const fallbackBeatDuration = beatDurationFromBpm(bpm);

  for (const event of playableEvents) {
    const duration = Math.max(0, event.endTime - event.startTime);
    if (duration <= 0) {
      continue;
    }

    const eventBeatCount = Math.max(1, event.beatCount ?? 1);
    const eventBeatDuration = duration > 0 ? duration / eventBeatCount : fallbackBeatDuration;
    const signalDynamics = dynamics.getSignalDynamics(event.startTime, duration);
    const dynamicMultiplier = dynamics.getVelocityMultiplier(
      event.startTime,
      event.beatIndex ?? Math.round(event.startTime / fallbackBeatDuration),
      event.chordName,
      duration,
      signalDynamics,
    );
    const scheduledNotes = generateNotesForInstrument('piano', {
      chordName: event.chordName,
      chordNotes: event.notes,
      duration,
      beatDuration: eventBeatDuration,
      startTime: event.startTime,
      timeSignature,
      segmentationData: options?.segmentationData ?? null,
      signalDynamics,
    });

    for (const scheduledNote of scheduledNotes) {
      const onset = event.startTime + scheduledNote.startOffset;
      const offset = onset + scheduledNote.duration;
      const beatOnset = event.beatIndex + (scheduledNote.startOffset / eventBeatDuration);
      const beatOffset = beatOnset + (scheduledNote.duration / eventBeatDuration);
      const velocity = Math.max(
        1,
        Math.min(127, Math.round(baseVelocity * dynamicMultiplier * scheduledNote.velocityMultiplier)),
      );

      absoluteNotes.push({
        pitch: scheduledNote.midi,
        onset,
        offset,
        velocity,
        chordName: event.chordName,
        chordStartTime: event.startTime,
        chordEndTime: event.endTime,
        beatIndex: event.beatIndex ?? 0,
        beatOnset,
        beatOffset,
        chordStartBeat: event.beatIndex ?? 0,
        chordEndBeat: (event.beatIndex ?? 0) + eventBeatCount,
        source: 'piano',
        handHint: scheduledNote.isBass ? 'left' : undefined,
        staffHint: scheduledNote.isBass ? 2 : undefined,
      });
    }
  }

  return trimPitchOverlaps(trimHandOverlapsForPianoNotation(absoluteNotes));
}
