'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollingChordStrip } from '@/components/piano-visualizer/ScrollingChordStrip';
import SheetMusicDisplay from '@/components/piano-visualizer/SheetMusicDisplay';
import { exportChordEventsToMidi, downloadMidiFile } from '@/utils/midiExport';
import { getAudioMixerService, type AudioMixerSettings } from '@/services/chord-playback/audioMixerService';
import { DEFAULT_AUDIO_MIXER_SETTINGS } from '@/config/audioDefaults';
import { useResolvedChordDisplayData } from '@/hooks/chord-analysis/useResolvedChordDisplayData';
import { useAnalysisResults, useShowCorrectedChords, useChordCorrections, useKeySignature } from '@/stores/analysisStore';
import {
  useGuitarCapoFret,
  useGuitarSelectedPositions,
  usePitchShiftSemitones,
  useRomanNumerals,
  useTargetKey,
} from '@/stores/uiStore';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import { INSTRUMENT_COLORS, MELODIC_TRANSCRIPTION_COLOR } from './constants';
import { areMixerSettingsEqual } from './helpers';
import { PianoRollPanel } from './PianoRollPanel';
import { PianoVisualizerHeader } from './PianoVisualizerHeader';
import { usePianoOnlyPlayback } from './usePianoOnlyPlayback';
import { usePianoVisualizerTimelineModel } from './usePianoVisualizerTimelineModel';
import { useSheetMusicModel } from './useSheetMusicModel';
import type { PianoVisualizerTabProps, VisualizerDisplayMode } from './types';

