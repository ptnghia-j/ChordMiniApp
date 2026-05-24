import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import {
  average,
  getBeatDurationsAroundWindow,
  getConsecutiveBeatDurations,
  isSilentChord,
} from './gridShared';
import { AudioMappingItem, ChordGridData } from './gridTypes';

type AlignmentWindowSource =
  | 'gap'
  | 'silence'
  | 'tempo'
  | 'leading_silence'
  | 'phrase_phase'
  | 'post_tempo_phase'
  | 'phase_anchor';

type AlignmentWindow = {
  startIndex: number;
  endIndex: number;
  source: AlignmentWindowSource;
  minAdjustment: number;
  maxAdjustment: number;
  adjustments?: number[];
};

type AlignmentDecision = AlignmentWindow & {
  adjustment: number;
};

type SolverState = {
  score: number;
  delta: number;
  decisions: AlignmentDecision[];
};

type PhrasePhaseCandidate = AlignmentWindow & {
  downbeatGain: number;
  correctedDownbeatShare: number;
};

export type AlignmentQualityMetrics = {
  chordStartCount: number;
  downbeatStarts: number;
  beatStartCounts: number[];
  editDistance: number;
  score: number;
};

export type AlignmentSolverResult = {
  gridData: ChordGridData;
  decisions: AlignmentDecision[];
  metrics: AlignmentQualityMetrics;
};

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

function getTempoChangeDirection(
  previousAverage: number,
  nextDurations: number[]
): 'faster' | 'slower' | null {
  if (previousAverage <= 0 || nextDurations.length === 0) {
    return null;
  }

  const changeThresholdRatio = GRID_ALIGNMENT_CONFIG.tempo.changeThresholdRatio;
  const becameFaster = nextDurations.every((duration) => duration <= previousAverage / changeThresholdRatio);
  const becameSlower = nextDurations.every((duration) => duration >= previousAverage * changeThresholdRatio);

  if (becameFaster) {
    return 'faster';
  }
  if (becameSlower) {
    return 'slower';
  }
  return null;
}

function findRampedTempoBoundary(params: {
  beats: (number | null)[];
  index: number;
  previousAverage: number;
  confirmationBeats: number;
  timeSignature: number;
}): number | null {
  const {
    beats,
    index,
    previousAverage,
    confirmationBeats,
    timeSignature,
  } = params;
  const maxTransitionBeats = Math.max(
    1,
    Math.min(GRID_ALIGNMENT_CONFIG.tempo.maxTransitionBeats, timeSignature)
  );
  const changeThresholdRatio = GRID_ALIGNMENT_CONFIG.tempo.changeThresholdRatio;

  for (let transitionBeats = 1; transitionBeats <= maxTransitionBeats; transitionBeats += 1) {
    const candidateIndex = index + transitionBeats;
    if (candidateIndex > beats.length - confirmationBeats - 1) {
      break;
    }

    const nextDurations = getConsecutiveBeatDurations(beats, candidateIndex, confirmationBeats);
    if (nextDurations.length !== confirmationBeats || !isSteadyBeatMeasure(nextDurations)) {
      continue;
    }

    const direction = getTempoChangeDirection(previousAverage, nextDurations);
    if (!direction) {
      continue;
    }

    const transitionDurations = getConsecutiveBeatDurations(beats, index, transitionBeats);
    if (transitionDurations.length !== transitionBeats) {
      continue;
    }

    const hasCrossedTempoThreshold = direction === 'faster'
      ? transitionDurations.some((duration) => duration <= previousAverage / changeThresholdRatio)
      : transitionDurations.some((duration) => duration >= previousAverage * changeThresholdRatio);

    if (hasCrossedTempoThreshold) {
      return candidateIndex;
    }
  }

  return null;
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
    if (!isSteadyBeatMeasure(previousDurations)) {
      continue;
    }

    const previousAverage = average(previousDurations);
    if (previousAverage <= 0) {
      continue;
    }

    const adjacentBoundary = isSteadyBeatMeasure(nextDurations) &&
      getTempoChangeDirection(previousAverage, nextDurations)
      ? index
      : null;
    const rampedBoundary = adjacentBoundary === null
      ? findRampedTempoBoundary({
          beats,
          index,
          previousAverage,
          confirmationBeats,
          timeSignature,
        })
      : null;
    const boundaryIndex = adjacentBoundary ?? rampedBoundary;

    if (boundaryIndex === null) {
      continue;
    }

    const previousBoundary = boundaries[boundaries.length - 1];
    if (previousBoundary !== undefined && boundaryIndex - previousBoundary < timeSignature) {
      continue;
    }

    boundaries.push(boundaryIndex);
  }

  return boundaries;
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

