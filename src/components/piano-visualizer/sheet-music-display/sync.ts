import type { MeasureHighlightBox, ScoreSyncData } from './types';

function normalizeMeasureStartTimes(rawTimes: unknown): number[] {
  if (!Array.isArray(rawTimes)) {
    return [];
  }

  return rawTimes
    .filter((value) => Number.isFinite(value))
    .map((value) => Number(value));
}

const SYNC_DATA_CACHE_LIMIT = 8;
const syncDataCache = new Map<string, ScoreSyncData>();

function parseSyncDataFromMusicXml(musicXml: string): ScoreSyncData {
  const syncMatch = musicXml.match(/chordmini-sync-data:([\s\S]*?)-->/i);
  if (!syncMatch) {
    return {
      measureStartScoreTimes: [],
      measureStartAudioTimes: [],
    };
  }

  try {
    const parsed = JSON.parse(syncMatch[1].trim()) as {
      measureStartScoreTimes?: unknown;
      measureStartAudioTimes?: unknown;
    };

    return {
      measureStartScoreTimes: normalizeMeasureStartTimes(parsed.measureStartScoreTimes),
      measureStartAudioTimes: normalizeMeasureStartTimes(parsed.measureStartAudioTimes),
    };
  } catch {
    return {
      measureStartScoreTimes: [],
      measureStartAudioTimes: [],
    };
  }
}

export function extractSyncDataFromMusicXml(musicXml: string): ScoreSyncData {
  const cached = syncDataCache.get(musicXml);
  if (cached) {
    return cached;
  }

  const parsed = parseSyncDataFromMusicXml(musicXml);

  if (syncDataCache.size >= SYNC_DATA_CACHE_LIMIT) {
    const oldestKey = syncDataCache.keys().next().value;
    if (oldestKey) {
      syncDataCache.delete(oldestKey);
    }
  }

  syncDataCache.set(musicXml, parsed);
  return parsed;
}

export function countScoreMeasuresInMusicXml(musicXml: string, syncData?: ScoreSyncData): number {
  const syncedMeasureCount = Math.max(
    syncData?.measureStartAudioTimes.length ?? 0,
    syncData?.measureStartScoreTimes.length ?? 0,
  );
  if (syncedMeasureCount > 0) {
    return syncedMeasureCount;
  }

  const firstPartXml = musicXml.match(/<part\b[^>]*>([\s\S]*?)<\/part>/i)?.[1] ?? musicXml;
  return Math.max(1, firstPartXml.match(/<measure\b/g)?.length ?? 0);
}

function isStrictlyIncreasing(values: number[]): boolean {
  if (values.length < 2) {
    return false;
  }

  for (let index = 1; index < values.length; index += 1) {
    if (!Number.isFinite(values[index]) || values[index] <= values[index - 1] + 0.000001) {
      return false;
    }
  }

  return true;
}

export function resolveMeasureStartScoreTimes(
  syncData: ScoreSyncData,
  measureCount: number,
  measureDurationSeconds: number,
): number[] {
  if (syncData.measureStartScoreTimes.length >= measureCount) {
    return syncData.measureStartScoreTimes.slice(0, measureCount);
  }

  return Array.from({ length: measureCount }, (_, measureIndex) => (
    Number((measureIndex * measureDurationSeconds).toFixed(6))
  ));
}