export const PianoVisualizerTab: React.FC<PianoVisualizerTabProps> = ({
  analysisResults,
  chordGridData,
  className = '',
  keySignature,
  showCorrectedChords,
  chordCorrections,
  sequenceCorrections = null,
  segmentationData = null,
  currentTime = 0,
  isPlaying = false,
  isChordPlaybackEnabled = false,
  currentBeatIndex = -1,
  audioUrl,
  sheetSageResult = null,
  showMelodicOverlay = false,
}) => {
  const storeAnalysisResults = useAnalysisResults();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();
  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;
  const storeKeySignature = useKeySignature();
  const mergedKeySignature = keySignature ?? storeKeySignature;

  const targetKey = useTargetKey();
  const guitarCapoFret = useGuitarCapoFret();
  const guitarSelectedPositions = useGuitarSelectedPositions();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const { showRomanNumerals, romanNumeralData } = useRomanNumerals() as {
    showRomanNumerals?: boolean;
    romanNumeralData?: { analysis?: string[] } | null;
  };
  const guitarVoicing = useMemo<Partial<GuitarVoicingSelection>>(
    () => ({
      capoFret: guitarCapoFret,
      selectedPositions: guitarSelectedPositions,
    }),
    [guitarCapoFret, guitarSelectedPositions],
  );

  const [speedIndex, setSpeedIndex] = useState(1);
  const [displayMode, setDisplayMode] = useState<VisualizerDisplayMode>('piano-roll');
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());
  const activeNotesSignatureRef = useRef('');
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [mixerSettings, setMixerSettings] = useState<AudioMixerSettings>(() => {
    if (typeof window !== 'undefined') {
      return getAudioMixerService().getSettings();
    }
    return {
      ...DEFAULT_AUDIO_MIXER_SETTINGS,
    };
  });

  const measureContainerWidth = useCallback((container: HTMLDivElement | null) => {
    if (!container) {
      return;
    }

    const width = container.getBoundingClientRect().width;
    setContainerWidth((prev) => (Math.abs(prev - width) >= 1 ? width : prev));
  }, []);

  const setMeasuredContainerRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    if (!node) {
      return;
    }

    measureContainerWidth(node);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth((prev) => (
          Math.abs(prev - entry.contentRect.width) >= 1 ? entry.contentRect.width : prev
        ));
      }
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, [measureContainerWidth]);

  useEffect(() => () => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
  }, []);

  useEffect(() => {
    const mixer = getAudioMixerService();
    const unsub = mixer.addListener((settings) => {
      setMixerSettings((prev) => (areMixerSettingsEqual(prev, settings) ? prev : { ...settings }));
    });
    return unsub;
  }, []);

  const {
    resolvedChordGridData,
    displayedChords,
    isPitchShiftActive,
  } = useResolvedChordDisplayData({
    chordGridData,
    showCorrectedChords: mergedShowCorrectedChords,
    chordCorrections: mergedChordCorrections,
    sequenceCorrections,
  });

  const timelineModel = usePianoVisualizerTimelineModel({
    chordGridData,
    resolvedChordGridData,
    displayedChords,
    mergedKeySignature,
    sequenceCorrections,
    analysisResults: mergedAnalysisResults,
    audioUrl,
    segmentationData,
    sheetSageResult,
    showMelodicOverlay,
    pitchShiftSemitones,
    isChordPlaybackEnabled,
    mixerSettings,
    containerWidth,
    showRomanNumerals,
    romanNumeralData,
  });

  const sheetMusicModel = useSheetMusicModel({
    currentTime,
    displayMode,
    mergedKeySignature,
    sheetSageResult,
    isPitchShiftActive,
    pitchShiftSemitones,
    resolvedChordGridData,
    mergedPlayableChordEvents: timelineModel.mergedPlayableChordEvents,
    notationBeatOffset: timelineModel.notationBeatOffset,
    beatToChordSequenceMap: timelineModel.beatToChordSequenceMap,
    shiftedOriginalChords: timelineModel.shiftedOriginalChords,
    sequenceCorrections,
    detectedBpm: timelineModel.detectedBpm,
    timeSignature: timelineModel.timeSignature,
    segmentationData,
    signalAnalysis: timelineModel.signalAnalysis,
  });

  const effectiveActiveInstruments = useMemo(() => {
    if (isChordPlaybackEnabled) return timelineModel.activeInstruments;
    return [{ name: 'Piano', color: INSTRUMENT_COLORS.piano }];
  }, [isChordPlaybackEnabled, timelineModel.activeInstruments]);

  const legendInstruments = useMemo(() => {
    if (showMelodicOverlay && timelineModel.melodyOverlayNotes.length > 0) {
      return [...effectiveActiveInstruments, { name: 'Melody', color: MELODIC_TRANSCRIPTION_COLOR }];
    }

    return effectiveActiveInstruments;
  }, [effectiveActiveInstruments, showMelodicOverlay, timelineModel.melodyOverlayNotes.length]);

  const handleActiveNotesChange = useCallback((notes: Set<number>, colors: Map<number, string>) => {
    const signature = Array.from(notes)
      .sort((a, b) => a - b)
      .map((note) => `${note}:${colors.get(note) ?? ''}`)
      .join('|');

    if (signature === activeNotesSignatureRef.current) {
      return;
    }

    activeNotesSignatureRef.current = signature;
    setActiveNotes(notes);
    setNoteColors(colors);
  }, []);

  usePianoOnlyPlayback(
    timelineModel.playbackChordEvents,
    currentTime,
    currentBeatIndex,
    isPlaying,
    isChordPlaybackEnabled,
    timelineModel.detectedBpm || 120,
    timelineModel.timeSignature,
    timelineModel.dynamicsAnalyzer,
    segmentationData,
    guitarVoicing,
    targetKey,
  );

  const handleMidiDownload = useCallback(() => {
    if (timelineModel.playbackChordEvents.length === 0) return;

    const instruments = timelineModel.activeInstruments.length > 0
      ? timelineModel.activeInstruments.map((instrument) => ({ name: instrument.name, color: instrument.color }))
      : undefined;
    const additionalTracks = showMelodicOverlay && sheetSageResult?.noteEvents?.length
      ? [{ name: 'Melody Violin', noteEvents: sheetSageResult.noteEvents }]
      : undefined;
    const midiData = exportChordEventsToMidi(timelineModel.playbackChordEvents, {
      instruments,
      bpm: timelineModel.detectedBpm || undefined,
      timeSignature: timelineModel.timeSignature,
      segmentationData,
      signalAnalysis: timelineModel.signalAnalysis,
      additionalTracks,
    });
    if (midiData.length > 0) {
      downloadMidiFile(midiData, 'piano-visualizer.mid');
    }
  }, [
    segmentationData,
    sheetSageResult,
    showMelodicOverlay,
    timelineModel.activeInstruments,
    timelineModel.detectedBpm,
    timelineModel.playbackChordEvents,
    timelineModel.signalAnalysis,
    timelineModel.timeSignature,
  ]);

  if (!mergedAnalysisResults) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-white p-8 shadow-card dark:bg-content-bg ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">Run chord analysis to see piano visualization.</p>
      </div>
    );
  }

  const lookAheadSeconds = speedIndex >= 0 && speedIndex < 3
    ? [6, 4, 2][speedIndex]
    : 4;

  return (
    <div className={`piano-visualizer-tab space-y-3 ${className}`}>
      <PianoVisualizerHeader
        playbackChordEventsCount={timelineModel.playbackChordEvents.length}
        onMidiDownload={handleMidiDownload}
        effectiveDisplayMode={sheetMusicModel.effectiveDisplayMode}
        hasSheetMusicData={sheetMusicModel.hasSheetMusicData}
        sheetMusicDisabledTooltip={sheetMusicModel.sheetMusicDisabledTooltip}
        onDisplayModeChange={setDisplayMode}
        speedIndex={speedIndex}
        onSpeedChange={setSpeedIndex}
      />

      <ScrollingChordStrip
        chordEvents={timelineModel.stripChordEvents}
        currentTime={currentTime}
        isPlaying={isPlaying}
        height={48}
        pixelsPerSecond={100}
        timeSignature={timelineModel.timeSignature}
        accidentalPreference={timelineModel.accidentalPreference}
        beatRomanNumerals={timelineModel.beatRomanNumerals}
        beatModulations={timelineModel.beatModulations}
        uncorrectedChords={resolvedChordGridData?.chords}
        segmentationData={segmentationData}
      />

      {sheetMusicModel.effectiveDisplayMode === 'sheet-music' ? (
        <SheetMusicDisplay
          className="w-full"
          musicXml={sheetMusicModel.sheetMusicXml}
          currentTime={sheetMusicModel.sheetMusicCurrentTime}
          totalDuration={timelineModel.totalDuration}
          bpm={timelineModel.detectedBpm || 120}
          timeSignature={timelineModel.timeSignature}
          isComputing={sheetMusicModel.isSheetMusicComputing}
        />
      ) : (
        <PianoRollPanel
          legendInstruments={legendInstruments}
          isChordPlaybackEnabled={isChordPlaybackEnabled}
          setMeasuredContainerRef={setMeasuredContainerRef}
          keyboardWidth={timelineModel.keyboardWidth}
          playbackChordEvents={timelineModel.playbackChordEvents}
          currentTime={currentTime}
          isPlaying={isPlaying}
          effectiveActiveInstruments={effectiveActiveInstruments}
          detectedBpm={timelineModel.detectedBpm}
          timeSignature={timelineModel.timeSignature}
          segmentationData={segmentationData}
          guitarVoicing={guitarVoicing}
          targetKey={targetKey}
          dynamicsAnalyzer={timelineModel.dynamicsAnalyzer}
          melodyOverlayNotes={timelineModel.melodyOverlayNotes}
          handleActiveNotesChange={handleActiveNotesChange}
          activeNotes={activeNotes}
          noteColors={noteColors}
          whiteKeyWidth={timelineModel.whiteKeyWidth}
          lookAheadSeconds={lookAheadSeconds}
        />
      )}
    </div>
  );
};

export default PianoVisualizerTab;