function getMusicalChordStartIndices(
  chords: string[],
  segmentStart: number,
  segmentEnd: number
): number[] {
  const starts: number[] = [];

  for (let index = segmentStart; index < segmentEnd; index += 1) {
    const chord = chords[index];
    if (isSilentChord(chord)) {
      continue;
    }

    const previousChord = index > segmentStart ? chords[index - 1] : '';
    if (index === segmentStart || isSilentChord(previousChord) || previousChord !== chord) {
      starts.push(index);
    }
  }

  return starts;
}

function countStartModulos(
  starts: number[],
  timeSignature: number,
  adjustment = 0
): number[] {
  const counts = Array(timeSignature).fill(0);

  starts.forEach((startIndex) => {
    const modulo = (startIndex + adjustment + (timeSignature * 1000)) % timeSignature;
    counts[modulo] += 1;
  });

  return counts;
}

function getChordRunLength(chords: string[], startIndex: number, segmentEnd: number): number {
  const chord = chords[startIndex];
  let runEnd = startIndex + 1;
  while (runEnd < segmentEnd && chords[runEnd] === chord) {
    runEnd += 1;
  }
  return runEnd - startIndex;
}

function scoreStartModulo(
  modulo: number,
  timeSignature: number,
  weight: number
): number {
  if (modulo === 0) {
    return GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.downbeatReward * weight;
  }

  if (timeSignature === 4) {
    const penalty = modulo === 1 || modulo === 3
      ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.nearDownbeatPenalty
      : GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.weakBeatPenalty;
    return -penalty * weight;
  }

  const distance = Math.min(modulo, timeSignature - modulo);
  return -distance * GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.weakBeatPenalty * weight;
}

function scoreSegment(
  chords: string[],
  segmentStart: number,
  segmentEnd: number,
  delta: number,
  timeSignature: number
): number {
  const starts = getMusicalChordStartIndices(chords, segmentStart, segmentEnd);
  if (starts.length === 0) {
    return 0;
  }

  return starts.reduce((score, startIndex, order) => {
    const modulo = (startIndex + delta + timeSignature * 1000) % timeSignature;
    const runLength = getChordRunLength(chords, startIndex, segmentEnd);
    const firstStartWeight = order === 0 ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.firstStartBonus : 0;
    const longRunWeight = runLength >= timeSignature
      ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.longRunStartBonus
      : 0;
    const weight = 1 + firstStartWeight + longRunWeight;

    return score + scoreStartModulo(modulo, timeSignature, weight);
  }, 0);
}

function scoreGrid(
  chords: string[],
  timeSignature: number,
  editDistance = 0
): AlignmentQualityMetrics {
  const starts = getMusicalChordStartIndices(chords, 0, chords.length);
  const beatStartCounts = countStartModulos(starts, timeSignature);

  const alignmentScore = starts.reduce((score, startIndex) => {
    const modulo = startIndex % timeSignature;
    return score + scoreStartModulo(modulo, timeSignature, 1);
  }, 0);

  return {
    chordStartCount: starts.length,
    downbeatStarts: beatStartCounts[0] ?? 0,
    beatStartCounts,
    editDistance,
    score: alignmentScore - (editDistance * GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.editPenalty),
  };
}

function addWindow(
  windows: AlignmentWindow[],
  candidate: AlignmentWindow
): void {
  if (candidate.endIndex <= candidate.startIndex) {
    return;
  }
  if (candidate.minAdjustment === 0 && candidate.maxAdjustment === 0) {
    return;
  }

  const overlapsExisting = windows.some((window) => (
    candidate.startIndex < window.endIndex && candidate.endIndex > window.startIndex
  ));
  if (overlapsExisting) {
    return;
  }

  windows.push(candidate);
}

