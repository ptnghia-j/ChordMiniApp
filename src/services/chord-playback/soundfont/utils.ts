import {
  DENSITY_REFERENCE_VOICES,
  GUITAR_STRUM_CLUSTER_LEVEL_GAMMA,
  GUITAR_STRUM_CLUSTER_SECONDS,
  MIN_DENSITY_COMPENSATION,
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

/**
 * Group staggered guitar onsets (strum rake / pick bursts) so level compensation uses
 * the full voicing size instead of treating each string as a lone voice.
 */
export function buildGuitarStrumClusterSizes(
  notes: ScheduledNote[],
  clusterWindowSeconds: number = GUITAR_STRUM_CLUSTER_SECONDS,
): number[] {
  if (notes.length === 0) {
    return [];
  }

  const n = notes.length;
  const order = notes.map((_, i) => i).sort((a, b) => notes[a].startOffset - notes[b].startOffset);
  const sizes = new Array<number>(n).fill(1);

  let start = 0;
  while (start < order.length) {
    const t0 = notes[order[start]].startOffset;
    let end = start + 1;
    while (
      end < order.length
      && notes[order[end]].startOffset - t0 <= clusterWindowSeconds
    ) {
      end += 1;
    }
    const size = end - start;
    for (let k = start; k < end; k += 1) {
      sizes[order[k]] = size;
    }
    start = end;
  }

  return sizes;
}

/** Softer than γ=1 (old stacking), but much fuller than linear 1/n leveling. */
export function resolveGuitarClusterDensityCompensation(clusterVoices: number): number {
  const n = Math.max(1, clusterVoices);
  const base = Math.sqrt(DENSITY_REFERENCE_VOICES);
  const comp = base * (n ** (GUITAR_STRUM_CLUSTER_LEVEL_GAMMA - 1));
  return Math.max(MIN_DENSITY_COMPENSATION, comp);
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
