'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Tabs, Tab } from '@heroui/react';
import { ScrollingChordStrip } from '@/components/piano-visualizer/ScrollingChordStrip';
import { PianoKeyboard } from '@/components/piano-visualizer/PianoKeyboard';
import { FallingNotesCanvas, type ActiveInstrument } from '@/components/piano-visualizer/FallingNotesCanvas';
import SheetMusicDisplay from '@/components/piano-visualizer/SheetMusicDisplay';
import {
  buildChordTimeline,
  type ChordEvent,
} from '@/utils/chordToMidi';
import { exportChordEventsToMidi, downloadMidiFile } from '@/utils/midiExport';
import {
  mergeConsecutiveChordEvents,
} from '@/utils/instrumentNoteGeneration';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';
import type { SheetSageResult } from '@/types/sheetSage';
import {
  exportLeadSheetToMusicXml,
  exportPianoVisualizerScoreToMusicXml,
  type MusicXmlKeySection,
} from '@/utils/musicXmlExport';

import { useAnalysisResults, useShowCorrectedChords, useChordCorrections, useKeySignature } from '@/stores/analysisStore';
import {
  useGuitarCapoFret,
  useGuitarSelectedPositions,
  usePitchShiftSemitones,
  useTargetKey,
  useRomanNumerals,
} from '@/stores/uiStore';
import { getDisplayAccidentalPreference } from '@/utils/chordUtils';
import {
  createShiftedChords,
} from '@/utils/chordProcessing';
import { buildBeatToChordSequenceMap, formatRomanNumeral } from '@/utils/chordFormatting';
import { getAudioMixerService, type AudioMixerSettings } from '@/services/chord-playback/audioMixerService';
import { DEFAULT_AUDIO_MIXER_SETTINGS, DEFAULT_PIANO_VOLUME } from '@/config/audioDefaults';
import type { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import type { SegmentationResult } from '@/types/chatbotTypes';
import { findChordEventForPlayback as findPlayableChordEvent } from '@/utils/chordEventLookup';
import { useResolvedChordDisplayData } from '@/hooks/chord-analysis/useResolvedChordDisplayData';
import { buildSheetSageExtraVisualNotes } from '@/utils/sheetSagePlayback';
import AppTooltip from '@/components/common/AppTooltip';
import { isSilentChord } from '@/services/chord-analysis/gridShared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChordGridData {
  chords: string[];
  beats: (number | null)[];
  hasPadding: boolean;
  paddingCount: number;
  shiftCount: number;
  totalPaddingCount?: number;
  originalAudioMapping?: Array<{
    chord: string;
    timestamp: number;
    visualIndex: number;
    audioIndex: number;
  }>;
}

interface PianoVisualizerTabProps {
  analysisResults?: AnalysisResult | null;
  chordGridData: ChordGridData;
  className?: string;
  keySignature?: string | null;
  isDetectingKey?: boolean;
  isChatbotOpen?: boolean;
  isLyricsPanelOpen?: boolean;
  isUploadPage?: boolean;
  showCorrectedChords?: boolean;
  chordCorrections?: Record<string, string> | null;
  sequenceCorrections?: {
    originalSequence: string[];
    correctedSequence: string[];
    keyAnalysis?: {
      sections: Array<{
        startIndex: number;
        endIndex: number;
        key: string;
        chords: string[];
      }>;
      modulations?: Array<{
        fromKey: string;
        toKey: string;
        atIndex: number;
        atTime?: number;
      }>;
    };
  } | null;
  segmentationData?: SegmentationResult | null;
  /** Current playback time in seconds */
  currentTime?: number;
  /** Whether audio is currently playing */
  isPlaying?: boolean;
  /** Whether chord playback is enabled */
  isChordPlaybackEnabled?: boolean;
  /** High-frequency beat index from the shared playback tracker */
  currentBeatIndex?: number;
  /** Resolved audio URL used for background signal analysis */
  audioUrl?: string | null;
  /** Optional melodic transcription note events shown as a separate overlay */
  sheetSageResult?: SheetSageResult | null;
  /** Whether the melodic transcription overlay should be shown */
  showMelodicOverlay?: boolean;
}

