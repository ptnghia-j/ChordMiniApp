import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import { average, getBeatDurationsAroundWindow, getConsecutiveBeatDurations, getCyclicShiftDistance, isSilentChord } from './gridShared';
import { ChordGridData, VisualCompactionWindow } from './gridTypes';

export function hasNaturalLeadingSilenceWithOffset(
  runEnd: number,
  existingLeadingOffset: number,
  timeSignature: number = 4
): boolean {
  if (existingLeadingOffset <= 0) {
    return false;
  }

  const naturalLeadingSilenceRun = Math.max(0, runEnd - Math.max(0, existingLeadingOffset));
  const naturalSilenceThreshold = Math.max(1, timeSignature - 1);
  return naturalLeadingSilenceRun >= naturalSilenceThreshold;
}

function isSteadyBeatMeasure(durations: number[]): boolean {
  if (durations.length === 0) {
    return false;
  }

  const meanDuration = average(durations);
  if (meanDuration <= 0) {
    return false;
  }

  return durations.every(
    (duration) =>
      Math.abs(duration - meanDuration) <= meanDuration * GRID_ALIGNMENT_CONFIG.tempo.steadyToleranceRatio
  );
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
  const fallbackStep = nearbyDurations.length > 0
    ? average(nearbyDurations)
    : GRID_ALIGNMENT_CONFIG.padding.fallbackBeatDurationSeconds;

  const startTime = previousNumericBeat ?? 0;
  const endTime =
    nextNumericBeat !== null && nextNumericBeat > startTime
      ? nextNumericBeat
      : startTime + (fallbackStep * (extraCount + 1));
  const step = (endTime - startTime) / (extraCount + 1);

  return Array.from({ length: extraCount }, (_, index) => {
    const candidate = startTime + (step * (index + 1));
    return Number.isFinite(candidate) ? candidate : null;
  });
}

