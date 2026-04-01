import { GRID_ALIGNMENT_CONFIG } from './gridConfig';

const SILENT_CHORD_VALUES: ReadonlySet<string> = new Set(GRID_ALIGNMENT_CONFIG.silentChordValues);

export function isSilentChord(chord: string | null | undefined): boolean {
  return SILENT_CHORD_VALUES.has((chord || '').trim());
}

export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getBeatTime(beat: number | { time?: number } | null | undefined): number | null {
  if (typeof beat === 'number') {
    return beat;
  }

  if (beat && typeof beat === 'object' && typeof beat.time === 'number') {
    return beat.time;
  }

  return null;
}

export function getBeatDurationsAroundWindow(
  beats: (number | null)[],
  startIndex: number,
  endIndex: number
): number[] {
  const durations: number[] = [];

  for (let index = Math.max(1, startIndex); index < Math.min(beats.length, endIndex); index += 1) {
    const previousBeat = beats[index - 1];
    const currentBeat = beats[index];

    if (typeof previousBeat === 'number' && typeof currentBeat === 'number' && currentBeat > previousBeat) {
      durations.push(currentBeat - previousBeat);
    }
  }

  return durations;
}

export function getConsecutiveBeatDurations(
  beats: (number | null)[],
  startBeatIndex: number,
  count: number
): number[] {
  if (count <= 0) {
    return [];
  }

  const durations: number[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const leftBeat = beats[startBeatIndex + offset];
    const rightBeat = beats[startBeatIndex + offset + 1];

    if (typeof leftBeat !== 'number' || typeof rightBeat !== 'number' || rightBeat <= leftBeat) {
      return [];
    }

    durations.push(rightBeat - leftBeat);
  }

  return durations;
}

export function getCyclicShiftDistance(a: number, b: number, timeSignature: number): number {
  const forward = (a - b + timeSignature) % timeSignature;
  const backward = (b - a + timeSignature) % timeSignature;
  return Math.min(forward, backward);
}