const PLAYBACK_EVENT_BOUNDARY_TOLERANCE = 0.08;
const PLAYBACK_EVENT_MISS_GRACE_PERIOD = 0.12;

function hasPlayableNotes(event: ChordEvent): boolean {
  return event.notes.length > 0;
}

function findChordEventForPlayback(
  events: ChordEvent[],
  currentTime: number,
  currentBeatIndex: number,
  toleranceSeconds = PLAYBACK_EVENT_BOUNDARY_TOLERANCE,
): ChordEvent | null {
  return findPlayableChordEvent(events, currentTime, currentBeatIndex, toleranceSeconds);
}

function findClosestTimedBeatIndex(
  beatTimes: Array<number | null> | undefined,
  targetTime: number,
  startIndex = 0,
): number | null {
  if (!beatTimes?.length || !Number.isFinite(targetTime)) {
    return null;
  }

  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = Math.max(0, startIndex); index < beatTimes.length; index += 1) {
    const beatTime = beatTimes[index];
    if (typeof beatTime !== 'number' || !Number.isFinite(beatTime)) {
      continue;
    }

    const distance = Math.abs(beatTime - targetTime);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }

    if (closestIndex !== null && beatTime > targetTime && distance > closestDistance) {
      break;
    }
  }

  return closestIndex;
}

function countLeadingShiftChordSlots(chords: string[] | undefined): number {
  if (!chords?.length) {
    return 0;
  }

  let count = 0;
  while (count < chords.length) {
    const chord = (chords[count] ?? '').trim();
    if (chord.length > 0) {
      break;
    }
    count += 1;
  }

  return count;
}

