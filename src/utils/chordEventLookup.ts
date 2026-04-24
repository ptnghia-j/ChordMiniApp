export interface ChordTimedEventLike {
  startTime: number;
  endTime: number;
  beatIndex: number;
}

function findChordEventIndexAtTime<T extends ChordTimedEventLike>(
  events: T[],
  time: number,
): number {
  let lo = 0;
  let hi = events.length - 1;
  let idx = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].startTime <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (idx < 0) return -1;

  return time < events[idx].endTime ? idx : -1;
}

export function findChordEventIndexByBeatIndex<T extends ChordTimedEventLike>(
  events: T[],
  beatIndex: number,
): number {
  if (beatIndex < 0) return -1;

  let lo = 0;
  let hi = events.length - 1;
  let idx = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].beatIndex <= beatIndex) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return idx;
}

export function findChordEventForPlayback<T extends ChordTimedEventLike>(
  events: T[],
  currentTime: number,
  currentBeatIndex: number,
  toleranceSeconds: number,
): T | null {
  const eventIndex = findChordEventIndexForPlayback(
    events,
    currentTime,
    currentBeatIndex,
    toleranceSeconds,
  );

  return eventIndex >= 0 ? events[eventIndex] : null;
}

export function findChordEventIndexForPlayback<T extends ChordTimedEventLike>(
  events: T[],
  currentTime: number,
  currentBeatIndex: number,
  toleranceSeconds: number,
): number {
  const exactEventIndex = findChordEventIndexAtTime(events, currentTime);
  const exactEvent = exactEventIndex >= 0 ? events[exactEventIndex] : null;

  const beatEventIndex = findChordEventIndexByBeatIndex(events, currentBeatIndex);
  const beatEvent = beatEventIndex >= 0 ? events[beatEventIndex] : null;

  if (exactEvent && beatEvent && exactEvent.beatIndex !== beatEvent.beatIndex) {
    const beatEventStartsSoon = beatEvent.startTime >= currentTime
      && beatEvent.startTime - currentTime <= toleranceSeconds;

    if (beatEventStartsSoon) {
      return beatEventIndex;
    }
  }

  if (exactEvent) {
    return exactEventIndex;
  }

  if (beatEvent) {
    const withinBeatEventWindow = currentTime >= beatEvent.startTime - toleranceSeconds
      && currentTime < beatEvent.endTime + toleranceSeconds;

    if (withinBeatEventWindow) {
      return beatEventIndex;
    }
  }

  const forwardEventIndex = findChordEventIndexAtTime(events, currentTime + toleranceSeconds);
  if (forwardEventIndex >= 0) {
    const forwardEvent = events[forwardEventIndex];
    if (forwardEvent.startTime - currentTime <= toleranceSeconds) {
      return forwardEventIndex;
    }
  }

  const backwardProbeTime = Math.max(0, currentTime - toleranceSeconds);
  const backwardEventIndex = findChordEventIndexAtTime(events, backwardProbeTime);
  if (backwardEventIndex >= 0) {
    const backwardEvent = events[backwardEventIndex];
    if (currentTime - backwardEvent.endTime <= toleranceSeconds) {
      return backwardEventIndex;
    }
  }

  return -1;
}
