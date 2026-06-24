import { getBeatTime } from '@/services/chord-analysis/gridShared';
import { runSegmentAlignmentSolver } from '@/services/chord-analysis/alignmentSolver';
import { getChordGridData } from '@/services/chord-analysis/gridAssembly';
import { detectLocalMeterSegments } from '@/services/chord-analysis/localMeterDetection';
import { calculatePaddingAndShift } from '@/services/chord-analysis/gridShifting';
import fs from 'fs';

describe('debug NieC8KA0EvI decisions check', () => {
  it('prints the decisions and metric segments', () => {
    const jsonPath = '/Users/nghiaphan/.gemini/antigravity-ide/brain/3480926d-67fb-4e2e-9443-ed49853046a6/scratch/NieC8KA0EvI.json';
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const timeSignature = data.timeSignature || 4;
    const bpm = data.bpm || 120;
    const regularChords = data.synchronizedChords.map((item: any) => item.chord);
    const regularBeats = data.synchronizedChords.map((item: any) => getBeatTime(data.beats?.[item.beatIndex]) ?? 0);
    const firstDetectedBeat = getBeatTime(data.beats?.[0]) ?? 0;

    const { paddingCount, shiftCount } = calculatePaddingAndShift(
      firstDetectedBeat,
      bpm,
      timeSignature,
      regularChords
    );

    const paddingChords = Array(paddingCount).fill('N.C.');
    const paddingTimestamps = Array(paddingCount).fill(0).map((_, index) => {
      const paddingDuration = firstDetectedBeat;
      return paddingCount > 0 ? (index * paddingDuration / paddingCount) : 0;
    });
    const shiftCells = Array(shiftCount).fill('');
    const shiftTimestamps = Array(shiftCount).fill(null);

    const initialGridData = {
      chords: [...shiftCells, ...paddingChords, ...regularChords],
      beats: [...shiftTimestamps, ...paddingTimestamps, ...regularBeats],
      hasPadding: true,
      paddingCount,
      shiftCount,
      totalPaddingCount: paddingCount + shiftCount,
      originalAudioMapping: data.synchronizedChords.map((item: any, index: number) => ({
        chord: item.chord,
        timestamp: regularBeats[index] ?? 0,
        visualIndex: shiftCount + paddingCount + index,
        audioIndex: index,
      })),
    };

    const compactionParams = {
      chordGridData: initialGridData,
      chordIntervals: data.chords || [],
      beatTimes: regularBeats,
      timeSignature,
      beatDuration: bpm > 0 ? 60 / bpm : 1.0,
      enabled: true,
      suppressLeadingSilenceExpansion: true,
    };

    const solverResult = runSegmentAlignmentSolver(compactionParams);

    process.stdout.write(`Decisions: ${JSON.stringify(solverResult.decisions, null, 2)}\n`);

    const preliminaryMetricSegments = detectLocalMeterSegments(regularChords, timeSignature);
    process.stdout.write(`Initial detected meter segments: ${JSON.stringify(preliminaryMetricSegments)}\n`);

    // Override minBoundaryBeats dynamically for testing
    const configObj = require('@/services/chord-analysis/gridConfig').GRID_ALIGNMENT_CONFIG;
    (configObj.segmentAlignmentSolver.phrasePhase as any).minBoundaryBeats = 12;

    const fullResult = getChordGridData(data);
    process.stdout.write(`Assembled metric segments: ${JSON.stringify(fullResult.metricSegments)}\n`);

    // Let's run buildPhrasePhaseCandidateForBoundary manually on boundaryIndex = 15
    const { buildPhrasePhaseCandidateForBoundary } = require('@/services/chord-analysis/alignmentSolver');
    const cand = buildPhrasePhaseCandidateForBoundary({
      chords: initialGridData.chords,
      boundaryIndex: 15,
      timeSignature,
    });
    process.stdout.write(`Candidate at 15: ${JSON.stringify(cand, null, 2)}\n`);

    // Let's print out what scorePhrasePhaseCandidate is returning for different adjustments
    // We can simulate its internal counts
    const getMusicalChordStartIndicesLocal = (chordsArr: string[], start: number, end: number) => {
      const resultStarts: number[] = [];
      const silentChordsList = ['', 'N.C.', 'N', 'N/C', 'NC'];
      const isSilent = (c: string) => silentChordsList.includes(c);
      for (let i = start; i < end; i++) {
        const c = chordsArr[i];
        if (isSilent(c)) continue;
        const prev = i > start ? chordsArr[i - 1] : '';
        if (i === start || isSilent(prev) || prev !== c) {
          resultStarts.push(i);
        }
      }
      return resultStarts;
    };

    const lookaheadBeats = 64;
    const rawSegmentEnd = Math.min(initialGridData.chords.length, 15 + lookaheadBeats);
    const segmentEnd = rawSegmentEnd;
    const starts = getMusicalChordStartIndicesLocal(initialGridData.chords, 15, segmentEnd);
    process.stdout.write(`Chord starts from 15 to ${segmentEnd}: ${JSON.stringify(starts)}\n`);
    process.stdout.write(`Starts modulos:\n`);
    for (let adj = -3; adj <= 3; adj++) {
      const counts = Array(4).fill(0);
      starts.forEach((startIndex) => {
        const modulo = (startIndex + adj + 4000) % 4;
        counts[modulo] += 1;
      });
      const share = counts[0] / starts.length;
      process.stdout.write(`Adjustment ${adj}: counts=${JSON.stringify(counts)}, downbeatShare=${share.toFixed(3)}\n`);
    }

    process.stdout.write(`paddingCount: ${paddingCount}, shiftCount: ${shiftCount}\n`);

    process.stdout.write("Mapping trace for first 20 chords (Initial vs Compacted vs Final):\n");
    for (let i = 0; i < 20; i++) {
      const initItem = initialGridData.originalAudioMapping.find((x: any) => x.audioIndex === i);
      const compItem = solverResult.gridData.originalAudioMapping.find((x: any) => x.audioIndex === i);
      const finalItem = fullResult.originalAudioMapping.find((x: any) => x.audioIndex === i);
      process.stdout.write(`AudioIndex ${i}: Chord="${data.synchronizedChords[i]?.chord}", Initial=${initItem?.visualIndex}, Compacted=${compItem?.visualIndex}, Final=${finalItem?.visualIndex}\n`);
    }

    // Print final chords for the first 60 indices
    process.stdout.write("Final Grid Chords for first 60 indices:\n");
    for (let i = 0; i < 60; i++) {
      process.stdout.write(`Final Index ${i} (modulo ${i % 4}): Chord="${fullResult.chords[i]}"\n`);
    }
  });
});
