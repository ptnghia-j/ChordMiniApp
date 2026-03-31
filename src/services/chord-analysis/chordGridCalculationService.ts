// Chord Grid Calculation Service
// Extracted from src/app/analyze/[videoId]/page.tsx
// Handles complex chord grid data processing, padding, and shifting calculations

// Import the actual AnalysisResult type from the chord recognition service
import { AnalysisResult as ChordRecognitionAnalysisResult } from '@/services/chord-analysis/chordRecognitionService';

// Create a flexible type that can handle both formats
type AnalysisResult = ChordRecognitionAnalysisResult | {
  chords?: Array<{chord: string, time: number}>;
  beats: Array<{time: number, beatNum?: number}> | number[];
  downbeats?: number[];
  downbeats_with_measures?: number[];
  synchronizedChords: Array<{chord: string, beatIndex: number, beatNum?: number}>;
  beatModel?: string;
  chordModel?: string;
  audioDuration?: number;
  beatDetectionResult?: {
    time_signature?: number;
    bpm?: number;
    beatShift?: number;
    beat_time_range_start?: number;
    paddingCount?: number;
    shiftCount?: number;
  };
};

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface VisualCompactionWindow {
  startIndex: number;
  endIndex: number;
  targetModulo?: number;
  mode?: 'shrink_only' | 'expand_only';
  source?: 'gap' | 'silence' | 'tempo' | 'leading_silence';
}

function shouldLogAlignmentDebug(beatModel: string | undefined): boolean {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
    return false;
  }
  return beatModel === 'madmom' && window.localStorage.getItem('alignmentDebug') === '1';
}

function logAlignmentDebug(label: string, payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') {
    return;
  }

  console.info(`[alignment-debug] ${label}`, payload);
}

const SILENT_CHORD_VALUES = new Set(['', 'N', 'N/C', 'N.C.', 'NC']);

function isSilentChord(chord: string | null | undefined): boolean {
  return SILENT_CHORD_VALUES.has((chord || '').trim());
}