function buildLeadingSilenceWindow(
  chordGridData: ChordGridData,
  timeSignature: number,
  suppressLeadingSilenceExpansion: boolean
): AlignmentWindow | null {
  if (chordGridData.chords.length === 0) {
    return null;
  }

  let runEnd = 0;
  while (runEnd < chordGridData.chords.length && isSilentChord(chordGridData.chords[runEnd])) {
    runEnd += 1;
  }

  if (runEnd === 0 || runEnd >= chordGridData.chords.length) {
    return null;
  }

  const maxAdjustment = Math.min(
    GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.maxLeadingExpansionBeats,
    timeSignature - 1
  );
  const maxShrink = Math.min(maxAdjustment, runEnd - 1);

  return {
    startIndex: 0,
    endIndex: runEnd,
    source: 'leading_silence',
    minAdjustment: suppressLeadingSilenceExpansion ? -maxShrink : 0,
    maxAdjustment: suppressLeadingSilenceExpansion ? 0 : maxAdjustment,
  };
}

function buildSilentRunWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): AlignmentWindow[] {
  const minSilentRunLength = Math.max(GRID_ALIGNMENT_CONFIG.silentRun.minLengthFloor, timeSignature - 1);
  const maxExpansion = Math.min(GRID_ALIGNMENT_CONFIG.silentRun.maxExpansionBeats, timeSignature - 1);
  const windows: AlignmentWindow[] = [];
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
    const windowLength = runEnd - index;

    if (precededByMusic && followedByMusic && windowLength >= minSilentRunLength) {
      windows.push({
        startIndex: index,
        endIndex: runEnd,
        source: 'silence',
        minAdjustment: -(windowLength - 1),
        maxAdjustment: maxExpansion,
      });
    }

    index = runEnd;
  }

  return windows;
}

function buildGapWindows(params: {
  chordGridData: ChordGridData;
  chordIntervals: Array<{ start?: number; end?: number; chord?: string }>;
  beatTimes: number[];
  beatDuration: number;
}): AlignmentWindow[] {
  const {
    chordGridData,
    chordIntervals,
    beatTimes,
    beatDuration,
  } = params;
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
  const visualOffset = chordGridData.paddingCount + chordGridData.shiftCount;
  const windows: AlignmentWindow[] = [];

  for (let index = 1; index < orderedChords.length; index += 1) {
    const previousChord = orderedChords[index - 1];
    const nextChord = orderedChords[index];
    const gapDuration = (nextChord.start as number) - (previousChord.end as number);

    if (!Number.isFinite(gapDuration) || gapDuration < gapThreshold) {
      continue;
    }

    const gapStartBeatIndex = findFirstBeatIndexAtOrAfter(beatTimes, (previousChord.end as number) + releaseTail);
    const resumeBeatIndex = findFirstBeatIndexAtOrAfter(beatTimes, (nextChord.start as number) - onsetLeadIn);
    const startIndex = visualOffset + gapStartBeatIndex;
    const endIndex = visualOffset + resumeBeatIndex;
    const windowLength = endIndex - startIndex;

    if (gapStartBeatIndex < beatTimes.length && resumeBeatIndex <= beatTimes.length && windowLength >= 2) {
      windows.push({
        startIndex,
        endIndex,
        source: 'gap',
        minAdjustment: -(windowLength - 1),
        maxAdjustment: 0,
      });
    }
  }

  return windows;
}

function buildTempoWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): AlignmentWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature * 3) {
    return [];
  }

  const windows: AlignmentWindow[] = [];
  const maxShrink = Math.min(GRID_ALIGNMENT_CONFIG.tempo.maxShrinkBeats, timeSignature - 1);

  findTempoChangeBoundaries(chordGridData.beats, timeSignature).forEach((boundaryIndex) => {
    if (boundaryIndex <= 1 || boundaryIndex > chordGridData.chords.length) {
      return;
    }

    const trailingChord = chordGridData.chords[boundaryIndex - 1];
    const leadingChord = chordGridData.chords[boundaryIndex];
    let runStart = boundaryIndex;
    let runEnd = boundaryIndex;

    if (!isSilentChord(trailingChord)) {
      runStart = boundaryIndex - 1;
      while (runStart > 0 && chordGridData.chords[runStart - 1] === trailingChord) {
        runStart -= 1;
      }
      runEnd = boundaryIndex;
      while (runEnd < chordGridData.chords.length && chordGridData.chords[runEnd] === trailingChord) {
        runEnd += 1;
      }
    } else if (!isSilentChord(leadingChord)) {
      runStart = boundaryIndex;
      runEnd = boundaryIndex + 1;
      while (runEnd < chordGridData.chords.length && chordGridData.chords[runEnd] === leadingChord) {
        runEnd += 1;
      }
    } else {
      return;
    }

    const windowLength = runEnd - runStart;
    if (windowLength < 2) {
      return;
    }

    const maxWindowLength = Math.min(windowLength, maxShrink + 1);
    const startIndex = Math.max(runStart, runEnd - maxWindowLength);
    const effectiveLength = runEnd - startIndex;

    windows.push({
      startIndex,
      endIndex: runEnd,
      source: 'tempo',
      minAdjustment: -Math.min(maxShrink, effectiveLength - 1),
      maxAdjustment: 0,
    });
  });

  return windows;
}

