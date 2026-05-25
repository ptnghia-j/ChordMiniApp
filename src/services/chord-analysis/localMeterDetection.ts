import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import { isSilentChord } from './gridShared';
import { MetricSegment } from './gridTypes';

type CandidateMeter = 3 | 4 | 5 | 7;

type MeterMeasure = {
  startIndex: number;
  endIndex: number;
  beatsPerMeasure: CandidateMeter;
  score: number;
};

type SolverState = {
  score: number;
  meter: CandidateMeter;
  runMeasures: number;
  previous?: SolverState;
  measure?: MeterMeasure;
};

function isCandidateMeter(value: number): value is CandidateMeter {
  return value === 3 || value === 4 || value === 5 || value === 7;
}

function getChordStartIndices(chords: string[]): number[] {
  const starts: number[] = [];

  chords.forEach((chord, index) => {
    if (isSilentChord(chord)) {
      return;
    }

    const previousChord = index > 0 ? chords[index - 1] : '';
    if (index === 0 || isSilentChord(previousChord) || previousChord !== chord) {
      starts.push(index);
    }
  });

  return starts;
}

function getChordRunLength(chords: string[], startIndex: number, endIndex: number): number {
  const chord = chords[startIndex];
  let runEnd = startIndex + 1;
  while (runEnd < endIndex && chords[runEnd] === chord) {
    runEnd += 1;
  }
  return runEnd - startIndex;
}

function scoreMeasure(params: {
  chords: string[];
  chordStartSet: Set<number>;
  startIndex: number;
  endIndex: number;
  beatsPerMeasure: CandidateMeter;
}): number {
  const {
    chords,
    chordStartSet,
    startIndex,
    endIndex,
    beatsPerMeasure,
  } = params;
  const config = GRID_ALIGNMENT_CONFIG.localMeterDetection;
  let score = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    if (!chordStartSet.has(index)) {
      continue;
    }

    const positionInMeasure = index - startIndex;
    const runLength = getChordRunLength(chords, index, endIndex);
    const longRunBonus = runLength >= beatsPerMeasure ? config.longRunStartBonus : 0;

    if (positionInMeasure === 0) {
      score += config.downbeatReward + longRunBonus;
    } else if (beatsPerMeasure === 4 && positionInMeasure === 2) {
      score += config.secondaryStrongBeatReward;
    } else {
      score -= config.offDownbeatPenalty;
    }
  }

  return score;
}

function getBestState(states: Map<CandidateMeter, SolverState> | undefined): SolverState | null {
  if (!states || states.size === 0) {
    return null;
  }

  return [...states.values()].reduce((best, current) => (
    current.score > best.score ? current : best
  ));
}

function reconstructMeasures(state: SolverState): MeterMeasure[] {
  const measures: MeterMeasure[] = [];
  let cursor: SolverState | undefined = state;

  while (cursor?.measure) {
    measures.push(cursor.measure);
    cursor = cursor.previous;
  }

  return measures.reverse();
}