function getBeatDurationsAroundWindow(
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

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildExpandedLeadingSilenceTimestamps(
  beats: (number | null)[],
  windowStart: number,
  windowEnd: number,
  extraCount: number
): (number | null)[] {
  if (extraCount <= 0) {
    return [];
  }

  let previousNumericBeat: number | null = null;
  for (let index = Math.min(windowEnd, beats.length) - 1; index >= Math.max(0, windowStart); index -= 1) {
    const beat = beats[index];
    if (typeof beat === 'number') {
      previousNumericBeat = beat;
      break;
    }
  }

  let nextNumericBeat: number | null = null;
  for (let index = Math.max(0, windowEnd); index < beats.length; index += 1) {
    const beat = beats[index];
    if (typeof beat === 'number') {
      nextNumericBeat = beat;
      break;
    }
  }

  const nearbyDurations = getBeatDurationsAroundWindow(
    beats,
    Math.max(0, windowStart - 4),
    Math.min(beats.length, windowEnd + 5)
  );
  const fallbackStep = nearbyDurations.length > 0 ? average(nearbyDurations) : 0.5;

  const startTime = previousNumericBeat ?? 0;
  const endTime = (
    nextNumericBeat !== null && nextNumericBeat > startTime
      ? nextNumericBeat
      : startTime + (fallbackStep * (extraCount + 1))
  );
  const step = (endTime - startTime) / (extraCount + 1);

  return Array.from({ length: extraCount }, (_, index) => {
    const candidate = startTime + (step * (index + 1));
    return Number.isFinite(candidate) ? candidate : null;
  });
}

function findTempoChangeBoundaries(
  beats: (number | null)[],
  timeSignature: number
): Array<{ boundaryIndex: number; prevBeatDuration: number; nextBeatDuration: number; ratio: number }> {
  const windowSize = Math.max(timeSignature, 4);
  const boundaries: Array<{ boundaryIndex: number; prevBeatDuration: number; nextBeatDuration: number; ratio: number }> = [];

  for (let index = windowSize * 2; index < beats.length - windowSize; index += 1) {
    const previousDurations = getBeatDurationsAroundWindow(beats, index - windowSize, index);
    const nextDurations = getBeatDurationsAroundWindow(beats, index, index + windowSize);

    if (previousDurations.length < Math.max(2, Math.floor(windowSize / 2)) || nextDurations.length < Math.max(2, Math.floor(windowSize / 2))) {
      continue;
    }

    const previousAverage = average(previousDurations);
    const nextAverage = average(nextDurations);
    if (previousAverage <= 0 || nextAverage <= 0) {
      continue;
    }

    const ratio = Math.max(previousAverage, nextAverage) / Math.min(previousAverage, nextAverage);
    if (ratio >= 1.7) {
      const previousBoundary = boundaries[boundaries.length - 1];
      if (previousBoundary && index - previousBoundary.boundaryIndex < timeSignature) {
        continue;
      }

      boundaries.push({
        boundaryIndex: index,
        prevBeatDuration: previousAverage,
        nextBeatDuration: nextAverage,
        ratio,
      });
    }
  }

  return boundaries;
}

function scoreLeadingExpansion(
  chords: string[],
  segmentStart: number,
  segmentEnd: number,
  timeSignature: number,
  extraBeats: number
): number {
  const chordStartIndices: number[] = [];

  for (let index = segmentStart; index < segmentEnd; index += 1) {
    const chord = chords[index];
    if (isSilentChord(chord)) {
      continue;
    }

    const previousChord = index > segmentStart ? chords[index - 1] : '';
    if (index === segmentStart || isSilentChord(previousChord) || previousChord !== chord) {
      chordStartIndices.push(index);
    }
  }

  if (chordStartIndices.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return chordStartIndices.slice(0, 8).reduce((score, chordStartIndex, order) => {
    const visualIndex = chordStartIndex + extraBeats;
    const modulo = visualIndex % timeSignature;
    const distanceToDownbeat = Math.min(modulo, (timeSignature - modulo) % timeSignature);
    const weight = order === 0 ? 20 : Math.max(4, 12 - (order * 2));

    if (distanceToDownbeat === 0) {
      return score + weight;
    }

    return score - (distanceToDownbeat * weight);
  }, -extraBeats * 0.25);
}

export function compactSilentRunsForVisualAlignment(
  chordGridData: ChordGridData,
  timeSignature: number,
  enabled: boolean
): ChordGridData {
  if (!enabled || timeSignature <= 1 || chordGridData.chords.length === 0) {
    return chordGridData;
  }

  const minSilentRunLength = Math.max(2, timeSignature - 1);
  const nextChords: string[] = [];
  const nextBeats: (number | null)[] = [];
  const oldToNewVisualIndex = new Map<number, number>();

  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < chordGridData.chords.length) {
    if (!isSilentChord(chordGridData.chords[oldIndex])) {
      nextChords.push(chordGridData.chords[oldIndex]);
      nextBeats.push(chordGridData.beats[oldIndex] ?? null);
      oldToNewVisualIndex.set(oldIndex, newIndex);
      oldIndex++;
      newIndex++;
      continue;
    }

    let runEnd = oldIndex;
    while (runEnd < chordGridData.chords.length && isSilentChord(chordGridData.chords[runEnd])) {
      runEnd++;
    }

    const runLength = runEnd - oldIndex;
    const previousChord = oldIndex > 0 ? chordGridData.chords[oldIndex - 1] : '';
    const nextChord = runEnd < chordGridData.chords.length ? chordGridData.chords[runEnd] : '';
    const precededByMusic = !isSilentChord(previousChord);
    const followedByMusic = !isSilentChord(nextChord);
    const resumeVisualIndex = newIndex + runLength;
    const cellsToRemove = resumeVisualIndex % timeSignature;
    const canCompact =
      precededByMusic &&
      followedByMusic &&
      runLength >= minSilentRunLength &&
      cellsToRemove > 0 &&
      cellsToRemove < runLength;

    const keptCount = canCompact ? runLength - cellsToRemove : runLength;

    for (let offset = 0; offset < keptCount; offset++) {
      const sourceIndex = oldIndex + offset;
      nextChords.push(chordGridData.chords[sourceIndex]);
      nextBeats.push(chordGridData.beats[sourceIndex] ?? null);
      oldToNewVisualIndex.set(sourceIndex, newIndex);
      newIndex++;
    }

    const collapsedTargetIndex = Math.max(0, newIndex - 1);
    for (let offset = keptCount; offset < runLength; offset++) {
      oldToNewVisualIndex.set(oldIndex + offset, collapsedTargetIndex);
    }

    oldIndex = runEnd;
  }

  return {
    ...chordGridData,
    chords: nextChords,
    beats: nextBeats,
    originalAudioMapping: chordGridData.originalAudioMapping?.map((item) => ({
      ...item,
      visualIndex: oldToNewVisualIndex.get(item.visualIndex) ?? item.visualIndex,
    })),
  };
}

function buildSilentRunWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): VisualCompactionWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length === 0) {
    return [];
  }

  const minSilentRunLength = Math.max(2, timeSignature - 1);
  const windows: VisualCompactionWindow[] = [];
  let index = 0;

  while (index < chordGridData.chords.length) {
    if (!isSilentChord(chordGridData.chords[index])) {
      index++;
      continue;
    }

    let runEnd = index;
    while (runEnd < chordGridData.chords.length && isSilentChord(chordGridData.chords[runEnd])) {
      runEnd++;
    }

    const previousChord = index > 0 ? chordGridData.chords[index - 1] : '';
    const nextChord = runEnd < chordGridData.chords.length ? chordGridData.chords[runEnd] : '';
    const precededByMusic = !isSilentChord(previousChord);
    const followedByMusic = !isSilentChord(nextChord);

    if (precededByMusic && followedByMusic && runEnd - index >= minSilentRunLength) {
      windows.push({ startIndex: index, endIndex: runEnd, mode: 'shrink_only', source: 'silence' });
    }

    index = runEnd;
  }

  return windows;
}

