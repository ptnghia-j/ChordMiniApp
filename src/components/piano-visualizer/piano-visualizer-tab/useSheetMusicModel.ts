import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { exportLeadSheetToMusicXml, exportPianoVisualizerScoreToMusicXml, type MusicXmlKeySection } from '@/utils/musicXmlExport';
import { transposeKeySignature } from '@/utils/chordTransposition';
import { isSilentChord } from '@/services/chord-analysis/gridShared';
import { transposeSheetSageNoteEvents } from '@/utils/sheetSagePlayback';
import type { ChordEvent } from '@/utils/chordToMidi';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { AudioDynamicsAnalysisResult } from '@/services/audio/audioDynamicsTypes';
import type { SheetSageResult } from '@/types/sheetSage';
import { countLeadingNullBeatSlots, findClosestTimedBeatIndex } from './helpers';
import type { ChordGridData, SequenceCorrections, VisualizerDisplayMode } from './types';

const SHEET_MUSIC_PITCH_SHIFT_DEBOUNCE_MS = 180;

interface UseSheetMusicModelParams {
  currentTime: number;
  displayMode: VisualizerDisplayMode;
  mergedKeySignature?: string | null;
  sheetSageResult?: SheetSageResult | null;
  isPitchShiftActive: boolean;
  pitchShiftSemitones: number;
  resolvedChordGridData: ChordGridData | null | undefined;
  mergedPlayableChordEvents: ChordEvent[];
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

      return {
        ...event,
        beatIndex: normalizedBeatIndex,
      };
    });
  }, [mergedPlayableChordEvents, notationBeatOffset, resolvedChordGridData?.beats]);

  const sheetPickupResolution = useMemo(() => {
    const normalizePickupCount = (value: number): number => {
      const normalizedValue = Math.max(0, Math.round(value));
      if (timeSignature <= 0) {
        return normalizedValue;
      }

      const pickup = normalizedValue % timeSignature;
      return pickup < 0 ? pickup + timeSignature : pickup;
    };

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

    const normalizedPaddingPickup = typeof resolvedChordGridData?.paddingCount === 'number'
      && Number.isFinite(resolvedChordGridData.paddingCount)
      ? normalizePickupCount(Math.max(0, Math.round(resolvedChordGridData.paddingCount)))
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

    const leadingSilentCells = countLeadingNullBeatSlots(sheetMusicBeatTimes);
    const normalizedLeadingSilentPickup = leadingSilentCells > 0
      ? normalizePickupCount(leadingSilentCells)
      : null;

    let resolvedPickupBeatCount = 0;

    if (typeof resolvedChordGridData?.paddingCount === 'number' && Number.isFinite(resolvedChordGridData.paddingCount)) {
      const normalizedPaddingCount = Math.max(0, Math.round(resolvedChordGridData.paddingCount));
      resolvedPickupBeatCount = normalizePickupCount(normalizedPaddingCount);
    } else if (normalizedLeadingSilentPickup !== null) {
      resolvedPickupBeatCount = normalizedLeadingSilentPickup;
    } else if (normalizedFirstPlayablePickup !== null) {
      resolvedPickupBeatCount = normalizedFirstPlayablePickup;
    } else if (!sheetMusicBeatTimes?.length) {
      resolvedPickupBeatCount = 0;
    }

    const normalizedFirstNonSilentVisibleGridPickup = firstNonSilentVisibleGridIndex !== null
      ? normalizePickupCount(firstNonSilentVisibleGridIndex)
      : null;
    if (normalizedFirstNonSilentVisibleGridPickup !== null) {
      resolvedPickupBeatCount = normalizedFirstNonSilentVisibleGridPickup;
    }

    const hasMelodyNotes = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
    const preferInferredExportPickup = hasMelodyNotes
      && normalizedFirstNonSilentVisibleGridPickup !== null
      && normalizedPaddingPickup !== null
      && normalizedFirstNonSilentVisibleGridPickup > normalizedPaddingPickup;

    return {
      resolvedPickupBeatCount,
      preferInferredExportPickup,
    };
  }, [notationBeatOffset, resolvedChordGridData, sheetMusicBeatTimes, sheetMusicChordEvents, sheetSageResult?.noteEvents?.length, timeSignature]);

  const sheetMusicPickupBeatCount = sheetPickupResolution.resolvedPickupBeatCount;
  const exportedSheetMusicPickupBeatCount = sheetPickupResolution.preferInferredExportPickup
    ? undefined
    : sheetMusicPickupBeatCount;

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
            melodyBeatTimes: sheetMusicBeatTimes,
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
    sheetMusicChordEvents,
    sheetMusicDisplayKeySignature,
    sheetMusicKeySections,
    sheetMusicMelodyNoteEvents,
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
