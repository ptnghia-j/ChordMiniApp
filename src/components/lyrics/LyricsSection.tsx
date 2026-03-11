'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LyricsData, ChordMarker, SynchronizedLyrics } from '@/types/musicAiTypes';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { useApiKeys } from '@/hooks/settings/useApiKeys';
import { SegmentationResult } from '@/types/chatbotTypes';
import type { BeatInfo } from '@/services/audio/beatDetectionService';
import { simplifyChord } from '@/utils/chordSimplification';
import { useSimplifySelector } from '@/contexts/selectors';
import { useShowCorrectedChords, useKeySignature } from '@/stores/analysisStore';
import { getDisplayAccidentalPreference } from '@/utils/chordUtils';
import { normalizeChordForDedup } from '@/utils/chordNormalization';
import {
  buildChordOccurrenceMap,
  buildChordOccurrenceCorrectionMap,
  buildChordSequenceIndexMap,
  getDisplayChord,
  SequenceCorrections
} from '@/utils/chordProcessing';

// Lazy load heavy lead sheet display component
const LeadSheetDisplay = dynamic(() => import('@/components/chord-analysis/LeadSheetDisplay'), {
  loading: () => <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />,
  ssr: false
});

interface LyricsSectionProps {
  showLyrics: boolean;
  lyrics: LyricsData | null;
  hasCachedLyrics?: boolean;
  currentTime: number;
  fontSize: number;
  theme: string;
  analysisResults: AnalysisResult | null;
  onFontSizeChange: (size: number) => void;
  segmentationData?: SegmentationResult | null;
  /** Per-position Gemini corrections – same data used by the Beat & Chord Map tab */
  sequenceCorrections?: SequenceCorrections | null;
}

