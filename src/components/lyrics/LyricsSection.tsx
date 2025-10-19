'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LyricsData, ChordMarker } from '@/types/musicAiTypes';
import { AnalysisResult } from '@/services/chord-analysis/chordRecognitionService';
import { useApiKeys } from '@/hooks/settings/useApiKeys';
import { SegmentationResult } from '@/types/chatbotTypes';
import type { BeatInfo } from '@/services/audio/beatDetectionService';
import { simplifyChord } from '@/utils/chordSimplification';
import { useSimplifySelector } from '@/contexts/selectors';

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
  segmentationData = null
}) => {
  const { isServiceAvailable, getServiceMessage } = useApiKeys();
  const { simplifyChords } = useSimplifySelector();

  // Legacy raw chord list removed; alignment uses beatAlignedChords from synchronizedChords

  // Beat/chord-centric timeline: compute beat times and beat-aligned chord change events
  const beatTimes = useMemo<number[]>(() => {
    const beats: BeatInfo[] = (analysisResults?.beats as BeatInfo[]) || [];
    return beats.map((b) => (typeof (b as unknown as number) === 'number' ? (b as unknown as number) : b?.time)).filter((t): t is number => typeof t === 'number');
  }, [analysisResults?.beats]);

  const beatAlignedChords = useMemo(() => {
    if (!analysisResults?.synchronizedChords || !beatTimes.length) return null as null | { time: number; chord: string }[];

    const events: { time: number; chord: string }[] = [];
    let lastChord = '';
    analysisResults.synchronizedChords.forEach((item: { chord: string; beatIndex: number }) => {
      const idx = item?.beatIndex ?? -1;
      if (idx < 0 || idx >= beatTimes.length) return;
      const chordLabel = simplifyChords ? simplifyChord(item.chord) : item.chord;
      if (!chordLabel || chordLabel === lastChord) return;
      lastChord = chordLabel;
      events.push({ time: beatTimes[idx], chord: chordLabel });
    });
    return events;
  }, [analysisResults?.synchronizedChords, beatTimes, simplifyChords]);

  // Snap lyric line boundaries to nearest beat timestamps
  const snappedLyrics = useMemo(() => {
    if (!lyrics?.lines?.length) return { lines: [] } as LyricsData;
    if (!beatTimes.length) {
      // Fallback: preserve original lyrics structure
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

    const nearestBeat = (t: number): number => {
      if (!beatTimes.length || typeof t !== 'number') return t;
      // Linear search is fine for typical beat counts; keeps code simple and robust
      let best = beatTimes[0];
      let bestDiff = Math.abs(best - t);
      for (let i = 1; i < beatTimes.length; i++) {
        const diff = Math.abs(beatTimes[i] - t);
        if (diff < bestDiff) { best = beatTimes[i]; bestDiff = diff; }
      }
      return best;
    };

    const epsilon = 1e-3;
    const snapped = lyrics.lines.map((line) => {
      const start = nearestBeat(line.startTime);
      let end = nearestBeat(line.endTime);
      if (end <= start) {
        // Move end to the next beat strictly after start when needed
        const nextIdx = beatTimes.findIndex((bt) => bt > start + epsilon);
        end = nextIdx !== -1 ? beatTimes[nextIdx] : start + 0.25;
      }
      return { ...line, startTime: start, endTime: end, chords: [] };
    });

    // Ensure monotonic, non-overlapping lines by nudging starts to next valid beat
    for (let i = 1; i < snapped.length; i++) {
      const prev = snapped[i - 1];
      const curr = snapped[i];
      if (curr.startTime < prev.endTime + epsilon) {
        const nextIdx = beatTimes.findIndex((bt) => bt >= prev.endTime + epsilon);
        curr.startTime = nextIdx !== -1 ? beatTimes[nextIdx] : prev.endTime + epsilon;
        if (curr.endTime <= curr.startTime) {
          const afterIdx = beatTimes.findIndex((bt) => bt > curr.startTime + epsilon);
          curr.endTime = afterIdx !== -1 ? beatTimes[afterIdx] : curr.startTime + 0.25;
        }
      }
    }

    return { ...lyrics, lines: snapped } as LyricsData;
  }, [lyrics, beatTimes, simplifyChords]);


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
        lyrics={{ lines: snappedLyrics.lines.map(l => ({ startTime: l.startTime, endTime: l.endTime, text: l.text, chords: (l.chords || []).map(c => ({ time: c.time, chord: c.chord, position: c.position ?? 0 })) })) }}
        currentTime={currentTime}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        darkMode={theme === 'dark'}
        chords={beatAlignedChords || []}
        segmentationData={segmentationData}
        downbeatsOnly={false}
        downbeatTimes={((analysisResults?.beats as BeatInfo[]) || []).filter((b) => typeof b === 'object' && (b as BeatInfo).beatNum === 1).map((b) => (b as BeatInfo).time)}
      />
    </div>
  );
};