function scorePhrasePhaseCandidate(params: {
  chords: string[];
  boundaryIndex: number;
  timeSignature: number;
  adjustment: number;
  requirePreviousStability?: boolean;
  source?: 'phrase_phase' | 'post_tempo_phase';
}): PhrasePhaseCandidate | null {
  const {
    chords,
    boundaryIndex,
    timeSignature,
    adjustment,
    requirePreviousStability = true,
    source = 'phrase_phase',
  } = params;
  const config = GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.phrasePhase;
  const segmentEnd = Math.min(chords.length, boundaryIndex + config.lookaheadBeats);
  const starts = getMusicalChordStartIndices(chords, boundaryIndex, segmentEnd);

  if (starts.length < config.minStarts) {
    return null;
  }

  const currentCounts = countStartModulos(starts, timeSignature);
  const correctedCounts = countStartModulos(starts, timeSignature, adjustment);
  const currentDownbeats = currentCounts[0] ?? 0;
  const correctedDownbeats = correctedCounts[0] ?? 0;
  const strongestCorrectedOffDownbeat = Math.max(0, ...correctedCounts.slice(1));
  const currentDownbeatShare = currentDownbeats / starts.length;
  const correctedDownbeatShare = correctedDownbeats / starts.length;
  const downbeatGain = correctedDownbeats - currentDownbeats;
  const minCorrectedDownbeatShare = source === 'post_tempo_phase'
    ? config.postTempoMinCorrectedDownbeatShare
    : config.minCorrectedDownbeatShare;

  if (
    currentDownbeatShare > config.maxCurrentDownbeatShare ||
    correctedDownbeatShare < minCorrectedDownbeatShare ||
    correctedDownbeats <= strongestCorrectedOffDownbeat ||
    downbeatGain < config.minDownbeatGain
  ) {
    return null;
  }

  if (requirePreviousStability) {
    const previousStart = Math.max(0, boundaryIndex - config.lookbehindBeats);
    const previousStarts = getMusicalChordStartIndices(chords, previousStart, boundaryIndex);
    if (previousStarts.length >= config.minPreviousStarts) {
      const previousCounts = countStartModulos(previousStarts, timeSignature);
      const previousDownbeatShare = (previousCounts[0] ?? 0) / previousStarts.length;
      if (previousDownbeatShare < config.minPreviousDownbeatShare) {
        return null;
      }
    }
  }

  let runStart = boundaryIndex - 1;
  const anchorChord = chords[runStart];
  if (runStart < 0 || isSilentChord(anchorChord)) {
    return null;
  }

  while (runStart > 0 && chords[runStart - 1] === anchorChord) {
    runStart -= 1;
  }

  const runLength = boundaryIndex - runStart;
  const maxAdjustment = Math.min(config.maxAdjustmentBeats, timeSignature - 1);
  if (Math.abs(adjustment) > maxAdjustment) {
    return null;
  }

  // Positive phase shifts would normally be implemented by inserting filler
  // cells before the next phrase. Those inserted cells do not have source audio
  // mappings, so they are not clickable and the beat animation skips them. Use
  // the equivalent modulo shrink instead: in 4/4, +1 phase is the same grid
  // alignment as removing 3 beats from the repeated anchor run.
  const visualAdjustment = adjustment > 0 ? adjustment - timeSignature : adjustment;
  const editWindowLength = Math.abs(visualAdjustment) + 1;
  if (runLength < editWindowLength) {
    return null;
  }

  const maxContextualShrink = Math.min(timeSignature - 1, runLength - 1);
  const startIndex = boundaryIndex - (maxContextualShrink + 1);

  const candidate: PhrasePhaseCandidate = {
    startIndex,
    endIndex: boundaryIndex,
    source,
    minAdjustment: Math.min(visualAdjustment, -maxContextualShrink),
    maxAdjustment: Math.max(0, visualAdjustment),
    adjustments: source === 'post_tempo_phase'
      ? [visualAdjustment, 0]
      : undefined,
    downbeatGain,
    correctedDownbeatShare,
  };

  return candidate;
}