function findFirstBeatIndexAtOrAfter(beats: number[], time: number): number {
  let left = 0;
  let right = beats.length - 1;
  let answer = beats.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (beats[mid] >= time) {
      answer = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return answer;
}

function compactVisualWindows(
  chordGridData: ChordGridData,
  windows: VisualCompactionWindow[],
  timeSignature: number,
  enabled: boolean
): ChordGridData {
  if (!enabled || timeSignature <= 1 || windows.length === 0) {
    return chordGridData;
  }

  const normalizedWindows = [...windows]
    .filter((window) => {
      const windowLength = window.endIndex - window.startIndex;
      return window.mode === 'expand_only' ? windowLength >= 1 : windowLength >= 2;
    })
    .sort((a, b) => a.startIndex - b.startIndex);

  if (normalizedWindows.length === 0) {
    return chordGridData;
  }

  const nextChords: string[] = [];
  const nextBeats: (number | null)[] = [];
  const oldToNewVisualIndex = new Map<number, number>();

  let oldIndex = 0;
  let newIndex = 0;
  let windowIndex = 0;

  while (oldIndex < chordGridData.chords.length) {
    const activeWindow = normalizedWindows[windowIndex];

    if (!activeWindow || oldIndex < activeWindow.startIndex || oldIndex >= activeWindow.endIndex) {
      nextChords.push(chordGridData.chords[oldIndex]);
      nextBeats.push(chordGridData.beats[oldIndex] ?? null);
      oldToNewVisualIndex.set(oldIndex, newIndex);
      oldIndex++;
      newIndex++;

      if (activeWindow && oldIndex >= activeWindow.endIndex) {
        windowIndex++;
      }
      continue;
    }

    const windowLength = activeWindow.endIndex - activeWindow.startIndex;
    const resumeVisualIndex = newIndex + windowLength;
    const targetModulo = Math.max(0, activeWindow.targetModulo ?? 0) % timeSignature;
    const currentModulo = resumeVisualIndex % timeSignature;
    const deltaForward = (targetModulo - currentModulo + timeSignature) % timeSignature;
    const deltaBackward = deltaForward === 0 ? 0 : deltaForward - timeSignature;
    const canShrink = windowLength + deltaBackward >= 1;
    let adjustment = 0;

    if (activeWindow.mode === 'expand_only') {
      adjustment = deltaForward;
    } else if (activeWindow.mode === 'shrink_only') {
      adjustment = canShrink && deltaBackward < 0 ? deltaBackward : 0;
    } else {
      adjustment =
        canShrink && Math.abs(deltaBackward) <= Math.abs(deltaForward)
          ? deltaBackward
          : deltaForward;
    }
    const targetWindowLength = Math.max(1, windowLength + adjustment);

    const copiedCount = Math.min(windowLength, targetWindowLength);
    const prependLeadingPadding = activeWindow.source === 'leading_silence' && targetWindowLength > windowLength;

    if (prependLeadingPadding) {
      const extraCount = targetWindowLength - windowLength;
      for (let extra = 0; extra < extraCount; extra++) {
        nextChords.push('');
        nextBeats.push(null);
        newIndex++;
      }
    }

    for (let offset = 0; offset < copiedCount; offset++) {
      const sourceIndex = activeWindow.startIndex + offset;
      nextChords.push(chordGridData.chords[sourceIndex]);
      nextBeats.push(chordGridData.beats[sourceIndex] ?? null);
      oldToNewVisualIndex.set(sourceIndex, newIndex);
      newIndex++;
    }

    if (targetWindowLength > windowLength && !prependLeadingPadding) {
      const isSilentWindow = chordGridData.chords
        .slice(activeWindow.startIndex, activeWindow.endIndex)
        .every((chord) => isSilentChord(chord));
      const fillerChord = isSilentWindow
        ? 'N.C.'
        : (copiedCount > 0
          ? chordGridData.chords[activeWindow.startIndex + copiedCount - 1] || 'N.C.'
          : 'N.C.');
      const extraCount = targetWindowLength - windowLength;
      const extraBeatTimestamps = activeWindow.source === 'leading_silence'
        ? buildExpandedLeadingSilenceTimestamps(
          chordGridData.beats,
          activeWindow.startIndex,
          activeWindow.endIndex,
          extraCount
        )
        : Array(extraCount).fill(null);
      for (let extra = 0; extra < extraCount; extra++) {
        nextChords.push(fillerChord || 'N.C.');
        nextBeats.push(extraBeatTimestamps[extra] ?? null);
        newIndex++;
      }
    } else {
      const collapsedTargetIndex = Math.max(0, newIndex - 1);
      for (let offset = copiedCount; offset < windowLength; offset++) {
        oldToNewVisualIndex.set(activeWindow.startIndex + offset, collapsedTargetIndex);
      }
    }

    oldIndex = activeWindow.endIndex;
    windowIndex++;
  }

  return {
    ...chordGridData,
    chords: nextChords,
    beats: nextBeats,
    originalAudioMapping: chordGridData.originalAudioMapping?.map((item) => ({
      ...item,
      visualIndex: oldToNewVisualIndex.get(item.visualIndex) ?? item.visualIndex,
    })),
  };
}

function buildGapCompactionWindows(
  chordIntervals: Array<{ start?: number; end?: number; chord?: string }>,
  beatTimes: number[],
  visualOffset: number,
  beatDuration: number
): VisualCompactionWindow[] {
  if (beatTimes.length < 2 || chordIntervals.length < 2) {
    return [];
  }

  const orderedChords = chordIntervals
    .filter((chord) => typeof chord.start === 'number' && typeof chord.end === 'number' && chord.end > chord.start)
    .sort((a, b) => (a.start as number) - (b.start as number));

  const gapThreshold = Math.max(beatDuration * 2.5, 1.1);
  const onsetLeadIn = beatDuration * 0.35;
  const releaseTail = Math.min(beatDuration * 0.1, 0.08);
  const windows: VisualCompactionWindow[] = [];

  for (let i = 1; i < orderedChords.length; i++) {
    const previousChord = orderedChords[i - 1];
    const nextChord = orderedChords[i];
    const gapDuration = (nextChord.start as number) - (previousChord.end as number);

    if (!Number.isFinite(gapDuration) || gapDuration < gapThreshold) {
      continue;
    }

    const gapStartBeatIndex = findFirstBeatIndexAtOrAfter(beatTimes, (previousChord.end as number) + releaseTail);
    const resumeBeatIndex = findFirstBeatIndexAtOrAfter(beatTimes, (nextChord.start as number) - onsetLeadIn);

    if (
      gapStartBeatIndex < beatTimes.length &&
      resumeBeatIndex <= beatTimes.length &&
      resumeBeatIndex - gapStartBeatIndex >= 2
    ) {
      windows.push({
        startIndex: visualOffset + gapStartBeatIndex,
        endIndex: visualOffset + resumeBeatIndex,
        mode: 'shrink_only',
        source: 'gap',
      });
    }
  }

  return windows;
}

function buildTempoChangeWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): Array<VisualCompactionWindow & { prevBeatDuration: number; nextBeatDuration: number; ratio: number }> {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature * 3) {
    return [];
  }

  return findTempoChangeBoundaries(chordGridData.beats, timeSignature).flatMap((boundary) => {
    const windowEnd = boundary.boundaryIndex;
    if (windowEnd <= 1 || windowEnd > chordGridData.chords.length) {
      return [];
    }

    const trailingChord = chordGridData.chords[windowEnd - 1];
    if (isSilentChord(trailingChord)) {
      return [];
    }

    let trailingStart = windowEnd - 1;
    while (trailingStart > 0 && chordGridData.chords[trailingStart - 1] === trailingChord) {
      trailingStart -= 1;
    }

    const maxShrink = Math.min(3, timeSignature - 1);
    const startIndex = Math.max(trailingStart + 1, windowEnd - maxShrink);

    if (windowEnd - startIndex < 1) {
      return [];
    }

    return [{
      startIndex,
      endIndex: windowEnd,
      mode: 'shrink_only' as const,
      source: 'tempo' as const,
      prevBeatDuration: boundary.prevBeatDuration,
      nextBeatDuration: boundary.nextBeatDuration,
      ratio: boundary.ratio,
    }];
  });
}

