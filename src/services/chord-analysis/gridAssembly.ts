import { GRID_ALIGNMENT_CONFIG } from './gridConfig';
import { runSegmentAlignmentSolver } from './alignmentSolver';
import { getBeatTime } from './gridShared';
import { calculatePaddingAndShift } from './gridShifting';
import { detectLocalMeterSegments } from './localMeterDetection';
import { AudioMappingItem, ChordGridData, GridAnalysisResult, MetricSegment } from './gridTypes';

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
    if (!isSilentGridChord(chord)) {
      break;
    }
    count += 1;
  }
  return count;
}

function isSilentGridChord(chord: string): boolean {
  return GRID_ALIGNMENT_CONFIG.silentChordValues.includes(
    chord as typeof GRID_ALIGNMENT_CONFIG.silentChordValues[number]
  );
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

export function trimLeadingEmptyMeasures(
  chordGridData: ChordGridData,
  timeSignature: number
): ChordGridData {
  if (timeSignature <= 1 || chordGridData.chords.length < timeSignature) {
    return chordGridData;
  }

  let trimCount = 0;
  while (
    trimCount + timeSignature <= chordGridData.chords.length &&
    chordGridData.chords
      .slice(trimCount, trimCount + timeSignature)
      .every((chord) => chord === '')
  ) {
    trimCount += timeSignature;
  }

  if (trimCount === 0) {
    return chordGridData;
  }

  const originalAudioMapping = chordGridData.originalAudioMapping
    ?.filter((item) => item.visualIndex >= trimCount)
    .map((item) => ({
      ...item,
      visualIndex: item.visualIndex - trimCount,
    }));
  const minimumMappedOffset = originalAudioMapping?.reduce((minimumOffset, item) => {
    const offset = item.visualIndex - item.audioIndex;
    return Number.isFinite(offset) ? Math.min(minimumOffset, Math.max(0, offset)) : minimumOffset;
  }, Number.POSITIVE_INFINITY);
  const firstMusicalMapping = originalAudioMapping?.find((item) => !isSilentGridChord(item.chord));
  const firstMusicalMappedOffset = firstMusicalMapping
    ? Math.max(0, firstMusicalMapping.visualIndex - firstMusicalMapping.audioIndex)
    : Number.POSITIVE_INFINITY;
  const mappedOffset = Number.isFinite(firstMusicalMappedOffset)
    ? firstMusicalMappedOffset
    : minimumMappedOffset;
  const effectiveLeadingOffset =
    typeof mappedOffset === 'number' && Number.isFinite(mappedOffset)
      ? Math.max(0, Math.min(timeSignature - 1, mappedOffset))
      : 0;
  const nextPaddingCount = Math.min(chordGridData.paddingCount, effectiveLeadingOffset);
  const nextShiftCount = Math.max(0, effectiveLeadingOffset - nextPaddingCount);

  return {
    ...chordGridData,
    chords: chordGridData.chords.slice(trimCount),
    beats: chordGridData.beats.slice(trimCount),
    paddingCount: nextPaddingCount,
    shiftCount: nextShiftCount,
    totalPaddingCount: nextPaddingCount + nextShiftCount,
    originalAudioMapping,
  };
}

function findFirstChangedAudioIndex(
  baselineMapping: AudioMappingItem[] | undefined,
  remapped: AudioMappingItem[] | undefined,
  minAudioIndex = 0
): number | null {
  if (!Array.isArray(baselineMapping) || !Array.isArray(remapped) || baselineMapping.length === 0 || remapped.length === 0) {
    return null;
  }

  const remappedVisualByAudioIndex = new Map<number, number>();
  remapped.forEach((item) => {
    remappedVisualByAudioIndex.set(item.audioIndex, item.visualIndex);
  });

  for (const baselineItem of baselineMapping) {
    if (baselineItem.audioIndex < minAudioIndex) {
      continue;
    }
    const remappedVisualIndex = remappedVisualByAudioIndex.get(baselineItem.audioIndex);
    if (typeof remappedVisualIndex === 'number' && remappedVisualIndex !== baselineItem.visualIndex) {
      return baselineItem.audioIndex;
    }
  }

  return null;
}

function getPositiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function scoreMappedProtectedStarts(params: {
  mapping: AudioMappingItem[] | undefined;
  startAudioIndex: number;
  endAudioIndex: number;
  timeSignature: number;
}): { startCount: number; downbeatStarts: number; beatStartCounts: number[] } {
  const {
    mapping,
    startAudioIndex,
    endAudioIndex,
    timeSignature,
  } = params;

  const beatStartCounts = Array(timeSignature).fill(0);
  if (!Array.isArray(mapping) || timeSignature <= 1) {
    return { startCount: 0, downbeatStarts: 0, beatStartCounts };
  }

  const orderedMapping = [...mapping].sort((a, b) => a.audioIndex - b.audioIndex);
  let startCount = 0;

  orderedMapping.forEach((item, index) => {
    if (item.audioIndex < startAudioIndex || item.audioIndex >= endAudioIndex || isSilentGridChord(item.chord)) {
      return;
    }

    const previousItem = index > 0 ? orderedMapping[index - 1] : null;
    const isChordStart =
      !previousItem ||
      isSilentGridChord(previousItem.chord) ||
      previousItem.chord !== item.chord;

    if (!isChordStart) {
      return;
    }

    const beatPosition = getPositiveModulo(item.visualIndex, timeSignature);
    beatStartCounts[beatPosition] += 1;
    startCount += 1;
  });

  return {
    startCount,
    downbeatStarts: beatStartCounts[0] ?? 0,
    beatStartCounts,
  };
}

function hasProtectedStartAlignmentImproved(params: {
  baselineMapping: AudioMappingItem[] | undefined;
  remapped: AudioMappingItem[] | undefined;
  startAudioIndex: number;
  endAudioIndex: number;
  timeSignature: number;
}): boolean {
  const {
    baselineMapping,
    remapped,
    startAudioIndex,
    endAudioIndex,
    timeSignature,
  } = params;
  const baselineScore = scoreMappedProtectedStarts({
    mapping: baselineMapping,
    startAudioIndex,
    endAudioIndex,
    timeSignature,
  });
  const remappedScore = scoreMappedProtectedStarts({
    mapping: remapped,
    startAudioIndex,
    endAudioIndex,
    timeSignature,
  });

  if (baselineScore.startCount === 0 || remappedScore.startCount !== baselineScore.startCount) {
    return false;
  }

  return remappedScore.downbeatStarts > baselineScore.downbeatStarts;
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
      metricSegments: [],
    };
  }

  const timeSignature = analysisResults.beatDetectionResult?.time_signature || 4;
  const bpm = analysisResults.beatDetectionResult?.bpm || 120;
  const firstDetectedBeat = extractFirstDetectedBeat(analysisResults);
  const regularChords = analysisResults.synchronizedChords.map((item) => item.chord);
  const regularBeats = extractBeatTimesFromSynchronizedChords(analysisResults);
  const preliminaryMetricSegments = detectLocalMeterSegments(regularChords, timeSignature);
  const singleDetectedMeter = preliminaryMetricSegments.length === 1
    ? preliminaryMetricSegments[0].beatsPerMeasure
    : null;
  const firstSegmentMeter = preliminaryMetricSegments.length > 0
    ? preliminaryMetricSegments[0].beatsPerMeasure
    : null;
  const alignmentTimeSignature = firstSegmentMeter ?? timeSignature;

  const { paddingCount, shiftCount } = calculatePaddingAndShift(
    firstDetectedBeat,
    bpm,
    alignmentTimeSignature,
    regularChords
  );

  const safePaddingCount = Math.max(0, Number.isFinite(paddingCount) ? Math.floor(paddingCount) : 0);
  const safeShiftCount = Math.max(0, Number.isFinite(shiftCount) ? Math.floor(shiftCount) : 0);
  const adapter = getGridAssemblyAdapter(analysisResults.chordModel, safePaddingCount, safeShiftCount);
  const globalOffsetCount = safePaddingCount + safeShiftCount;
  const leadingSilentRunLength = countLeadingSilentChords(regularChords);
  const naturalLeadingSilenceSuppressionThreshold =
    alignmentTimeSignature === 3
      ? alignmentTimeSignature * GRID_ALIGNMENT_CONFIG.longIntroCompaction.minNaturalSilenceMeasuresForSuppression
      : alignmentTimeSignature;
  const hasLongLeadingSilenceWithGlobalOffset =
    globalOffsetCount > 0 &&
    leadingSilentRunLength >= globalOffsetCount + naturalLeadingSilenceSuppressionThreshold;
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

  const compactionParams = {
    chordGridData: initialGridData,
    chordIntervals: analysisResults.chords || [],
    beatTimes: regularBeats,
    timeSignature: alignmentTimeSignature,
    beatDuration: bpm > 0 ? 60 / bpm : GRID_ALIGNMENT_CONFIG.padding.fallbackBeatDurationSeconds,
    enabled: isLocalCompactionEnabled,
    suppressLeadingSilenceExpansion: hasLongLeadingSilenceWithGlobalOffset,
  };
  // Production alignment path: the segment solver replaces the legacy
  // runVisualCompactionPipeline sequence of local ad-hoc corrections.
  let solverResult = runSegmentAlignmentSolver(compactionParams);
  let compactedGridData = solverResult.gridData;

  if (hasLongLeadingSilenceWithGlobalOffset) {
    const firstProtectedMusicAudioIndex = leadingSilentRunLength;
    const firstChangedAudioIndex = findFirstChangedAudioIndex(
      initialGridData.originalAudioMapping,
      compactedGridData.originalAudioMapping,
      firstProtectedMusicAudioIndex
    );
    const protectedEarlyBeatCount =
      alignmentTimeSignature * GRID_ALIGNMENT_CONFIG.longIntroCompaction.protectEarlyMusicMeasures;
    const protectedAudioBoundary = firstProtectedMusicAudioIndex + protectedEarlyBeatCount;
    const compactionStartsTooEarly =
      firstChangedAudioIndex !== null &&
      firstChangedAudioIndex < protectedAudioBoundary;

    const protectedAlignmentImproved = hasProtectedStartAlignmentImproved({
      baselineMapping: initialGridData.originalAudioMapping,
      remapped: compactedGridData.originalAudioMapping,
      startAudioIndex: firstProtectedMusicAudioIndex,
      endAudioIndex: protectedAudioBoundary,
      timeSignature: alignmentTimeSignature,
    });

    if (compactionStartsTooEarly && !protectedAlignmentImproved) {
      solverResult = runSegmentAlignmentSolver({
        ...compactionParams,
        disableLeadingSilenceWindow: true,
      });
      compactedGridData = solverResult.gridData;

      const retryFirstChangedAudioIndex = findFirstChangedAudioIndex(
        initialGridData.originalAudioMapping,
        compactedGridData.originalAudioMapping,
        firstProtectedMusicAudioIndex
      );
      const retryCompactionStartsTooEarly =
        retryFirstChangedAudioIndex !== null &&
        retryFirstChangedAudioIndex < protectedAudioBoundary;
      const retryProtectedAlignmentImproved = hasProtectedStartAlignmentImproved({
        baselineMapping: initialGridData.originalAudioMapping,
        remapped: compactedGridData.originalAudioMapping,
        startAudioIndex: firstProtectedMusicAudioIndex,
        endAudioIndex: protectedAudioBoundary,
        timeSignature: alignmentTimeSignature,
      });

      if (retryCompactionStartsTooEarly && !retryProtectedAlignmentImproved) {
        return initialGridData;
      }
    }
  }

  const finalGridData = trimLeadingEmptyMeasures(compactedGridData, alignmentTimeSignature);
  let metricSegments = singleDetectedMeter
    ? [{
        startIndex: 0,
        endIndex: finalGridData.chords.length,
        beatsPerMeasure: singleDetectedMeter,
      }]
    : detectLocalMeterSegments(finalGridData.chords, timeSignature);

  if (!singleDetectedMeter && metricSegments.length < 2 && preliminaryMetricSegments.length >= 2) {
    metricSegments = mapPreliminarySegments(
      preliminaryMetricSegments,
      finalGridData.originalAudioMapping,
      finalGridData.chords.length
    );
  }

  return {
    ...finalGridData,
    metricSegments,
  };
}

