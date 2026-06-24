import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import { isSilentChord } from './gridShared';

type ShiftEvaluationResult = {
  shift: number;
  chordChanges: number;
  downbeatPositions: number[];
  chordLabels: string[];
  firstMusicalChordOnDownbeat: boolean;
  earlyDownbeatStarts: number;
};

function selectBestShiftResult(results: ShiftEvaluationResult[]): ShiftEvaluationResult {
  return results.reduce((best, current) => {
    if (current.chordChanges > best.chordChanges) {
      return current;
    }
    if (current.chordChanges === best.chordChanges && current.shift < best.shift) {
      return current;
    }
    return best;
  });
}

function shouldKeepShortIntroAlignment(params: {
  bestOverall: ShiftEvaluationResult;
  bestIntroAligned: ShiftEvaluationResult;
}): boolean {
  const { bestOverall, bestIntroAligned } = params;

  if (bestOverall.chordChanges <= 0) {
    return true;
  }

  const chordChangePenalty = bestOverall.chordChanges - bestIntroAligned.chordChanges;
  const retainedScoreRatio = bestIntroAligned.chordChanges / bestOverall.chordChanges;

  // Guardrail: never preserve short-intro alignment when it costs too many
  // downbeat-aligned chord starts globally.
  if (chordChangePenalty > GRID_ALIGNMENT_CONFIG.shortIntroAlignment.maxChordChangePenalty) {
    return false;
  }

  return retainedScoreRatio >= GRID_ALIGNMENT_CONFIG.shortIntroAlignment.minCompetitiveRatio;
}

function shouldKeepLongIntroAlignment(params: {
  bestOverall: ShiftEvaluationResult;
  bestIntroAligned: ShiftEvaluationResult;
}): boolean {
  const { bestOverall, bestIntroAligned } = params;

  const earlyDownbeatAdvantage = bestIntroAligned.earlyDownbeatStarts - bestOverall.earlyDownbeatStarts;
  if (
    bestIntroAligned.firstMusicalChordOnDownbeat &&
    earlyDownbeatAdvantage >= GRID_ALIGNMENT_CONFIG.longIntroAlignment.minEarlyDownbeatAdvantage
  ) {
    return true;
  }

  if (bestOverall.chordChanges <= 0) {
    return true;
  }

  const chordChangePenalty = bestOverall.chordChanges - bestIntroAligned.chordChanges;
  const retainedScoreRatio = bestIntroAligned.chordChanges / bestOverall.chordChanges;

  if (chordChangePenalty > GRID_ALIGNMENT_CONFIG.longIntroAlignment.maxChordChangePenalty) {
    return false;
  }

  return retainedScoreRatio >= GRID_ALIGNMENT_CONFIG.longIntroAlignment.minCompetitiveRatio;
}

function getOptimalShiftResults(
  chords: string[],
  timeSignature: number,
  paddingCount: number = 0
): ShiftEvaluationResult[] {
  if (chords.length === 0) {
    return [{
      shift: 0,
      chordChanges: 0,
      downbeatPositions: [],
      chordLabels: [],
      firstMusicalChordOnDownbeat: false,
      earlyDownbeatStarts: 0,
    }];
  }

  let leadingIntroRunLength = 0;
  if (chords.length > 0) {
    const firstChord = chords[0];
    const isSilent = isSilentChord(firstChord);
    while (
      leadingIntroRunLength < chords.length &&
      (isSilent ? isSilentChord(chords[leadingIntroRunLength]) : chords[leadingIntroRunLength] === firstChord)
    ) {
      leadingIntroRunLength += 1;
    }
  }

  const shouldPreserveShortIntroAlignment =
    leadingIntroRunLength > 0 &&
    leadingIntroRunLength < timeSignature &&
    leadingIntroRunLength < chords.length &&
    ((paddingCount + leadingIntroRunLength) % timeSignature) === 0;
  const shouldPreserveLongIntroAlignment =
    leadingIntroRunLength >= timeSignature &&
    leadingIntroRunLength < chords.length;
  const chordStartIndices: number[] = [];

  for (let index = 0; index < chords.length; index += 1) {
    const currentChord = chords[index];
    if (!currentChord || isSilentChord(currentChord)) {
      continue;
    }

    const previousChord = index > 0 ? chords[index - 1] : '';
    if (index === 0 || isSilentChord(previousChord) || previousChord !== currentChord) {
      chordStartIndices.push(index);
    }
  }

  const earlyChordStartIndices = chordStartIndices.slice(
    0,
    GRID_ALIGNMENT_CONFIG.longIntroAlignment.earlyStartWindow
  );

  const shiftResults: ShiftEvaluationResult[] = [];

  for (let shift = 0; shift < timeSignature; shift += 1) {
    let chordChangeCount = 0;
    const downbeatPositions: number[] = [];
    const chordLabels: string[] = [];
    const totalPadding = paddingCount + shift;
    const firstMusicalChordOnDownbeat = shouldPreserveShortIntroAlignment || shouldPreserveLongIntroAlignment
      ? ((totalPadding + leadingIntroRunLength) % timeSignature) === 0
      : false;
    const earlyDownbeatStarts = earlyChordStartIndices.filter((chordStartIndex) => (
      (totalPadding + chordStartIndex) % timeSignature
    ) === 0).length;

    let previousDownbeatChord = '';

    for (let index = 0; index < chords.length; index += 1) {
      const currentChord = chords[index];
      const visualPosition = totalPadding + index;
      const beatInMeasure = (visualPosition % timeSignature) + 1;
      const isDownbeat = beatInMeasure === 1;

      if (!isDownbeat) {
        continue;
      }

      const isValidChord = currentChord && !isSilentChord(currentChord);
      const isChordChange =
        isValidChord &&
        previousDownbeatChord !== '' &&
        currentChord !== previousDownbeatChord;

      if (isChordChange) {
        const chordStartsHere = index === 0 || chords[index - 1] !== currentChord;

        if (chordStartsHere) {
          chordChangeCount += 1;
          downbeatPositions.push(index);
          chordLabels.push(currentChord);
        }
      }

      if (isValidChord) {
        previousDownbeatChord = currentChord;
      }
    }

    shiftResults.push({
      shift,
      chordChanges: chordChangeCount,
      downbeatPositions,
      chordLabels,
      firstMusicalChordOnDownbeat,
      earlyDownbeatStarts,
    });
  }

  if (!shouldPreserveShortIntroAlignment && !shouldPreserveLongIntroAlignment) {
    return shiftResults;
  }

  const introAlignedResults = shiftResults.filter((result) => result.firstMusicalChordOnDownbeat);
  if (introAlignedResults.length === 0) {
    return shiftResults;
  }

  const bestOverall = selectBestShiftResult(shiftResults);
  const bestIntroAligned = selectBestShiftResult(introAlignedResults);
  const keepIntroAlignment = shouldPreserveShortIntroAlignment
    ? shouldKeepShortIntroAlignment({ bestOverall, bestIntroAligned })
    : shouldKeepLongIntroAlignment({ bestOverall, bestIntroAligned });

  return keepIntroAlignment ? introAlignedResults : shiftResults;
}