function findTempoChangeBoundaries(
  beats: (number | null)[],
  timeSignature: number
): number[] {
  const boundaries: number[] = [];
  const confirmationBeats = Math.max(GRID_ALIGNMENT_CONFIG.tempo.minConfirmationBeats, timeSignature);

  for (let index = confirmationBeats; index <= beats.length - confirmationBeats - 1; index += 1) {
    const previousDurations = getConsecutiveBeatDurations(beats, index - confirmationBeats, confirmationBeats);
    const nextDurations = getConsecutiveBeatDurations(beats, index, confirmationBeats);

    if (previousDurations.length !== confirmationBeats || nextDurations.length !== confirmationBeats) {
      continue;
    }

    if (!isSteadyBeatMeasure(previousDurations) || !isSteadyBeatMeasure(nextDurations)) {
      continue;
    }

    const previousAverage = average(previousDurations);
    const nextAverage = average(nextDurations);
    if (previousAverage <= 0 || nextAverage <= 0) {
      continue;
    }

    const changeThresholdRatio = GRID_ALIGNMENT_CONFIG.tempo.changeThresholdRatio;
    const becameFaster = nextDurations.every((duration) => duration <= previousAverage / changeThresholdRatio);
    const becameSlower = nextDurations.every((duration) => duration >= previousAverage * changeThresholdRatio);

    if (!becameFaster && !becameSlower) {
      continue;
    }

    // `index` is already the first beat in the new tempo segment because
    // previousDurations cover [index-confirmationBeats, index) and
    // nextDurations cover [index, index+confirmationBeats). Using index+1
    // shifts compaction one beat late.
    const boundaryIndex = index;
    const previousBoundary = boundaries[boundaries.length - 1];
    if (previousBoundary !== undefined && boundaryIndex - previousBoundary < timeSignature) {
      continue;
    }

    boundaries.push(boundaryIndex);
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

  const {
    maxChordStartsToScore,
    primaryStartWeight,
    descendingWeightStart,
    minWeight,
    extraBeatPenalty,
  } = GRID_ALIGNMENT_CONFIG.leadingExpansion;

  return chordStartIndices.slice(0, maxChordStartsToScore).reduce((score, chordStartIndex, order) => {
    const visualIndex = chordStartIndex + extraBeats;
    const modulo = visualIndex % timeSignature;
    const distanceToDownbeat = Math.min(modulo, (timeSignature - modulo) % timeSignature);
    const weight = order === 0
      ? primaryStartWeight
      : Math.max(minWeight, descendingWeightStart - (order * 2));

    if (distanceToDownbeat === 0) {
      return score + weight;
    }

    return score - (distanceToDownbeat * weight);
  }, -extraBeats * extraBeatPenalty);
}

function buildSilentRunWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): VisualCompactionWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length === 0) {
    return [];
  }

  const minSilentRunLength = Math.max(GRID_ALIGNMENT_CONFIG.silentRun.minLengthFloor, timeSignature - 1);
  const windows: VisualCompactionWindow[] = [];
  let index = 0;

  while (index < chordGridData.chords.length) {
    if (!isSilentChord(chordGridData.chords[index])) {
      index += 1;
      continue;
    }

    let runEnd = index;
    while (runEnd < chordGridData.chords.length && isSilentChord(chordGridData.chords[runEnd])) {
      runEnd += 1;
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
      oldIndex += 1;
      newIndex += 1;

      if (activeWindow && oldIndex >= activeWindow.endIndex) {
        windowIndex += 1;
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
      for (let extra = 0; extra < extraCount; extra += 1) {
        nextChords.push('');
        nextBeats.push(null);
        newIndex += 1;
      }
    }

    for (let offset = 0; offset < copiedCount; offset += 1) {
      const sourceIndex = activeWindow.startIndex + offset;
      nextChords.push(chordGridData.chords[sourceIndex]);
      nextBeats.push(chordGridData.beats[sourceIndex] ?? null);
      oldToNewVisualIndex.set(sourceIndex, newIndex);
      newIndex += 1;
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
      for (let extra = 0; extra < extraCount; extra += 1) {
        nextChords.push(fillerChord || 'N.C.');
        nextBeats.push(extraBeatTimestamps[extra] ?? null);
        newIndex += 1;
      }
    } else {
      const collapsedTargetIndex = Math.max(0, newIndex - 1);
      for (let offset = copiedCount; offset < windowLength; offset += 1) {
        oldToNewVisualIndex.set(activeWindow.startIndex + offset, collapsedTargetIndex);
      }
    }

    oldIndex = activeWindow.endIndex;
    windowIndex += 1;
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

  const gapThreshold = Math.max(
    beatDuration * GRID_ALIGNMENT_CONFIG.gap.thresholdBeatsMultiplier,
    GRID_ALIGNMENT_CONFIG.gap.minGapSeconds
  );
  const onsetLeadIn = beatDuration * GRID_ALIGNMENT_CONFIG.gap.onsetLeadInBeatsMultiplier;
  const releaseTail = Math.min(
    beatDuration * GRID_ALIGNMENT_CONFIG.gap.releaseTailBeatsMultiplier,
    GRID_ALIGNMENT_CONFIG.gap.maxReleaseTailSeconds
  );
  const windows: VisualCompactionWindow[] = [];

  for (let index = 1; index < orderedChords.length; index += 1) {
    const previousChord = orderedChords[index - 1];
    const nextChord = orderedChords[index];
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
): VisualCompactionWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature * 3) {
    return [];
  }

  const boundaries = findTempoChangeBoundaries(chordGridData.beats, timeSignature);
  const windows = boundaries.flatMap((boundaryIndex): VisualCompactionWindow[] => {
    if (boundaryIndex <= 1 || boundaryIndex > chordGridData.chords.length) {
      return [];
    }

    const trailingChord = chordGridData.chords[boundaryIndex - 1];
    if (isSilentChord(trailingChord)) {
      return [];
    }

    let trailingStart = boundaryIndex - 1;
    while (trailingStart > 0 && chordGridData.chords[trailingStart - 1] === trailingChord) {
      trailingStart -= 1;
    }

    let trailingEnd = boundaryIndex;
    while (trailingEnd < chordGridData.chords.length && chordGridData.chords[trailingEnd] === trailingChord) {
      trailingEnd += 1;
    }

    const maxShrink = Math.min(GRID_ALIGNMENT_CONFIG.tempo.maxShrinkBeats, timeSignature - 1);
    const maxWindowLength = Math.min(trailingEnd - trailingStart, maxShrink + 1);
    const startIndex = Math.max(trailingStart, trailingEnd - maxWindowLength);
    const windowEnd = trailingEnd;

    if (windowEnd - startIndex < 2) {
      return [];
    }

    return [{
      startIndex,
      endIndex: windowEnd,
      mode: 'shrink_only',
      source: 'tempo',
    }];
  });

  return windows;
}

