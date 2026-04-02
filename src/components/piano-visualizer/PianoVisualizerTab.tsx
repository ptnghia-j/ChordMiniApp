'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ScrollingChordStrip } from '@/components/piano-visualizer/ScrollingChordStrip';
import { PianoKeyboard } from '@/components/piano-visualizer/PianoKeyboard';
import { FallingNotesCanvas, type ActiveInstrument } from '@/components/piano-visualizer/FallingNotesCanvas';
import {
  buildChordTimeline,
  type ChordEvent,
} from '@/utils/chordToMidi';
import { exportChordEventsToMidi, downloadMidiFile } from '@/utils/midiExport';
import { mergeConsecutiveChordEvents } from '@/utils/instrumentNoteGeneration';
import { getSoundfontChordPlaybackService } from '@/services/chord-playback/soundfontChordPlaybackService';
import { useSharedAudioDynamics } from '@/hooks/audio/useSharedAudioDynamics';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';
import type { GuitarVoicingSelection } from '@/utils/guitarVoicing';

import { useAnalysisResults, useShowCorrectedChords, useChordCorrections, useKeySignature } from '@/stores/analysisStore';
import {
  useGuitarCapoFret,
  useGuitarSelectedPositions,
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
import { isInstrumentalTime } from '@/utils/segmentationSections';
import { findChordEventForPlayback as findPlayableChordEvent } from '@/utils/chordEventLookup';
import { useResolvedChordDisplayData } from '@/hooks/chord-analysis/useResolvedChordDisplayData';

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
      service.stopAll();
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

        serviceRef.current.stopAll();
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
        service.stopAll();
        service.updateOptions({ enabled: false });
        pianoOnlyActiveRef.current = false;
      }
    };
  }, []);

  // Stop when playback stops
  useEffect(() => {
    if (!isPlaying && pianoOnlyActiveRef.current) {
      serviceRef.current.stopAll();
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
  showCorrectedChords,
  chordCorrections,
  sequenceCorrections = null,
  segmentationData = null,
  currentTime = 0,
  isPlaying = false,
  isChordPlaybackEnabled = false,
  currentBeatIndex = -1,
  audioUrl,
}) => {
  // Zustand store fallbacks
  const storeAnalysisResults = useAnalysisResults();
  const storeShowCorrectedChords = useShowCorrectedChords();
  const storeChordCorrections = useChordCorrections();
  const mergedAnalysisResults = analysisResults ?? storeAnalysisResults;
  const mergedShowCorrectedChords = showCorrectedChords ?? storeShowCorrectedChords;
  const mergedChordCorrections = chordCorrections ?? storeChordCorrections;
  const storeKeySignature = useKeySignature();

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
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());
  const activeNotesSignatureRef = useRef('');

  // Container ref for responsive width
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Measure container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth((prev) => (
          Math.abs(prev - entry.contentRect.width) >= 1 ? entry.contentRect.width : prev
        ));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
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

  // Build chord event timeline for the piano roll
  const chordEvents = useMemo<ChordEvent[]>(() => {
    if (!resolvedChordGridData) return [];
    return buildChordTimeline(
      displayedChords,
      resolvedChordGridData.beats,
      resolvedChordGridData.paddingCount,
      resolvedChordGridData.shiftCount,
    );
  }, [displayedChords, resolvedChordGridData]);
  const mergedPlayableChordEvents = useMemo(
    () => mergeConsecutiveChordEvents(chordEvents.filter(hasPlayableNotes)),
    [chordEvents],
  );

  // Compute accidental preference for consistent sharp/flat rendering.
  // Key signature (from Gemini) is authoritative; heuristic is fallback.
  const accidentalPreference = useMemo(() => {
    return getDisplayAccidentalPreference({
      chords: displayedChords,
      keySignature: storeKeySignature,
      preserveExactSpelling: Boolean(sequenceCorrections),
    });
  }, [storeKeySignature, displayedChords, sequenceCorrections]);

  // ── Roman numeral support (shared with ChordGrid via stores) ──────────────

  const { showRomanNumerals, romanNumeralData } = useRomanNumerals();

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

    for (const event of chordEvents) {
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
  }, [chordEvents, beatToChordSequenceMap, romanNumeralData, showRomanNumerals]);

  const beatModulations = useMemo(() => {
    const modulations = sequenceCorrections?.keyAnalysis?.modulations;
    if (!modulations?.length) return undefined;

    const map = new Map<number, { isModulation: true; fromKey: string; toKey: string }>();

    for (const event of chordEvents) {
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
  }, [beatToChordSequenceMap, chordEvents, sequenceCorrections?.keyAnalysis?.modulations]);

  // Compute dynamic white key width to fit the full 88-key range
  const whiteKeyWidth = useMemo(() => {
    if (containerWidth <= 0) return 14; // default before measurement
    const calculated = Math.floor(containerWidth / PIANO_WHITE_KEY_COUNT);
    return Math.max(10, Math.min(24, calculated));
  }, [containerWidth]);

  // Determine active instruments from audio mixer
  const autoSaxophoneActive = useMemo(
    () => !!segmentationData && isChordPlaybackEnabled && isInstrumentalTime(segmentationData, currentTime),
    [currentTime, isChordPlaybackEnabled, segmentationData],
  );

  const activeInstruments = useMemo<ActiveInstrument[]>(() => {
    if (!isChordPlaybackEnabled) return [];

    const instruments: ActiveInstrument[] = [];
    if (mixerSettings.pianoVolume > 0) instruments.push({ name: 'Piano', color: INSTRUMENT_COLORS.piano });
    if (mixerSettings.guitarVolume > 0) instruments.push({ name: 'Guitar', color: INSTRUMENT_COLORS.guitar });
    if (mixerSettings.violinVolume > 0) instruments.push({ name: 'Violin', color: INSTRUMENT_COLORS.violin });
    if (mixerSettings.fluteVolume > 0) instruments.push({ name: 'Flute', color: INSTRUMENT_COLORS.flute });
    if (mixerSettings.saxophoneVolume > 0 || autoSaxophoneActive) {
      instruments.push({ name: 'Saxophone', color: INSTRUMENT_COLORS.saxophone });
    }
    if (mixerSettings.bassVolume > 0) instruments.push({ name: 'Bass', color: INSTRUMENT_COLORS.bass });
    return instruments;
  }, [autoSaxophoneActive, isChordPlaybackEnabled, mixerSettings]);

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
    chordEvents,
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

  const handleMidiDownload = useCallback(() => {
    if (chordEvents.length === 0) return;
    const instruments = activeInstruments.length > 0
      ? activeInstruments.map(i => ({ name: i.name, color: i.color }))
      : undefined;
    const midiData = exportChordEventsToMidi(chordEvents, {
      instruments,
      bpm: detectedBpm || undefined,
      timeSignature, // Use detected time signature
      segmentationData,
      signalAnalysis,
    });
    if (midiData.length > 0) {
      downloadMidiFile(midiData, 'chord-progression.mid');
    }
  }, [activeInstruments, chordEvents, detectedBpm, segmentationData, signalAnalysis, timeSignature]);

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

          <div className="flex items-center space-x-3">
            {/* MIDI download button */}
            {chordEvents.length > 0 && (
              <button
                onClick={handleMidiDownload}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
                title="Download chord progression as MIDI file"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                MIDI
              </button>
            )}

            {/* Speed selector */}
            <div className="flex items-center space-x-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                Speed:
              </label>
              <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {SPEED_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    onClick={() => setSpeedIndex(idx)}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      speedIndex === idx
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <ScrollingChordStrip
          chordEvents={chordEvents}
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

      {/* Piano Visualizer Section */}
      <div
        ref={containerRef}
        className="piano-visualizer-section bg-gray-950 dark:bg-gray-950 rounded-lg overflow-hidden"
      >
        {/* Instrument legend (shown when instruments are visualized) */}
        {effectiveActiveInstruments.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900/60 border-b border-gray-800">
            <span className="text-xs uppercase tracking-[0.12em] text-gray-500 font-medium">
              {isChordPlaybackEnabled ? 'Instruments:' : 'Piano Only:'}
            </span>
            {effectiveActiveInstruments.map((inst) => (
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

        {/* Falling notes + keyboard wrapper */}
        <div className="relative overflow-x-auto overflow-y-hidden">
          <div
            className="flex flex-col items-center mx-auto"
            style={{ minWidth: keyboardWidth }}
          >
            {/* Falling notes canvas */}
            <div className="w-full flex justify-center">
              <FallingNotesCanvas
                chordEvents={chordEvents}
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
    </div>
  );
};

export default PianoVisualizerTab;