function buildPhrasePhaseCandidateForBoundary(params: {
  chords: string[];
  boundaryIndex: number;
  timeSignature: number;
  requirePreviousStability?: boolean;
  source?: 'phrase_phase' | 'post_tempo_phase';
}): PhrasePhaseCandidate | null {
  const config = GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.phrasePhase;
  const adjustmentCandidates = Array.from(
    { length: config.maxAdjustmentBeats * 2 },
    (_, candidateIndex) => candidateIndex < config.maxAdjustmentBeats
      ? -(candidateIndex + 1)
      : candidateIndex - config.maxAdjustmentBeats + 1
  );

  return adjustmentCandidates
    .map((adjustment) => scorePhrasePhaseCandidate({
      ...params,
      adjustment,
    }))
    .filter((candidate): candidate is PhrasePhaseCandidate => candidate !== null)
    .sort((a, b) => (
      b.downbeatGain - a.downbeatGain ||
      b.correctedDownbeatShare - a.correctedDownbeatShare
    ))[0] ?? null;
}

function buildPhrasePhaseWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): AlignmentWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature * 8) {
    return [];
  }

  const config = GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.phrasePhase;
  const candidates: PhrasePhaseCandidate[] = [];

  let index = Math.max(config.minBoundaryBeats, 1);
  while (index < chordGridData.chords.length - timeSignature) {
    const previousChord = chordGridData.chords[index - 1];
    const nextChord = chordGridData.chords[index];
    const isBoundary =
      !isSilentChord(previousChord) &&
      !isSilentChord(nextChord) &&
      previousChord !== nextChord;

    if (!isBoundary) {
      index += 1;
      continue;
    }

    const bestCandidate = buildPhrasePhaseCandidateForBoundary({
      chords: chordGridData.chords,
      boundaryIndex: index,
      timeSignature,
    });

    if (bestCandidate) {
      candidates.push(bestCandidate);
    }

    index += 1;
  }

  return candidates
    .sort((a, b) => (
      b.downbeatGain - a.downbeatGain ||
      b.correctedDownbeatShare - a.correctedDownbeatShare ||
      a.startIndex - b.startIndex
    ))
    .reduce<AlignmentWindow[]>((selected, candidate) => {
      if (selected.length >= config.maxWindows) {
        return selected;
      }

      const tooCloseToExisting = selected.some((window) => (
        candidate.startIndex < window.endIndex + config.minWindowSpacingBeats &&
        candidate.endIndex > window.startIndex - config.minWindowSpacingBeats
      ));
      if (!tooCloseToExisting) {
        selected.push(candidate);
      }
      return selected;
    }, [])
    .sort((a, b) => a.startIndex - b.startIndex);
}

function buildPostTempoPhrasePhaseWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): AlignmentWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature * 8) {
    return [];
  }

  const config = GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.phrasePhase;
  return findTempoChangeBoundaries(chordGridData.beats, timeSignature)
    .map((tempoBoundaryIndex) => {
      const searchStart = Math.max(
        config.minBoundaryBeats,
        tempoBoundaryIndex - config.postTempoLookbehindBeats
      );
      const searchEnd = Math.min(
        chordGridData.chords.length - timeSignature,
        tempoBoundaryIndex + config.postTempoLookaheadBeats
      );
      const candidates: PhrasePhaseCandidate[] = [];

      for (let index = searchStart; index <= searchEnd; index += 1) {
        const previousChord = chordGridData.chords[index - 1];
        const nextChord = chordGridData.chords[index];
        const isBoundary =
          !isSilentChord(previousChord) &&
          !isSilentChord(nextChord) &&
          previousChord !== nextChord;

        if (!isBoundary) {
          continue;
        }

        const candidate = buildPhrasePhaseCandidateForBoundary({
          chords: chordGridData.chords,
          boundaryIndex: index,
          timeSignature,
          requirePreviousStability: false,
          source: 'post_tempo_phase',
        });

        const usesExpansionEquivalentShrink = candidate &&
          Math.abs(candidate.minAdjustment) > config.maxAdjustmentBeats;
        if (usesExpansionEquivalentShrink) {
          candidates.push(candidate);
        }
      }

      return candidates.sort((a, b) => (
        b.correctedDownbeatShare - a.correctedDownbeatShare ||
        b.downbeatGain - a.downbeatGain ||
        a.startIndex - b.startIndex
      ))[0] ?? null;
    })
    .filter((candidate): candidate is PhrasePhaseCandidate => candidate !== null)
    .reduce<AlignmentWindow[]>((selected, candidate) => {
      if (selected.length >= config.maxWindows) {
        return selected;
      }

      const overlapsExisting = selected.some((window) => (
        candidate.startIndex < window.endIndex && candidate.endIndex > window.startIndex
      ));
      if (!overlapsExisting) {
        selected.push(candidate);
      }
      return selected;
    }, [])
    .sort((a, b) => a.startIndex - b.startIndex);
}