function buildLeadingSilenceExpansionWindow(
  chordGridData: ChordGridData,
  sortedFollowupFlags: VisualCompactionWindow[],
  timeSignature: number
): VisualCompactionWindow | null {
  if (sortedFollowupFlags.length === 0 || timeSignature <= 1 || chordGridData.chords.length === 0) {
    return null;
  }

  let runEnd = 0;
  while (runEnd < chordGridData.chords.length && isSilentChord(chordGridData.chords[runEnd])) {
    runEnd += 1;
  }

  if (runEnd === 0 || runEnd >= chordGridData.chords.length) {
    return null;
  }

  const nextFlagStart = sortedFollowupFlags[0]?.startIndex ?? chordGridData.chords.length;
  if (nextFlagStart <= runEnd) {
    return null;
  }

  const maxExtraBeats = Math.min(3, timeSignature - 1);
  let bestExtraBeats = 0;
  let bestScore = scoreLeadingExpansion(chordGridData.chords, runEnd, nextFlagStart, timeSignature, 0);

  for (let extraBeats = 1; extraBeats <= maxExtraBeats; extraBeats += 1) {
    const candidateScore = scoreLeadingExpansion(
      chordGridData.chords,
      runEnd,
      nextFlagStart,
      timeSignature,
      extraBeats
    );

    if (candidateScore > bestScore + 0.5) {
      bestScore = candidateScore;
      bestExtraBeats = extraBeats;
    }
  }

  if (bestExtraBeats === 0) {
    return null;
  }

  const currentModulo = runEnd % timeSignature;
  return {
    startIndex: 0,
    endIndex: runEnd,
    targetModulo: (currentModulo + bestExtraBeats) % timeSignature,
    mode: 'expand_only',
    source: 'leading_silence',
  };
}

