import { expose } from 'comlink';
import { synchronizeChords } from '@/utils/chordSynchronization';
import type { BeatInfo, ChordDetectionResult } from '@/types/audioAnalysis';

// Heuristic: reward chord changes that occur on downbeats and penalize changes off-downbeat
// Copied from audioAnalysisService.ts (pure function)
function scoreDownbeatAlignment(
  chordSeries: string[],
  timeSignature: number
): { score: number; bestShift: number } {
  if (!Array.isArray(chordSeries) || chordSeries.length < 2) return { score: 0, bestShift: 0 };
  const isValid = (c: string) => c && c !== '' && c !== 'N.C.' && c !== 'N/C' && c !== 'N';
  // changeAt[i] indicates a chord change occurs at beat i (from i-1 -> i) with valid chords
  const changeAt: boolean[] = new Array(chordSeries.length).fill(false);
  for (let i = 1; i < chordSeries.length; i++) {
    const prev = chordSeries[i - 1];
    const curr = chordSeries[i];
    if (isValid(prev as string) && isValid(curr as string) && prev !== curr) changeAt[i] = true;
  }

  let bestShift = 0;
  let bestScore = -Infinity;
  const onWeight = 2;   // reward for a change on a downbeat
  const offPenalty = 1; // penalty for a change off a downbeat

  for (let shift = 0; shift < timeSignature; shift++) {
    let onDown = 0;
    let offDown = 0;
    for (let i = 1; i < chordSeries.length; i++) {
      if (!changeAt[i]) continue;
      const isDownbeatPos = ((i - shift) % timeSignature + timeSignature) % timeSignature === 0;
      if (isDownbeatPos) onDown++; else offDown++;
    }
    const score = onDown * onWeight - offDown * offPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  return { score: bestScore === -Infinity ? 0 : bestScore, bestShift };
}

function toBeatInfoFromTimes(beatTimes: number[]): BeatInfo[] {
  return (beatTimes || []).map((t) => ({ time: t, strength: 0.8 })) as BeatInfo[];
}

const api = {
  synchronizeChords(
    chords: ChordDetectionResult[],
    beats: BeatInfo[]
  ): { chord: string; beatIndex: number }[] {
    return synchronizeChords(chords, beats);
  },

  scoreDownbeatAlignment(
    chordSeries: string[],
    timeSignature: 3 | 4
  ): { score: number; bestShift: number } {
    return scoreDownbeatAlignment(chordSeries, timeSignature);
  },

  chooseMeterAndDownbeats(
    chordResults: ChordDetectionResult[],
    beatTimes: number[],
    candidates: Record<string, number[]>
  ): { timeSignature: 3 | 4; downbeats: number[] } {
    const beatsForSync = toBeatInfoFromTimes(beatTimes);
    const synchronized = synchronizeChords(chordResults, beatsForSync);
    const chordSeries = synchronized.map((s) => s.chord);
    const s3 = scoreDownbeatAlignment(chordSeries, 3);
    const s4 = scoreDownbeatAlignment(chordSeries, 4);
    const winner: 3 | 4 = s3.score > s4.score ? 3 : 4; // tie -> prefer 4
    return { timeSignature: winner, downbeats: candidates[String(winner)] || [] };
  }
};

export type WorkerAPI = typeof api;

expose(api);

