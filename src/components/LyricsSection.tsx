'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LyricsData } from '@/types/musicAiTypes';
import { AnalysisResult } from '@/services/chordRecognitionService';
import { useApiKeys } from '@/hooks/useApiKeys';
import { SegmentationResult } from '@/types/chatbotTypes';

// Lazy load heavy lead sheet display component
const LeadSheetDisplay = dynamic(() => import('@/components/LeadSheetDisplay'), {
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

  // Memoize the chords transformation to prevent infinite re-renders
  // This must be called before any early returns to follow Rules of Hooks
  const memoizedChords = useMemo(() => {
    return analysisResults?.chords?.map((chord: {start: number, chord: string}) => ({
      time: chord.start,
      chord: chord.chord
    })) || [];
  }, [analysisResults?.chords]);

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

  // Ensure each line has a chords array to match SynchronizedLyrics interface
  const synchronizedLyrics = {
    ...lyrics,
    lines: lyrics.lines.map(line => ({
      ...line,
      chords: line.chords || []
    }))
  };

  return (
    <div>
      <LeadSheetDisplay
        lyrics={synchronizedLyrics}
        currentTime={currentTime}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        darkMode={theme === 'dark'}
        chords={memoizedChords}
        segmentationData={segmentationData}
      />
    </div>
  );
};
