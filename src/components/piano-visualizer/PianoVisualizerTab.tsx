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

import { useAnalysisResults, useShowCorrectedChords, useChordCorrections, useKeySignature } from '@/stores/analysisStore';
import { useIsPitchShiftEnabled, usePitchShiftSemitones, useTargetKey, useRomanNumerals } from '@/stores/uiStore';
import { transposeChord } from '@/utils/chordTransposition';
import { computeAccidentalPreference, getAccidentalPreferenceFromKey } from '@/utils/chordUtils';
import { createShiftedChords } from '@/utils/chordProcessing';
import { buildBeatToChordSequenceMap, formatRomanNumeral } from '@/utils/chordFormatting';
import { getAudioMixerService, type AudioMixerSettings } from '@/services/chord-playback/audioMixerService';
import type { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import type { SegmentationResult } from '@/types/chatbotTypes';

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
  } | null;
  segmentationData?: SegmentationResult | null;
  /** Current playback time in seconds */
  currentTime?: number;
  /** Whether audio is currently playing */
  isPlaying?: boolean;
  /** Whether chord playback is enabled */
  isChordPlaybackEnabled?: boolean;
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

// Instrument color palette
const INSTRUMENT_COLORS: Record<string, string> = {
  piano: '#60a5fa',   // blue-400
  guitar: '#34d399',  // emerald-400
  violin: '#a78bfa',  // violet-400
  flute: '#fb923c',   // orange-400
  bass: '#f87171',    // red-400
};

// ─── Component ───────────────────────────────────────────────────────────────

export const PianoVisualizerTab: React.FC<PianoVisualizerTabProps> = ({
  analysisResults,
  chordGridData,
  className = '',
  showCorrectedChords,
  chordCorrections,
  sequenceCorrections = null,
  currentTime = 0,
  isPlaying = false,
  isChordPlaybackEnabled = false,
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
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const targetKey = useTargetKey();

  // Local UI state
  const [speedIndex, setSpeedIndex] = useState(1); // Default: Normal
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());

  // Container ref for responsive width
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Audio mixer settings for instrument detection
  const [mixerSettings, setMixerSettings] = useState<AudioMixerSettings>(() => {
    if (typeof window !== 'undefined') {
      return getAudioMixerService().getSettings();
    }
    return {
      masterVolume: 80, youtubeVolume: 100, pitchShiftedAudioVolume: 30,
      chordPlaybackVolume: 70, pianoVolume: 50, guitarVolume: 60,
      violinVolume: 60, fluteVolume: 50, bassVolume: 40, metronomeVolume: 70,
    };
  });

  // Measure container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Subscribe to audio mixer for instrument volume changes
  useEffect(() => {
    const mixer = getAudioMixerService();
    const unsub = mixer.addListener((settings) => {
      setMixerSettings({ ...settings });
    });
    return unsub;
  }, []);

  const speed = SPEED_PRESETS[speedIndex];

  // Apply pitch shift to chord grid data
  const transposedChordGridData = useMemo(() => {
    if (!isPitchShiftEnabled || pitchShiftSemitones === 0 || !chordGridData) {
      return chordGridData;
    }
    const transposedChords = chordGridData.chords.map((chord) => {
      if (!chord || chord === 'N.C.' || chord === 'N' || chord === 'N/C' || chord === 'NC') return chord;
      return transposeChord(chord, pitchShiftSemitones, targetKey ?? undefined);
    });
    return { ...chordGridData, chords: transposedChords };
  }, [chordGridData, isPitchShiftEnabled, pitchShiftSemitones, targetKey]);

  // Apply chord corrections
  const correctedChords = useMemo(() => {
    if (!transposedChordGridData) return [];
    const chords = [...transposedChordGridData.chords];

    if (mergedShowCorrectedChords && sequenceCorrections) {
      const { originalSequence, correctedSequence } = sequenceCorrections;
      const skipCount = (transposedChordGridData.shiftCount || 0) + (transposedChordGridData.paddingCount || 0);
      for (let i = skipCount; i < chords.length; i++) {
        const seqIndex = i - skipCount;
        if (seqIndex >= 0 && seqIndex < originalSequence.length && originalSequence[seqIndex] === chords[i]) {
          chords[i] = correctedSequence[seqIndex];
        }
      }
    } else if (mergedShowCorrectedChords && mergedChordCorrections) {
      for (let i = 0; i < chords.length; i++) {
        const chord = chords[i];
        if (!chord) continue;
        const rootNote = chord.includes(':') ? chord.split(':')[0] : (chord.match(/^([A-G][#b]?)/)?.[1] || chord);
        const correction = mergedChordCorrections[rootNote];
        if (correction) chords[i] = chord.replace(rootNote, correction);
      }
    }

    return chords;
  }, [transposedChordGridData, mergedShowCorrectedChords, mergedChordCorrections, sequenceCorrections]);

  // Build chord event timeline for the piano roll
  const chordEvents = useMemo<ChordEvent[]>(() => {
    if (!transposedChordGridData) return [];
    return buildChordTimeline(
      correctedChords,
      transposedChordGridData.beats,
      transposedChordGridData.paddingCount,
      transposedChordGridData.shiftCount,
    );
  }, [correctedChords, transposedChordGridData]);

  // Compute accidental preference for consistent sharp/flat rendering.
  // Key signature (from Gemini) is authoritative; heuristic is fallback.
  const accidentalPreference = useMemo(() => {
    const keyPref = getAccidentalPreferenceFromKey(storeKeySignature);
    if (keyPref) return keyPref;
    return computeAccidentalPreference(correctedChords);
  }, [storeKeySignature, correctedChords]);

  // ── Roman numeral support (shared with ChordGrid via stores) ──────────────

  const { showRomanNumerals, romanNumeralData } = useRomanNumerals();

  const timeSignature = mergedAnalysisResults?.beatDetectionResult?.time_signature || 4;

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

  // Calculate keyboard width
  const keyboardWidth = useMemo(() => {
    return PIANO_WHITE_KEY_COUNT * whiteKeyWidth;
  }, [whiteKeyWidth]);

  // Handle active notes from canvas
  const handleActiveNotesChange = useCallback((notes: Set<number>, colors: Map<number, string>) => {
    setActiveNotes(notes);
    setNoteColors(colors);
  }, []);

  // MIDI export handler
  const detectedBpm = mergedAnalysisResults?.beatDetectionResult?.bpm;
  const handleMidiDownload = useCallback(() => {
    if (chordEvents.length === 0) return;
    const instruments = activeInstruments.length > 0
      ? activeInstruments.map(i => ({ name: i.name, color: i.color }))
      : undefined;
    const midiData = exportChordEventsToMidi(chordEvents, {
      instruments,
      bpm: detectedBpm || undefined,
      timeSignature: 4, // Always 4/4 — beat detection time_signature is unreliable
    });
    if (midiData.length > 0) {
      downloadMidiFile(midiData, 'chord-progression.mid');
    }
  }, [chordEvents, activeInstruments, detectedBpm]);

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
          uncorrectedChords={transposedChordGridData?.chords}
        />
      </div>

      {/* Piano Visualizer Section */}
      <div
        ref={containerRef}
        className="piano-visualizer-section bg-gray-950 dark:bg-gray-950 rounded-lg overflow-hidden"
      >
        {/* Instrument legend (shown when chord playback is active) */}
        {activeInstruments.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900/60 border-b border-gray-800">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Instruments:</span>
            {activeInstruments.map((inst) => (
              <div key={inst.name} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: inst.color }}
                />
                <span className="text-[11px] text-gray-400">{inst.name}</span>
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
                activeInstruments={activeInstruments}
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
