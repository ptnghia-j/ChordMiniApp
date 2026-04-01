import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import { isSilentChord } from './gridShared';

function getOptimalShiftResults(
  chords: string[],
  timeSignature: number,
  paddingCount: number = 0
): Array<{
  shift: number;
  chordChanges: number;
  downbeatPositions: number[];
  chordLabels: string[];
  firstMusicalChordOnDownbeat: boolean;
}> {
  if (chords.length === 0) {
    return [{
      shift: 0,
      chordChanges: 0,
      downbeatPositions: [],
      chordLabels: [],
      firstMusicalChordOnDownbeat: false,
    }];
  }

  let leadingSilentRunLength = 0;
  while (leadingSilentRunLength < chords.length && isSilentChord(chords[leadingSilentRunLength])) {
    leadingSilentRunLength += 1;
  }

  const shouldPreserveShortIntroAlignment =
    leadingSilentRunLength > 0 &&
    leadingSilentRunLength < timeSignature &&
    leadingSilentRunLength < chords.length &&
    ((paddingCount + leadingSilentRunLength) % timeSignature) === 0;

  const shiftResults: Array<{
    shift: number;
    chordChanges: number;
    downbeatPositions: number[];
    chordLabels: string[];
    firstMusicalChordOnDownbeat: boolean;
  }> = [];

  for (let shift = 0; shift < timeSignature; shift += 1) {
    let chordChangeCount = 0;
    const downbeatPositions: number[] = [];
    const chordLabels: string[] = [];
    const firstMusicalChordOnDownbeat = shouldPreserveShortIntroAlignment
      ? ((paddingCount + shift + leadingSilentRunLength) % timeSignature) === 0
      : false;

    let previousDownbeatChord = '';

    for (let index = 0; index < chords.length; index += 1) {
      const currentChord = chords[index];
      const totalPadding = paddingCount + shift;
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
    });
  }

  const candidateResults = shouldPreserveShortIntroAlignment
    ? shiftResults.filter((result) => result.firstMusicalChordOnDownbeat)
    : shiftResults;

  return candidateResults.length > 0 ? candidateResults : shiftResults;
}

export function calculateOptimalShift(
  chords: string[],
  timeSignature: number,
  paddingCount: number = 0
): number {
  const evaluatedResults = getOptimalShiftResults(chords, timeSignature, paddingCount);

  const bestResult = evaluatedResults.reduce((best, current) => {
    if (current.chordChanges > best.chordChanges) {
      return current;
    }
    if (current.chordChanges === best.chordChanges && current.shift < best.shift) {
      return current;
    }
    return best;
  });

  return bestResult.shift;
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

  return {
    paddingCount,
    shiftCount,
    totalPaddingCount: paddingCount + shiftCount,
  };
}
