import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { exportLeadSheetToMusicXml, exportPianoVisualizerScoreToMusicXml, type MusicXmlKeySection } from '@/utils/musicXmlExport';
import { buildMelodyAbsoluteNoteEvents } from '@/utils/musicXmlExport/absoluteEvents';
import { transposeKeySignature } from '@/utils/chordTransposition';
import { isSilentChord } from '@/services/chord-analysis/gridShared';
import { transposeSheetSageNoteEvents } from '@/utils/sheetSagePlayback';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { AudioDynamicsAnalysisResult } from '@/services/audio/audioDynamicsTypes';
import type { SheetSageNoteEvent, SheetSageResult } from '@/types/sheetSage';
import { countLeadingNullBeatSlots, findClosestTimedBeatIndex } from './helpers';
import type { ChordGridData, SequenceCorrections, VisualizerDisplayMode } from './types';

const SHEET_MUSIC_PITCH_SHIFT_DEBOUNCE_MS = 180;

type SheetPickupResolution = {
  resolvedPickupBeatCount: number;
  preferInferredExportPickup: boolean;
  melodyOverridesStructuralPickup: boolean;
  melodyOverridesFirstPlayableLeadInPickup: boolean;
  usesFirstPlayableLeadInPickup: boolean;
  rawPaddingCount: number;
  rawStructuralPickupCount: number;
  normalizedStructuralPickup: number | null;
  firstNonSilentVisibleGridIndex: number | null;
  normalizedPaddingPickup: number | null;
  firstPlayableBeatIndex: number | null;
  normalizedFirstPlayablePickup: number | null;
  firstMelodyBeatIndex: number | null;
  normalizedFirstMelodyPickup: number | null;
  firstMusicalBeatIndex: number | null;
  normalizedFirstMusicalPickup: number | null;
  leadingSilentCells: number;
  normalizedLeadingSilentPickup: number | null;
  normalizedFirstNonSilentVisibleGridPickup: number | null;
  shouldForceZeroPickupForLongLeadingSilence: boolean;
};

export function resolveFirstMelodyBeatIndex(
  melodyNoteEvents: SheetSageNoteEvent[] | undefined,
  beatTimes: Array<number | null> | undefined,
): number | null {
  if (!melodyNoteEvents?.length || !beatTimes?.length) {
    return null;
  }

  const melodyAbsoluteNotes = buildMelodyAbsoluteNoteEvents(melodyNoteEvents, beatTimes);
  return melodyAbsoluteNotes.reduce<number | null>((earliest, note) => {
    const candidate = typeof note.beatOnset === 'number' && Number.isFinite(note.beatOnset)
      ? Math.max(0, Math.floor(note.beatOnset))
      : null;
    if (candidate === null) {
      return earliest;
    }
    return earliest === null ? candidate : Math.min(earliest, candidate);
  }, null);
}

export function selectMelodyBeatTimesForExport(params: {
  sheetMusicBeatTimes: Array<number | null> | undefined;
  sheetMusicMelodyBeatTimes: Array<number | null> | undefined;
  usesFirstPlayableLeadInPickup: boolean;
}): Array<number | null> | undefined {
  const {
    sheetMusicBeatTimes,
    sheetMusicMelodyBeatTimes,
    usesFirstPlayableLeadInPickup,
  } = params;

  return usesFirstPlayableLeadInPickup ? sheetMusicBeatTimes : sheetMusicMelodyBeatTimes;
}

