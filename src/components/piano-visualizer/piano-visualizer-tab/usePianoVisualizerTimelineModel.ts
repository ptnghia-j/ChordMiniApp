import { useMemo, type ReactElement } from 'react';
import type { ActiveInstrument } from '@/components/piano-visualizer/FallingNotesCanvas';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import { getDisplayAccidentalPreference } from '@/utils/chordUtils';
import { buildBeatToChordSequenceMap, formatRomanNumeral } from '@/utils/chordFormatting';
import { createShiftedChords } from '@/utils/chordProcessing';
import { mergeConsecutiveChordEvents } from '@/utils/instrumentNoteGeneration';
import { buildSheetSageExtraVisualNotes } from '@/utils/sheetSagePlayback';
import {
  buildChordTimeline,
  type ChordEvent,
} from '@/utils/chordToMidi';
import type { AudioMixerSettings } from '@/services/chord-playback/audioMixerService';
import type { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import type { SegmentationResult } from '@/types/chatbotTypes';
import type { SheetSageResult } from '@/types/sheetSage';
import {
  INSTRUMENT_COLORS,
  MELODIC_TRANSCRIPTION_COLOR,
  PIANO_WHITE_KEY_COUNT,
} from './constants';
import { countLeadingShiftChordSlots, hasPlayableNotes } from './helpers';
import type { ChordGridData, SequenceCorrections } from './types';

type RomanNumeralDataShape = {
  analysis?: string[];
} | null | undefined;

interface UsePianoVisualizerTimelineModelParams {
  chordGridData: ChordGridData;
  resolvedChordGridData: ChordGridData | null | undefined;
  displayedChords: string[];
  mergedKeySignature?: string | null;
  sequenceCorrections?: SequenceCorrections | null;
  analysisResults?: AnalysisResult | null;
  audioUrl?: string | null;
  segmentationData?: SegmentationResult | null;
  sheetSageResult?: SheetSageResult | null;
  showMelodicOverlay: boolean;
  pitchShiftSemitones: number;
  isChordPlaybackEnabled: boolean;
  mixerSettings: AudioMixerSettings;
  containerWidth: number;
  showRomanNumerals?: boolean;
  romanNumeralData?: RomanNumeralDataShape;
}

export function usePianoVisualizerTimelineModel({
  chordGridData,
  resolvedChordGridData,
  displayedChords,
  mergedKeySignature,
  sequenceCorrections = null,
  analysisResults,
  audioUrl,
  segmentationData = null,
  sheetSageResult = null,
  showMelodicOverlay,
  pitchShiftSemitones,
  isChordPlaybackEnabled,
  mixerSettings,
  containerWidth,
  showRomanNumerals,
  romanNumeralData,
}: UsePianoVisualizerTimelineModelParams) {
  const playbackChordEvents = useMemo<ChordEvent[]>(() => {
    if (!resolvedChordGridData) return [];
    return buildChordTimeline(
      resolvedChordGridData.chords,
      resolvedChordGridData.beats,
      resolvedChordGridData.paddingCount,
      resolvedChordGridData.shiftCount,
    );
  }, [resolvedChordGridData]);

  const stripChordEvents = useMemo<ChordEvent[]>(() => {
    if (!resolvedChordGridData) return [];
    return buildChordTimeline(
      displayedChords,
      resolvedChordGridData.beats,
      resolvedChordGridData.paddingCount,
      resolvedChordGridData.shiftCount,
    );
  }, [displayedChords, resolvedChordGridData]);

  const mergedPlayableChordEvents = useMemo(
    () => mergeConsecutiveChordEvents(playbackChordEvents.filter(hasPlayableNotes)),
    [playbackChordEvents],
  );

  const accidentalPreference = useMemo(() => {
    return getDisplayAccidentalPreference({
      chords: displayedChords,
      keySignature: mergedKeySignature,
      preserveExactSpelling: Boolean(sequenceCorrections),
    });
  }, [displayedChords, mergedKeySignature, sequenceCorrections]);

  const timeSignature = analysisResults?.beatDetectionResult?.time_signature || 4;
  const detectedBpm = analysisResults?.beatDetectionResult?.bpm;
  const totalDuration = useMemo(
    () => (mergedPlayableChordEvents.length > 0
      ? mergedPlayableChordEvents[mergedPlayableChordEvents.length - 1].endTime
      : undefined),
    [mergedPlayableChordEvents],
  );
  const dynamicsParams = useMemo(
    () => ({
      bpm: detectedBpm || 120,
      timeSignature,
      totalDuration,
      segmentationData,
    }),
    [detectedBpm, segmentationData, timeSignature, totalDuration],
  );
  const dynamicsAnalyzer = useSharedAudioDynamics(audioUrl, dynamicsParams);
  const signalAnalysis = dynamicsAnalyzer.getSignalAnalysis();

  const shiftedOriginalChords = useMemo(() => {
    if (!chordGridData?.chords) return [];
    return createShiftedChords(
      chordGridData.chords,
      chordGridData.hasPadding,
      timeSignature,
      chordGridData.shiftCount,
    );
  }, [chordGridData, timeSignature]);

  const notationBeatOffset = useMemo(
    () => countLeadingShiftChordSlots(resolvedChordGridData?.chords),
    [resolvedChordGridData?.chords],
  );

  const normalizedRomanNumeralData = useMemo(
    () => (romanNumeralData?.analysis ? { analysis: romanNumeralData.analysis } : null),
    [romanNumeralData],
  );

  const beatToChordSequenceMap = useMemo(() => {
    if (!chordGridData?.chords?.length) return {};
    return buildBeatToChordSequenceMap(
      chordGridData.chords.length,
      shiftedOriginalChords,
      normalizedRomanNumeralData,
      sequenceCorrections ?? null,
    );
  }, [chordGridData, normalizedRomanNumeralData, shiftedOriginalChords, sequenceCorrections]);

  const beatRomanNumerals = useMemo(() => {
    if (!romanNumeralData?.analysis || !showRomanNumerals) return undefined;
    const map = new Map<number, ReactElement | string>();
    const formatCache = new Map<string, ReactElement | string>();

    for (const event of stripChordEvents) {
      const seqIdx = beatToChordSequenceMap[event.beatIndex];
      if (seqIdx !== undefined && romanNumeralData.analysis[seqIdx]) {
        const raw = romanNumeralData.analysis[seqIdx];
        if (!formatCache.has(raw)) {
          formatCache.set(raw, formatRomanNumeral(raw));
        }
        map.set(event.beatIndex, formatCache.get(raw)!);
      }
    }
    return map;
  }, [stripChordEvents, beatToChordSequenceMap, romanNumeralData, showRomanNumerals]);

  const beatModulations = useMemo(() => {
    const modulations = sequenceCorrections?.keyAnalysis?.modulations;
    if (!modulations?.length) return undefined;

    const map = new Map<number, { isModulation: true; fromKey: string; toKey: string }>();

    for (const event of stripChordEvents) {
      const seqIdx = beatToChordSequenceMap[event.beatIndex];
      if (seqIdx === undefined) continue;

      const modulation = modulations.find((entry) => entry.atIndex === seqIdx);
      if (!modulation) continue;

      map.set(event.beatIndex, {
        isModulation: true,
        fromKey: modulation.fromKey,
        toKey: modulation.toKey,
      });
    }

    return map;
  }, [beatToChordSequenceMap, sequenceCorrections?.keyAnalysis?.modulations, stripChordEvents]);

  const whiteKeyWidth = useMemo(() => {
    if (containerWidth <= 0) return 14;
    const calculated = Math.floor(containerWidth / PIANO_WHITE_KEY_COUNT);
    return Math.max(10, Math.min(24, calculated));
  }, [containerWidth]);

  const activeInstruments = useMemo<ActiveInstrument[]>(() => {
    if (!isChordPlaybackEnabled) return [];

    const instruments: ActiveInstrument[] = [];
    if (mixerSettings.pianoVolume > 0) instruments.push({ name: 'Piano', color: INSTRUMENT_COLORS.piano });
    if (mixerSettings.guitarVolume > 0) instruments.push({ name: 'Guitar', color: INSTRUMENT_COLORS.guitar });
    if (mixerSettings.violinVolume > 0) instruments.push({ name: 'Violin', color: INSTRUMENT_COLORS.violin });
    if (mixerSettings.fluteVolume > 0) instruments.push({ name: 'Flute', color: INSTRUMENT_COLORS.flute });
    if (mixerSettings.bassVolume > 0) instruments.push({ name: 'Bass', color: INSTRUMENT_COLORS.bass });
    return instruments;
  }, [isChordPlaybackEnabled, mixerSettings]);

  const melodyOverlayNotes = useMemo(
    () => showMelodicOverlay
      ? buildSheetSageExtraVisualNotes(sheetSageResult, MELODIC_TRANSCRIPTION_COLOR, pitchShiftSemitones)
      : [],
    [pitchShiftSemitones, sheetSageResult, showMelodicOverlay],
  );

  const keyboardWidth = useMemo(
    () => PIANO_WHITE_KEY_COUNT * whiteKeyWidth,
    [whiteKeyWidth],
  );

  return {
    playbackChordEvents,
    stripChordEvents,
    mergedPlayableChordEvents,
    accidentalPreference,
    timeSignature,
    detectedBpm,
    totalDuration,
    dynamicsAnalyzer,
    signalAnalysis,
    shiftedOriginalChords,
    notationBeatOffset,
    beatToChordSequenceMap,
    beatRomanNumerals,
    beatModulations,
    activeInstruments,
    melodyOverlayNotes,
    whiteKeyWidth,
    keyboardWidth,
  };
}
