import { getInstrumentVisualSustainTailSeconds } from '@/services/chord-playback/instrumentEnvelopeConfig';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';

import { generateNotesForInstrument } from './dispatch';
import { adjustScheduledNoteForPlayback, beatDurationFromBpm, estimateBeatDuration, mergeConsecutiveChordEvents } from './playback';
import type {
  ActiveInstrument,
  InstrumentVisualEventPlan,
  InstrumentVisualNoteGroupPlan,
  InstrumentName,
  PositionedVisualNote,
  ScheduledNote,
  SignalDynamicsSource,
  VisualNote,
} from './types';

function pushVisualNote(
  notes: VisualNote[],
  note: ScheduledNote,
  noteGroup: InstrumentVisualNoteGroupPlan,
  eventPlan: InstrumentVisualEventPlan,
): void {
  const noteStartTime = eventPlan.startTime + note.startOffset;
  const symbolicEndTime = noteStartTime + note.duration;
  const clippedVisualEndTime = Math.min(eventPlan.endTime, symbolicEndTime + noteGroup.visualTail);
  notes.push({
    midi: note.midi,
    startTime: noteStartTime,
    // Keep the audible tail within the active chord window so the piano roll
    // stays notation-like instead of showing cross-chord overlap.
    endTime: clippedVisualEndTime,
    color: noteGroup.color,
    chordName: eventPlan.chordName,
  });
}

function findVisualEventPlanIndexAtTime(
  eventPlans: InstrumentVisualEventPlan[],
  time: number,
): number {
  let lo = 0;
  let hi = eventPlans.length - 1;
  let idx = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (eventPlans[mid].startTime <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (idx < 0) {
    return -1;
  }

  return time < eventPlans[idx].endTime ? idx : -1;
}

/**
 * Generate static instrument visual note plans once per event/instrument set.
 */
export function generateAllInstrumentVisualNotePlans(
  events: ChordEvent[],
  instruments: ActiveInstrument[],
  bpm?: number,
  timeSignature?: number,
  segmentationData?: SegmentationResult | null,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string,
  signalDynamicsSource?: SignalDynamicsSource | null,
): InstrumentVisualEventPlan[] {
  const eventPlans: InstrumentVisualEventPlan[] = [];
  // Merge consecutive beats with same chord — audio only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);
  const totalDuration = merged.length > 0 ? merged[merged.length - 1].endTime : undefined;
  // Use BPM-based beat duration when available (matches audio path exactly).
  // Fall back to estimated beat duration from raw events when beat counts are unavailable.
  const bd = bpm ? beatDurationFromBpm(bpm) : estimateBeatDuration(events);
  const visualTailByInstrument = new Map<InstrumentName, number>();

  for (let eventIndex = 0; eventIndex < merged.length; eventIndex += 1) {
    const event = merged[eventIndex];
    const { chordName, notes: chordNotes, startTime, endTime } = event;
    const duration = endTime - startTime;
    const eventBeatCount = Math.max(1, event.beatCount ?? 1);
    const eventBeatDuration = duration > 0 ? duration / eventBeatCount : bd;
    const signalDynamics = signalDynamicsSource?.getSignalDynamics(startTime, duration) ?? null;
    const nextChordName = merged[eventIndex + 1]?.chordName;
    const noteGroups: InstrumentVisualNoteGroupPlan[] = [];

    for (const inst of instruments) {
      const instrumentName = inst.name.toLowerCase() as InstrumentName;
      const scheduledNotes = generateNotesForInstrument(instrumentName, {
        chordName,
        chordNotes,
        duration,
        beatDuration: eventBeatDuration,
        startTime,
        totalDuration,
        timeSignature,
        segmentationData,
        signalDynamics,
        guitarVoicing,
        targetKey,
        nextChordName,
      });

      if (scheduledNotes.length === 0) {
        continue;
      }

      let visualTail = visualTailByInstrument.get(instrumentName);
      if (visualTail === undefined) {
        visualTail = getInstrumentVisualSustainTailSeconds(instrumentName);
        visualTailByInstrument.set(instrumentName, visualTail);
      }

      noteGroups.push({
        instrumentName,
        color: inst.color,
        visualTail,
        scheduledNotes,
      });
    }

    if (noteGroups.length > 0) {
      eventPlans.push({
        chordName,
        startTime,
        endTime,
        noteGroups,
      });
    }
  }

  return eventPlans;
}

/**
 * Materialize visual notes from precomputed plans. Only the currently active
 * chord window needs late-entry recovery; all other windows can reuse their
 * static note schedules unchanged.
 */
export function materializeInstrumentVisualNotes(
  eventPlans: InstrumentVisualEventPlan[],
  playbackTime?: number,
): VisualNote[] {
  const notes: VisualNote[] = [];
  const activeEventPlanIndex = playbackTime === undefined
    ? -1
    : findVisualEventPlanIndexAtTime(eventPlans, playbackTime);

  for (let eventIndex = 0; eventIndex < eventPlans.length; eventIndex += 1) {
    const eventPlan = eventPlans[eventIndex];
    const isActiveEvent = eventIndex === activeEventPlanIndex && playbackTime !== undefined;
    const elapsedInChord = isActiveEvent
      ? Math.max(0, playbackTime - eventPlan.startTime)
      : 0;

    for (const noteGroup of eventPlan.noteGroups) {
      if (!isActiveEvent) {
        for (const scheduledNote of noteGroup.scheduledNotes) {
          pushVisualNote(notes, scheduledNote, noteGroup, eventPlan);
        }
        continue;
      }

      for (const scheduledNote of noteGroup.scheduledNotes) {
        const originalEndOffset = scheduledNote.startOffset + scheduledNote.duration;
        if (originalEndOffset > elapsedInChord) {
          pushVisualNote(notes, scheduledNote, noteGroup, eventPlan);
          continue;
        }

        // Reuse the audio-path recovery rules so visuals keep the same late-entry
        // piano grace/min-audible behavior without widening the 180 ms onset
        // window to the broader 220 ms catch-up scheduler tolerance.
        const recoveredNote = adjustScheduledNoteForPlayback(scheduledNote, {
          instrumentName: noteGroup.instrumentName,
          elapsedInChord,
        });

        if (!recoveredNote) {
          continue;
        }

        pushVisualNote(
          notes,
          {
            ...recoveredNote,
            startOffset: elapsedInChord,
          },
          noteGroup,
          eventPlan,
        );
      }
    }
  }

  return notes;
}

/**
 * Backwards-compatible convenience wrapper.
 */
export function generateAllInstrumentVisualNotes(
  events: ChordEvent[],
  instruments: ActiveInstrument[],
  bpm?: number,
  timeSignature?: number,
  segmentationData?: SegmentationResult | null,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string,
  signalDynamicsSource?: SignalDynamicsSource | null,
  playbackTime?: number,
): VisualNote[] {
  return materializeInstrumentVisualNotes(
    generateAllInstrumentVisualNotePlans(
      events,
      instruments,
      bpm,
      timeSignature,
      segmentationData,
      guitarVoicing,
      targetKey,
      signalDynamicsSource,
    ),
    playbackTime,
  );
}

export function attachVisualNotePositions(
  notes: VisualNote[],
  posLookup: Map<number, { x: number; width: number }>,
): PositionedVisualNote[] {
  return notes.map((note) => ({
    ...note,
    pos: posLookup.get(note.midi) ?? null,
  }));
}