function buildPhaseAnchorWindows(
  chordGridData: ChordGridData,
  timeSignature: number
): AlignmentWindow[] {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature * 8) {
    return [];
  }

  const config = GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.phrasePhase;
  const candidates: AlignmentWindow[] = [];
  const maxShrink = Math.min(config.maxAnchorShrinkBeats, timeSignature - 1);

  for (
    let index = Math.max(config.minBoundaryBeats, 1);
    index < chordGridData.chords.length - timeSignature;
    index += 1
  ) {
    const previousChord = chordGridData.chords[index - 1];
    const nextChord = chordGridData.chords[index];
    const isBoundary =
      !isSilentChord(previousChord) &&
      !isSilentChord(nextChord) &&
      previousChord !== nextChord;

    if (!isBoundary) {
      continue;
    }
    if (index % timeSignature !== 0) {
      continue;
    }

    const starts = getMusicalChordStartIndices(
      chordGridData.chords,
      index,
      Math.min(chordGridData.chords.length, index + config.lookaheadBeats)
    );
    if (starts.length < config.minStarts) {
      continue;
    }

    const counts = countStartModulos(starts, timeSignature);
    const downbeatShare = (counts[0] ?? 0) / starts.length;
    if (downbeatShare < config.minAnchorDownbeatShare) {
      continue;
    }

    let runStart = index - 1;
    const anchorChord = chordGridData.chords[runStart];
    if (runStart < 0 || isSilentChord(anchorChord)) {
      continue;
    }

    while (runStart > 0 && chordGridData.chords[runStart - 1] === anchorChord) {
      runStart -= 1;
    }

    const runLength = index - runStart;
    const usableShrink = Math.min(maxShrink, runLength - 1);
    if (usableShrink <= 0) {
      continue;
    }

    const endIndex = index;
    const startIndex = index - (usableShrink + 1);
    candidates.push({
      startIndex,
      endIndex,
      source: 'phase_anchor',
      minAdjustment: -usableShrink,
      maxAdjustment: 0,
    });
  }

  return candidates
    .sort((a, b) => a.startIndex - b.startIndex)
    .reduce<AlignmentWindow[]>((selected, candidate) => {
      if (selected.length >= config.maxAnchorWindows) {
        return selected;
      }

      const tooCloseToExisting = selected.some((window) => (
        candidate.startIndex < window.endIndex + config.minWindowSpacingBeats &&
        candidate.endIndex > window.startIndex - config.minWindowSpacingBeats
      ));
      if (!tooCloseToExisting) {
        selected.push(candidate);
      }
      return selected;
    }, []);
}