function resolveWindowTargetModulos(
  chordGridData: ChordGridData,
  windows: VisualCompactionWindow[],
  timeSignature: number
): VisualCompactionWindow[] {
  if (windows.length === 0 || timeSignature <= 1) {
    return windows;
  }

  const sortedWindows = [...windows].sort((a, b) => a.startIndex - b.startIndex);

  return sortedWindows.map((window, index) => {
    const nextWindowStart = sortedWindows[index + 1]?.startIndex ?? chordGridData.chords.length;
    const segmentStart = window.endIndex;
    const segmentEnd = Math.max(segmentStart, nextWindowStart);
    const segmentChords = chordGridData.chords.slice(segmentStart, segmentEnd);
    const hasMusicalContent = segmentChords.some((chord) => !isSilentChord(chord));

    if (!hasMusicalContent) {
      return { ...window, targetModulo: 0 };
    }

    return {
      ...window,
      targetModulo: calculateOptimalShift(segmentChords, timeSignature, 0),
    };
  });
}

/**
 * Calculate optimal shift for chord alignment with downbeats
 */
export const calculateOptimalShift = (chords: string[], timeSignature: number, paddingCount: number = 0): number => {
  if (chords.length === 0) {
    return 0;
  }

  const shiftResults: Array<{
    shift: number;
    chordChanges: number;
    downbeatPositions: number[];
    chordLabels: string[];
  }> = [];

  // Test all possible shift values (0 to timeSignature-1)
  for (let shift = 0; shift < timeSignature; shift++) {
    let chordChangeCount = 0;
    const downbeatPositions: number[] = [];
    const chordLabels: string[] = [];

    // Check each chord position after applying the shift
    let previousDownbeatChord = '';

    for (let i = 0; i < chords.length; i++) {
      const currentChord = chords[i];
      const totalPadding = paddingCount + shift;
      const visualPosition = totalPadding + i;
      const beatInMeasure = (visualPosition % timeSignature) + 1;
      const isDownbeat = beatInMeasure === 1;

      // Only check for chord changes on downbeats
      if (isDownbeat) {
        // FIXED: Restore original chord validation logic
        const isValidChord = currentChord && currentChord !== '' &&
                            currentChord !== 'N.C.' && currentChord !== 'N/C' && currentChord !== 'N';

        const isChordChange = isValidChord &&
                             previousDownbeatChord !== '' && // Must have a previous chord to compare
                             currentChord !== previousDownbeatChord; // Must be different

        // FIXED: Only count chord changes that START on downbeats
        // This ensures both musical alignment (on downbeats) and visual accuracy (where chords start)
        if (isChordChange) {
          // Check if this chord actually starts on this downbeat position
          const chordStartsHere = i === 0 || chords[i - 1] !== currentChord;

          if (chordStartsHere) {
            // This chord starts on this downbeat - count it!
            chordChangeCount++;
            downbeatPositions.push(i); // Record the downbeat position where chord starts
            chordLabels.push(currentChord);
          }
        }

        // FIXED: Update previous downbeat chord for ALL valid chords on downbeats
        // This ensures we track the last chord seen on any downbeat for comparison
        if (isValidChord) {
          previousDownbeatChord = currentChord;
        }
      }
    }

    shiftResults.push({
      shift,
      chordChanges: chordChangeCount,
      downbeatPositions,
      chordLabels
    });
  }

  // Find the shift with the most chord changes on downbeats
  const bestResult = shiftResults.reduce((best, current) => {
    if (current.chordChanges > best.chordChanges) {
      return current;
    }
    if (current.chordChanges === best.chordChanges && current.shift < best.shift) {
      return current; // Prefer smaller shift when tied
    }
    return best;
  });

  return bestResult.shift;
};