function buildLeadingSilenceExpansionWindow(
  chordGridData: ChordGridData,
  sortedFollowupFlags: VisualCompactionWindow[],
  timeSignature: number,
  existingLeadingOffset: number
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

  // Guardrail: skip leading expansion only when there is *natural* leading
  // silence in addition to the artificial global offset. For offset-only
  // silence (runEnd === existingLeadingOffset), expansion can still be useful.
  if (hasNaturalLeadingSilenceWithOffset(runEnd, existingLeadingOffset, timeSignature)) {
    return null;
  }

  const nextFlagStart = sortedFollowupFlags[0]?.startIndex ?? chordGridData.chords.length;
  if (nextFlagStart <= runEnd) {
    return null;
  }

  const maxExtraBeats = Math.min(GRID_ALIGNMENT_CONFIG.leadingExpansion.maxExtraBeats, timeSignature - 1);
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

    if (candidateScore > bestScore + GRID_ALIGNMENT_CONFIG.leadingExpansion.scoreImprovementThreshold) {
      bestScore = candidateScore;
      bestExtraBeats = extraBeats;
    }
  }

  if (bestExtraBeats === 0) {
    return null;
  }

  const currentModulo = runEnd % timeSignature;
  const selectedWindow: VisualCompactionWindow = {
    startIndex: 0,
    endIndex: runEnd,
    targetModulo: (currentModulo + bestExtraBeats) % timeSignature,
    mode: 'expand_only',
    source: 'leading_silence',
  };

  return selectedWindow;
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

    if (window.source === 'tempo') {
      return { ...window, targetModulo: 0 };
    }

    if (!hasMusicalContent) {
      return { ...window, targetModulo: 0 };
    }

    const preferredModulo = window.endIndex % timeSignature;
    const scoredCandidates = Array.from({ length: timeSignature }, (_, shift) => ({
      shift,
      score: scoreLeadingExpansion(segmentChords, 0, segmentChords.length, timeSignature, shift),
    }));
    const bestScore = Math.max(...scoredCandidates.map((candidate) => candidate.score));
    const bestCandidates = scoredCandidates.filter(
      (candidate) => candidate.score >= bestScore - GRID_ALIGNMENT_CONFIG.leadingExpansion.scoreImprovementThreshold
    );

    const chosenCandidate = bestCandidates.reduce((best, current) => {
      const currentDistance = getCyclicShiftDistance(current.shift, preferredModulo, timeSignature);
      const bestDistance = getCyclicShiftDistance(best.shift, preferredModulo, timeSignature);

      if (currentDistance < bestDistance) {
        return current;
      }
      if (currentDistance === bestDistance) {
        if (current.score > best.score) {
          return current;
        }
        if (current.score === best.score && current.shift < best.shift) {
          return current;
        }
      }
      return best;
    });

    return {
      ...window,
      targetModulo: chosenCandidate.shift,
    };
  });
}

export function runVisualCompactionPipeline(params: {
  chordGridData: ChordGridData;
  chordIntervals: Array<{ start?: number; end?: number; chord?: string }>;
  beatTimes: number[];
  timeSignature: number;
  beatDuration: number;
  enabled: boolean;
  suppressLeadingSilenceExpansion?: boolean;
}): ChordGridData {
  const {
    chordGridData,
    chordIntervals,
    beatTimes,
    timeSignature,
    beatDuration,
    enabled,
    suppressLeadingSilenceExpansion = false,
  } = params;

  const gapWindows = resolveWindowTargetModulos(
    chordGridData,
    buildGapCompactionWindows(
      chordIntervals,
      beatTimes,
      chordGridData.shiftCount + chordGridData.paddingCount,
      beatDuration
    ),
    timeSignature
  );

  const compactedGapGridData = compactVisualWindows(
    chordGridData,
    gapWindows,
    timeSignature,
    enabled
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
  const followupFlags = [...silentRunWindows, ...tempoChangeWindows].sort((a, b) => a.startIndex - b.startIndex);
  const leadingSilenceWindow = suppressLeadingSilenceExpansion
    ? null
    : buildLeadingSilenceExpansionWindow(
        compactedGapGridData,
        followupFlags,
        timeSignature,
        chordGridData.paddingCount + chordGridData.shiftCount
      );

  const finalGridData = compactVisualWindows(
    compactedGapGridData,
    leadingSilenceWindow ? [leadingSilenceWindow, ...followupFlags] : followupFlags,
    timeSignature,
    enabled
  );

  return finalGridData;
}