function solveMeterPath(chords: string[], candidateMeters: CandidateMeter[]): {
  measures: MeterMeasure[];
  score: number;
} {
  const config = GRID_ALIGNMENT_CONFIG.localMeterDetection;
  const chordStartSet = new Set(getChordStartIndices(chords));
  const statesByIndex = Array.from({ length: chords.length + 1 }, () => new Map<CandidateMeter, SolverState>());

  candidateMeters.forEach((meter) => {
    statesByIndex[0].set(meter, {
      score: 0,
      meter,
      runMeasures: 0,
    });
  });

  for (let startIndex = 0; startIndex < chords.length; startIndex += 1) {
    const states = statesByIndex[startIndex];
    if (states.size === 0) {
      continue;
    }

    states.forEach((state) => {
      candidateMeters.forEach((meter) => {
        const endIndex = Math.min(chords.length, startIndex + meter);
        if (endIndex <= startIndex) {
          return;
        }

        const measureScore = scoreMeasure({
          chords,
          chordStartSet,
          startIndex,
          endIndex,
          beatsPerMeasure: meter,
        });
        const didSwitch = state.runMeasures > 0 && state.meter !== meter;
        const transitionPenalty = didSwitch
          ? config.switchPenalty + (
              state.runMeasures < config.minRunMeasuresBeforeSwitch ? config.earlySwitchPenalty : 0
            )
          : 0;
        const nextScore = state.score + measureScore - transitionPenalty;
        const nextState: SolverState = {
          score: nextScore,
          meter,
          runMeasures: state.meter === meter ? state.runMeasures + 1 : 1,
          previous: state,
          measure: {
            startIndex,
            endIndex,
            beatsPerMeasure: meter,
            score: measureScore,
          },
        };
        const currentBest = statesByIndex[endIndex].get(meter);

        if (!currentBest || nextScore > currentBest.score) {
          statesByIndex[endIndex].set(meter, nextState);
        }
      });
    });
  }

  const bestFinalState = getBestState(statesByIndex[chords.length]);

  return bestFinalState
    ? { measures: reconstructMeasures(bestFinalState), score: bestFinalState.score }
    : { measures: [], score: 0 };
}

function solveMeterPathWithShift(
  chords: string[],
  candidateMeters: CandidateMeter[]
): {
  measures: MeterMeasure[];
  score: number;
} {
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestResult: { measures: MeterMeasure[]; score: number } = { measures: [], score: 0 };

  const maxShift = Math.min(chords.length, Math.max(...candidateMeters));

  for (let shift = 0; shift < maxShift; shift++) {
    const result = solveMeterPath(chords.slice(shift), candidateMeters);
    const adjustedMeasures = result.measures.map((m) => ({
      ...m,
      startIndex: m.startIndex + shift,
      endIndex: m.endIndex + shift,
    }));

    if (result.score > bestScore) {
      bestScore = result.score;
      bestResult = {
        measures: adjustedMeasures,
        score: result.score,
      };
    }
  }

  return bestResult;
}

function scoreSingleMeterPath(chords: string[], beatsPerMeasure: CandidateMeter): number {
  return solveMeterPathWithShift(chords, [beatsPerMeasure]).score;
}

function getBestSingleMeter(chords: string[], candidateMeters: CandidateMeter[]): {
  meter: CandidateMeter;
  score: number;
} {
  return candidateMeters
    .map((meter) => ({
      meter,
      score: scoreSingleMeterPath(chords, meter),
    }))
    .reduce((best, current) => (
      current.score > best.score ? current : best
    ));
}

function collapseMeasuresToSegments(measures: MeterMeasure[]): MetricSegment[] {
  return measures.reduce<MetricSegment[]>((segments, measure) => {
    const current = segments[segments.length - 1];

    if (current && current.beatsPerMeasure === measure.beatsPerMeasure) {
      current.endIndex = measure.endIndex;
      current.score = (current.score ?? 0) + measure.score;
      return segments;
    }

    segments.push({
      startIndex: measure.startIndex,
      endIndex: measure.endIndex,
      beatsPerMeasure: measure.beatsPerMeasure,
      score: measure.score,
    });
    return segments;
  }, []);
}

function mergeShortSegments(segments: MetricSegment[], minSegmentBeats: number): MetricSegment[] {
  if (segments.length <= 1) {
    return segments;
  }

  const merged = segments.map((segment) => ({ ...segment }));
  let index = 0;

  while (index < merged.length) {
    const segment = merged[index];
    const segmentLength = segment.endIndex - segment.startIndex;
    const isEdgeSegment = index === 0 || index === merged.length - 1;

    if (segmentLength >= minSegmentBeats || (isEdgeSegment && segmentLength >= Math.floor(minSegmentBeats * 0.75))) {
      index += 1;
      continue;
    }

    const previous = merged[index - 1];
    const next = merged[index + 1];
    const mergeIntoPrevious =
      previous && (!next || (previous.endIndex - previous.startIndex) >= (next.endIndex - next.startIndex));

    if (mergeIntoPrevious) {
      previous.endIndex = segment.endIndex;
      previous.score = (previous.score ?? 0) + (segment.score ?? 0);
      merged.splice(index, 1);
      index = Math.max(0, index - 1);
    } else if (next) {
      next.startIndex = segment.startIndex;
      next.score = (next.score ?? 0) + (segment.score ?? 0);
      merged.splice(index, 1);
    } else {
      index += 1;
    }
  }

  return merged;
}

