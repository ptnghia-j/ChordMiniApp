import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import { runVisualCompactionPipeline } from './gridCompaction';
import { getBeatTime } from './gridShared';
import { calculatePaddingAndShift } from './gridShifting';
import { AudioMappingItem, ChordGridData, GridAnalysisResult } from './gridTypes';
import { chordSheetDebugLog } from '@/utils/debug/chordSheetDebug';

type GridAssemblyAdapter = {
  paddingChord: string;
  buildPaddingTimestamps: (params: {
    paddingCount: number;
    firstDetectedBeat: number;
    bpm: number;
  }) => number[];
};

function buildDistributedPaddingTimestamps(params: {
  paddingCount: number;
  firstDetectedBeat: number;
}): number[] {
  const { paddingCount, firstDetectedBeat } = params;
  return Array(paddingCount).fill(0).map((_, index) => {
    const paddingDuration = firstDetectedBeat;
    const paddingBeatDuration = paddingCount > 0 ? paddingDuration / paddingCount : 0;
    return index * paddingBeatDuration;
  });
}

function buildMeterPaddingTimestamps(params: {
  paddingCount: number;
  bpm: number;
}): number[] {
  const { paddingCount, bpm } = params;
  return Array(paddingCount).fill(0).map((_, index) => {
    const beatDuration = bpm > 0 ? 60 / bpm : GRID_ALIGNMENT_CONFIG.padding.fallbackBeatDurationSeconds;
    return index * beatDuration;
  });
}

function getGridAssemblyAdapter(
  chordModel: string | undefined,
  paddingCount: number,
  shiftCount: number
): GridAssemblyAdapter {
  const usesComprehensiveAssembly = chordModel === 'chord-cnn-lstm' || paddingCount > 0 || shiftCount > 0;

  return usesComprehensiveAssembly
    ? {
        paddingChord: 'N.C.',
        buildPaddingTimestamps: ({ paddingCount: count, firstDetectedBeat }) =>
          buildDistributedPaddingTimestamps({ paddingCount: count, firstDetectedBeat }),
      }
    : {
        paddingChord: '',
        buildPaddingTimestamps: ({ paddingCount: count, bpm }) =>
          buildMeterPaddingTimestamps({ paddingCount: count, bpm }),
      };
}

function extractBeatTimesFromSynchronizedChords(analysisResults: GridAnalysisResult): number[] {
  return analysisResults.synchronizedChords.map((item) => {
    const beat = analysisResults.beats?.[item.beatIndex];
    return getBeatTime(beat) ?? 0;
  });
}

function extractFirstDetectedBeat(analysisResults: GridAnalysisResult): number {
  const firstBeat = analysisResults.beats?.[0];
  return getBeatTime(firstBeat) ?? 0;
}

function countLeadingSilentChords(chords: string[]): number {
  let count = 0;
  while (count < chords.length) {
    const chord = chords[count];
    if (!GRID_ALIGNMENT_CONFIG.silentChordValues.includes(chord as typeof GRID_ALIGNMENT_CONFIG.silentChordValues[number])) {
      break;
    }
    count += 1;
  }
  return count;
}

function buildOriginalAudioMapping(
  synchronizedChords: GridAnalysisResult['synchronizedChords'],
  beatTimes: number[],
  shiftCount: number,
  paddingCount: number
): AudioMappingItem[] {
  return synchronizedChords.map((item, index) => ({
    chord: item.chord,
    timestamp: beatTimes[index] ?? 0,
    visualIndex: shiftCount + paddingCount + index,
    audioIndex: index,
  }));
}

function findFirstChangedAudioIndex(
  baselineMapping: AudioMappingItem[] | undefined,
  remapped: AudioMappingItem[] | undefined
): number | null {
  if (!Array.isArray(baselineMapping) || !Array.isArray(remapped) || baselineMapping.length === 0 || remapped.length === 0) {
    return null;
  }

  const remappedVisualByAudioIndex = new Map<number, number>();
  remapped.forEach((item) => {
    remappedVisualByAudioIndex.set(item.audioIndex, item.visualIndex);
  });

  for (const baselineItem of baselineMapping) {
    const remappedVisualIndex = remappedVisualByAudioIndex.get(baselineItem.audioIndex);
    if (typeof remappedVisualIndex === 'number' && remappedVisualIndex !== baselineItem.visualIndex) {
      return baselineItem.audioIndex;
    }
  }

  return null;
}