function mapPreliminarySegments(
  preliminarySegments: MetricSegment[],
  originalAudioMapping: AudioMappingItem[] | undefined,
  totalLength: number
): MetricSegment[] {
  if (!originalAudioMapping || originalAudioMapping.length === 0) {
    return [];
  }

  const audioToVisual = new Map<number, number>();
  originalAudioMapping.forEach((item) => {
    audioToVisual.set(item.audioIndex, item.visualIndex);
  });

  const segments = preliminarySegments.map((segment) => {
    let visualStartIndex = -1;
    for (let a = segment.startIndex; a < segment.endIndex; a++) {
      if (audioToVisual.has(a)) {
        visualStartIndex = audioToVisual.get(a)!;
        break;
      }
    }
    if (visualStartIndex === -1) {
      for (let a = segment.startIndex - 1; a >= 0; a--) {
        if (audioToVisual.has(a)) {
          visualStartIndex = audioToVisual.get(a)!;
          break;
        }
      }
    }
    if (visualStartIndex === -1) {
      visualStartIndex = 0;
    }

    let visualEndIndex = -1;
    for (let a = segment.endIndex; a < totalLength; a++) {
      if (audioToVisual.has(a)) {
        visualEndIndex = audioToVisual.get(a)!;
        break;
      }
    }
    if (visualEndIndex === -1) {
      for (let a = segment.endIndex - 1; a >= 0; a--) {
        if (audioToVisual.has(a)) {
          visualEndIndex = audioToVisual.get(a)!;
          break;
        }
      }
    }
    if (visualEndIndex === -1) {
      visualEndIndex = totalLength;
    }

    return {
      startIndex: visualStartIndex,
      endIndex: visualEndIndex,
      beatsPerMeasure: segment.beatsPerMeasure,
      score: segment.score,
    };
  });

  const results: MetricSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = results[i - 1];

    let startIndex = seg.startIndex;
    if (prev) {
      startIndex = prev.endIndex;
    } else {
      startIndex = 0;
    }

    let endIndex = seg.endIndex;
    if (i === segments.length - 1) {
      endIndex = totalLength;
    }

    if (endIndex > startIndex) {
      results.push({
        startIndex,
        endIndex,
        beatsPerMeasure: seg.beatsPerMeasure,
        score: seg.score,
      });
    } else if (prev) {
      prev.endIndex = endIndex;
    }
  }

  return results;
}
