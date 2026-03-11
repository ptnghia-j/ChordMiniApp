/**
 * LeadSheetDisplay Component
 *
 * This component displays lyrics in a lead sheet format with chords positioned
 * above the corresponding words. It includes dynamic styling that changes
 * as the song plays, with unplayed lyrics in gray and played lyrics in blue.
 */

import React, { useEffect, useRef, useMemo } from 'react';

import { useApiKeys } from '@/hooks/settings/useApiKeys';
import { useProcessedLyrics } from '@/hooks/lyrics/useProcessedLyrics';
import { useActiveLine } from '@/hooks/lyrics/useActiveLine';
import { useTranslation } from '@/hooks/lyrics/useTranslation';
import LyricsControls from '@/components/lyrics/LyricsControls';
import NoLyricsMessage from '@/components/lyrics/NoLyricsMessage';
import LyricLine from '@/components/lyrics/LyricLine';
import { SegmentationResult } from '@/types/chatbotTypes';
import type { LyricWordTiming } from '@/types/musicAiTypes';
interface ChordData {
  time: number;
  chord: string;
}

// Define types for the component props and data structure
interface ChordMarker {
  time: number;
  chord: string;
  position: number; // Character position in the line
}

interface LyricLine {
  startTime: number;
  endTime: number;
  text: string;
  chords: ChordMarker[];
  wordTimings?: LyricWordTiming[];
}
interface SynchronizedLyrics {
  lines: LyricLine[];
  error?: string; // Optional error message when lyrics synchronization fails
}
interface LeadSheetProps {
  lyrics: SynchronizedLyrics;
  currentTime: number;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  darkMode?: boolean;
  chords?: ChordData[]; // Optional chord data from analysis results (beat-aligned events expected)
  segmentationData?: SegmentationResult | null; // Optional segmentation data for section labels and instrumental placeholders
  downbeatsOnly?: boolean;
  downbeatTimes?: number[];
  accidentalPreference?: 'sharp' | 'flat'; // Enharmonic spelling preference for chord labels
}

/**
 * LeadSheetDisplay Component - Memoized for performance
 */