function buildInitialGridData(params: {
  regularChords: string[];
  regularBeats: number[];
  paddingCount: number;
  shiftCount: number;
  firstDetectedBeat: number;
  bpm: number;
  adapter: GridAssemblyAdapter;
  synchronizedChords: GridAnalysisResult['synchronizedChords'];
}): ChordGridData {
  const {
    regularChords,
    regularBeats,
    paddingCount,
    shiftCount,
    firstDetectedBeat,
    bpm,
    adapter,
    synchronizedChords,
  } = params;

  const paddingChords = Array(paddingCount).fill(adapter.paddingChord);
  const paddingTimestamps = adapter.buildPaddingTimestamps({ paddingCount, firstDetectedBeat, bpm });
  const shiftCells = Array(shiftCount).fill('');
  const shiftTimestamps = Array(shiftCount).fill(null);

  return {
    chords: [...shiftCells, ...paddingChords, ...regularChords],
    beats: [...shiftTimestamps, ...paddingTimestamps, ...regularBeats],
    hasPadding: true,
    paddingCount,
    shiftCount,
    totalPaddingCount: paddingCount + shiftCount,
    originalAudioMapping: buildOriginalAudioMapping(synchronizedChords, regularBeats, shiftCount, paddingCount),
  };
}

export function getChordGridData(analysisResults: GridAnalysisResult | null): ChordGridData {
  if (!analysisResults || !analysisResults.synchronizedChords || analysisResults.synchronizedChords.length === 0) {

    return {
      chords: [],
      beats: [],
      hasPadding: true,
      paddingCount: 0,
      shiftCount: 0,
      totalPaddingCount: 0,
      originalAudioMapping: [],
    };
  }

  const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults.beatDetectionResult?.bpm || 120;
  const firstDetectedBeat = extractFirstDetectedBeat(analysisResults);
  const regularChords = analysisResults.synchronizedChords.map((item) => item.chord);
  const regularBeats = extractBeatTimesFromSynchronizedChords(analysisResults);

  const { paddingCount, shiftCount } = calculatePaddingAndShift(
    firstDetectedBeat,
    bpm,
    timeSignature,
    regularChords
  );

  const safePaddingCount = Math.max(0, Number.isFinite(paddingCount) ? Math.floor(paddingCount) : 0);
  const safeShiftCount = Math.max(0, Number.isFinite(shiftCount) ? Math.floor(shiftCount) : 0);
  const adapter = getGridAssemblyAdapter(analysisResults.chordModel, safePaddingCount, safeShiftCount);
  const globalOffsetCount = safePaddingCount + safeShiftCount;
  const leadingSilentRunLength = countLeadingSilentChords(regularChords);
  const hasLongLeadingSilenceWithGlobalOffset =
    globalOffsetCount > 0 &&
    leadingSilentRunLength > globalOffsetCount + timeSignature;
  const isLocalCompactionEnabled =
    GRID_ALIGNMENT_CONFIG.enableLocalCompaction &&
    analysisResults.beatModel === GRID_ALIGNMENT_CONFIG.localCompactionBeatModel;

  const initialGridData = buildInitialGridData({
    regularChords,
    regularBeats,
    paddingCount: safePaddingCount,
    shiftCount: safeShiftCount,
    firstDetectedBeat,
    bpm,
    adapter,
    synchronizedChords: analysisResults.synchronizedChords,
  });

  const compactedGridData = runVisualCompactionPipeline({
    chordGridData: initialGridData,
    chordIntervals: analysisResults.chords || [],
    beatTimes: regularBeats,
    timeSignature,
    beatDuration: bpm > 0 ? 60 / bpm : GRID_ALIGNMENT_CONFIG.padding.fallbackBeatDurationSeconds,
    enabled: isLocalCompactionEnabled,
    suppressLeadingSilenceExpansion: hasLongLeadingSilenceWithGlobalOffset,
  });

  if (hasLongLeadingSilenceWithGlobalOffset) {
    const firstChangedAudioIndex = findFirstChangedAudioIndex(
      initialGridData.originalAudioMapping,
      compactedGridData.originalAudioMapping
    );
    const protectedEarlyBeatCount =
      timeSignature * GRID_ALIGNMENT_CONFIG.longIntroCompaction.protectEarlyMusicMeasures;
    const firstProtectedMusicAudioIndex = leadingSilentRunLength;
    const protectedAudioBoundary = firstProtectedMusicAudioIndex + protectedEarlyBeatCount;
    const compactionStartsTooEarly =
      firstChangedAudioIndex !== null &&
      firstChangedAudioIndex < protectedAudioBoundary;

    if (compactionStartsTooEarly) {
      chordSheetDebugLog('GridAssembly', 'Returning initial grid data to protect early musical measures');
      return initialGridData;
    }
  }

  return compactedGridData;
}
