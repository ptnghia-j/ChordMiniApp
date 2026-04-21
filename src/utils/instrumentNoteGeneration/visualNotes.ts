import { getInstrumentVisualSustainTailSeconds } from '@/services/chord-playback/instrumentEnvelopeConfig';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';

import { generateNotesForInstrument } from './dispatch';
import { adjustScheduledNotesForPlayback, beatDurationFromBpm, estimateBeatDuration, mergeConsecutiveChordEvents } from './playback';
import type {
  ActiveInstrument,
  InstrumentName,
  PositionedVisualNote,
  ScheduledNote,
  SignalDynamicsSource,
  VisualNote,
} from './types';

/**
 * Generate visual notes for all instruments across all chord events.
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
  const notes: VisualNote[] = [];

  // Merge consecutive beats with same chord — audio only triggers on chord changes
  const merged = mergeConsecutiveChordEvents(events);
  const totalDuration = merged.length > 0 ? merged[merged.length - 1].endTime : undefined;
  // Use BPM-based beat duration when available (matches audio path exactly).
  // Fall back to estimated beat duration from raw events when beat counts are unavailable.
  const bd = bpm ? beatDurationFromBpm(bpm) : estimateBeatDuration(events);

  for (let eventIndex = 0; eventIndex < merged.length; eventIndex += 1) {
    const event = merged[eventIndex];
    const { chordName, notes: chordNotes, startTime, endTime } = event;
    const duration = endTime - startTime;
    const eventBeatCount = Math.max(1, event.beatCount ?? 1);
    const eventBeatDuration = duration > 0 ? duration / eventBeatCount : bd;
    const signalDynamics = signalDynamicsSource?.getSignalDynamics(startTime, duration) ?? null;
    const nextChordName = merged[eventIndex + 1]?.chordName;

    for (const inst of instruments) {
      const instrumentName = inst.name.toLowerCase() as InstrumentName;
      const color = inst.color;

      const scheduled = generateNotesForInstrument(instrumentName, {
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
      const visualScheduled = playbackTime !== undefined
        ? scheduled
          .map((sn) => {
            const elapsedInChord = Math.max(0, playbackTime - startTime);
            const originalEndOffset = sn.startOffset + sn.duration;

            if (originalEndOffset > elapsedInChord) {
              return sn;
            }

            const recovered = adjustScheduledNotesForPlayback([sn], {
              instrumentName,
              elapsedInChord,
            })[0];

            if (!recovered) {
              return null;
            }

            return {
              ...recovered,
              startOffset: Math.max(0, playbackTime - startTime),
            } satisfies ScheduledNote;
          })
          .filter((sn): sn is ScheduledNote => sn !== null)
        : scheduled;

      for (const sn of visualScheduled) {
        const visualTail = getInstrumentVisualSustainTailSeconds(instrumentName);
        const noteStartTime = startTime + sn.startOffset;
        const symbolicEndTime = noteStartTime + sn.duration;
        const clippedVisualEndTime = Math.min(endTime, symbolicEndTime + visualTail);
        notes.push({
          midi: sn.midi,
          startTime: noteStartTime,
          // Keep the audible tail within the active chord window so the piano roll
          // stays notation-like instead of showing cross-chord overlap.
          endTime: clippedVisualEndTime,
          color,
          chordName,
        });
      }
    }
  }

  return notes;
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
