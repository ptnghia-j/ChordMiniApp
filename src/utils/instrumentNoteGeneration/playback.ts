import type { ChordEvent } from '@/utils/chordToMidi';

import {
  DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
  DEFAULT_LATE_PIANO_ONSET_GRACE_SECONDS,
  TIMING_EPSILON,
} from './constants';
import type { PlaybackAdjustmentOptions, ScheduledNote } from './types';

export function adjustScheduledNotesForPlayback(
  scheduledNotes: ScheduledNote[],
  options: PlaybackAdjustmentOptions,
): ScheduledNote[] {
  const {
    instrumentName,
    elapsedInChord = 0,
    latePianoOnsetGraceSeconds = DEFAULT_LATE_PIANO_ONSET_GRACE_SECONDS,
    latePianoMinAudibleSeconds = DEFAULT_LATE_PIANO_MIN_AUDIBLE_SECONDS,
  } = options;

  return scheduledNotes
    .map((scheduledNote) => {
      const originalEndOffset = scheduledNote.startOffset + scheduledNote.duration;
      const shouldRecoverLatePianoOnset = instrumentName === 'piano'
        && scheduledNote.startOffset <= 0.0001
        && elapsedInChord > 0
        && elapsedInChord <= latePianoOnsetGraceSeconds;

      if (originalEndOffset <= elapsedInChord) {
        if (shouldRecoverLatePianoOnset) {
          return {
            ...scheduledNote,
            startOffset: 0,
            duration: Math.min(
              scheduledNote.duration,
              Math.max(
                latePianoMinAudibleSeconds,
                scheduledNote.duration * 0.75,
              ),
            ),
          } satisfies ScheduledNote;
        }
        return null;
      }

      const adjustedStartOffset = Math.max(0, scheduledNote.startOffset - elapsedInChord);
      const adjustedDuration = originalEndOffset - Math.max(elapsedInChord, scheduledNote.startOffset);
      const shouldClampLatePianoOnset = shouldRecoverLatePianoOnset
        && adjustedStartOffset <= 0.0001
        && adjustedDuration < latePianoMinAudibleSeconds;

      if (adjustedDuration <= 0) {
        if (shouldRecoverLatePianoOnset) {
          return {
            ...scheduledNote,
            startOffset: 0,
            duration: Math.min(
              scheduledNote.duration,
              Math.max(
                latePianoMinAudibleSeconds,
                scheduledNote.duration * 0.75,
              ),
            ),
          } satisfies ScheduledNote;
        }
        return null;
      }

      if (shouldClampLatePianoOnset) {
        return {
          ...scheduledNote,
          startOffset: 0,
          duration: Math.min(
            scheduledNote.duration,
            Math.max(
              latePianoMinAudibleSeconds,
              scheduledNote.duration * 0.75,
            ),
          ),
        } satisfies ScheduledNote;
      }

      return {
        ...scheduledNote,
        startOffset: adjustedStartOffset,
        duration: adjustedDuration,
      } satisfies ScheduledNote;
    })
    .filter((scheduledNote): scheduledNote is ScheduledNote => scheduledNote !== null);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Merge consecutive chord events with the same chord name into single events.
 * The audio playback service only triggers on chord changes, so the visualization
 * should mirror that behavior — one visual event per chord change, spanning the
 * full duration until the next change.
 */
export function mergeConsecutiveChordEvents(events: ChordEvent[]): ChordEvent[] {
  if (events.length === 0) return [];

  const merged: ChordEvent[] = [];
  let current: ChordEvent = {
    ...events[0],
    beatCount: events[0].beatCount ?? 1,
  };

  for (let i = 1; i < events.length; i++) {
    const isContiguous = Math.abs(events[i].startTime - current.endTime) <= TIMING_EPSILON;
    if (events[i].chordName === current.chordName && isContiguous) {
      // Same chord — extend endTime
      current.endTime = events[i].endTime;
      current.beatCount = (current.beatCount ?? 1) + (events[i].beatCount ?? 1);
    } else {
      // Chord changed — push previous and start new
      merged.push(current);
      current = {
        ...events[i],
        beatCount: events[i].beatCount ?? 1,
      };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Estimate average beat duration from raw chord events.
 */
export function estimateBeatDuration(events: ChordEvent[]): number {
  if (events.length < 2) return 0.5; // fallback
  const totalSpan = events[events.length - 1].endTime - events[0].startTime;
  return totalSpan / events.length;
}

/**
 * Get beat duration from BPM.
 */
export function beatDurationFromBpm(bpm: number): number {
  if (bpm <= 0 || !isFinite(bpm)) return 0.5;
  return 60 / bpm;
}