function countLeadingNullBeatSlots(beatTimes: Array<number | null> | undefined): number {
  if (!beatTimes?.length) {
    return 0;
  }

  let count = 0;
  while (count < beatTimes.length) {
    const beatTime = beatTimes[count];
    if (typeof beatTime === 'number' && Number.isFinite(beatTime)) {
      break;
    }
    count += 1;
  }

  return count;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Full 88-key piano range (A0 to C8)
const PIANO_START_MIDI = 21;
const PIANO_END_MIDI = 108;
const PIANO_WHITE_KEY_COUNT = 52; // 88-key piano has 52 white keys

// Look-ahead time presets
const SPEED_PRESETS = [
  { label: 'Slow', lookAhead: 6, description: 'More time to read ahead' },
  { label: 'Normal', lookAhead: 4, description: 'Balanced view' },
  { label: 'Fast', lookAhead: 2, description: 'Compact, closer timing' },
] as const;

function areMixerSettingsEqual(a: AudioMixerSettings, b: AudioMixerSettings): boolean {
  return (
    a.pianoVolume === b.pianoVolume
    && a.guitarVolume === b.guitarVolume
    && a.violinVolume === b.violinVolume
    && a.melodyVolume === b.melodyVolume
    && a.fluteVolume === b.fluteVolume
    && a.bassVolume === b.bassVolume
    && a.saxophoneVolume === b.saxophoneVolume
    && a.chordPlaybackVolume === b.chordPlaybackVolume
  );
}

// Instrument color palette
const INSTRUMENT_COLORS: Record<string, string> = {
  piano: '#60a5fa',   // blue-400
  guitar: '#34d399',  // emerald-400
  violin: '#a78bfa',  // violet-400
  flute: '#fb923c',   // orange-400
  saxophone: '#facc15', // yellow-400
  bass: '#f87171',    // red-400
};
const MELODIC_TRANSCRIPTION_COLOR = '#22d3ee';
type VisualizerDisplayMode = 'piano-roll' | 'sheet-music';

// ─── Piano-Only Auto-Playback Hook ───────────────────────────────────────────

/**
 * When the Piano Visualizer tab is active and chord playback toggle is OFF,
 * automatically play piano-only sounds matching the visualizer's note patterns.
 */
function usePianoOnlyPlayback(
  chordEvents: ChordEvent[],
  currentTime: number,
  currentBeatIndex: number,
  isPlaying: boolean,
  isChordPlaybackEnabled: boolean,
  bpm: number,
  timeSignature: number = 4,
  dynamicsAnalyzer: DynamicsAnalyzer,
  segmentationData?: SegmentationResult | null,
  guitarVoicing?: Partial<GuitarVoicingSelection>,
  targetKey?: string,
) {
  const lastPlayedChordRef = useRef<string | null>(null);
  const serviceRef = useRef(getSoundfontChordPlaybackService());
  const pianoOnlyActiveRef = useRef(false);
  const eventMissStartedAtRef = useRef<number | null>(null);

  // Determine whether piano-only mode should be active
  const shouldActivate = !isChordPlaybackEnabled && isPlaying;

  // Merge events to match playback granularity (one per chord change)
  const merged = useMemo(
    () => mergeConsecutiveChordEvents(chordEvents.filter(hasPlayableNotes)),
    [chordEvents],
  );
  const totalDuration = useMemo(
    () => (merged.length > 0 ? merged[merged.length - 1].endTime : undefined),
    [merged],
  );

  // Activate / deactivate piano-only mode
  useEffect(() => {
    const service = serviceRef.current;

    if (shouldActivate) {
      // Enable service with piano only (all other instruments at 0)
      service.updateOptions({
        enabled: true,
        pianoVolume: DEFAULT_PIANO_VOLUME,
        guitarVolume: 0,
        violinVolume: 0,
        fluteVolume: 0,
        saxophoneVolume: 0,
        bassVolume: 0,
      });
      pianoOnlyActiveRef.current = true;
    } else if (pianoOnlyActiveRef.current) {
      // Deactivate: stop any piano-only notes
      service.stopInstruments(['piano']);
      // Only disable the service if chord playback is NOT taking over.
      // When isChordPlaybackEnabled is true, useChordPlayback has already
      // called updateOptions({ enabled: true }), so disabling here would
      // race and leave the service disabled.
      if (!isChordPlaybackEnabled) {
        service.updateOptions({ enabled: false });
      }
      pianoOnlyActiveRef.current = false;
      lastPlayedChordRef.current = null;
    }
  }, [shouldActivate, isChordPlaybackEnabled]);

  // Find and play the current chord on time changes
  useEffect(() => {
    if (!shouldActivate || merged.length === 0) return;

    const currentChordEvent = findChordEventForPlayback(merged, currentTime, currentBeatIndex);

    if (!currentChordEvent) {
      if (lastPlayedChordRef.current !== null) {
        if (eventMissStartedAtRef.current === null) {
          eventMissStartedAtRef.current = currentTime;
          return;
        }

        if (currentTime - eventMissStartedAtRef.current < PLAYBACK_EVENT_MISS_GRACE_PERIOD) {
          return;
        }

        serviceRef.current.stopInstruments(['piano']);
        lastPlayedChordRef.current = null;
        eventMissStartedAtRef.current = null;
      }
      return;
    }

    eventMissStartedAtRef.current = null;

    // Only trigger on chord changes
    if (currentChordEvent.chordName === lastPlayedChordRef.current) return;

    const duration = currentChordEvent.endTime - currentChordEvent.startTime;

    // Calculate dynamic velocity for musical expression
    const signalDynamics = dynamicsAnalyzer.getSignalDynamics(currentChordEvent.startTime, duration);
    const dynamicVelocity = dynamicsAnalyzer.getVelocityMultiplier(
      currentChordEvent.startTime,
      currentChordEvent.beatIndex,
      currentChordEvent.chordName,
      duration,
      signalDynamics,
    );

    serviceRef.current.playChord(
      currentChordEvent.chordName,
      duration,
      bpm,
      dynamicVelocity,
      {
        startTime: currentChordEvent.startTime,
        playbackTime: currentTime,
        totalDuration,
        beatCount: currentChordEvent.beatCount,
        segmentationData,
        signalDynamics,
      },
      timeSignature,
      guitarVoicing,
      targetKey,
    );
    lastPlayedChordRef.current = currentChordEvent.chordName;
  }, [
    bpm,
    currentBeatIndex,
    currentTime,
    dynamicsAnalyzer,
    guitarVoicing,
    merged,
    segmentationData,
    shouldActivate,
    targetKey,
    timeSignature,
    totalDuration,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    const service = serviceRef.current;
    return () => {
      if (pianoOnlyActiveRef.current) {
        service.stopInstruments(['piano']);
        service.updateOptions({ enabled: false });
        pianoOnlyActiveRef.current = false;
      }
    };
  }, []);

  // Stop when playback stops
  useEffect(() => {
    if (!isPlaying && pianoOnlyActiveRef.current) {
      serviceRef.current.stopInstruments(['piano']);
      lastPlayedChordRef.current = null;
      eventMissStartedAtRef.current = null;
    }
  }, [isPlaying]);
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  // Zustand store fallbacks
  const storeAnalysisResults = useAnalysisResults();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();
  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;
  const storeKeySignature = useKeySignature();
  const mergedKeySignature = keySignature ?? storeKeySignature;

  // Pitch shift
  const targetKey = useTargetKey();
  const guitarCapoFret = useGuitarCapoFret();
  const guitarSelectedPositions = useGuitarSelectedPositions();
  const guitarVoicing = useMemo<Partial<GuitarVoicingSelection>>(
    () => ({
      capoFret: guitarCapoFret,
      selectedPositions: guitarSelectedPositions,
    }),
    [guitarCapoFret, guitarSelectedPositions],
  );

  // Local UI state
  const [speedIndex, setSpeedIndex] = useState(1); // Default: Normal
  const [displayMode, setDisplayMode] = useState<VisualizerDisplayMode>('piano-roll');
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());
  const activeNotesSignatureRef = useRef('');

  // Container ref for responsive width
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Audio mixer settings for instrument detection
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
    containerRef.current = node;

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

  // Subscribe to audio mixer for instrument volume changes
  useEffect(() => {
    const mixer = getAudioMixerService();
    const unsub = mixer.addListener((settings) => {
      setMixerSettings(prev => (areMixerSettingsEqual(prev, settings) ? prev : { ...settings }));
    });
    return unsub;
  }, []);

  const speed = SPEED_PRESETS[speedIndex];

  const { resolvedChordGridData, displayedChords } = useResolvedChordDisplayData({
    chordGridData,
    showCorrectedChords: mergedShowCorrectedChords,
    chordCorrections: mergedChordCorrections,
    sequenceCorrections,
  });

  // Build the exact playback-aligned chord event timeline from the same
  // chord source that the chord playback manager uses.
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

  // Compute accidental preference for consistent sharp/flat rendering.
  // Key signature (from Gemini) is authoritative; heuristic is fallback.
  const accidentalPreference = useMemo(() => {
    return getDisplayAccidentalPreference({
      chords: displayedChords,
      keySignature: mergedKeySignature,
      preserveExactSpelling: Boolean(sequenceCorrections),
    });
  }, [displayedChords, mergedKeySignature, sequenceCorrections]);

  // ── Roman numeral support (shared with ChordGrid via stores) ──────────────

  const { showRomanNumerals, romanNumeralData } = useRomanNumerals();
  const pitchShiftSemitones = usePitchShiftSemitones();

  const timeSignature = mergedAnalysisResults?.beatDetectionResult?.time_signature || 4;
  const detectedBpm = mergedAnalysisResults?.beatDetectionResult?.bpm;
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

  // Shifted original chords for roman numeral beat-to-sequence mapping
  const shiftedOriginalChords = useMemo(() => {
    if (!chordGridData?.chords) return [];
    return createShiftedChords(
      chordGridData.chords,
      chordGridData.hasPadding,
      timeSignature,
      chordGridData.shiftCount,
    );
  }, [chordGridData, timeSignature]);

  const notationBeatOffset = useMemo(() => (
    countLeadingShiftChordSlots(resolvedChordGridData?.chords)
  ), [resolvedChordGridData?.chords]);

  // Map beat indices → chord-sequence indices (for romanNumeralData.analysis[])
  const beatToChordSequenceMap = useMemo(() => {
    if (!chordGridData?.chords?.length) return {};
    return buildBeatToChordSequenceMap(
      chordGridData.chords.length,
      shiftedOriginalChords,
      romanNumeralData,
      sequenceCorrections ?? null,
    );
  }, [chordGridData, shiftedOriginalChords, romanNumeralData, sequenceCorrections]);

  // Pre-compute Map<beatIndex, formattedRomanNumeral> for ScrollingChordStrip
  const beatRomanNumerals = useMemo(() => {
    if (!romanNumeralData?.analysis || !showRomanNumerals) return undefined;
    const map = new Map<number, React.ReactElement | string>();
    const formatCache = new Map<string, React.ReactElement | string>();

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

  const sheetMusicKeySections = useMemo<MusicXmlKeySection[] | undefined>(() => {
    const sections = sequenceCorrections?.keyAnalysis?.sections;
    const modulations = sequenceCorrections?.keyAnalysis?.modulations;
    const rawKeyEntries = sections?.length
      ? sections.map((section) => ({
          startIndex: section.startIndex,
          keySignature: section.key,
        }))
      : [
          ...(mergedKeySignature?.trim()
            ? [{ startIndex: 0, keySignature: mergedKeySignature.trim() }]
            : []),
          ...((modulations ?? []).map((modulation) => ({
            startIndex: modulation.atIndex,
            keySignature: modulation.toKey,
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
    shiftedOriginalChords.length,
  ]);

  // Compute dynamic white key width to fit the full 88-key range
  const whiteKeyWidth = useMemo(() => {
    if (containerWidth <= 0) return 14; // default before measurement
    const calculated = Math.floor(containerWidth / PIANO_WHITE_KEY_COUNT);
    return Math.max(10, Math.min(24, calculated));
  }, [containerWidth]);

  // Determine active instruments from audio mixer
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

  // Calculate keyboard width
  const keyboardWidth = useMemo(() => {
    return PIANO_WHITE_KEY_COUNT * whiteKeyWidth;
  }, [whiteKeyWidth]);

  // Handle active notes from canvas
  const handleActiveNotesChange = useCallback((notes: Set<number>, colors: Map<number, string>) => {
    const signature = Array.from(notes)
      .sort((a, b) => a - b)
      .map(note => `${note}:${colors.get(note) ?? ''}`)
      .join('|');

    if (signature === activeNotesSignatureRef.current) {
      return;
    }

    activeNotesSignatureRef.current = signature;
    setActiveNotes(notes);
    setNoteColors(colors);
  }, []);

  // Piano-only auto-playback: plays piano when visualizer tab is active but chord playback is off
  usePianoOnlyPlayback(
    playbackChordEvents,
    currentTime,
    currentBeatIndex,
    isPlaying,
    isChordPlaybackEnabled,
    detectedBpm || 120,
    timeSignature,
    dynamicsAnalyzer,
    segmentationData,
    guitarVoicing,
    targetKey,
  );

  // Determine active instruments for visualization
  // When piano-only mode is active (chord playback OFF), show piano notes on the visualizer
  const effectiveActiveInstruments = useMemo<ActiveInstrument[]>(() => {
    if (isChordPlaybackEnabled) return activeInstruments;
    // Piano-only mode: show piano notes on the visualizer
    return [{ name: 'Piano', color: INSTRUMENT_COLORS.piano }];
  }, [isChordPlaybackEnabled, activeInstruments]);

  const hasLeadSheetData = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
  const hasPianoSheetData = mergedPlayableChordEvents.length > 0;
  const hasSheetMusicData = hasPianoSheetData || hasLeadSheetData;
  const sheetMusicDisabledTooltip = 'Sheet music requires playable piano chords or melody transcription.';
  const musicXmlOptions = useMemo(() => ({
    bpm: detectedBpm || undefined,
    timeSignature,
    title: 'ChordMini Lead Sheet',
    keySignature: mergedKeySignature,
  }), [detectedBpm, mergedKeySignature, timeSignature]);
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
    let resolvedPickupReason = 'fallback_zero';

    if (typeof resolvedChordGridData?.paddingCount === 'number' && Number.isFinite(resolvedChordGridData.paddingCount)) {
      const normalizedPaddingCount = Math.max(0, Math.round(resolvedChordGridData.paddingCount));
      resolvedPickupBeatCount = normalizePickupCount(normalizedPaddingCount);
      resolvedPickupReason = 'padding_count_fallback';
    } else if (normalizedLeadingSilentPickup !== null) {
      resolvedPickupBeatCount = normalizedLeadingSilentPickup;
      resolvedPickupReason = 'leading_null_beat_fallback';
    } else if (normalizedFirstPlayablePickup !== null) {
      resolvedPickupBeatCount = normalizedFirstPlayablePickup;
      resolvedPickupReason = 'first_playable_event_fallback';
    } else if (!sheetMusicBeatTimes?.length) {
      resolvedPickupBeatCount = 0;
      resolvedPickupReason = 'no_beat_times';
    }

    const normalizedFirstNonSilentVisibleGridPickup = firstNonSilentVisibleGridIndex !== null
      ? normalizePickupCount(firstNonSilentVisibleGridIndex)
      : null;
    if (normalizedFirstNonSilentVisibleGridPickup !== null) {
      resolvedPickupBeatCount = normalizedFirstNonSilentVisibleGridPickup;
      resolvedPickupReason = 'first_non_silent_visible_grid';
    }

    const hasMelodyNotes = (sheetSageResult?.noteEvents?.length ?? 0) > 0;
    const preferInferredExportPickup = hasMelodyNotes
      && normalizedFirstNonSilentVisibleGridPickup !== null
      && normalizedPaddingPickup !== null
      && normalizedFirstNonSilentVisibleGridPickup > normalizedPaddingPickup;

    return {
      resolvedPickupBeatCount,
      resolvedPickupReason,
      normalizedPaddingPickup,
      preferInferredExportPickup,
      timeSignature,
      notationBeatOffset,
      paddingCount: resolvedChordGridData?.paddingCount ?? null,
      shiftCount: resolvedChordGridData?.shiftCount ?? null,
      totalPaddingCount: resolvedChordGridData?.totalPaddingCount ?? null,
      firstNonSilentVisibleGridIndex,
      normalizedFirstNonSilentVisibleGridPickup,
      firstPlayableBeatIndex: Number.isFinite(firstPlayableBeatIndex) ? firstPlayableBeatIndex : null,
      normalizedFirstPlayablePickup,
      leadingSilentCells,
      normalizedLeadingSilentPickup,
      previewGridChords: resolvedChordGridData?.chords?.slice(notationBeatOffset, notationBeatOffset + 20) ?? [],
      previewGridBeats: resolvedChordGridData?.beats?.slice(notationBeatOffset, notationBeatOffset + 20) ?? [],
      previewSheetChordEvents: sheetMusicChordEvents.slice(0, 8).map((event) => ({
        chordName: event.chordName,
        beatIndex: event.beatIndex,
        startTime: Number.isFinite(event.startTime)
          ? Number(event.startTime.toFixed(4))
          : event.startTime,
      })),
      previewSheetMelodyBeatTimes: sheetMusicBeatTimes?.slice(0, 20) ?? [],
    };
  }, [notationBeatOffset, resolvedChordGridData, sheetMusicBeatTimes, sheetMusicChordEvents, sheetSageResult?.noteEvents?.length, timeSignature]);

  const sheetMusicPickupBeatCount = sheetPickupResolution.resolvedPickupBeatCount;
  const exportedSheetMusicPickupBeatCount = sheetPickupResolution.preferInferredExportPickup
    ? undefined
    : sheetMusicPickupBeatCount;

  const sheetMusicXml = useMemo(() => {
    if (hasPianoSheetData) {
      return exportPianoVisualizerScoreToMusicXml({
        chordEvents: sheetMusicChordEvents,
        melodyNoteEvents: sheetSageResult?.noteEvents,
        melodyBeatTimes: sheetMusicBeatTimes,
        pickupBeatCount: exportedSheetMusicPickupBeatCount,
        bpm: detectedBpm || undefined,
        timeSignature,
        title: 'ChordMini Piano Visualizer Score',
        keySignature: mergedKeySignature,
        keySections: sheetMusicKeySections,
        segmentationData,
        signalAnalysis,
      });
    }

    if (!hasLeadSheetData || !sheetSageResult) {
      return '';
    }

    return exportLeadSheetToMusicXml(sheetSageResult.noteEvents, mergedPlayableChordEvents, musicXmlOptions);
  }, [
    detectedBpm,
    hasLeadSheetData,
    hasPianoSheetData,
    mergedKeySignature,
    mergedPlayableChordEvents,
    musicXmlOptions,
    sheetMusicChordEvents,
    sheetMusicBeatTimes,
    exportedSheetMusicPickupBeatCount,
    sheetMusicKeySections,
    segmentationData,
    sheetSageResult,
    signalAnalysis,
    timeSignature,
  ]);

  const effectiveDisplayMode: VisualizerDisplayMode = hasSheetMusicData ? displayMode : 'piano-roll';
  const legendInstruments = useMemo(() => {
    if (showMelodicOverlay && melodyOverlayNotes.length > 0) {
      return [...effectiveActiveInstruments, { name: 'Melody', color: MELODIC_TRANSCRIPTION_COLOR }];
    }

    return effectiveActiveInstruments;
  }, [effectiveActiveInstruments, melodyOverlayNotes.length, showMelodicOverlay]);

  const handleMidiDownload = useCallback(() => {
    if (playbackChordEvents.length === 0) return;
    const instruments = activeInstruments.length > 0
      ? activeInstruments.map(i => ({ name: i.name, color: i.color }))
      : undefined;
    const additionalTracks = showMelodicOverlay && sheetSageResult?.noteEvents?.length
      ? [
          {
            name: 'Melody Violin',
            noteEvents: sheetSageResult.noteEvents,
          },
        ]
      : undefined;
    const midiData = exportChordEventsToMidi(playbackChordEvents, {
      instruments,
      bpm: detectedBpm || undefined,
      timeSignature, // Use detected time signature
      segmentationData,
      signalAnalysis,
      additionalTracks,
    });
    if (midiData.length > 0) {
      downloadMidiFile(midiData, 'piano-visualizer.mid');
    }
  }, [
    activeInstruments,
    detectedBpm,
    playbackChordEvents,
    segmentationData,
    sheetSageResult,
    showMelodicOverlay,
    signalAnalysis,
    timeSignature,
  ]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!mergedAnalysisResults) {
    return (
      <div className={`flex items-center justify-center p-8 bg-white dark:bg-content-bg rounded-lg shadow-card ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">Run chord analysis to see piano visualization.</p>
      </div>
    );
  }

  return (
    <div className={`piano-visualizer-tab space-y-3 ${className}`}>
      {/* Scrolling Chord Timeline */}
      <div className="chord-timeline-section">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-y-2">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
            Chord Timeline
          </h3>

          <div className="flex items-center space-x-3 flex-wrap justify-end">
            {/* MIDI download button */}
            {playbackChordEvents.length > 0 && (
              <AppTooltip content="Download the currently visible piano visualizer notes as MIDI">
                <button
                  onClick={handleMidiDownload}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  MIDI
                </button>
              </AppTooltip>
            )}

            <Tabs
              aria-label="Piano visualizer display mode"
              selectedKey={effectiveDisplayMode}
              onSelectionChange={(key) => setDisplayMode(key as VisualizerDisplayMode)}
              size="sm"
              radius="full"
              classNames={{
                tabList: 'bg-gray-100 dark:bg-gray-800 p-1',
                cursor: 'bg-white dark:bg-gray-700 shadow-sm',
                tab: 'h-7 px-3',
                tabContent: 'text-xs font-medium text-gray-700 group-data-[selected=true]:text-gray-900 dark:text-gray-300 dark:group-data-[selected=true]:text-white',
              }}
            >
              <Tab key="piano-roll" title="Piano Roll" />
              <Tab
                key="sheet-music"
                title={
                  <AppTooltip content={sheetMusicDisabledTooltip} isDisabled={hasSheetMusicData}>
                    <span title={process.env.NODE_ENV === 'test' ? sheetMusicDisabledTooltip : undefined}>Sheet Music</span>
                  </AppTooltip>
                }
                isDisabled={!hasSheetMusicData}
              />
            </Tabs>

            {/* Speed selector */}
            <div className={`flex items-center space-x-1.5 ${effectiveDisplayMode === 'sheet-music' ? 'opacity-50' : ''}`}>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                Speed:
              </label>
              <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {SPEED_PRESETS.map((preset, idx) => (
                  <AppTooltip key={preset.label} content={preset.description}>
                    <span className="inline-flex">
                      <button
                        onClick={() => setSpeedIndex(idx)}
                        disabled={effectiveDisplayMode === 'sheet-music'}
                        className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                          speedIndex === idx
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    </span>
                  </AppTooltip>
                ))}
              </div>
            </div>
          </div>
        </div>

        <ScrollingChordStrip
          chordEvents={stripChordEvents}
          currentTime={currentTime}
          isPlaying={isPlaying}
          height={48}
          pixelsPerSecond={100}
          timeSignature={timeSignature}
          accidentalPreference={accidentalPreference}
          beatRomanNumerals={beatRomanNumerals}
          beatModulations={beatModulations}
          uncorrectedChords={resolvedChordGridData?.chords}
          segmentationData={segmentationData}
        />
      </div>

      {effectiveDisplayMode === 'sheet-music' ? (
        <SheetMusicDisplay
          className="w-full"
          musicXml={sheetMusicXml}
          currentTime={currentTime}
          totalDuration={totalDuration}
          bpm={detectedBpm || 120}
          timeSignature={timeSignature}
        />
      ) : (
        <div
          ref={setMeasuredContainerRef}
          className="piano-visualizer-section rounded-lg overflow-hidden bg-gray-950 dark:bg-gray-950"
        >
          {/* Instrument legend (shown when instruments are visualized) */}
          {legendInstruments.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900/60 border-b border-gray-800">
              <span className="text-xs uppercase tracking-[0.12em] text-gray-500 font-medium">
                {isChordPlaybackEnabled ? 'Instruments:' : 'Visualizer Voices:'}
              </span>
              {legendInstruments.map((inst) => (
                <div key={inst.name} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: inst.color }}
                  />
                  <span className="text-xs font-medium text-gray-400">{inst.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="relative overflow-x-auto overflow-y-hidden">
            <div
              className="flex flex-col items-center mx-auto"
              style={{ minWidth: keyboardWidth }}
            >
              {/* Falling notes canvas */}
              <div className="w-full flex justify-center">
                <FallingNotesCanvas
                  chordEvents={playbackChordEvents}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  startMidi={PIANO_START_MIDI}
                  endMidi={PIANO_END_MIDI}
                  whiteKeyWidth={whiteKeyWidth}
                  lookAheadSeconds={speed.lookAhead}
                  lookBehindSeconds={0.5}
                  height={280}
                  activeInstruments={effectiveActiveInstruments}
                  bpm={detectedBpm || undefined}
                  timeSignature={timeSignature}
                  segmentationData={segmentationData}
                  guitarVoicing={guitarVoicing}
                  targetKey={targetKey}
                  signalDynamicsSource={dynamicsAnalyzer}
                  playbackTime={currentTime}
                  extraVisualNotes={melodyOverlayNotes}
                  onActiveNotesChange={handleActiveNotesChange}
                />
              </div>

              {/* Piano keyboard */}
              <div className="w-full flex justify-center pb-2 bg-gradient-to-b from-gray-950 to-gray-900">
                <PianoKeyboard
                  startMidi={PIANO_START_MIDI}
                  endMidi={PIANO_END_MIDI}
                  activeNotes={activeNotes}
                  noteColors={noteColors}
                  whiteKeyWidth={whiteKeyWidth}
                  height={60}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PianoVisualizerTab;
