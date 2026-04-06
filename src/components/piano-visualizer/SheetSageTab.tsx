'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FallingNotesCanvas } from '@/components/piano-visualizer/FallingNotesCanvas';
import { PianoKeyboard } from '@/components/piano-visualizer/PianoKeyboard';
import {
  useIsCheckingSheetSageBackend,
  useIsComputingSheetSage,
  useIsSheetSageBackendAvailable,
  useSheetSageBackendError,
  useSheetSageActions,
  useSheetSageError,
  useSheetSageResult,
} from '@/stores/analysisStore';
import { requestSheetSageTranscription } from '@/services/sheetsage/sheetSageTranscriptionClient';
import { convertSheetSageToChordEvents } from '@/utils/sheetSagePlayback';
import AppTooltip from '@/components/common/AppTooltip';

interface SheetSageTabProps {
  audioUrl?: string | null;
  audioFile?: File | null;
  currentTime?: number;
  isPlaying?: boolean;
  className?: string;
  videoId?: string | null;
}

const PIANO_START_MIDI = 21;
const PIANO_END_MIDI = 108;
const PIANO_WHITE_KEY_COUNT = 52;
const DEFAULT_WHITE_KEY_WIDTH = 14;
const SPEED_PRESETS = [
  { label: 'Slow', lookAhead: 6, description: 'More time to read ahead' },
  { label: 'Normal', lookAhead: 4, description: 'Balanced view' },
  { label: 'Fast', lookAhead: 2, description: 'Compact, closer timing' },
] as const;

export const SheetSageTab: React.FC<SheetSageTabProps> = ({
  audioUrl = null,
  audioFile = null,
  currentTime = 0,
  isPlaying = false,
  className = '',
  videoId = null,
}) => {
  const sheetSageResult = useSheetSageResult();
  const isComputingSheetSage = useIsComputingSheetSage();
  const sheetSageError = useSheetSageError();
  const isCheckingSheetSageBackend = useIsCheckingSheetSageBackend();
  const isSheetSageBackendAvailable = useIsSheetSageBackendAvailable();
  const sheetSageBackendError = useSheetSageBackendError();
  const {
    setSheetSageResult,
    setIsComputingSheetSage,
    setSheetSageError,
  } = useSheetSageActions();

  const [speedIndex, setSpeedIndex] = useState(1);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [noteColors, setNoteColors] = useState<Map<number, string>>(new Map());
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeNotesSignatureRef = useRef('');

  const speed = SPEED_PRESETS[speedIndex];
  const chordEvents = useMemo(() => convertSheetSageToChordEvents(sheetSageResult), [sheetSageResult]);

  const keyboardWidth = useMemo(() => {
    const whiteKeyWidth = containerWidth > 0
      ? Math.max(10, Math.min(24, Math.floor(containerWidth / PIANO_WHITE_KEY_COUNT)))
      : DEFAULT_WHITE_KEY_WIDTH;
    return PIANO_WHITE_KEY_COUNT * whiteKeyWidth;
  }, [containerWidth]);

  const whiteKeyWidth = useMemo(() => {
    if (containerWidth <= 0) return DEFAULT_WHITE_KEY_WIDTH;
    return Math.max(10, Math.min(24, Math.floor(containerWidth / PIANO_WHITE_KEY_COUNT)));
  }, [containerWidth]);

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

  const handleActiveNotesChange = useCallback((notes: Set<number>, colors: Map<number, string>) => {
    const signature = Array.from(notes)
      .sort((left, right) => left - right)
      .map((note) => `${note}:${colors.get(note) ?? ''}`)
      .join('|');

    if (signature === activeNotesSignatureRef.current) {
      return;
    }

    activeNotesSignatureRef.current = signature;
    setActiveNotes(notes);
    setNoteColors(colors);
  }, []);

  const handleTranscribe = useCallback(async () => {
    setIsComputingSheetSage(true);
    setSheetSageError(null);

    try {
      const result = await requestSheetSageTranscription(audioFile, audioUrl, videoId);
      setSheetSageResult(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown Sheet Sage error';
      setSheetSageError(message);
    } finally {
      setIsComputingSheetSage(false);
    }
  }, [
    audioFile,
    audioUrl,
    setIsComputingSheetSage,
    setSheetSageError,
    setSheetSageResult,
    videoId,
  ]);

  const hasAudioSource = Boolean(audioFile || audioUrl);
  const isBackendReady = isSheetSageBackendAvailable === true;
  const statusMessage = isCheckingSheetSageBackend
    ? 'Checking Sheet Sage backend readiness...'
    : !isBackendReady && sheetSageBackendError
      ? sheetSageBackendError
      : null;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-content-bg p-4 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">Sheet Sage Melody</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Run the Sheet Sage melody model and render the melodic line with the existing piano roll visualizer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {SPEED_PRESETS.map((preset, idx) => (
                <AppTooltip key={preset.label} content={preset.description}>
                  <button
                    onClick={() => setSpeedIndex(idx)}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      speedIndex === idx
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                </AppTooltip>
              ))}
            </div>

            <button
              onClick={handleTranscribe}
              disabled={!hasAudioSource || isComputingSheetSage || isCheckingSheetSageBackend || !isBackendReady}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-gray-100"
            >
              {isCheckingSheetSageBackend
                ? 'Checking Backend...'
                : isComputingSheetSage
                  ? 'Computing Melody...'
                  : !isBackendReady
                    ? 'Backend Unavailable'
                    : 'Compute Sheet Sage Melody'}
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {statusMessage}
          </div>
        )}

        {sheetSageResult && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1">
              Notes: {sheetSageResult.noteEventCount}
            </span>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1">
              BPM: {sheetSageResult.tempoBpm}
            </span>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1">
              Meter: {sheetSageResult.beatsPerMeasure}/4
            </span>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1">
              Beats: {sheetSageResult.beatTimes.length}
            </span>
          </div>
        )}

        {sheetSageError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {sheetSageError}
          </div>
        )}
      </div>

      {chordEvents.length > 0 ? (
        <div
          ref={containerRef}
          className="rounded-lg overflow-hidden bg-gray-950 dark:bg-gray-950"
        >
          <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900/60 border-b border-gray-800">
            <span className="text-xs uppercase tracking-[0.12em] text-gray-500 font-medium">
              Melody Roll
            </span>
            <span className="text-xs font-medium text-gray-400">
              Experimental Sheet Sage melodic note events
            </span>
          </div>

          <div className="relative overflow-x-auto overflow-y-hidden">
            <div
              className="flex flex-col items-center mx-auto"
              style={{ minWidth: keyboardWidth }}
            >
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
                  onActiveNotesChange={handleActiveNotesChange}
                />
              </div>

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
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-content-bg p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {isComputingSheetSage
            ? 'Transcribing melody with Sheet Sage...'
            : 'Click "Compute Sheet Sage Melody" to generate a melody piano roll from the current audio.'}
        </div>
      )}
    </div>
  );
};

export default SheetSageTab;