/**
 * Calculate padding and shift based on first detected beat time
 */
export const calculatePaddingAndShift = (
  firstDetectedBeatTime: number,
  bpm: number,
  timeSignature: number,
  chords: string[] = []
): { paddingCount: number; shiftCount: number; totalPaddingCount: number } => {

  // FIXED: Don't skip shift calculation for songs that start at 0s
  // Padding calculation can be skipped, but shift optimization should still be performed
  let paddingCount = 0;

  // Only calculate padding if there's a meaningful pre-beat phase (> 0.05s)
  if (firstDetectedBeatTime > 0.05) {
    // Calculate padding based on first detected beat time
    const rawPaddingCount = Math.floor((firstDetectedBeatTime / 60) * bpm);
    const beatDuration = Math.round((60 / bpm) * 1000) / 1000;
    const gapRatio = firstDetectedBeatTime / beatDuration;
    paddingCount = rawPaddingCount === 0 && gapRatio > 0.2 ? 1 : rawPaddingCount;

    // Optimize padding to reduce visual clutter
    if (paddingCount >= timeSignature) {
      const fullMeasuresToRemove = Math.floor(paddingCount / timeSignature);
      paddingCount = paddingCount - (fullMeasuresToRemove * timeSignature);

      if (paddingCount === 0 && paddingCount >= timeSignature) {
        paddingCount = timeSignature - 1;
      }
    }
  }

  // Calculate optimal shift (always perform this, even for songs starting at 0s)
  let shiftCount = 0;
  if (chords.length > 0) {
    shiftCount = calculateOptimalShift(chords, timeSignature, paddingCount);
  } else {
    const beatPositionInMeasure = ((paddingCount) % timeSignature) + 1;
    const finalBeatPosition = beatPositionInMeasure > timeSignature ? 1 : beatPositionInMeasure;
    shiftCount = finalBeatPosition === 1 ? 0 : (timeSignature - finalBeatPosition + 1);
  }

  const totalPaddingCount = paddingCount + shiftCount;

  return { paddingCount, shiftCount, totalPaddingCount };
};

/**
 * Get comprehensive chord grid data with padding and shifting
 */