const LeadSheetDisplay: React.FC<LeadSheetProps> = React.memo(({
  lyrics,
  currentTime,
  fontSize,
  onFontSizeChange,
  darkMode = false,
  chords = [],
  segmentationData = null,
  downbeatsOnly = false,
  downbeatTimes = [],
  accidentalPreference
}) => {
  // Ref for the container element (used for auto-scrolling)
  const containerRef = useRef<HTMLDivElement>(null);

  // API keys hook for accessing user's Gemini API key
  const { getApiKey } = useApiKeys();

  // Memoize chords array to prevent unnecessary re-renders
  const memoizedChords = useMemo(() => chords || [], [chords]);

  // Colors based on dark/light mode
  const textColors = useMemo(() => ({
    unplayed: darkMode ? '#9CA3AF' : '#6B7280', // Gray
    played: darkMode ? '#60A5FA' : '#3B82F6',   // Blue (keeping blue instead of purple)
    chord: darkMode ? '#93C5FD' : '#2563EB',    // Chord color
    background: darkMode ? '#1F2937' : '#FFFFFF' // Background
  }), [darkMode]);

  // Use the extracted hook for processing lyrics
  const processedAndMergedLyrics = useProcessedLyrics({
    lyrics,
    beatAlignedChords: memoizedChords,
    segmentationData,
    downbeatsOnly,
    downbeatTimes
  });

  // Use the extracted hook for active line management
  const { activeLine } = useActiveLine({
    processedLines: processedAndMergedLyrics,
    currentTime,
    containerRef,
    chords: memoizedChords
  });

  // Use the extracted hook for translation management
  const {
    translatedLyrics,
    isTranslating,
    translationError,
    selectedLanguages,
    isLanguageMenuOpen,
    backgroundUpdatesInProgress,
    availableLanguages,
    translateLyrics,
    setSelectedLanguages,
    setIsLanguageMenuOpen
  } = useTranslation({
    processedLines: processedAndMergedLyrics,
    getApiKey
  });

  // Add padding elements to ensure first and last lines can be centered
  useEffect(() => {
    if (containerRef.current) {
      // Increased top padding to account for tab labels and controls
      containerRef.current.style.paddingTop = '60px';
      containerRef.current.style.paddingBottom = '40vh';

      // Add scroll margin to ensure active lines are positioned properly
      document.documentElement.style.scrollPaddingTop = '60px';
      document.documentElement.style.scrollPaddingBottom = '40vh';

      // Add a class to the container for better visibility
      containerRef.current.classList.add('lyrics-scroll-container');

      // Set initial scroll position to show the first lyrics at the top
      containerRef.current.scrollTop = 0;
    }

    // Clean up function to reset styles when component unmounts
    return () => {
      document.documentElement.style.scrollPaddingTop = '';
      document.documentElement.style.scrollPaddingBottom = '';
    };
  }, []);

  // PERFORMANCE OPTIMIZATION: Memoized character array creation
  // This prevents expensive array creation and color calculations on every render
  const memoizedCharacterArrays = useMemo(() => {
    const cache = new Map<string, string[]>();
    return {
      getCharArray: (text: string) => {
        if (!cache.has(text)) {
          cache.set(text, text.split(''));
        }
        return cache.get(text)!;
      },
      clear: () => cache.clear()
    };
  }, []);

  // Clear character array cache when lyrics change to prevent memory leaks
  useEffect(() => {
    memoizedCharacterArrays.clear();
  }, [processedAndMergedLyrics, memoizedCharacterArrays]);

  // If no lyrics are available, show a message
  if (!processedAndMergedLyrics || processedAndMergedLyrics.length === 0) {
    return (
      <NoLyricsMessage
        error={lyrics?.error}
        textColors={textColors}
      />
    );
  }

  return (
    <div className="lead-sheet-container">
      <LyricsControls
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        darkMode={darkMode}
        processedLyricsLength={processedAndMergedLyrics?.length || 0}
        isTranslating={isTranslating}
        translationError={translationError}
        selectedLanguages={selectedLanguages}
        isLanguageMenuOpen={isLanguageMenuOpen}
        backgroundUpdatesInProgress={backgroundUpdatesInProgress}
        availableLanguages={availableLanguages}
        translatedLyrics={translatedLyrics}
        translateLyrics={translateLyrics}
        setSelectedLanguages={setSelectedLanguages}
        setIsLanguageMenuOpen={setIsLanguageMenuOpen}
      />

      {/* Lyrics container with auto-scroll - transparent, inherits parent background */}
      <div
        ref={containerRef}
        className="lyrics-container overflow-y-auto p-3"
        style={{
          lineHeight: '1.4',
          scrollBehavior: 'smooth',
          height: 'calc(65vh - 20px)',
          maxHeight: '600px',
          scrollPaddingTop: '15px',
          scrollPaddingBottom: '30px',
          position: 'relative',
          margin: '0 auto',
          paddingTop: '3px'
        }}
      >
        {processedAndMergedLyrics.map((line, index) => (
          <LyricLine
            key={index}
            line={line}
            index={index}
            isActive={index === activeLine}
            isPast={index < activeLine && activeLine !== -1}
            currentTime={currentTime}
            fontSize={fontSize}
            textColors={textColors}
            darkMode={darkMode}
            selectedLanguages={selectedLanguages}
            translatedLyrics={translatedLyrics}
            processedLines={processedAndMergedLyrics}
            segmentationData={segmentationData}
            memoizedCharacterArrays={memoizedCharacterArrays}
            accidentalPreference={accidentalPreference}
          />
        ))}
      </div>
    </div>
  );
});

LeadSheetDisplay.displayName = 'LeadSheetDisplay';

export default LeadSheetDisplay;