export function getActiveMeasureIndexFromAudioTime(
  currentTime: number,
  syncData: ScoreSyncData,
  bpm: number,
  timeSignature: number,
): number {
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  const starts = syncData.measureStartAudioTimes;

  if (isStrictlyIncreasing(starts)) {
    let left = 0;
    let right = starts.length - 1;
    let answer = 0;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      if (safeCurrentTime >= starts[middle]) {
        answer = middle;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    return Math.max(0, answer);
  }

  const measureDurationSeconds = (timeSignature * 60) / bpm;
  return Math.max(0, Math.floor(safeCurrentTime / Math.max(measureDurationSeconds, 0.001)));
}

export function stabilizeMeasureBoxAnchors(
  rawBoxes: Array<MeasureHighlightBox | undefined>,
  measureCount: number,
): MeasureHighlightBox[] {
  const anchors: Array<MeasureHighlightBox | null> = Array.from(
    { length: measureCount },
    (_, index) => rawBoxes[index] ?? null,
  );
  const firstKnownBox = anchors.find((box): box is MeasureHighlightBox => Boolean(box));

  if (!firstKnownBox) {
    return [];
  }

  for (let measureIndex = 1; measureIndex < anchors.length; measureIndex += 1) {
    const previous = anchors[measureIndex - 1];
    const current = anchors[measureIndex];
    if (!previous || !current) {
      continue;
    }

    const sameSystem = Math.abs(current.top - previous.top) < 8;
    if (sameSystem && current.left <= previous.left + 1) {
      anchors[measureIndex] = null;
    }
  }

  const findPreviousKnownIndex = (fromIndex: number): number | null => {
    for (let index = fromIndex - 1; index >= 0; index -= 1) {
      if (anchors[index]) {
        return index;
      }
    }
    return null;
  };

  const findNextKnownIndex = (fromIndex: number): number | null => {
    for (let index = fromIndex + 1; index < anchors.length; index += 1) {
      if (anchors[index]) {
        return index;
      }
    }
    return null;
  };

  for (let measureIndex = 0; measureIndex < anchors.length; measureIndex += 1) {
    if (anchors[measureIndex]) {
      continue;
    }

    const previousKnownIndex = findPreviousKnownIndex(measureIndex);
    const nextKnownIndex = findNextKnownIndex(measureIndex);
    const previous = previousKnownIndex !== null ? anchors[previousKnownIndex] : null;
    const next = nextKnownIndex !== null ? anchors[nextKnownIndex] : null;

    if (
      previous
      && next
      && previousKnownIndex !== null
      && nextKnownIndex !== null
      && Math.abs(next.top - previous.top) < 8
    ) {
      const span = nextKnownIndex - previousKnownIndex;
      const progress = span > 0 ? (measureIndex - previousKnownIndex) / span : 0;
      anchors[measureIndex] = {
        top: previous.top + ((next.top - previous.top) * progress),
        left: previous.left + ((next.left - previous.left) * progress),
        width: Math.max(1, previous.width + ((next.width - previous.width) * progress)),
        height: Math.max(1, previous.height + ((next.height - previous.height) * progress)),
      };
      continue;
    }

    anchors[measureIndex] = previous ?? next ?? firstKnownBox;
  }

  return anchors.map((box) => box ?? firstKnownBox);
}

export function resolveMeasureScrollTop(params: {
  activeMeasureBox: MeasureHighlightBox;
  currentScrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}): number | null {
  const {
    activeMeasureBox,
    currentScrollTop,
    viewportHeight,
    scrollHeight,
  } = params;

  if (
    !Number.isFinite(activeMeasureBox.top)
    || !Number.isFinite(activeMeasureBox.height)
    || !Number.isFinite(currentScrollTop)
    || !Number.isFinite(viewportHeight)
    || !Number.isFinite(scrollHeight)
    || viewportHeight <= 0
  ) {
    return null;
  }

  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const measureTop = activeMeasureBox.top;
  const measureHeight = Math.max(1, activeMeasureBox.height);
  const measureBottom = measureTop + measureHeight;
  const preferredTopPadding = Math.max(18, Math.min(52, viewportHeight * 0.08));
  const preferredBottomPadding = Math.max(28, Math.min(72, viewportHeight * 0.12));
  const minimumVisibleGap = 12;
  const preferredPaddingTotal = preferredTopPadding + preferredBottomPadding;
  const maxPaddingTotal = Math.max(0, viewportHeight - measureHeight - minimumVisibleGap);
  const paddingScale = preferredPaddingTotal > 0
    ? Math.min(1, maxPaddingTotal / preferredPaddingTotal)
    : 1;
  const topPadding = preferredTopPadding * paddingScale;
  const bottomPadding = preferredBottomPadding * paddingScale;
  const minVisibleScrollTop = measureBottom - viewportHeight + bottomPadding;
  const maxVisibleScrollTop = measureTop - topPadding;

  let targetScrollTop: number | null = null;

  if (minVisibleScrollTop > maxVisibleScrollTop) {
    targetScrollTop = minVisibleScrollTop;
  } else if (currentScrollTop < minVisibleScrollTop - 0.5) {
    targetScrollTop = maxVisibleScrollTop;
  } else if (currentScrollTop > maxVisibleScrollTop + 0.5) {
    targetScrollTop = maxVisibleScrollTop;
  }

  if (targetScrollTop === null) {
    return null;
  }

  const clampedTarget = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
  return Math.abs(clampedTarget - currentScrollTop) > 0.5 ? clampedTarget : null;
}
