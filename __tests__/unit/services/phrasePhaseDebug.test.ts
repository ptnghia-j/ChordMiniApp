import { GRID_ALIGNMENT_CONFIG } from '@/services/chord-analysis/gridConfig';
import { isSilentChord } from '@/services/chord-analysis/gridShared';
import * as fs from 'fs';
const transcriptionData = require('../../../scratch/transcription_2RjUwH9iRVo.json');


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



function scoreSegmentRefined(
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
    
    // REFINED LOGIC: Only apply firstStartBonus at start of song or after silence
    const isSongStartOrAfterSilence = startIndex === 0 || isSilentChord(chords[startIndex - 1]);
    const firstStartWeight = (order === 0 && isSongStartOrAfterSilence)
      ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.firstStartBonus
      : 0;
      
    const longRunWeight = runLength >= timeSignature
      ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.longRunStartBonus
      : 0;
    const weight = 1 + firstStartWeight + longRunWeight;
    const itemScore = scoreStartModulo(modulo, timeSignature, weight);
    return score + itemScore;
  }, 0);
}

function transitionPenalty(window: any, adjustment: number): number {
  if (adjustment === 0) {
    return 0;
  }
  const basePenalty = window.source === 'leading_silence'
    ? GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.leadingExpansionPenalty
    : GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.editPenalty;
  return Math.abs(adjustment) * basePenalty;
}

import { GRID_ALIGNMENT_CONFIG } from '@/services/chord-analysis/gridConfig';
import { isSilentChord } from '@/services/chord-analysis/gridShared';
import * as fs from 'fs';

function findNextSilentRun(chords: string[], startIndex: number, endIndex: number): number {
  const minLength = 2;
  let index = startIndex;
  while (index < endIndex - minLength + 1) {
    let isRun = true;
    for (let i = 0; i < minLength; i++) {
      if (!isSilentChord(chords[index + i])) {
        isRun = false;
        break;
      }
    }
    if (isRun) {
      return index;
    }
    index += 1;
  }
  return endIndex;
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

describe('phrase phase debug', () => {
  it('debugs pop/classical sequence failure', () => {
    const logs: string[] = [];
    const log = (...args: any[]) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
    };

    const appendRun = (target: string[], chord: string, beats: number) => {
      target.push(...Array(beats).fill(chord));
    };
    const chords: string[] = [];
    [
      ['E:maj', 2],
      ['A:maj', 2],
      ['F#:min', 2],
      ['A:maj', 4],
      ['D:maj', 4],
      ['A:maj', 4],
      ['E:maj', 4],
      ['A:maj', 4],
      ['F#:min', 4],
      ['B:min7', 4],
    ].forEach(([chord, beats]) => appendRun(chords, chord as string, beats as number));

    const prepend: string[] = [];
    Array.from({ length: 2 }, (_, i) => (i % 2 === 0 ? 'A:maj' : 'E:maj'))
      .forEach((chord) => appendRun(prepend, chord, 4));

    const testChords = [
      ...prepend,
      'A:maj', 'A:maj', 'A:maj',
      ...chords,
    ];

    const timeSignature = 4;
    log('testChords length:', testChords.length);

    const config = GRID_ALIGNMENT_CONFIG.segmentAlignmentSolver.phrasePhase;
    const adjustments = [-3, -2, -1, 1, 2, 3];

    for (let index = 1; index < testChords.length - timeSignature; index++) {
      const previousChord = testChords[index - 1];
      const nextChord = testChords[index];
      const isBoundary =
        !isSilentChord(previousChord) &&
        !isSilentChord(nextChord) &&
        previousChord !== nextChord;

      if (isBoundary) {
        log(`\nBoundary at Index ${index} (${previousChord} -> ${nextChord})`);
        
        const rawSegmentEnd = Math.min(testChords.length, index + config.lookaheadBeats);
        const segmentEnd = Math.min(testChords.length, findNextSilentRun(testChords, index, rawSegmentEnd));
        const starts = getMusicalChordStartIndices(testChords, index, segmentEnd);

        if (starts.length < config.minStarts) {
          log(`  Fail: starts.length (${starts.length}) < minStarts (${config.minStarts})`);
          continue;
        }

        adjustments.forEach((adjustment) => {
          const currentCounts = countStartModulos(starts, timeSignature);
          const correctedCounts = countStartModulos(starts, timeSignature, adjustment);
          const currentDownbeats = currentCounts[0] ?? 0;
          const correctedDownbeats = correctedCounts[0] ?? 0;
          const strongestCorrectedOffDownbeat = timeSignature === 4
            ? Math.max(correctedCounts[1] ?? 0, correctedCounts[3] ?? 0)
            : Math.max(0, ...correctedCounts.slice(1));
          const currentDownbeatShare = currentDownbeats / starts.length;
          const correctedDownbeatShare = correctedDownbeats / starts.length;
          const downbeatGain = correctedDownbeats - currentDownbeats;

          log(`  Adj: ${adjustment}`);
          log(`    currentDownbeatShare: ${currentDownbeatShare.toFixed(3)} (max ${config.maxCurrentDownbeatShare})`);
          log(`    correctedDownbeatShare: ${correctedDownbeatShare.toFixed(3)} (min ${config.minCorrectedDownbeatShare})`);
          log(`    correctedDownbeats: ${correctedDownbeats} (strongestOff ${strongestCorrectedOffDownbeat})`);
          log(`    downbeatGain: ${downbeatGain} (min ${config.minDownbeatGain})`);

          // Check lookbehind stability
          const previousStart = Math.max(0, index - config.lookbehindBeats);
          const previousStarts = getMusicalChordStartIndices(testChords, previousStart, index);
          log(`    previousStarts.length: ${previousStarts.length}`);
          if (previousStarts.length >= config.minPreviousStarts) {
            const previousCounts = countStartModulos(previousStarts, timeSignature);
            let isStable = false;
            if (timeSignature === 4) {
              const phase02Share = ((previousCounts[0] ?? 0) + (previousCounts[2] ?? 0)) / previousStarts.length;
              const phase13Share = ((previousCounts[1] ?? 0) + (previousCounts[3] ?? 0)) / previousStarts.length;
              isStable = Math.max(phase02Share, phase13Share) >= 0.70;
              log(`      phase02Share: ${phase02Share.toFixed(3)}, phase13Share: ${phase13Share.toFixed(3)}, isStable: ${isStable}`);
            } else {
              const maxShare = Math.max(...previousCounts) / previousStarts.length;
              isStable = maxShare >= config.minPreviousDownbeatShare;
              log(`      maxShare: ${maxShare.toFixed(3)}, isStable: ${isStable}`);
            }
          }
        });
      }
    }

    fs.writeFileSync('scratch/phrase_phase_debug_output.txt', logs.join('\n'));
  });
});








