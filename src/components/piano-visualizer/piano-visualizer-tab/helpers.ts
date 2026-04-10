import type { AudioMixerSettings } from '@/services/chord-playback/audioMixerService';
import { findChordEventForPlayback as findPlayableChordEvent } from '@/utils/chordEventLookup';
import type { ChordEvent } from '@/utils/chordToMidi';
import { PLAYBACK_EVENT_BOUNDARY_TOLERANCE } from './constants';

export function hasPlayableNotes(event: ChordEvent): boolean {
  return event.notes.length > 0;
}

export function findChordEventForPlayback(
  events: ChordEvent[],
  currentTime: number,
  currentBeatIndex: number,
  toleranceSeconds = PLAYBACK_EVENT_BOUNDARY_TOLERANCE,
): ChordEvent | null {
  return findPlayableChordEvent(events, currentTime, currentBeatIndex, toleranceSeconds);
}

export function findClosestTimedBeatIndex(
  beatTimes: Array<number | null> | undefined,
  targetTime: number,
  startIndex = 0,
): number | null {
  if (!beatTimes?.length || !Number.isFinite(targetTime)) {
    return null;
  }

  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = Math.max(0, startIndex); index < beatTimes.length; index += 1) {
    const beatTime = beatTimes[index];
    if (typeof beatTime !== 'number' || !Number.isFinite(beatTime)) {
      continue;
    }

    const distance = Math.abs(beatTime - targetTime);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }

    if (closestIndex !== null && beatTime > targetTime && distance > closestDistance) {
      break;
    }
  }

  return closestIndex;
}

export function countLeadingShiftChordSlots(chords: string[] | undefined): number {
  if (!chords?.length) {
    return 0;
  }

  let count = 0;
  while (count < chords.length) {
    const chord = (chords[count] ?? '').trim();
    if (chord.length > 0) {
      break;
    }
    count += 1;
  }

  return count;
}

export function countLeadingNullBeatSlots(beatTimes: Array<number | null> | undefined): number {
  if (!beatTimes?.length) {
    return 0;
  }

  let count = 0;
  while (count < beatTimes.length) {
    const beatTime = beatTimes[count];
    if (typeof beatTime === 'number' && Number.isFinite(beatTime)) {
      break;
    }
    count += 1;
  }

  return count;
}

export function areMixerSettingsEqual(a: AudioMixerSettings, b: AudioMixerSettings): boolean {
  return (
    a.pianoVolume === b.pianoVolume
    && a.guitarVolume === b.guitarVolume
    && a.violinVolume === b.violinVolume
    && a.melodyVolume === b.melodyVolume
    && a.fluteVolume === b.fluteVolume
    && a.bassVolume === b.bassVolume
    && a.saxophoneVolume === b.saxophoneVolume
    && a.chordPlaybackVolume === b.chordPlaybackVolume
  );
}