export function calculateOptimalShift(
  chords: string[],
  timeSignature: number,
  paddingCount: number = 0
): number {
  const evaluatedResults = getOptimalShiftResults(chords, timeSignature, paddingCount);
  return selectBestShiftResult(evaluatedResults).shift;
}

function normalizeCombinedLeadingOffset(params: {
  paddingCount: number;
  shiftCount: number;
  timeSignature: number;
}): { paddingCount: number; shiftCount: number } {
  const { paddingCount, shiftCount, timeSignature } = params;

  if (timeSignature <= 0) {
    return { paddingCount, shiftCount };
  }

  const totalLeadingOffset = paddingCount + shiftCount;
  const removableFullMeasureBeats =
    Math.floor(totalLeadingOffset / timeSignature) * timeSignature;

  if (removableFullMeasureBeats <= 0) {
    return { paddingCount, shiftCount };
  }

  let remainingToTrim = removableFullMeasureBeats;
  let nextShiftCount = shiftCount;
  let nextPaddingCount = paddingCount;

  // Prefer trimming visual-only shift beats before trimming real padding beats.
  const trimShift = Math.min(nextShiftCount, remainingToTrim);
  nextShiftCount -= trimShift;
  remainingToTrim -= trimShift;

  if (remainingToTrim > 0) {
    const trimPadding = Math.min(nextPaddingCount, remainingToTrim);
    nextPaddingCount -= trimPadding;
  }

  return {
    paddingCount: nextPaddingCount,
    shiftCount: nextShiftCount,
  };
}

export function calculatePaddingAndShift(
  firstDetectedBeatTime: number,
  bpm: number,
  timeSignature: number,
  chords: string[] = []
): { paddingCount: number; shiftCount: number; totalPaddingCount: number } {
  let paddingCount = 0;

  if (firstDetectedBeatTime > GRID_ALIGNMENT_CONFIG.padding.meaningfulPreBeatSeconds) {
    const rawPaddingCount = Math.floor((firstDetectedBeatTime / 60) * bpm);
    const beatDuration = Math.round((60 / bpm) * 1000) / 1000;
    const gapRatio = firstDetectedBeatTime / beatDuration;
    paddingCount =
      rawPaddingCount === 0 && gapRatio > GRID_ALIGNMENT_CONFIG.padding.minGapRatioForSinglePadding
        ? 1
        : rawPaddingCount;

    if (paddingCount >= timeSignature) {
      const fullMeasuresToRemove = Math.floor(paddingCount / timeSignature);
      paddingCount -= fullMeasuresToRemove * timeSignature;
    }
  }

  const shiftCount = chords.length > 0
    ? calculateOptimalShift(chords, timeSignature, paddingCount)
    : (() => {
        const beatPositionInMeasure = (paddingCount % timeSignature) + 1;
        const finalBeatPosition = beatPositionInMeasure > timeSignature ? 1 : beatPositionInMeasure;
        return finalBeatPosition === 1 ? 0 : (timeSignature - finalBeatPosition + 1);
      })();

  const normalizedCounts = chords.length > 0
    ? normalizeCombinedLeadingOffset({
        paddingCount,
        shiftCount,
        timeSignature,
      })
    : { paddingCount, shiftCount };

  return {
    paddingCount: normalizedCounts.paddingCount,
    shiftCount: normalizedCounts.shiftCount,
    totalPaddingCount: normalizedCounts.paddingCount + normalizedCounts.shiftCount,
  };
}
