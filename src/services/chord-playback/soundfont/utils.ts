import {
  SAMPLE_DURATION,
  SUSTAIN_RETRIGGER_OVERLAP_SECONDS,
  SUSTAIN_RETRIGGER_SEGMENT_SECONDS,
  SUSTAIN_RETRIGGER_VELOCITY_SCALE,
} from './constants';
import { beatDurationFromBpm, type ScheduledNote } from '@/utils/instrumentNoteGeneration';
import type { PlaybackTimingContext } from './types';
import type { InstrumentEnvelopeConfig } from '../instrumentEnvelopeConfig';

export function resolvePatternBeatDuration(
  duration: number,
  bpm: number,
  timingContext?: PlaybackTimingContext,
): number {
  const beatCount = timingContext?.beatCount;
  if (typeof beatCount === 'number' && isFinite(beatCount) && beatCount > 0 && duration > 0) {
    return duration / beatCount;
  }
  return beatDurationFromBpm(bpm);
}

export function getSwitchAttackMultiplier(
  startOffset: number,
  isChordSwitch: boolean,
  envelope: InstrumentEnvelopeConfig,
): number {
  if (!isChordSwitch) {
    return 1;
  }

  if (startOffset <= 0) {
    return envelope.switchAttackFloor;
  }

  if (startOffset >= envelope.switchAttackRampWindow) {
    return 1;
  }

  const rampProgress = startOffset / envelope.switchAttackRampWindow;
  return envelope.switchAttackFloor + ((1 - envelope.switchAttackFloor) * rampProgress);
}

export function buildSustainRetriggerPlan(note: ScheduledNote): ScheduledNote[] {
  if (note.duration <= SAMPLE_DURATION) {
    return [note];
  }

  const stride = Math.max(0.5, SUSTAIN_RETRIGGER_SEGMENT_SECONDS - SUSTAIN_RETRIGGER_OVERLAP_SECONDS);
  const segments: ScheduledNote[] = [];

  for (
    let segmentStart = note.startOffset;
    segmentStart < note.startOffset + note.duration - 0.001;
    segmentStart += stride
  ) {
    const elapsedWithinNote = segmentStart - note.startOffset;
    const remainingWithinNote = note.duration - elapsedWithinNote;
    if (remainingWithinNote <= 0) {
      break;
    }

    const requestedDuration = Math.min(
      SUSTAIN_RETRIGGER_SEGMENT_SECONDS + SUSTAIN_RETRIGGER_OVERLAP_SECONDS,
      remainingWithinNote,
    );
    const isFirstSegment = elapsedWithinNote <= 0.0001;
    segments.push({
      ...note,
      startOffset: segmentStart,
      duration: requestedDuration,
      velocityMultiplier: note.velocityMultiplier * (isFirstSegment ? 1 : SUSTAIN_RETRIGGER_VELOCITY_SCALE),
    });
  }

  return segments.length > 0 ? segments : [note];
}