export const LyricsSection: React.FC<LyricsSectionProps> = ({
  showLyrics,
  lyrics,
  hasCachedLyrics = false,
  currentTime,
  fontSize,
  theme,
  analysisResults,
  onFontSizeChange,
  segmentationData = null,
  sequenceCorrections = null
}) => {
  const { isServiceAvailable, getServiceMessage } = useApiKeys();
  const { simplifyChords } = useSimplifySelector();
  const storeKeySignature = useKeySignature();

  // Read correction toggle from Zustand store (shared with Beat & Chord Map tab)
  const showCorrectedChords = useShowCorrectedChords();

  // Chord-centric timeline: compute beat times and beat-aligned chord change events.
  // Chord changes are the authoritative timing source for lyrics alignment.
  const beatTimes = useMemo<number[]>(() => {
    const beats: BeatInfo[] = (analysisResults?.beats as BeatInfo[]) || [];
    return beats.map((b) => (typeof (b as unknown as number) === 'number' ? (b as unknown as number) : b?.time)).filter((t): t is number => typeof t === 'number');
  }, [analysisResults?.beats]);

  const beatAlignedChords = useMemo(() => {
    if (!analysisResults?.synchronizedChords || !beatTimes.length) return null as null | { time: number; chord: string }[];

    // Build chord array from synchronizedChords (one entry per beat, forward-filled)
    const rawChords: string[] = analysisResults.synchronizedChords.map(
      (item: { chord: string; beatIndex: number }) => {
        let ch = item.chord || '';
        // Apply simplification if enabled (must happen BEFORE occurrence mapping
        // so the chord names match the simplified sequenceCorrections)
        if (simplifyChords) ch = simplifyChord(ch);
        return ch;
      }
    );

    // --- Reuse the SAME correction pipeline as the Beat & Chord Map tab ---
    // 1. Build per-beat occurrence map (N-th group of each chord)
    const occurrenceMap = buildChordOccurrenceMap(rawChords);
    // 2. Build the correction look-up from sequenceCorrections (already simplified if needed)
    const correctionMap = buildChordOccurrenceCorrectionMap(sequenceCorrections ?? null);
    const sequenceIndexMap = buildChordSequenceIndexMap(rawChords, sequenceCorrections?.originalSequence);

    const events: { time: number; chord: string }[] = [];
    let lastNormalized = '';
    analysisResults.synchronizedChords.forEach((item: { chord: string; beatIndex: number }, idx: number) => {
      const beatIdx = item?.beatIndex ?? -1;
      if (beatIdx < 0 || beatIdx >= beatTimes.length) return;

      let chordLabel = rawChords[idx]; // already simplified

      // Apply per-position original/corrected display using the same sequence-aware logic as ChordGrid
      if (sequenceCorrections) {
        const { chord: displayChord, wasCorrected } = getDisplayChord(
          chordLabel,
          idx,
          showCorrectedChords,
          sequenceCorrections,
          occurrenceMap,
          correctionMap,
          sequenceIndexMap
        );
        if (showCorrectedChords) {
          if (wasCorrected) chordLabel = displayChord;
        } else {
          chordLabel = displayChord;
        }
      }

      // Normalize to canonical display form to prevent visual duplicates
      // (e.g., B:maj and B both display as "B")
      chordLabel = normalizeChordForDedup(chordLabel);

      // Skip empty, N/C (no-chord), and consecutive duplicates (by normalized form).
      // Filtering N/C prevents gap-duplicates like B → N/C → B collapsing to B, B.
      if (!chordLabel || chordLabel === 'N/C' || chordLabel === 'N' || chordLabel === lastNormalized) return;
      lastNormalized = chordLabel;
      events.push({ time: beatTimes[beatIdx], chord: chordLabel });
    });
    return events;
  }, [analysisResults, beatTimes, simplifyChords, sequenceCorrections, showCorrectedChords]);

  // Compute accidental preference (sharp vs flat).
  // Key signature (from Gemini) is authoritative; heuristic is fallback.
  const accidentalPreference = useMemo<'sharp' | 'flat' | undefined>(() => {
    return getDisplayAccidentalPreference({
      chords: (beatAlignedChords ?? []).map(c => c.chord),
      keySignature: storeKeySignature,
      preserveExactSpelling: Boolean(sequenceCorrections),
    });
  }, [beatAlignedChords, sequenceCorrections, storeKeySignature]);

  // Chord-centric alignment: snap lyric line boundaries to chord change timestamps.
  // Chords are the authoritative timing source; lyrics snap to them (not the reverse).
  // Uses O(n+m) two-pointer technique (both lyrics and chord changes are sorted).
  const snappedLyrics = useMemo(() => {
    if (!lyrics?.lines?.length) return { lines: [] } as LyricsData;

    // Primary anchors: chord change timestamps; fallback: beat timestamps
    const anchorTimes = beatAlignedChords?.length
      ? beatAlignedChords.map(c => c.time)
      : beatTimes;

    if (!anchorTimes.length) {
      return {
        ...lyrics,
        lines: lyrics.lines.map((line) => ({
          ...line,
          chords: (line.chords || []).map((chord: ChordMarker) => ({
            ...chord,
            chord: simplifyChords ? simplifyChord(chord.chord) : chord.chord
          }))
        }))
      } as LyricsData;
    }

    // Collect all lyric boundary timestamps and sort for the two-pointer pass
    const queries: { lineIdx: number; isEnd: boolean; time: number }[] = [];
    lyrics.lines.forEach((line, i) => {
      queries.push({ lineIdx: i, isEnd: false, time: line.startTime });
      queries.push({ lineIdx: i, isEnd: true, time: line.endTime });
    });
    queries.sort((a, b) => a.time - b.time || (a.isEnd ? 1 : 0) - (b.isEnd ? 1 : 0));

    // Two-pointer: advance through sorted anchorTimes to find nearest for each query
    const snappedBounds: [number, number][] = lyrics.lines.map(() => [0, 0]);
    let ptr = 0;
    for (const q of queries) {
      while (ptr < anchorTimes.length - 1) {
        const currDist = Math.abs(anchorTimes[ptr] - q.time);
        const nextDist = Math.abs(anchorTimes[ptr + 1] - q.time);
        if (nextDist <= currDist) {
          ptr++;
        } else {
          break;
        }
      }
      snappedBounds[q.lineIdx][q.isEnd ? 1 : 0] = anchorTimes[ptr];
    }

    // Binary search helper: first anchor index with value >= threshold
    const lowerBound = (threshold: number): number => {
      let lo = 0, hi = anchorTimes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (anchorTimes[mid] < threshold) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const epsilon = 1e-3;
    const snapped = lyrics.lines.map((line, i) => {
      const [start, end_] = snappedBounds[i];
      let end = end_;
      if (end <= start) {
        const idx = lowerBound(start + epsilon);
        end = idx < anchorTimes.length ? anchorTimes[idx] : start + 0.25;
      }
      return { ...line, startTime: start, endTime: end, chords: [] };
    });

    // Ensure monotonic, non-overlapping lines
    for (let i = 1; i < snapped.length; i++) {
      const prev = snapped[i - 1];
      const curr = snapped[i];
      if (curr.startTime < prev.endTime + epsilon) {
        const idx = lowerBound(prev.endTime + epsilon);
        curr.startTime = idx < anchorTimes.length ? anchorTimes[idx] : prev.endTime + epsilon;
        if (curr.endTime <= curr.startTime) {
          const afterIdx = lowerBound(curr.startTime + epsilon);
          curr.endTime = afterIdx < anchorTimes.length ? anchorTimes[afterIdx] : curr.startTime + 0.25;
        }
      }
    }

    return { ...lyrics, lines: snapped } as LyricsData;
  }, [lyrics, beatAlignedChords, beatTimes, simplifyChords]);

  const displayLyrics = useMemo<SynchronizedLyrics>(() => ({
    lines: snappedLyrics.lines.map((line) => ({
      startTime: line.startTime,
      endTime: line.endTime,
      text: line.text,
      chords: (line.chords || []).map((chord: ChordMarker) => ({
        time: chord.time,
        chord: chord.chord,
        position: chord.position ?? 0,
      })),
      wordTimings: line.wordTimings?.map((wordTiming) => ({ ...wordTiming })),
    })),
    error: snappedLyrics.error,
  }), [snappedLyrics]);

  const downbeatTimes = useMemo(() => (
    ((analysisResults?.beats as BeatInfo[]) || [])
      .filter((beat) => typeof beat === 'object' && (beat as BeatInfo).beatNum === 1)
      .map((beat) => (beat as BeatInfo).time)
  ), [analysisResults?.beats]);


  if (!showLyrics) {
    const musicAiAvailable = isServiceAvailable('musicAi');

    return (
      <div className={`p-4 rounded-md transition-colors duration-300 ${
        musicAiAvailable
          ? 'bg-blue-100 dark:bg-blue-200 text-blue-700 dark:text-blue-900'
          : 'bg-orange-100 dark:bg-orange-200 text-orange-700 dark:text-orange-900'
      }`}>
        <p className="font-medium">
          {hasCachedLyrics ? "Cached Lyrics Available" : "Lyrics Not Transcribed"}
        </p>
        <p>
          {!musicAiAvailable ? (
            <>
              {getServiceMessage('musicAi')}
              <br />
              <span className="text-sm">Go to Settings to add your Music.AI API key.</span>
            </>
          ) : hasCachedLyrics ? (
            "Cached lyrics are loading automatically. Click \"AI Transcribe\" to refresh or re-transcribe."
          ) : (
            "Click the \"AI Transcribe\" button above to analyze the audio for lyrics. Lyrics transcription is now manual to give you control over when to process vocals."
          )}
        </p>
      </div>
    );
  }

  if (!lyrics) {
    return (
      <div className="p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-md transition-colors duration-300">
        <p className="font-medium">Lyrics Data Unavailable</p>
        <p>The lyrics data could not be loaded. Please try again.</p>
      </div>
    );
  }

  if (lyrics.error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 text-red-700 dark:text-red-200 rounded-md transition-colors duration-300">
        <p className="font-medium">Lyrics Transcription Error</p>
        <p>{lyrics.error}</p>
      </div>
    );
  }

  if (!lyrics.lines || lyrics.lines.length === 0) {
    return (
      <div className="p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-md transition-colors duration-300">
        <p className="font-medium">No Lyrics Detected</p>
        <p>This may be an instrumental track or the vocals are too quiet for accurate transcription.</p>
      </div>
    );
  }

  // Keep the old structure in place for reference, but we now pass snappedLyrics to the display
  // const synchronizedLyrics = undefined as unknown as LyricsData; // no longer used (removed)

  return (
    <div>
      <LeadSheetDisplay
        lyrics={displayLyrics}
        currentTime={currentTime}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        darkMode={theme === 'dark'}
        chords={beatAlignedChords || []}
        segmentationData={segmentationData}
        downbeatsOnly={false}
        downbeatTimes={downbeatTimes}
        accidentalPreference={accidentalPreference}
      />
    </div>
  );
};