function buildAlignmentWindows(params: {
  chordGridData: ChordGridData;
  chordIntervals: Array<{ start?: number; end?: number; chord?: string }>;
  beatTimes: number[];
  timeSignature: number;
  beatDuration: number;
  suppressLeadingSilenceExpansion: boolean;
  disableLeadingSilenceWindow: boolean;
}): AlignmentWindow[] {
  const {
    chordGridData,
    chordIntervals,
    beatTimes,
    timeSignature,
    beatDuration,
    suppressLeadingSilenceExpansion,
    disableLeadingSilenceWindow,
  } = params;
  const windows: AlignmentWindow[] = [];
  const followupWindows = [
    ...buildGapWindows({ chordGridData, chordIntervals, beatTimes, beatDuration }),
    ...buildSilentRunWindows(chordGridData, timeSignature),
    ...buildTempoWindows(chordGridData, timeSignature),
    ...buildPostTempoPhrasePhaseWindows(chordGridData, timeSignature),
    ...buildPhrasePhaseWindows(chordGridData, timeSignature),
    ...buildPhaseAnchorWindows(chordGridData, timeSignature),
  ].sort((a, b) => a.startIndex - b.startIndex);
  const leadingWindow = buildLeadingSilenceWindow(
    chordGridData,
    timeSignature,
    suppressLeadingSilenceExpansion
  );

  if (!disableLeadingSilenceWindow && leadingWindow && followupWindows.length > 0) {
    addWindow(windows, leadingWindow);
  }

  followupWindows.forEach((window) => addWindow(windows, window));

  return windows.sort((a, b) => a.startIndex - b.startIndex);
}

function getAdjustmentCandidates(window: AlignmentWindow): number[] {
  if (window.adjustments && window.adjustments.length > 0) {
    return [...new Set(window.adjustments)].sort((a, b) => a - b);
  }

  const candidates: number[] = [];
  for (let adjustment = window.minAdjustment; adjustment <= window.maxAdjustment; adjustment += 1) {
    candidates.push(adjustment);
  }
  return candidates;
}

function transitionPenalty(window: AlignmentWindow, adjustment: number): number {
  if (adjustment === 0) {
    return 0;
  }

  const basePenalty = window.source === 'leading_silence'
    ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.leadingExpansionPenalty
    : GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.editPenalty;
  return Math.abs(adjustment) * basePenalty;
}

function chooseBestStates(states: SolverState[]): SolverState[] {
  const bestByDelta = new Map<number, SolverState>();

  states.forEach((state) => {
    const currentBest = bestByDelta.get(state.delta);
    if (!currentBest || state.score > currentBest.score) {
      bestByDelta.set(state.delta, state);
    }
  });

  return [...bestByDelta.values()];
}

