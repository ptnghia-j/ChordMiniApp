import { getChordGridData } from '@/services/chord-analysis/gridAssembly';
import { runSegmentAlignmentSolver } from '@/services/chord-analysis/alignmentSolver';
import { detectLocalMeterSegments } from '@/services/chord-analysis/localMeterDetection';
import * as fs from 'fs';

const transcriptionData = require('../../../scratch/transcription_2RjUwH9iRVo.json');

describe('alignment diagnostic', () => {
  it('diagnoses alignment decisions for song 2RjUwH9iRVo', () => {
    const logs: string[] = [];
    const log = (...args: any[]) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
    };

    log('--- DIAGNOSTIC START ---');
    log('Video Title:', transcriptionData.title);
    log('Total input beats:', transcriptionData.beats?.length);
    log('Total input chords:', transcriptionData.chords?.length);
    log('Time signature:', transcriptionData.timeSignature);
    log('BPM:', transcriptionData.bpm);

    const gridData = getChordGridData(transcriptionData);
    log('Resulting grid chords length:', gridData.chords?.length);
    log('Resulting grid beats length:', gridData.beats?.length);
    log('Padding count:', gridData.paddingCount);
    log('Shift count:', gridData.shiftCount);
    log('Metric segments:', JSON.stringify(gridData.metricSegments, null, 2));

    // Let's run the solver separately to see details
    const timeSignature = transcriptionData.timeSignature || 4;
    const bpm = transcriptionData.bpm || 120;
    const firstDetectedBeat = transcriptionData.beats?.[0]?.time || 0;
    const regularChords = transcriptionData.synchronizedChords?.map((item: any) => item.chord) || [];
    const regularBeats = transcriptionData.synchronizedChords?.map((item: any) => {
      const beat = transcriptionData.beats?.[item.beatIndex];
      return beat ? beat.time : 0;
    }) || [];
    const preliminaryMetricSegments = detectLocalMeterSegments(regularChords, timeSignature);
    const singleDetectedMeter = preliminaryMetricSegments.length === 1
      ? preliminaryMetricSegments[0].beatsPerMeasure
      : null;
    const alignmentTimeSignature = singleDetectedMeter ?? timeSignature;

    const initialGridData = {
      chords: regularChords,
      beats: regularBeats,
      hasPadding: true,
      paddingCount: 0,
      shiftCount: 0,
      totalPaddingCount: 0,
      originalAudioMapping: regularChords.map((chord: string, index: number) => ({
        chord,
        timestamp: regularBeats[index],
        visualIndex: index,
        audioIndex: index,
      })),
    };

    const solverResult = runSegmentAlignmentSolver({
      chordGridData: initialGridData,
      chordIntervals: transcriptionData.chords || [],
      beatTimes: regularBeats,
      timeSignature: alignmentTimeSignature,
      beatDuration: bpm > 0 ? 60 / bpm : 0.5,
      enabled: true,
    });

    log('Solver Decisions:', JSON.stringify(solverResult.decisions, null, 2));

    const finalGridChords = gridData.chords;
    const finalMetricSegments = detectLocalMeterSegments(finalGridChords, timeSignature);
    log('Final Metric Segments:', JSON.stringify(finalMetricSegments, null, 2));

    log('Alignment Time Signature:', alignmentTimeSignature);
    log('Preliminary Metric Segments:', JSON.stringify(preliminaryMetricSegments, null, 2));

    // Find the end chords
    // "towards the end after the F#m -> Bm -> B -> A. Starting from the A chord, we start to have local downbeat misalignment"
    log('--- INPUT CHORDS (LAST 100 BEATS) ---');
    const startIdx = Math.max(0, regularChords.length - 100);
    for (let i = startIdx; i < regularChords.length; i++) {
      const item = transcriptionData.synchronizedChords[i];
      const beat = transcriptionData.beats[item.beatIndex];
      log(`idx: ${i}, beatIdx: ${item.beatIndex}, time: ${beat?.time?.toFixed(2)}, beatNum: ${beat?.beatNum}, chord: ${item.chord}, modulo: ${i % alignmentTimeSignature}`);
    }

    log('--- OUTPUT CHORDS (FIRST 100 BEATS) ---');
    const outEndIdx = Math.min(gridData.chords.length, 100);
    for (let i = 0; i < outEndIdx; i++) {
      const chord = gridData.chords[i];
      const beat = gridData.beats[i];
      const origMapping = gridData.originalAudioMapping?.find((m: any) => m.visualIndex === i);
      log(`visualIdx: ${i}, time: ${typeof beat === 'number' ? beat.toFixed(2) : 'null'}, chord: ${chord}, audioIdx: ${origMapping ? origMapping.audioIndex : 'none'}, modulo: ${i % alignmentTimeSignature}`);
    }

    log('--- OUTPUT CHORDS (LAST 100 BEATS) ---');
    const outStartIdx = Math.max(0, gridData.chords.length - 100);
    for (let i = outStartIdx; i < gridData.chords.length; i++) {
      const chord = gridData.chords[i];
      const beat = gridData.beats[i];
      const origMapping = gridData.originalAudioMapping?.find((m: any) => m.visualIndex === i);
      log(`visualIdx: ${i}, time: ${typeof beat === 'number' ? beat.toFixed(2) : 'null'}, chord: ${chord}, audioIdx: ${origMapping ? origMapping.audioIndex : 'none'}, modulo: ${i % alignmentTimeSignature}`);
    }

    fs.writeFileSync('scratch/diagnostic_output.txt', logs.join('\n'));
  });
});
