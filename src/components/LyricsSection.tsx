'use client';

import React from 'react';
import LeadSheetDisplay from '@/components/LeadSheetDisplay';
import { LyricsData } from '@/types/musicAiTypes';
import { AnalysisResult } from '@/services/chordRecognitionService';

interface LyricsSectionProps {
  showLyrics: boolean;
  lyrics: LyricsData | null;
  currentTime: number;
  fontSize: number;
  theme: string;
  analysisResults: AnalysisResult | null;
  onFontSizeChange: (size: number) => void;
}

export const LyricsSection: React.FC<LyricsSectionProps> = ({
  showLyrics,
  lyrics,
  currentTime,
  fontSize,
  theme,
  analysisResults,
  onFontSizeChange
}) => {
  if (!showLyrics) {
    return (
      <div className="p-4 bg-blue-100 dark:bg-blue-200 text-blue-700 dark:text-blue-900 rounded-md transition-colors duration-300">
        <p className="font-medium">Lyrics Not Transcribed</p>
        <p>Click the &quot;Transcribe Lyrics&quot; button above to analyze the audio for lyrics. Lyrics transcription is now manual to give you control over when to process vocals.</p>
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
      <div className="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md transition-colors duration-300">
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
        chords={analysisResults?.chords?.map((chord: {start: number, chord: string}) => ({
          time: chord.start,
          chord: chord.chord
        }))}
      />
    </div>
  );
};