function solveWindowAdjustments(
  chordGridData: ChordGridData,
  windows: AlignmentWindow[],
  timeSignature: number
): AlignmentDecision[] {
  if (windows.length === 0) {
    return [];
  }

  let previousEnd = 0;
  let states: SolverState[] = [{ score: 0, delta: 0, decisions: [] }];

  windows.forEach((window) => {
    const nextStates: SolverState[] = [];

    states.forEach((state) => {
      const segmentScore = scoreSegment(
        chordGridData.chords,
        previousEnd,
        window.startIndex,
        state.delta,
        timeSignature
      );

      getAdjustmentCandidates(window).forEach((adjustment) => {
        nextStates.push({
          score: state.score + segmentScore - transitionPenalty(window, adjustment),
          delta: state.delta + adjustment,
          decisions: [
            ...state.decisions,
            { ...window, adjustment },
          ],
        });
      });
    });

    states = chooseBestStates(nextStates);
    previousEnd = window.endIndex;
  });

  const scoredFinalStates = states.map((state) => ({
    ...state,
    score: state.score + scoreSegment(
      chordGridData.chords,
      previousEnd,
      chordGridData.chords.length,
      state.delta,
      timeSignature
    ),
  }));

  return scoredFinalStates.reduce((best, current) => (
    current.score > best.score ? current : best
  )).decisions;
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

function applyAlignmentDecisions(
  chordGridData: ChordGridData,
  decisions: AlignmentDecision[]
): ChordGridData {
  const activeDecisions = decisions
    .filter((decision) => decision.adjustment !== 0)
    .sort((a, b) => a.startIndex - b.startIndex);

  if (activeDecisions.length === 0) {
    return chordGridData;
  }

  const nextChords: string[] = [];
  const nextBeats: (number | null)[] = [];
  const oldToNewVisualIndex = new Map<number, number>();
  let oldIndex = 0;
  let newIndex = 0;
  let decisionIndex = 0;

  while (oldIndex < chordGridData.chords.length) {
    const activeDecision = activeDecisions[decisionIndex];

    if (!activeDecision || oldIndex < activeDecision.startIndex || oldIndex >= activeDecision.endIndex) {
      nextChords.push(chordGridData.chords[oldIndex]);
      nextBeats.push(chordGridData.beats[oldIndex] ?? null);
      oldToNewVisualIndex.set(oldIndex, newIndex);
      oldIndex += 1;
      newIndex += 1;

      if (activeDecision && oldIndex >= activeDecision.endIndex) {
        decisionIndex += 1;
      }
      continue;
    }

    const windowLength = activeDecision.endIndex - activeDecision.startIndex;
    const targetWindowLength = Math.max(1, windowLength + activeDecision.adjustment);
    const copiedCount = Math.min(windowLength, targetWindowLength);
    const prependLeadingPadding =
      activeDecision.source === 'leading_silence' &&
      activeDecision.adjustment > 0;

    if (prependLeadingPadding) {
      const extraCount = targetWindowLength - windowLength;
      const extraBeatTimestamps = buildExpandedLeadingSilenceTimestamps(
        chordGridData.beats,
        activeDecision.startIndex,
        activeDecision.endIndex,
        extraCount
      );
      for (let extra = 0; extra < extraCount; extra += 1) {
        nextChords.push('');
        nextBeats.push(extraBeatTimestamps[extra] ?? null);
        newIndex += 1;
      }
    }

    for (let offset = 0; offset < copiedCount; offset += 1) {
      const sourceIndex = activeDecision.startIndex + offset;
      nextChords.push(chordGridData.chords[sourceIndex]);
      nextBeats.push(chordGridData.beats[sourceIndex] ?? null);
      oldToNewVisualIndex.set(sourceIndex, newIndex);
      newIndex += 1;
    }

    if (targetWindowLength > windowLength && !prependLeadingPadding) {
      const fillerChord = copiedCount > 0
        ? chordGridData.chords[activeDecision.startIndex + copiedCount - 1] || 'N.C.'
        : 'N.C.';
      for (let extra = 0; extra < targetWindowLength - windowLength; extra += 1) {
        nextChords.push(fillerChord);
        nextBeats.push(null);
        newIndex += 1;
      }
    } else {
      const collapsedTargetIndex = Math.max(0, newIndex - 1);
      for (let offset = copiedCount; offset < windowLength; offset += 1) {
        oldToNewVisualIndex.set(activeDecision.startIndex + offset, collapsedTargetIndex);
      }
    }

    oldIndex = activeDecision.endIndex;
    decisionIndex += 1;
  }

  return {
    ...chordGridData,
    chords: nextChords,
    beats: nextBeats,
    originalAudioMapping: chordGridData.originalAudioMapping?.map((item: AudioMappingItem) => ({
      ...item,
      visualIndex: oldToNewVisualIndex.get(item.visualIndex) ?? item.visualIndex,
    })),
  };
}

export function evaluateAlignmentQuality(
  gridData: ChordGridData,
  timeSignature: number
): AlignmentQualityMetrics {
  return scoreGrid(gridData.chords, timeSignature);
}

export function runSegmentAlignmentSolver(params: {
  chordGridData: ChordGridData;
  chordIntervals: Array<{ start?: number; end?: number; chord?: string }>;
  beatTimes: number[];
  timeSignature: number;
  beatDuration: number;
  enabled: boolean;
  suppressLeadingSilenceExpansion?: boolean;
  disableLeadingSilenceWindow?: boolean;
}): AlignmentSolverResult {
  const {
    chordGridData,
    chordIntervals,
    beatTimes,
    timeSignature,
    beatDuration,
    enabled,
    suppressLeadingSilenceExpansion = false,
    disableLeadingSilenceWindow = false,
  } = params;

  if (!enabled || timeSignature <= 1 || chordGridData.chords.length === 0) {
    return {
      gridData: chordGridData,
      decisions: [],
      metrics: evaluateAlignmentQuality(chordGridData, Math.max(1, timeSignature)),
    };
  }

  const windows = buildAlignmentWindows({
    chordGridData,
    chordIntervals,
    beatTimes,
    timeSignature,
    beatDuration,
    suppressLeadingSilenceExpansion,
    disableLeadingSilenceWindow,
  });
  const decisions = solveWindowAdjustments(chordGridData, windows, timeSignature);
  const gridData = applyAlignmentDecisions(chordGridData, decisions);
  const editDistance = decisions.reduce((sum, decision) => sum + Math.abs(decision.adjustment), 0);

  return {
    gridData,
    decisions,
    metrics: scoreGrid(gridData.chords, timeSignature, editDistance),
  };
}