function normalizeSegments(segments: MetricSegment[], totalBeats: number): MetricSegment[] {
  return segments
    .filter((segment) => (
      segment.endIndex > segment.startIndex &&
      segment.startIndex >= 0 &&
      segment.startIndex < totalBeats
    ))
    .map((segment, index, allSegments) => ({
      ...segment,
      startIndex: index === 0 ? 0 : Math.max(0, segment.startIndex),
      endIndex: index === allSegments.length - 1 ? totalBeats : Math.min(totalBeats, segment.endIndex),
    }));
}

export function detectLocalMeterSegments(
  chords: string[],
  globalTimeSignature: number
): MetricSegment[] {
  const config = GRID_ALIGNMENT_CONFIG.localMeterDetection;

  if (!config.enabled || chords.length < config.minBeats) {
    return [];
  }

  const candidateMeters = config.candidateMeters.filter(isCandidateMeter);
  if (candidateMeters.length < 2) {
    return [];
  }

  const chordStartCount = getChordStartIndices(chords).length;
  if (chordStartCount < config.minRunMeasuresBeforeSwitch * 2) {
    return [];
  }

  const bestSingleMeter = getBestSingleMeter(chords, candidateMeters);
  const globalMeterScore = isCandidateMeter(globalTimeSignature)
    ? scoreSingleMeterPath(chords, globalTimeSignature)
    : Number.NEGATIVE_INFINITY;
  const canUseSingleMeterOverride =
    !isCandidateMeter(globalTimeSignature) ||
    bestSingleMeter.meter === 5 ||
    bestSingleMeter.meter === 7;
  const hasSingleMeterImprovement =
    canUseSingleMeterOverride &&
    (
      !isCandidateMeter(globalTimeSignature) ||
      bestSingleMeter.meter !== globalTimeSignature
    ) &&
    (
      !Number.isFinite(globalMeterScore) ||
      bestSingleMeter.score >= globalMeterScore + config.minSingleMeterImprovement
    );
  const singleMeterSegment: MetricSegment[] = hasSingleMeterImprovement
    ? [{
        startIndex: 0,
        endIndex: chords.length,
        beatsPerMeasure: bestSingleMeter.meter,
        score: bestSingleMeter.score,
      }]
    : [];

  const mixedResult = solveMeterPathWithShift(chords, candidateMeters);
  let segments = normalizeSegments(
    mergeShortSegments(collapseMeasuresToSegments(mixedResult.measures), config.minSegmentBeats),
    chords.length
  );

  if (segments.length < 2) {
    return singleMeterSegment;
  }

  const usedMeters = new Set(segments.map((segment) => segment.beatsPerMeasure));

  if (usedMeters.size < 2) {
    return singleMeterSegment;
  }

  const mixedMeterImprovementThreshold =
    bestSingleMeter.meter === 5 || bestSingleMeter.meter === 7
      ? config.minMixedOddMeterImprovement
      : config.minMixedMeterImprovement;

  if (mixedResult.score < bestSingleMeter.score + mixedMeterImprovementThreshold) {
    return singleMeterSegment;
  }

  if (isCandidateMeter(globalTimeSignature)) {
    const nonGlobalBeats = segments.reduce((count, segment) => (
      segment.beatsPerMeasure === globalTimeSignature
        ? count
        : count + (segment.endIndex - segment.startIndex)
    ), 0);

    if (nonGlobalBeats < config.minSegmentBeats) {
      return [];
    }
  }

  segments = segments.filter((segment) => segment.endIndex - segment.startIndex > 0);
  return segments.length >= 2 ? segments : [];
}