export function resolveSheetPickupResolution(params: {
  timeSignature: number;
  notationBeatOffset: number;
  resolvedChordGridData: ChordGridData | null | undefined;
  sheetMusicBeatTimes: Array<number | null> | undefined;
  sheetMusicChordEvents: Array<Pick<ChordEvent, 'beatIndex'>>;
  firstMelodyBeatIndex: number | null;
  hasMelodyNotes: boolean;
}): SheetPickupResolution {
  const {
    timeSignature,
    notationBeatOffset,
    resolvedChordGridData,
    sheetMusicBeatTimes,
    sheetMusicChordEvents,
    firstMelodyBeatIndex,
    hasMelodyNotes,
  } = params;
  const normalizePickupCount = (value: number): number => {
    const normalizedValue = Math.max(0, Math.round(value));
    if (timeSignature <= 0) {
      return normalizedValue;
    }

    const pickup = normalizedValue % timeSignature;
    return pickup < 0 ? pickup + timeSignature : pickup;
  };
  const isWithinFirstMeasure = (value: number | null): value is number => (
    value !== null
    && value > 0
    && (timeSignature <= 0 || value < timeSignature)
  );
  const rawPaddingCount = typeof resolvedChordGridData?.paddingCount === 'number'
    && Number.isFinite(resolvedChordGridData.paddingCount)
    ? Math.max(0, Math.round(resolvedChordGridData.paddingCount))
    : 0;
  const rawStructuralPickupCount = rawPaddingCount;
  const normalizedStructuralPickup = rawStructuralPickupCount > 0
    ? normalizePickupCount(rawStructuralPickupCount)
    : null;

  const firstNonSilentVisibleGridIndex = (() => {
    const chords = resolvedChordGridData?.chords;
    if (!chords?.length) {
      return null;
    }

    for (let rawIndex = notationBeatOffset; rawIndex < chords.length; rawIndex += 1) {
      if (!isSilentChord(chords[rawIndex])) {
        return rawIndex - notationBeatOffset;
      }
    }

    return null;
  })();
  const normalizedPaddingPickup = rawPaddingCount > 0
    ? normalizePickupCount(rawPaddingCount)
    : null;

  const firstPlayableBeatIndex = sheetMusicChordEvents.reduce<number>((earliest, event) => {
    if (typeof event.beatIndex !== 'number' || !Number.isFinite(event.beatIndex)) {
      return earliest;
    }

    return Math.min(earliest, Math.round(event.beatIndex));
  }, Number.POSITIVE_INFINITY);

  const normalizedFirstPlayablePickup = Number.isFinite(firstPlayableBeatIndex)
    ? normalizePickupCount(firstPlayableBeatIndex)
    : null;
  const normalizedFirstMelodyPickup = firstMelodyBeatIndex !== null
    ? normalizePickupCount(firstMelodyBeatIndex)
    : null;
  const firstMusicalBeatIndex = [firstMelodyBeatIndex, Number.isFinite(firstPlayableBeatIndex) ? firstPlayableBeatIndex : null]
    .filter((value): value is number => value !== null)
    .reduce<number | null>((earliest, value) => (earliest === null ? value : Math.min(earliest, value)), null);
  const normalizedFirstMusicalPickup = firstMusicalBeatIndex !== null
    ? normalizePickupCount(firstMusicalBeatIndex)
    : null;
  const usesFirstPlayableLeadInPickup = (
    firstPlayableBeatIndex !== null
    && normalizedFirstPlayablePickup !== null
    && firstPlayableBeatIndex > normalizedFirstPlayablePickup
  );
  const melodyOverridesStructuralPickup = (
    normalizedStructuralPickup !== null
    && normalizedStructuralPickup > 0
    && normalizedFirstMelodyPickup !== null
    && normalizedFirstMelodyPickup > 0
    && normalizedFirstMelodyPickup < normalizedStructuralPickup
  );
  const melodyOverridesFirstPlayableLeadInPickup = (
    usesFirstPlayableLeadInPickup
    && normalizedFirstPlayablePickup !== null
    && normalizedFirstPlayablePickup > 0
    && normalizedFirstMelodyPickup !== null
    && normalizedFirstMelodyPickup > 0
    && normalizedFirstMelodyPickup < normalizedFirstPlayablePickup
  );

  const leadingSilentCells = countLeadingNullBeatSlots(sheetMusicBeatTimes);
  const normalizedLeadingSilentPickup = leadingSilentCells > 0
    ? normalizePickupCount(leadingSilentCells)
    : null;

  const hasNonZeroStructuralPickup = normalizedStructuralPickup !== null && normalizedStructuralPickup > 0;
  const normalizedCombinedLeadInPickup = (
    usesFirstPlayableLeadInPickup
    && normalizedFirstPlayablePickup === 0
    && notationBeatOffset > 0
  )
    ? normalizePickupCount(notationBeatOffset + (Number.isFinite(firstPlayableBeatIndex) ? firstPlayableBeatIndex : 0))
    : null;
  const shouldUseCombinedLeadInPickup = (
    normalizedCombinedLeadInPickup !== null
    && normalizedCombinedLeadInPickup > 0
  );
  const shouldRetainStructuralPickupAtBoundaryAlignedLeadIn = (
    hasNonZeroStructuralPickup
    && usesFirstPlayableLeadInPickup
    && normalizedFirstPlayablePickup === 0
    && !shouldUseCombinedLeadInPickup
  );
  let resolvedPickupBeatCount = 0;

  if (melodyOverridesStructuralPickup) {
    resolvedPickupBeatCount = normalizedFirstMelodyPickup!;
  } else if (melodyOverridesFirstPlayableLeadInPickup) {
    resolvedPickupBeatCount = normalizedFirstMelodyPickup!;
  } else if (shouldUseCombinedLeadInPickup) {
    resolvedPickupBeatCount = normalizedCombinedLeadInPickup!;
  } else if (hasNonZeroStructuralPickup && (!usesFirstPlayableLeadInPickup || shouldRetainStructuralPickupAtBoundaryAlignedLeadIn)) {
    resolvedPickupBeatCount = normalizedStructuralPickup;
  } else if (
    usesFirstPlayableLeadInPickup
    && firstPlayableBeatIndex !== null
    && firstPlayableBeatIndex > 0
    && normalizedFirstPlayablePickup !== null
    && normalizedFirstPlayablePickup > 0
  ) {
    resolvedPickupBeatCount = normalizedFirstPlayablePickup;
  } else if (isWithinFirstMeasure(leadingSilentCells) && normalizedLeadingSilentPickup !== null) {
    resolvedPickupBeatCount = normalizedLeadingSilentPickup;
  } else if (isWithinFirstMeasure(firstMusicalBeatIndex) && normalizedFirstMusicalPickup !== null) {
    resolvedPickupBeatCount = normalizedFirstMusicalPickup;
  } else if (!sheetMusicBeatTimes?.length) {
    resolvedPickupBeatCount = 0;
  }

  const normalizedFirstNonSilentVisibleGridPickup = firstNonSilentVisibleGridIndex !== null
    ? normalizePickupCount(firstNonSilentVisibleGridIndex)
    : null;
  const shouldForceZeroPickupForLongLeadingSilence = (
    timeSignature > 0
    && firstNonSilentVisibleGridIndex !== null
    && firstNonSilentVisibleGridIndex >= timeSignature
    && notationBeatOffset === 0
    && leadingSilentCells === 0
  );

  if (
    !hasNonZeroStructuralPickup
    && (firstMusicalBeatIndex === null || firstMusicalBeatIndex === 0)
    && isWithinFirstMeasure(firstNonSilentVisibleGridIndex)
    && normalizedFirstNonSilentVisibleGridPickup !== null
  ) {
    resolvedPickupBeatCount = normalizedFirstNonSilentVisibleGridPickup;
  }

  if (shouldForceZeroPickupForLongLeadingSilence) {
    // Keep full-bar lead-ins as full-bar rests; modulo pickup would be misleading.
    resolvedPickupBeatCount = 0;
  }

  const preferInferredExportPickup = hasMelodyNotes
    && !hasNonZeroStructuralPickup
    && normalizedFirstNonSilentVisibleGridPickup !== null
    && normalizedPaddingPickup !== null
    && normalizedFirstNonSilentVisibleGridPickup > normalizedPaddingPickup;

  return {
    resolvedPickupBeatCount,
    preferInferredExportPickup,
    melodyOverridesStructuralPickup,
    melodyOverridesFirstPlayableLeadInPickup,
    usesFirstPlayableLeadInPickup,
    rawPaddingCount,
    rawStructuralPickupCount,
    normalizedStructuralPickup,
    firstNonSilentVisibleGridIndex,
    normalizedPaddingPickup,
    firstPlayableBeatIndex: Number.isFinite(firstPlayableBeatIndex) ? firstPlayableBeatIndex : null,
    normalizedFirstPlayablePickup,
    firstMelodyBeatIndex,
    normalizedFirstMelodyPickup,
    firstMusicalBeatIndex,
    normalizedFirstMusicalPickup,
    leadingSilentCells,
    normalizedLeadingSilentPickup,
    normalizedFirstNonSilentVisibleGridPickup,
    shouldForceZeroPickupForLongLeadingSilence,
  };
}

