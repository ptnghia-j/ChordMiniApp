import type { LyricsData } from '@/types/musicAiTypes';
import type { BeatInfo } from '@/services/audio/beatDetectionService';

/**
 * Snap lyric line boundaries to nearest beat timestamps, enforcing non-overlap.
 * Returns a new LyricsData object (does not mutate input).
 */
export function snapLyricLinesToBeats(
  lyrics: LyricsData,
  beatTimes: number[],
  guardGapSec: number = 0.05
): LyricsData {
  if (!lyrics?.lines?.length) return lyrics;
  if (!beatTimes || beatTimes.length === 0) return lyrics;

  const nearestBeat = (t: number): number => {
    if (typeof t !== 'number') return t;
    let best = beatTimes[0];
    let bestDiff = Math.abs(best - t);
    for (let i = 1; i < beatTimes.length; i++) {
      const diff = Math.abs(beatTimes[i] - t);
      if (diff < bestDiff) { best = beatTimes[i]; bestDiff = diff; }
    }
    return best;
  };

  const snapped = lyrics.lines.map((line) => {
    const start = nearestBeat(line.startTime);
    let end = nearestBeat(line.endTime);
    if (end <= start) {
      const nextIdx = beatTimes.findIndex((bt) => bt > start + guardGapSec);
      end = nextIdx !== -1 ? beatTimes[nextIdx] : start + 0.25;
    }
    return { ...line, startTime: start, endTime: end };
  });

  for (let i = 1; i < snapped.length; i++) {
    const prev = snapped[i - 1];
    const curr = snapped[i];
    if (curr.startTime < prev.endTime + guardGapSec) {
      const nextIdx = beatTimes.findIndex((bt) => bt >= prev.endTime + guardGapSec);
      curr.startTime = nextIdx !== -1 ? beatTimes[nextIdx] : prev.endTime + guardGapSec;
      if (curr.endTime <= curr.startTime) {
        const afterIdx = beatTimes.findIndex((bt) => bt > curr.startTime + guardGapSec);
        curr.endTime = afterIdx !== -1 ? beatTimes[afterIdx] : curr.startTime + 0.25;
      }
    }
  }

  return { ...lyrics, lines: snapped };
}

/**
 * Compute downbeat times from beats and optional downbeat indices.
 * If beat.beatNum === 1 is available, prefer that; otherwise map indices.
 */
export function computeDownbeatTimes(
  beats: BeatInfo[] | Array<number>,
  downbeatIndices?: number[]
): number[] {
  const beatTimes = (beats as (number | BeatInfo)[])
    .map((b) => (typeof b === 'number' ? b : (b?.time as number)))
    .filter((t): t is number => typeof t === 'number');
  if (!beatTimes.length) return [];

  // Prefer beatNum if available
  const hasBeatNum = Array.isArray(beats) && typeof beats[0] === 'object' && (beats[0] as BeatInfo)?.beatNum != null;
  if (hasBeatNum) {
    return (beats as BeatInfo[]).filter((b) => b.beatNum === 1).map((b) => b.time);
  }

  if (downbeatIndices && downbeatIndices.length) {
    return downbeatIndices
      .map((idx) => (idx >= 0 && idx < beatTimes.length ? beatTimes[idx] : null))
      .filter((t): t is number => typeof t === 'number');
  }
  return [];
}

/**
 * Filter chord events to those that occur near downbeats.
 * Tolerance defaults to one quarter of the median beat interval.
 */
export function filterChordsToDownbeats(
  chords: Array<{ time: number; chord: string }>,
  downbeatTimes: number[],
  toleranceSec?: number
): Array<{ time: number; chord: string }> {
  if (!chords.length || !downbeatTimes.length) return chords;
  // Estimate a default tolerance from downbeat intervals
  const intervals: number[] = [];
  for (let i = 1; i < downbeatTimes.length; i++) intervals.push(downbeatTimes[i] - downbeatTimes[i - 1]);
  const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)] || 0.5;
  const tol = toleranceSec ?? Math.max(0.04, median / 4);

  const isNear = (t: number) => downbeatTimes.some((db) => Math.abs(db - t) <= tol);
  return chords.filter((c) => isNear(c.time));
}