export const getChordGridData = (analysisResults: AnalysisResult | null): ChordGridData => {
  if (!analysisResults || !analysisResults.synchronizedChords || analysisResults.synchronizedChords.length === 0) {
    return {
      chords: [],
      beats: [],
      hasPadding: true, // FIXED: Always return true for consistency with animation system
      paddingCount: 0,
      shiftCount: 0,
      totalPaddingCount: 0,
      originalAudioMapping: []
    };
  }

  const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults.beatDetectionResult?.bpm || 120;

  // Handle both YouTube (object array) and upload (number array) beat formats
  let firstDetectedBeat = 0;
  if (analysisResults.beats && analysisResults.beats.length > 0) {
    const firstBeat = analysisResults.beats[0];
    if (typeof firstBeat === 'number') {
      // Upload workflow: beats is number[]
      firstDetectedBeat = firstBeat;
    } else if (typeof firstBeat === 'object' && firstBeat?.time) {
      // YouTube workflow: beats is BeatInfo[]
      firstDetectedBeat = firstBeat.time;
    }
  }

  // Extract chord data for optimal shift calculation
  const chordData = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);

  // Calculate padding and shifting
  const { paddingCount, shiftCount } = calculatePaddingAndShift(firstDetectedBeat, bpm, timeSignature, chordData);

  // Ensure padding and shift counts are non-negative and finite
  const safePaddingCount = Math.max(0, isFinite(paddingCount) ? Math.floor(paddingCount) : 0);
  const safeShiftCount = Math.max(0, isFinite(shiftCount) ? Math.floor(shiftCount) : 0);

  // Handle comprehensive strategy (Chord-CNN-LSTM and similar models)
  if (analysisResults.chordModel === 'chord-cnn-lstm' || safePaddingCount > 0 || safeShiftCount > 0) {
    // Add padding N.C. chords
    const paddingChords = Array(safePaddingCount).fill('N.C.');
    const paddingTimestamps = Array(safePaddingCount).fill(0).map((_, i) => {
      const paddingDuration = firstDetectedBeat;
      const paddingBeatDuration = safePaddingCount > 0 ? paddingDuration / safePaddingCount : 0;
      return i * paddingBeatDuration;
    });

    // Extract regular chord and beat data
    const regularChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
    const regularBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
      const beatIndex = item.beatIndex;
      if (analysisResults.beats && beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
        const beat = analysisResults.beats[beatIndex];
        if (typeof beat === 'number') {
          // Upload workflow: beats is number[]
          return beat;
        } else if (typeof beat === 'object' && beat?.time) {
          // YouTube workflow: beats is BeatInfo[]
          return beat.time;
        }
      }
      return 0;
    });

    const shiftNullTimestamps = Array(safeShiftCount).fill(null);

    // Construct final visual grid
    const finalChords = [...Array(safeShiftCount).fill(''), ...paddingChords, ...regularChords];
    const finalBeats = [...shiftNullTimestamps, ...paddingTimestamps, ...regularBeats];

    // Create original audio mapping for accurate sync
    const originalAudioMapping = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}, index) => {
      const beatIndex = item.beatIndex;
      let originalTimestamp = 0;
      if (analysisResults.beats && beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
        const beat = analysisResults.beats[beatIndex];
        if (typeof beat === 'number') {
          // Upload workflow: beats is number[]
          originalTimestamp = beat;
        } else if (typeof beat === 'object' && beat?.time) {
          // YouTube workflow: beats is BeatInfo[]
          originalTimestamp = beat.time;
        }
      }

      const visualIndex = safeShiftCount + safePaddingCount + index;
      
      return {
        chord: item.chord,
        timestamp: originalTimestamp,
        visualIndex: visualIndex,
        audioIndex: index
      };
    });

    const gridData: ChordGridData = {
      chords: finalChords,
      beats: finalBeats,
      hasPadding: true, // FIXED: Always true for consistency with ChordGrid frontend shifting
      paddingCount: safePaddingCount,
      shiftCount: safeShiftCount,
      totalPaddingCount: safePaddingCount + safeShiftCount,
      originalAudioMapping
    };

    const beatDuration = bpm > 0 ? 60 / bpm : 0.5;
    const gapWindows = resolveWindowTargetModulos(
      gridData,
      buildGapCompactionWindows(
        analysisResults.chords || [],
        regularBeats,
        safeShiftCount + safePaddingCount,
        beatDuration
      ),
      timeSignature
    );

    const compactedGapGridData = compactVisualWindows(
      gridData,
      gapWindows,
      timeSignature,
      analysisResults.beatModel === 'madmom'
    );

    const silentRunWindows = resolveWindowTargetModulos(
      compactedGapGridData,
      buildSilentRunWindows(compactedGapGridData, timeSignature),
      timeSignature
    );
    const tempoChangeWindows = resolveWindowTargetModulos(
      compactedGapGridData,
      buildTempoChangeWindows(compactedGapGridData, timeSignature),
      timeSignature
    );
    const followupFlags = [...silentRunWindows, ...tempoChangeWindows]
      .sort((a, b) => a.startIndex - b.startIndex);
    const leadingSilenceWindow = buildLeadingSilenceExpansionWindow(
      compactedGapGridData,
      followupFlags,
      timeSignature
    );

    const finalGridData = compactVisualWindows(
      compactedGapGridData,
      leadingSilenceWindow ? [leadingSilenceWindow, ...followupFlags] : followupFlags,
      timeSignature,
      analysisResults.beatModel === 'madmom'
    );

    if (shouldLogAlignmentDebug(analysisResults.beatModel)) {
      logAlignmentDebug('cnn-lstm-grid', {
        timeSignature,
        bpm,
        shiftCount: safeShiftCount,
        paddingCount: safePaddingCount,
        rawChordCount: regularChords.length,
        rawBeatCount: regularBeats.length,
        initialGridCount: gridData.chords.length,
        afterGapWindowCount: compactedGapGridData.chords.length,
        finalGridCount: finalGridData.chords.length,
        gapWindows,
        silentRunWindows,
        tempoChangeWindows,
        leadingSilenceWindow,
        sampleBefore: gridData.chords.slice(0, 80),
        sampleAfter: finalGridData.chords.slice(0, 80),
      });
    }

    return finalGridData;
  }

  // Handle BTC models with comprehensive strategy
  const btcChords = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => item.chord);
  const btcBeats = analysisResults.synchronizedChords.map((item: {chord: string, beatIndex: number, beatNum?: number}) => {
    const beatIndex = item.beatIndex;
    if (analysisResults.beats && beatIndex >= 0 && beatIndex < analysisResults.beats.length) {
      const beat = analysisResults.beats[beatIndex];
      if (typeof beat === 'number') {
        // Upload workflow: beats is number[]
        return beat;
      } else if (typeof beat === 'object' && beat?.time) {
        // YouTube workflow: beats is BeatInfo[]
        return beat.time;
      }
    }
    return 0;
  });

  const btcFirstDetectedBeatTime = btcBeats.length > 0 ? btcBeats[0] : 0;
  const btcBpm = bpm;
  const btcTimeSignature = timeSignature;

  const btcPaddingAndShift = calculatePaddingAndShift(btcFirstDetectedBeatTime, btcBpm, btcTimeSignature, btcChords);
  const btcPaddingCount = Math.max(0, isFinite(btcPaddingAndShift.paddingCount) ? Math.floor(btcPaddingAndShift.paddingCount) : 0);
  const btcShiftCount = Math.max(0, isFinite(btcPaddingAndShift.shiftCount) ? Math.floor(btcPaddingAndShift.shiftCount) : 0);

  // Apply padding and shifting to BTC model data
  const btcPaddingCells = Array(btcPaddingCount).fill('');
  const btcShiftCells = Array(btcShiftCount).fill('');
  const btcFinalChords = [...btcShiftCells, ...btcPaddingCells, ...btcChords];

  // Create beat timestamps
  const btcPaddingBeats = btcPaddingCells.map((_, index) => {
    const beatDuration = 60 / btcBpm;
    return index * beatDuration;
  });
  const btcShiftBeats = Array(btcShiftCount).fill(null);
  const btcFinalBeats = [...btcShiftBeats, ...btcPaddingBeats, ...btcBeats];

  // Create original audio mapping for BTC models
  const btcOriginalAudioMapping = btcChords.map((chord, index) => {
    const visualIndex = btcShiftCount + btcPaddingCount + index;
    return {
      chord: chord,
      timestamp: btcBeats[index] || 0,
      visualIndex: visualIndex,
      audioIndex: index
    };
  });

  const gridData: ChordGridData = {
    chords: btcFinalChords,
    beats: btcFinalBeats,
    hasPadding: true, // FIXED: Always true for consistency with ChordGrid frontend shifting
    paddingCount: btcPaddingCount,
    shiftCount: btcShiftCount,
    totalPaddingCount: btcPaddingCount + btcShiftCount,
    originalAudioMapping: btcOriginalAudioMapping
  };

  const beatDuration = btcBpm > 0 ? 60 / btcBpm : 0.5;
  const gapWindows = resolveWindowTargetModulos(
    gridData,
    buildGapCompactionWindows(
      analysisResults.chords || [],
      btcBeats,
      btcShiftCount + btcPaddingCount,
      beatDuration
    ),
    timeSignature
  );

  const compactedGapGridData = compactVisualWindows(
    gridData,
    gapWindows,
    timeSignature,
    analysisResults.beatModel === 'madmom'
  );

  const silentRunWindows = resolveWindowTargetModulos(
    compactedGapGridData,
    buildSilentRunWindows(compactedGapGridData, timeSignature),
    timeSignature
  );
  const tempoChangeWindows = resolveWindowTargetModulos(
    compactedGapGridData,
    buildTempoChangeWindows(compactedGapGridData, timeSignature),
    timeSignature
  );
  const followupFlags = [...silentRunWindows, ...tempoChangeWindows]
    .sort((a, b) => a.startIndex - b.startIndex);
  const leadingSilenceWindow = buildLeadingSilenceExpansionWindow(
    compactedGapGridData,
    followupFlags,
    timeSignature
  );

  const finalGridData = compactVisualWindows(
    compactedGapGridData,
    leadingSilenceWindow ? [leadingSilenceWindow, ...followupFlags] : followupFlags,
    timeSignature,
    analysisResults.beatModel === 'madmom'
  );

  if (shouldLogAlignmentDebug(analysisResults.beatModel)) {
    logAlignmentDebug('btc-grid', {
      timeSignature,
      bpm: btcBpm,
      shiftCount: btcShiftCount,
      paddingCount: btcPaddingCount,
      rawChordCount: btcChords.length,
      rawBeatCount: btcBeats.length,
      initialGridCount: gridData.chords.length,
      afterGapWindowCount: compactedGapGridData.chords.length,
      finalGridCount: finalGridData.chords.length,
      gapWindows,
      silentRunWindows,
      tempoChangeWindows,
      leadingSilenceWindow,
      sampleBefore: gridData.chords.slice(0, 80),
      sampleAfter: finalGridData.chords.slice(0, 80),
    });
  }

  return finalGridData;
};