interface UseSheetMusicModelParams {
  currentTime: number;
  displayMode: VisualizerDisplayMode;
  mergedKeySignature?: string | null;
  sheetSageResult?: SheetSageResult | null;
  isPitchShiftActive: boolean;
  pitchShiftSemitones: number;
  resolvedChordGridData: ChordGridData | null | undefined;
  mergedPlayableChordEvents: ChordEvent[];
  stripChordEvents: ChordEvent[];
  notationBeatOffset: number;
  beatToChordSequenceMap: Record<number, number>;
  shiftedOriginalChords: string[];
  sequenceCorrections?: SequenceCorrections | null;
  detectedBpm?: number | null;
  timeSignature: number;
  segmentationData?: SegmentationResult | null;
  signalAnalysis: AudioDynamicsAnalysisResult | null;
}

export function useSheetMusicModel({
  currentTime,
  displayMode,
  mergedKeySignature,
  sheetSageResult = null,
  isPitchShiftActive,
  pitchShiftSemitones,
  resolvedChordGridData,
  mergedPlayableChordEvents,
  stripChordEvents,
  notationBeatOffset,
  beatToChordSequenceMap,
  shiftedOriginalChords,
  sequenceCorrections = null,
  detectedBpm,
  timeSignature,
  segmentationData = null,
  signalAnalysis,
}: UseSheetMusicModelParams) {
  const targetSheetMusicPitchShiftSemitones = isPitchShiftActive ? pitchShiftSemitones : 0;
  const [sheetMusicPitchShiftSemitones, setSheetMusicPitchShiftSemitones] = useState(targetSheetMusicPitchShiftSemitones);
  const sheetMusicCurrentTime = useDeferredValue(currentTime);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSheetMusicPitchShiftSemitones(targetSheetMusicPitchShiftSemitones);
    }, SHEET_MUSIC_PITCH_SHIFT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [targetSheetMusicPitchShiftSemitones]);

  const hasLeadSheetData = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
  const hasPianoSheetData = mergedPlayableChordEvents.length > 0;
  const hasSheetMusicData = hasPianoSheetData || hasLeadSheetData;
  const sheetMusicDisabledTooltip = 'Sheet music requires playable piano chords or melody transcription.';
  const effectiveDisplayMode: VisualizerDisplayMode = hasSheetMusicData ? displayMode : 'piano-roll';

  const sheetMusicDisplayKeySignature = useMemo(
    () => transposeKeySignature(mergedKeySignature, sheetMusicPitchShiftSemitones) ?? mergedKeySignature ?? null,
    [mergedKeySignature, sheetMusicPitchShiftSemitones],
  );
  const sheetMusicMelodyNoteEvents = useMemo(
    () => transposeSheetSageNoteEvents(sheetSageResult?.noteEvents, sheetMusicPitchShiftSemitones),
    [sheetMusicPitchShiftSemitones, sheetSageResult?.noteEvents],
  );

  const sheetMusicKeySections = useMemo<MusicXmlKeySection[] | undefined>(() => {
    const resolveSheetMusicKeySignature = (value?: string | null): string | null => {
      const trimmedValue = value?.trim();
      if (!trimmedValue) {
        return null;
      }

      return transposeKeySignature(trimmedValue, sheetMusicPitchShiftSemitones) ?? trimmedValue;
    };
    const sections = sequenceCorrections?.keyAnalysis?.sections;
    const modulations = sequenceCorrections?.keyAnalysis?.modulations;
    const rawKeyEntries = sections?.length
      ? sections.map((section) => ({
          startIndex: section.startIndex,
          keySignature: resolveSheetMusicKeySignature(section.key),
        }))
      : [
          ...(resolveSheetMusicKeySignature(mergedKeySignature)
            ? [{ startIndex: 0, keySignature: resolveSheetMusicKeySignature(mergedKeySignature) }]
            : []),
          ...((modulations ?? []).map((modulation) => ({
            startIndex: modulation.atIndex,
            keySignature: resolveSheetMusicKeySignature(modulation.toKey),
          }))),
        ];

    if (!rawKeyEntries.length) {
      return undefined;
    }

    const seqIndexToFirstBeatIndex = new Map<number, number>();
    for (let beatIndex = 0; beatIndex < shiftedOriginalChords.length; beatIndex += 1) {
      const sequenceIndex = beatToChordSequenceMap[beatIndex];
      if (sequenceIndex === undefined || seqIndexToFirstBeatIndex.has(sequenceIndex)) {
        continue;
      }

      seqIndexToFirstBeatIndex.set(sequenceIndex, beatIndex);
    }

    if (seqIndexToFirstBeatIndex.size === 0) {
      return undefined;
    }

    const mappedSections = rawKeyEntries
      .filter((entry) => Number.isInteger(entry.startIndex))
      .sort((left, right) => left.startIndex - right.startIndex)
      .reduce<MusicXmlKeySection[]>((accumulator, entry) => {
        if (typeof entry.keySignature !== 'string' || entry.keySignature.trim().length === 0) {
          return accumulator;
        }

        const rawBeatIndex = seqIndexToFirstBeatIndex.get(entry.startIndex);
        if (rawBeatIndex === undefined && entry.startIndex > 0) {
          return accumulator;
        }

        const nextSection: MusicXmlKeySection = {
          startBeatIndex: rawBeatIndex !== undefined
            ? Math.max(0, rawBeatIndex - notationBeatOffset)
            : 0,
          keySignature: entry.keySignature.trim(),
        };
        const previousSection = accumulator[accumulator.length - 1];

        if (previousSection?.startBeatIndex === nextSection.startBeatIndex) {
          accumulator[accumulator.length - 1] = nextSection;
          return accumulator;
        }

        if (previousSection?.keySignature === nextSection.keySignature) {
          return accumulator;
        }

        accumulator.push(nextSection);
        return accumulator;
      }, []);

    return mappedSections.length > 0 ? mappedSections : undefined;
  }, [
    beatToChordSequenceMap,
    mergedKeySignature,
    notationBeatOffset,
    sequenceCorrections?.keyAnalysis?.modulations,
    sequenceCorrections?.keyAnalysis?.sections,
    sheetMusicPitchShiftSemitones,
    shiftedOriginalChords,
  ]);

  const musicXmlOptions = useMemo(() => ({
    bpm: detectedBpm || undefined,
    timeSignature,
    title: 'ChordMini Lead Sheet',
    keySignature: sheetMusicDisplayKeySignature,
  }), [detectedBpm, sheetMusicDisplayKeySignature, timeSignature]);

  const sheetMusicBeatTimes = useMemo<Array<number | null> | undefined>(() => {
    const beatTimes = resolvedChordGridData?.beats;
    if (!beatTimes?.length) {
      return sheetSageResult?.beatTimes;
    }

    return notationBeatOffset > 0 ? beatTimes.slice(notationBeatOffset) : beatTimes;
  }, [notationBeatOffset, resolvedChordGridData?.beats, sheetSageResult?.beatTimes]);
  const sheetMusicMelodyBeatTimes = useMemo<Array<number | null> | undefined>(() => {
    if (sheetSageResult?.beatTimes?.length) {
      return sheetSageResult.beatTimes;
    }

    return sheetMusicBeatTimes;
  }, [sheetMusicBeatTimes, sheetSageResult?.beatTimes]);

  const stripChordNameByBeatIndex = useMemo(() => {
    const byBeatIndex = new Map<number, string>();

    stripChordEvents.forEach((event) => {
      const eventBeatIndex = typeof event.beatIndex === 'number' && Number.isFinite(event.beatIndex)
        ? Math.max(0, Math.round(event.beatIndex))
        : null;
      if (eventBeatIndex === null) {
        return;
      }

      const displayChordName = typeof event.chordName === 'string'
        ? event.chordName.trim()
        : '';
      if (!displayChordName) {
        return;
      }

      const beatSpan = Math.max(1, Math.round(event.beatCount ?? 1));
      for (let beatOffset = 0; beatOffset < beatSpan; beatOffset += 1) {
        const beatIndex = eventBeatIndex + beatOffset;
        if (!byBeatIndex.has(beatIndex)) {
          byBeatIndex.set(beatIndex, displayChordName);
        }
      }
    });

    return byBeatIndex;
  }, [stripChordEvents]);

  const sheetMusicChordEvents = useMemo(() => {
    const rawBeatTimes = resolvedChordGridData?.beats;

    return mergedPlayableChordEvents.map((event) => {
      const sourceBeatIndex = typeof event.beatIndex === 'number' && Number.isFinite(event.beatIndex)
        ? Math.max(0, Math.round(event.beatIndex))
        : null;
      const sourceBeatTime = sourceBeatIndex !== null
        ? rawBeatTimes?.[sourceBeatIndex]
        : null;
      const sourceBeatMatchesStart = typeof sourceBeatTime === 'number'
        && Number.isFinite(sourceBeatTime)
        && Number.isFinite(event.startTime)
        && Math.abs(sourceBeatTime - event.startTime) <= 0.001;
      const matchedBeatIndex = findClosestTimedBeatIndex(rawBeatTimes, event.startTime, notationBeatOffset);
      const anchoredBeatIndex = sourceBeatMatchesStart
        ? sourceBeatIndex
        : (matchedBeatIndex ?? sourceBeatIndex);
      const normalizedBeatIndex = anchoredBeatIndex !== null
        ? Math.max(0, anchoredBeatIndex - notationBeatOffset)
        : event.beatIndex;
      const displayChordName = [
        anchoredBeatIndex,
        sourceBeatIndex,
      ]
        .map((beatIndex) => (beatIndex !== null ? stripChordNameByBeatIndex.get(beatIndex) : undefined))
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

      return {
        ...event,
        displayChordName,
        beatIndex: normalizedBeatIndex,
      };
    });
  }, [mergedPlayableChordEvents, notationBeatOffset, resolvedChordGridData?.beats, stripChordNameByBeatIndex]);

  const firstSheetMusicMelodyBeatIndex = useMemo(() => (
    resolveFirstMelodyBeatIndex(sheetMusicMelodyNoteEvents, sheetMusicMelodyBeatTimes)
  ), [sheetMusicMelodyBeatTimes, sheetMusicMelodyNoteEvents]);

  const sheetPickupResolution = useMemo(() => {
    return resolveSheetPickupResolution({
      timeSignature,
      notationBeatOffset,
      resolvedChordGridData,
      sheetMusicBeatTimes,
      sheetMusicChordEvents,
      firstMelodyBeatIndex: firstSheetMusicMelodyBeatIndex,
      hasMelodyNotes: (sheetSageResult?.noteEvents?.length ?? 0) > 0,
    });
  }, [
    firstSheetMusicMelodyBeatIndex,
    notationBeatOffset,
    resolvedChordGridData,
    sheetMusicBeatTimes,
    sheetMusicChordEvents,
    sheetSageResult?.noteEvents?.length,
    timeSignature,
  ]);

  const sheetMusicPickupBeatCount = sheetPickupResolution.resolvedPickupBeatCount;
  const exportedSheetMusicPickupBeatCount = sheetPickupResolution.preferInferredExportPickup
    ? undefined
    : sheetMusicPickupBeatCount;
  const sheetMusicExportMelodyBeatTimes = useMemo(
    () => selectMelodyBeatTimesForExport({
      sheetMusicBeatTimes,
      sheetMusicMelodyBeatTimes,
      usesFirstPlayableLeadInPickup: sheetPickupResolution.usesFirstPlayableLeadInPickup,
    }),
    [
      sheetMusicBeatTimes,
      sheetMusicMelodyBeatTimes,
      sheetPickupResolution.usesFirstPlayableLeadInPickup,
    ],
  );

  const [sheetMusicXmlState, setSheetMusicXmlState] = useState('');
  const [isSheetMusicComputingState, setIsSheetMusicComputingState] = useState(false);
  const sheetMusicComputationRequestRef = useRef(0);
  const sheetMusicXml = hasSheetMusicData ? sheetMusicXmlState : '';
  const isSheetMusicComputing = (
    hasSheetMusicData
    && effectiveDisplayMode === 'sheet-music'
    && isSheetMusicComputingState
  );

  useEffect(() => {
    if (!hasSheetMusicData || effectiveDisplayMode !== 'sheet-music') {
      return;
    }

    const requestId = sheetMusicComputationRequestRef.current + 1;
    sheetMusicComputationRequestRef.current = requestId;
    let rafId: number | null = null;
    let timeoutId: number | null = null;

    const computeSheetMusicXml = () => {
      const nextSheetMusicXml = hasPianoSheetData
        ? exportPianoVisualizerScoreToMusicXml({
            chordEvents: sheetMusicChordEvents,
            melodyNoteEvents: sheetMusicMelodyNoteEvents,
            melodyBeatTimes: sheetMusicExportMelodyBeatTimes,
            pickupBeatCount: exportedSheetMusicPickupBeatCount,
            bpm: detectedBpm || undefined,
            timeSignature,
            title: 'ChordMini Piano Visualizer Score',
            keySignature: sheetMusicDisplayKeySignature,
            keySections: sheetMusicKeySections,
            segmentationData,
            signalAnalysis,
          })
        : (hasLeadSheetData && sheetSageResult
          ? exportLeadSheetToMusicXml(sheetMusicMelodyNoteEvents, mergedPlayableChordEvents, musicXmlOptions)
          : '');

      if (sheetMusicComputationRequestRef.current !== requestId) {
        return;
      }

      setSheetMusicXmlState(nextSheetMusicXml);
      setIsSheetMusicComputingState(false);
    };

    rafId = window.requestAnimationFrame(() => {
      if (sheetMusicComputationRequestRef.current !== requestId) {
        return;
      }

      setIsSheetMusicComputingState(true);
      timeoutId = window.setTimeout(computeSheetMusicXml, 0);
    });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    detectedBpm,
    effectiveDisplayMode,
    exportedSheetMusicPickupBeatCount,
    hasLeadSheetData,
    hasPianoSheetData,
    hasSheetMusicData,
    mergedPlayableChordEvents,
    musicXmlOptions,
    sheetMusicBeatTimes,
    sheetMusicExportMelodyBeatTimes,
    sheetMusicMelodyBeatTimes,
    sheetMusicChordEvents,
    sheetMusicDisplayKeySignature,
    sheetMusicKeySections,
    sheetMusicMelodyNoteEvents,
    sheetMusicPickupBeatCount,
    sheetPickupResolution.preferInferredExportPickup,
    sheetPickupResolution.usesFirstPlayableLeadInPickup,
    sheetSageResult,
    segmentationData,
    signalAnalysis,
    timeSignature,
  ]);

  return {
    sheetMusicXml,
    isSheetMusicComputing,
    hasSheetMusicData,
    effectiveDisplayMode,
    sheetMusicDisabledTooltip,
    sheetMusicCurrentTime,
  };
}
