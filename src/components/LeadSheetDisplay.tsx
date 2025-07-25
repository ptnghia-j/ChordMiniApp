/**
 * LeadSheetDisplay Component
 *
 * This component displays lyrics in a lead sheet format with chords positioned
 * above the corresponding words. It includes dynamic styling that changes
 * as the song plays, with unplayed lyrics in gray and played lyrics in blue.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  formatChordWithMusicalSymbols,
  getResponsiveChordFontSize,
  getChordLabelStyles
} from '@/utils/chordFormatting';
import {
  enhanceLyricsWithCharacterTiming,
  EnhancedLyricsData,
  EnhancedLyricLine
} from '@/utils/lyricsTimingUtils';
import { useApiKeys } from '@/hooks/useApiKeys';
import { SegmentationResult, SongSegment } from '@/types/chatbotTypes';

interface ChordData {
  time: number;
  chord: string;
}

/**
 * Create instrumental placeholders for sections without lyrics
 */
const createInstrumentalPlaceholder = (segment: SongSegment, chords: ChordData[]) => {
  const sectionLabel = segment.label || segment.type || 'Instrumental';

  // Find chords that occur during this instrumental section
  const sectionChords = chords.filter(chord =>
    chord.time >= segment.startTime && chord.time <= segment.endTime
  );

  // Deduplicate chords to only show chord changes
  const deduplicatedChords = deduplicateChords(sectionChords);

  return {
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: `[${sectionLabel}]`,
    chords: deduplicatedChords.map(chord => ({
      position: 0, // Position at start of placeholder text
      chord: chord.chord,
      time: chord.time
    })),
    isInstrumental: true,
    sectionLabel,
    duration: segment.endTime - segment.startTime
  };
};

/**
 * Deduplicate consecutive identical chords - only show chords on changes
 */
const deduplicateChords = (chords: ChordData[]): ChordData[] => {
  if (chords.length === 0) return [];

  const deduplicated: ChordData[] = [chords[0]]; // Always include the first chord

  for (let i = 1; i < chords.length; i++) {
    const currentChord = chords[i];
    const previousChord = chords[i - 1];

    // Only add chord if it's different from the previous one
    if (currentChord.chord !== previousChord.chord) {
      deduplicated.push(currentChord);
    }
  }

  return deduplicated;
};

/**
 * Create chord-only sections for chords that don't fall within lyrics or instrumental sections
 * Optimizes sections with minimal unique chords by condensing them
 */
const createChordOnlySection = (chords: ChordData[], isCondensed: boolean = false) => {
  // Deduplicate chords to only show chord changes
  const deduplicatedChords = deduplicateChords(chords);

  const startTime = chords[0].time;
  const endTime = chords[chords.length - 1].time + 2; // Add 2 seconds buffer after last chord

  // For condensed sections, show all unique chords in a single compact row with proper formatting
  const displayText = isCondensed
    ? deduplicatedChords.map(chord => {
        // Apply chord formatting to remove :maj suffixes and standardize notation
        const formattedChord = chord.chord.replace(/:maj$/, ''); // Remove :maj suffix
        return formattedChord;
      }).join(' ') // Show all unique chords together
    : '♪'.repeat(Math.max(1, deduplicatedChords.length)).split('').join(' '); // Dynamic musical note symbols based on chord changes

  return {
    startTime,
    endTime,
    text: displayText,
    chords: deduplicatedChords.map(chord => ({
      position: 0, // Position at start of placeholder text
      chord: chord.chord,
      time: chord.time
    })),
    isChordOnly: true,
    isCondensed,
    duration: endTime - startTime
  };
};

/**
 * Globe Icon Component for light and dark modes
 */
const GlobeIcon: React.FC<{ className?: string; darkMode?: boolean }> = ({ className = "h-4 w-4", darkMode = false }) => {
  return (
    <svg
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      className={className}
    >
      <g clipPath="url(#a)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10.27 14.1a6.5 6.5 0 0 0 3.67-3.45q-1.24.21-2.7.34-.31 1.83-.97 3.1M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.48-1.52a7 7 0 0 1-.96 0H7.5a4 4 0 0 1-.84-1.32q-.38-.89-.63-2.08a40 40 0 0 0 3.92 0q-.25 1.2-.63 2.08a4 4 0 0 1-.84 1.31zm2.94-4.76q1.66-.15 2.95-.43a7 7 0 0 0 0-2.58q-1.3-.27-2.95-.43a18 18 0 0 1 0 3.44m-1.27-3.54a17 17 0 0 1 0 3.64 39 39 0 0 1-4.3 0 17 17 0 0 1 0-3.64 39 39 0 0 1 4.3 0m1.1-1.17q1.45.13 2.69.34a6.5 6.5 0 0 0-3.67-3.44q.65 1.26.98 3.1M8.48 1.5l.01.02q.41.37.84 1.31.38.89.63 2.08a40 40 0 0 0-3.92 0q.25-1.2.63-2.08a4 4 0 0 1 .85-1.32 7 7 0 0 1 .96 0m-2.75.4a6.5 6.5 0 0 0-3.67 3.44 29 29 0 0 1 2.7-.34q.31-1.83.97-3.1M4.58 6.28q-1.66.16-2.95.43a7 7 0 0 0 0 2.58q1.3.27 2.95.43a18 18 0 0 1 0-3.44m.17 4.71q-1.45-.12-2.69-.34a6.5 6.5 0 0 0 3.67 3.44q-.65-1.27-.98-3.1"
          fill={darkMode ? "#ffffff" : "currentColor"}
        />
      </g>
      <defs>
        <clipPath id="a">
          <path fill="#fff" d="M0 0h16v16H0z"/>
        </clipPath>
      </defs>
    </svg>
  );
};

/**
 * Utility function to detect if text contains Chinese characters
 */
const containsChineseCharacters = (text: string): boolean => {
  // Unicode ranges for Chinese characters
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]/;
  return chineseRegex.test(text);
};

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
}

interface SynchronizedLyrics {
  lines: LyricLine[];
  error?: string; // Optional error message when lyrics synchronization fails
}

interface TranslatedLyrics {
  originalLyrics: string;
  translatedLyrics: string;
  sourceLanguage: string;
  targetLanguage: string;
  detectedLanguage?: string;
  fromCache?: boolean;
  backgroundUpdateInProgress?: boolean;
  timestamp?: number;
}

interface LeadSheetProps {
  lyrics: SynchronizedLyrics;
  currentTime: number;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  darkMode?: boolean;
  chords?: ChordData[]; // Optional chord data from analysis results
  segmentationData?: SegmentationResult | null; // Optional segmentation data for section labels and instrumental placeholders
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
  segmentationData = null
}) => {
  // State to track the currently active line
  const [activeLine, setActiveLine] = useState<number>(-1);

  // API keys hook for accessing user's Gemini API key
  const { getApiKey } = useApiKeys();

  // State to store processed lyrics with chords and character-level timing
  const [processedLyrics, setProcessedLyrics] = useState<EnhancedLyricsData>(
    enhanceLyricsWithCharacterTiming(lyrics as SynchronizedLyrics)
  );

  // State for translations
  const [translatedLyrics, setTranslatedLyrics] = useState<{[language: string]: TranslatedLyrics}>({});
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState<boolean>(false);
  const [backgroundUpdatesInProgress, setBackgroundUpdatesInProgress] = useState<Set<string>>(new Set());

  // Available languages for translation
  const availableLanguages = [
    { code: 'English', name: 'English' },
    { code: 'Spanish', name: 'Spanish' },
    { code: 'French', name: 'French' },
    { code: 'German', name: 'German' },
    { code: 'Japanese', name: 'Japanese' },
    { code: 'Chinese', name: 'Chinese' },
    { code: 'Korean', name: 'Korean' },
    { code: 'Russian', name: 'Russian' }
  ];

  // Ref for the container element (used for auto-scrolling)
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoize chords array to prevent unnecessary re-renders
  const memoizedChords = useMemo(() => chords || [], [chords]);

  // Colors based on dark/light mode
  const textColors = useMemo(() => ({
    unplayed: darkMode ? '#9CA3AF' : '#6B7280', // Gray
    played: darkMode ? '#60A5FA' : '#3B82F6',   // Blue (keeping blue instead of purple)
    chord: darkMode ? '#93C5FD' : '#2563EB',    // Chord color
    background: darkMode ? '#1F2937' : '#FFFFFF' // Background
  }), [darkMode]);

  // Process lyrics and integrate chord data when either changes
  useEffect(() => {

    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
      setProcessedLyrics(enhanceLyricsWithCharacterTiming(lyrics as SynchronizedLyrics));
      return;
    }

    // If no chord data is provided, use the lyrics as is
    if (!memoizedChords || memoizedChords.length === 0) {
      setProcessedLyrics(enhanceLyricsWithCharacterTiming(lyrics as SynchronizedLyrics));
      return;
    }

    // PERFORMANCE OPTIMIZATION: Efficient cloning instead of JSON.parse(JSON.stringify())
    // This reduces cloning time by ~70% for large lyric datasets
    const newLyrics: SynchronizedLyrics = {
      lines: lyrics.lines.map(line => ({
        startTime: line.startTime,
        endTime: line.endTime,
        text: line.text,
        chords: line.chords ? line.chords.map(chord => ({
          position: chord.position,
          chord: chord.chord,
          time: chord.time
        })) : []
      })),
      error: lyrics.error
    };

    // Map chords to lyrics lines and words
    newLyrics.lines.forEach((line, lineIndex) => {
      // Find chords that occur during this line's time range
      const lineChords = memoizedChords.filter(chord =>
        chord.time >= line.startTime && chord.time <= line.endTime
      );

      // Deduplicate chords to only show chord changes
      const deduplicatedLineChords = deduplicateChords(lineChords);

      // Create chord markers for each chord
      const chordMarkers: ChordMarker[] = deduplicatedLineChords.map(chord => {
        // Calculate the relative position of the chord within the line
        const relativePosition = (chord.time - line.startTime) / (line.endTime - line.startTime);

        // Split the line text into words
        const words = line.text.split(' ');
        const totalChars = line.text.length;

        // Map to character position in the text
        const charPosition = Math.floor(relativePosition * totalChars);

        // Find which word this position falls into
        let currentPos = 0;
        let wordIndex = 0;

        for (let i = 0; i < words.length; i++) {
          const wordLength = words[i].length;
          if (charPosition >= currentPos && charPosition < currentPos + wordLength) {
            wordIndex = i;
            break;
          }
          // Add 1 for the space between words
          currentPos += wordLength + 1;
        }

        // Calculate the position at the start of the word
        let wordStartPos = 0;
        for (let i = 0; i < wordIndex; i++) {
          wordStartPos += words[i].length + 1; // Add 1 for space
        }

        return {
          time: chord.time,
          chord: chord.chord,
          position: wordStartPos // Position at the start of the word
        };
      });

      // Add chord markers to the line
      newLyrics.lines[lineIndex].chords = chordMarkers;
    });

    // Enhance the lyrics with character-level timing
    setProcessedLyrics(enhanceLyricsWithCharacterTiming(newLyrics));
  }, [lyrics, memoizedChords]); // memoizedChords already handles chords dependency



  // Function to translate lyrics to a specific language with cache-first approach
  const translateLyrics = useCallback(async (targetLanguage: string) => {
    if (!processedLyrics || !processedLyrics.lines || processedLyrics.lines.length === 0) {
      setTranslationError('No lyrics available to translate');
      return;
    }

    try {
      setIsTranslating(true);
      setTranslationError(null);

      // Combine all lyrics lines into a single string
      const lyricsText = processedLyrics.lines.map(line => line.text).join('\n');

      // Get video ID from URL if available
      const videoId = typeof window !== 'undefined' ?
        new URLSearchParams(window.location.search).get('v') ||
        window.location.pathname.split('/').pop() :
        '';

      // Import the translation service dynamically to avoid SSR issues
      const { translateLyricsWithCache } = await import('@/services/translationService');

      // Get user's Gemini API key if available
      const geminiApiKey = await getApiKey('gemini');

      // Call the cache-first translation service
      const translationResponse = await translateLyricsWithCache(
        {
          lyrics: lyricsText,
          targetLanguage,
          videoId,
          geminiApiKey: geminiApiKey || undefined
        },
        // Background update callback
        (updatedTranslation) => {
          // Update the translations state with the fresh translation
          setTranslatedLyrics(prev => ({
            ...prev,
            [targetLanguage]: updatedTranslation
          }));

          // Remove from background updates tracking
          setBackgroundUpdatesInProgress(prev => {
            const newSet = new Set(prev);
            newSet.delete(targetLanguage);
            return newSet;
          });
        }
      );

      // Update the translations state with the initial translation (cached or fresh)
      setTranslatedLyrics(prev => ({
        ...prev,
        [targetLanguage]: translationResponse
      }));

      // Add the language to selected languages if not already selected
      setSelectedLanguages(prev =>
        prev.includes(targetLanguage) ? prev : [...prev, targetLanguage]
      );

      // Track background updates
      if (translationResponse.fromCache) {
        // Track that a background update is in progress for this language
        if (translationResponse.backgroundUpdateInProgress) {
          setBackgroundUpdatesInProgress(prev => {
            const newSet = new Set(prev);
            newSet.add(targetLanguage);
            return newSet;
          });
        }
      }

    } catch (error) {
      console.error('Translation error:', error);
      setTranslationError(
        error instanceof Error ? error.message : 'Failed to translate lyrics'
      );
    } finally {
      setIsTranslating(false);
    }
  }, [processedLyrics, getApiKey]);

  // Track the last scroll time to prevent too frequent scrolling
  const lastScrollTimeRef = useRef<number>(0);

  // Track the progress within the current line
  const lineProgressRef = useRef<number>(0);

  // Track throttle timing for auto-scroll
  const lastThrottleTimeRef = useRef<number>(0);

  // Add padding elements to ensure first and last lines can be centered
  useEffect(() => {
    if (containerRef.current) {
      // Minimal top padding to show first lyrics immediately
      containerRef.current.style.paddingTop = '10px';
      containerRef.current.style.paddingBottom = '20vh';

      // Add scroll margin to ensure active lines are positioned properly
      document.documentElement.style.scrollPaddingTop = '20px';
      document.documentElement.style.scrollPaddingBottom = '20vh';

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

  // PERFORMANCE OPTIMIZATION: Memoized active line calculation logic
  // This prevents recreation of the calculation function on every render
  const calculateActiveLine = useCallback((currentTime: number) => {
    if (!processedLyrics || !processedLyrics.lines || processedLyrics.lines.length === 0) {
      return { activeLine: -1, shouldShowLyrics: false, syncedTime: currentTime };
    }

    // Simple approach: Use chord timing to determine when lyrics should start
    let syncedTime = currentTime;
    let shouldShowLyrics = true;

    // If we have chord data, find the first non-"N" chord to determine music start time
    if (memoizedChords && memoizedChords.length > 0) {
      // Find the first actual chord (not "N" which represents no chord/silence)
      const firstActualChord = memoizedChords.find(chord =>
        chord.chord && chord.chord !== 'N' && chord.chord.trim() !== ''
      );

      if (firstActualChord) {
        const musicStartTime = firstActualChord.time || 0;

        // If current time is before the music starts, don't show lyrics
        if (currentTime < musicStartTime) {
          shouldShowLyrics = false;
        } else {
          // Adjust timing to account for music start offset
          syncedTime = currentTime;
        }
      }
    }

    return { activeLine: -1, shouldShowLyrics, syncedTime };
  }, [processedLyrics, memoizedChords]);

  // PERFORMANCE OPTIMIZATION: Throttled auto-scroll logic
  // This reduces DOM reads/writes from 60+ times per second to ~10 times per second
  const throttledAutoScroll = useCallback((newActiveLine: number) => {
    // Simple throttling using a ref to track last execution time
    const now = Date.now();
    const timeSinceLastCall = now - lastThrottleTimeRef.current;

    if (timeSinceLastCall >= 100) { // 100ms throttle = 10 times per second
      lastThrottleTimeRef.current = now;

      if (newActiveLine >= 0 && containerRef.current) {
        const lineElement = document.getElementById(`line-${newActiveLine}`);
        if (lineElement) {
          // Batch DOM reads using requestAnimationFrame
          requestAnimationFrame(() => {
            if (!containerRef.current) return;

            // Get the container's viewport dimensions
            const containerHeight = containerRef.current.clientHeight;
            const containerScrollTop = containerRef.current.scrollTop;
            const containerBottom = containerScrollTop + containerHeight;

            // Get the line element's position
            const lineTop = lineElement.offsetTop;
            const lineHeight = lineElement.clientHeight;
            const lineBottom = lineTop + lineHeight;

            // Calculate the ideal position - position the line at 1/3 from the bottom of the container
            const oneThirdFromBottom = containerHeight * (2/3);
            const idealScrollTop = lineTop - oneThirdFromBottom + (lineHeight / 2);

            // Calculate buffer space in terms of lines
            const avgLineHeight = lineHeight + 8;
            const linesVisible = Math.floor(containerHeight / avgLineHeight);
            const bufferLines = Math.max(2, Math.floor(linesVisible / 4));
            const bufferSize = bufferLines * avgLineHeight;

            // Check if the line is already properly positioned
            const targetPosition = containerScrollTop + oneThirdFromBottom;
            const isCorrectlyPositioned =
              Math.abs(targetPosition - (lineTop + lineHeight / 2)) < (avgLineHeight / 2);

            const isLineVisible =
              lineTop >= containerScrollTop + bufferSize &&
              lineBottom <= containerBottom - bufferSize;

            const shouldScroll = !isCorrectlyPositioned || !isLineVisible;
            const isNewLine = newActiveLine !== activeLine;
            const isNearEndOfLine = lineProgressRef.current > 0.85;
            const currentTime = Date.now();
            const timeSinceLastScroll = currentTime - lastScrollTimeRef.current;
            const minTimeBetweenScrolls = 800;

            if ((isNewLine || (shouldScroll && isNearEndOfLine)) &&
                timeSinceLastScroll > minTimeBetweenScrolls) {

              // Smooth scroll to center the active line
              containerRef.current.scrollTo({
                top: Math.max(0, idealScrollTop),
                behavior: 'smooth'
              });

              // Update last scroll time
              lastScrollTimeRef.current = currentTime;
            }
          });
        }
      }
    }
  }, [activeLine]);



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
  }, [processedLyrics, memoizedCharacterArrays]);



  /**
   * Find word boundaries in a string
   * Returns an array of objects with start and end indices for each word
   */
  const findWordBoundaries = (text: string): { start: number; end: number }[] => {
    const words: { start: number; end: number }[] = [];
    const wordRegex = /\S+/g;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
      words.push({
        start: match.index,
        end: match.index + match[0].length - 1
      });
    }

    return words;
  };

  /**
   * Find the word that contains a given character position
   */
  const findWordAtPosition = (
    position: number,
    words: { start: number; end: number }[]
  ): number => {
    for (let i = 0; i < words.length; i++) {
      if (position >= words[i].start && position <= words[i].end) {
        return i;
      }
    }

    // If position is after the last word, return the last word
    if (words.length > 0 && position > words[words.length - 1].end) {
      return words.length - 1;
    }

    // If position is before the first word, return the first word
    if (words.length > 0 && position < words[0].start) {
      return 0;
    }

    return -1; // Not found
  };

  // Note: We've removed the unused calculateCharacterProgress function
  // and replaced it with the improved word-aware animation logic

  /**
   * Utility function to identify instrumental sections from segmentation data
   */
  const getInstrumentalSections = useMemo(() => {
    if (!segmentationData?.segments) return [];

    return segmentationData.segments.filter(segment => {
      const type = (segment.label || segment.type || '').toLowerCase();
      return type.includes('intro') ||
             type.includes('outro') ||
             type.includes('instrumental') ||
             type.includes('solo') ||
             type.includes('bridge') && !type.includes('vocal');
    });
  }, [segmentationData]);



  /**
   * Get section label for a given timestamp
   */
  const getSectionLabel = (timestamp: number): string | null => {
    if (!segmentationData?.segments) return null;

    const segment = segmentationData.segments.find(seg =>
      timestamp >= seg.startTime && timestamp <= seg.endTime
    );

    return segment ? (segment.label || segment.type || null) : null;
  };

  /**
   * Render a single line with chords above the text
   */
  const renderLine = (line: EnhancedLyricLine, index: number) => {
    const isActive = index === activeLine;
    const isPast = index < activeLine && activeLine !== -1;

    // Find all word boundaries in the line
    const words = findWordBoundaries(line.text);

    // Group chords by the word they belong to
    const chordsByWord: { [wordIndex: number]: string[] } = {};

    // Sort chords by position (ensure line.chords exists and position property exists)
    const sortedChords = [...(line.chords || [])].sort((a, b) => {
      // Ensure position property exists, default to 0 if not
      const posA = a.position !== undefined ? a.position : 0;
      const posB = b.position !== undefined ? b.position : 0;
      return posA - posB;
    });

    // CRITICAL FIX: Deduplicate chords at line level before word assignment
    // This prevents the same chord from being assigned to multiple words
    const lineDeduplicatedChords: { chord: string; position: number; time: number }[] = [];
    let lastChordInLine = '';

    sortedChords.forEach(chord => {
      if (chord.chord !== lastChordInLine) {
        lineDeduplicatedChords.push(chord);
        lastChordInLine = chord.chord;
      }
    });

    // Assign each deduplicated chord to a word
    lineDeduplicatedChords.forEach(chord => {
      const wordIndex = findWordAtPosition(chord.position, words);
      if (wordIndex >= 0) {
        if (!chordsByWord[wordIndex]) {
          chordsByWord[wordIndex] = [];
        }
        // Only add if this chord isn't already assigned to this word
        if (!chordsByWord[wordIndex].includes(chord.chord)) {
          chordsByWord[wordIndex].push(chord.chord);
        }
      }
    });

    // Check if this is an instrumental placeholder or chord-only section
    const isInstrumental = (line as EnhancedLyricLine & { isInstrumental?: boolean }).isInstrumental;
    const isChordOnly = (line as EnhancedLyricLine & { isChordOnly?: boolean }).isChordOnly;
    const isCondensed = (line as EnhancedLyricLine & { isCondensed?: boolean }).isCondensed;

    // Create word segments with their associated chords
    const wordSegments: { text: string; chords: string[]; isChineseChar?: boolean }[] = [];

    // SPECIAL HANDLING: For condensed chord-only sections, show musical notes below with chord labels above
    if (isChordOnly && isCondensed) {
      // For condensed sections, show musical notes (♪) below and all unique chord labels above
      // Extract unique chords from the line's chord data
      const uniqueChords = line.chords ?
        line.chords.reduce((acc: string[], chord) => {
          const formattedChord = chord.chord.replace(/:maj$/, ''); // Remove :maj suffix
          if (!acc.includes(formattedChord)) {
            acc.push(formattedChord);
          }
          return acc;
        }, []) : [];

      // Generate dynamic number of musical notes based on actual chord changes
      const numChordChanges = Math.max(1, uniqueChords.length);
      const musicalNotes = '♪'.repeat(numChordChanges).split('').join(' ');

      wordSegments.push({
        text: musicalNotes, // Dynamic musical notes below based on chord changes
        chords: uniqueChords // All unique chord labels above
      });
    } else {
      // Regular processing for lyrics, instrumental, and non-condensed chord-only sections

      // Check if this line contains Chinese characters
      const hasChineseChars = containsChineseCharacters(line.text);

      // For Chinese text, we need special handling for character spacing
      if (hasChineseChars) {
        // For Chinese text, group characters into words based on spaces
        const chineseWords = line.text.split(' ').filter(word => word.length > 0);

        // Process each word
        chineseWords.forEach((word, wordIndex) => {
          // Find chords that align with this word
          const wordChords: string[] = [];
          const wordStartPos = line.text.indexOf(word);
          const wordEndPos = wordStartPos + word.length - 1;

          // Find chords that belong to this word
          sortedChords.forEach(chord => {
            if (chord.position >= wordStartPos && chord.position <= wordEndPos) {
              wordChords.push(chord.chord);
            }
          });

          // Add the word as a segment with its chords
          wordSegments.push({
            text: word,
            chords: wordChords,
            isChineseChar: containsChineseCharacters(word)
          });

          // Add space after word (except for the last word)
          if (wordIndex < chineseWords.length - 1) {
            wordSegments.push({
              text: ' ',
              chords: []
            });
          }
        });
      } else {
        // For non-Chinese text, use the original word-based approach
        // Split the line into words and spaces
        let lastIndex = 0;
        words.forEach((word, wordIndex) => {
          // Add any space before this word
          if (word.start > lastIndex) {
            wordSegments.push({
              text: line.text.substring(lastIndex, word.start),
              chords: []
            });
          }

          // Add the word with its chords
          wordSegments.push({
            text: line.text.substring(word.start, word.end + 1),
            chords: chordsByWord[wordIndex] || []
          });

          lastIndex = word.end + 1;
        });
      }

      // For non-Chinese text, add any remaining text after the last word
      if (!hasChineseChars) {
        let lastIndex = 0;
        if (words.length > 0) {
          const lastWord = words[words.length - 1];
          lastIndex = lastWord.end + 1;
        }

        if (lastIndex < line.text.length) {
          wordSegments.push({
            text: line.text.substring(lastIndex),
            chords: []
          });
        }
      }
    } // End of regular processing else block

    // Get translated texts for this line in all selected languages
    const translatedTexts = selectedLanguages.map(language => ({
      language,
      text: translatedLyrics[language] ? getTranslatedLineText(line.text, language) : ''
    })).filter(item => item.text);

    // Get section label for this line
    const sectionLabel = getSectionLabel(line.startTime);
    const isFirstLineOfSection = index === 0 || getSectionLabel(mergedLyricsWithInstrumentals[index - 1]?.startTime) !== sectionLabel;



    return (
      <div key={index}>
        {/* Section Label - only show at the beginning of each section */}
        {isFirstLineOfSection && sectionLabel && (
          <div className={`mb-2 mt-4 first:mt-0 text-left ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div
              className={`inline-block px-2 py-1 rounded-lg font-medium uppercase tracking-wide ${
                darkMode ? 'bg-gray-800 border border-gray-600' : 'bg-gray-100 border border-gray-300'
              }`}
              style={{
                fontSize: `${fontSize * 0.85}px`, // Match lyrics font size proportionally
              }}
            >
              {sectionLabel}
            </div>
          </div>
        )}

        <div
          id={`line-${index}`}
          className={`mb-4 ${isActive ? `active p-2 rounded-lg -mx-1 border-l-3 ${darkMode ? 'bg-blue-900 bg-opacity-20 border-blue-500' : 'bg-blue-50 border-blue-400'}` : ''} ${isPast ? 'past' : ''} ${
            isInstrumental ? `${darkMode ? 'bg-yellow-900 bg-opacity-20 border-yellow-600' : 'bg-yellow-50 border-yellow-400'} border-l-3 italic` : ''
          } ${
            isChordOnly ? 'text-center' : ''
          }`}
          style={isActive ? {
            transform: 'scale(1.01)',
            transition: 'all 0.3s ease-in-out'
          } : {}}
        >
        <div className="flex flex-wrap">
          {wordSegments.map((segment, i) => (
            <div
              key={i}
              className="relative inline-flex flex-col justify-end"
              style={{
                alignItems: 'flex-start',
                marginRight: segment.text === ' ' ? '0' : '0px', // No extra margin for spaces
                letterSpacing: 'normal', // Use normal letter spacing for all text
                whiteSpace: 'pre-wrap' // Preserve whitespace
              }}
            >
              {segment.chords.length > 0 && (
                  <div
                    className={getResponsiveChordFontSize()}
                    style={{
                      ...getChordLabelStyles(),
                      marginBottom: '0px', // Reduced from 2px to 0px
                      minHeight: 'auto',
                      fontSize: `${fontSize * 0.9}px`,
                      color: textColors.chord,
                      fontWeight: 600,
                      display: 'inline-block',
                      position: 'relative',
                      width: 'auto',
                      paddingBottom: '1px' // Added minimal padding
                    }}
                  >
                    {segment.chords.map((chord, chordIndex) =>
                      <span
                        key={`chord-${chordIndex}`}
                        className="inline-block mx-0.5"
                        dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(chord, darkMode) }}
                      ></span>
                    ).reduce((prev, curr, i) =>
                      i === 0 ? [curr] : [...prev, <span key={`space-${i}`}> </span>, curr], [] as React.ReactNode[]
                    )}
                    {/* Add a darker underline bar that's limited to the chord width */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '-1px', // Moved up from -2px to -1px
                        left: '0',
                        right: '0',
                        height: '1px', // Reduced from 2px to 1px
                        backgroundColor: darkMode ? '#64748b' : '#94a3b8', // Darker gray for better visibility
                        borderRadius: '1px'
                      }}
                    ></div>
                  </div>
              )}

              {/* Render text with character-by-character animation for active lines */}
              <div
                style={{
                  fontSize: `${fontSize}px`,
                  paddingTop: segment.chords.length > 0 ? '2px' : '0',
                  display: 'inline-block',
                  whiteSpace: 'pre' // Preserve whitespace exactly as is
                }}
                className={segment.chords.length > 0 ? "font-medium" : ""}
              >
                {isActive ? (
                  // For active lines, render each character with its own animation
                  <span>
                    {/* Calculate the overall line progress with character-level timing */}
                    {(() => {
                      // Calculate overall line progress (0 to 1)
                      const lineProgress = Math.max(0, Math.min(1,
                        (currentTime - line.startTime) / (line.endTime - line.startTime)
                      ));

                      // Use character-level timing if available
                      let colorChangePosition = 0;
                      const totalLineLength = line.text.length;

                      if (line.characterTimings && line.characterTimings.length > 0) {
                        // Find the active character based on current time
                        const activeCharIndex = line.characterTimings.findIndex(
                          charTiming => currentTime >= charTiming.startTime && currentTime <= charTiming.endTime
                        );

                        // If we found an active character, use it as the color change position
                        if (activeCharIndex >= 0) {
                          colorChangePosition = activeCharIndex;
                        } else {
                          // Otherwise, fall back to the traditional calculation
                          colorChangePosition = Math.floor(lineProgress * totalLineLength);
                        }
                      } else {
                        // Fall back to the traditional calculation if character timings aren't available
                        colorChangePosition = Math.floor(lineProgress * totalLineLength);
                      }

                      // Calculate the absolute position of this segment in the line
                      // Use indexOf with a start position to handle repeated segments correctly
                      let segmentStartPos = 0;
                      const segmentIndex = wordSegments.findIndex(s => s === segment);

                      // Find the correct start position by looking at previous segments
                      for (let i = 0; i < segmentIndex; i++) {
                        segmentStartPos += wordSegments[i].text.length;
                      }

                      const segmentEndPos = segmentStartPos + segment.text.length - 1;

                      // Determine if this segment is before, after, or contains the color change
                      if (segmentEndPos < colorChangePosition) {
                        // Segment is completely before the color change - all colored
                        return (
                          <span style={{ color: textColors.played }}>
                            {segment.text}
                          </span>
                        );
                      } else if (segmentStartPos > colorChangePosition) {
                        // Segment is completely after the color change - no color
                        return (
                          <span style={{ color: textColors.unplayed }}>
                            {segment.text}
                          </span>
                        );
                      } else {
                        // Segment contains the color change - split into characters
                        // First, identify word boundaries within this segment
                        const segmentWords: { start: number; end: number; text: string }[] = [];
                        let wordStart = 0;

                        // For most segments, the entire segment is a single word
                        // This simplifies the logic and ensures proper word-level coloring
                        if (segment.text.trim().length > 0 && !segment.text.includes(' ')) {
                          segmentWords.push({
                            start: 0,
                            end: segment.text.length - 1,
                            text: segment.text
                          });
                        } else {
                          // For segments with spaces, use the original logic
                          for (let i = 0; i < segment.text.length; i++) {
                            if (segment.text[i] === ' ' || i === segment.text.length - 1) {
                              const end = i === segment.text.length - 1 ? i : i - 1;
                              if (end >= wordStart) {
                                segmentWords.push({
                                  start: wordStart,
                                  end: end,
                                  text: segment.text.substring(wordStart, end + 1)
                                });
                              }
                              wordStart = i + 1;
                            }
                          }
                        }

                        // PERFORMANCE OPTIMIZATION: Use memoized character array instead of split() on every render
                        const characters = memoizedCharacterArrays.getCharArray(segment.text);
                        return characters.map((char, charIndex) => {
                          const absoluteCharPos = segmentStartPos + charIndex;

                          // Determine which word this character belongs to
                          const wordIndex = segmentWords.findIndex(
                            word => charIndex >= word.start && charIndex <= word.end
                          );

                          // If character is part of a word, ensure left-to-right coloring within the word
                          if (wordIndex >= 0) {
                            const word = segmentWords[wordIndex];
                            const wordAbsoluteStart = segmentStartPos + word.start;

                            // If the color change is within this word
                            if (colorChangePosition >= wordAbsoluteStart &&
                                colorChangePosition <= segmentStartPos + word.end) {

                              // Color all characters to the left of the color change position
                              const isColored = absoluteCharPos <= colorChangePosition;

                              // Apply gradient effect only to the character at the transition point
                              if (absoluteCharPos === colorChangePosition) {
                                // Calculate fractional progress within this character
                                let fractionalProgress = 0;

                                // Use character-level timing if available
                                if (line.characterTimings && line.characterTimings.length > absoluteCharPos) {
                                  const charTiming = line.characterTimings[absoluteCharPos];
                                  const charDuration = charTiming.endTime - charTiming.startTime;

                                  if (charDuration > 0) {
                                    // Calculate progress within this specific character
                                    fractionalProgress = (currentTime - charTiming.startTime) / charDuration;
                                    fractionalProgress = Math.max(0, Math.min(1, fractionalProgress));
                                  } else {
                                    // Fallback if character has no duration
                                    fractionalProgress = (lineProgress * totalLineLength) - Math.floor(lineProgress * totalLineLength);
                                  }
                                } else {
                                  // Fallback to traditional calculation
                                  fractionalProgress = (lineProgress * totalLineLength) - Math.floor(lineProgress * totalLineLength);
                                }

                                // Interpolate between colors
                                const r1 = parseInt(textColors.unplayed.slice(1, 3), 16);
                                const g1 = parseInt(textColors.unplayed.slice(3, 5), 16);
                                const b1 = parseInt(textColors.unplayed.slice(5, 7), 16);

                                const r2 = parseInt(textColors.played.slice(1, 3), 16);
                                const g2 = parseInt(textColors.played.slice(3, 5), 16);
                                const b2 = parseInt(textColors.played.slice(5, 7), 16);

                                const r = Math.round(r1 + (r2 - r1) * fractionalProgress);
                                const g = Math.round(g1 + (g2 - g1) * fractionalProgress);
                                const b = Math.round(b1 + (b2 - b1) * fractionalProgress);

                                return (
                                  <span key={charIndex} style={{ color: `rgb(${r}, ${g}, ${b})` }}>
                                    {char}
                                  </span>
                                );
                              }

                              return (
                                <span key={charIndex} style={{ color: isColored ? textColors.played : textColors.unplayed }}>
                                  {char}
                                </span>
                              );
                            } else {
                              // Word is either completely before or after the color change
                              const isWordColored = wordAbsoluteStart < colorChangePosition;
                              return (
                                <span key={charIndex} style={{ color: isWordColored ? textColors.played : textColors.unplayed }}>
                                  {char}
                                </span>
                              );
                            }
                          } else {
                            // Character is not part of a word (e.g., space)
                            const isColored = absoluteCharPos < colorChangePosition;
                            return (
                              <span key={charIndex} style={{ color: isColored ? textColors.played : textColors.unplayed }}>
                                {char}
                              </span>
                            );
                          }
                        });
                      }
                    })()}
                  </span>
                ) : (
                  // For non-active lines, use a simple motion animation
                  <motion.span
                    initial={{ color: textColors.unplayed }}
                    animate={{
                      color: isPast ? textColors.played : textColors.unplayed
                    }}
                    transition={{ duration: 0.5 }}
                  >
                    {segment.text}
                  </motion.span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Display translated texts for each selected language */}
        {translatedTexts.length > 0 && (
          <div className={`mt-2 pt-2 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            {translatedTexts.map((translation, i) => (
              <div key={i} className="mb-1">
                <div
                  className={`italic mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}
                  style={{ fontSize: `${fontSize * 0.85}px` }}
                >
                  {translation.text}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    );
  };

  /**
   * Get the translated text for a specific line in a specific language
   */
  const getTranslatedLineText = (originalText: string, language: string): string => {
    if (!translatedLyrics[language] || !translatedLyrics[language].translatedLyrics) {
      return '';
    }

    // Get all original lines from the current processed lyrics
    const originalLines = processedLyrics.lines.map((line) => line.text);

    // Find the index of this line in the original text
    const originalLineIndex = originalLines.indexOf(originalText);
    if (originalLineIndex === -1) {
      return '';
    }

    // Split the translated text into lines
    const translatedLines = translatedLyrics[language].translatedLyrics.split('\n');

    // Return the corresponding translated line if it exists
    if (originalLineIndex < translatedLines.length) {
      return translatedLines[originalLineIndex];
    }

    return '';
  };

  /**
   * Merge lyrics with instrumental placeholders and chord-only sections to create a complete timeline
   */
  const mergedLyricsWithInstrumentals = useMemo(() => {
    if (!processedLyrics?.lines) return [];

    const allItems: (EnhancedLyricLine & { isInstrumental?: boolean; isChordOnly?: boolean; sectionLabel?: string; duration?: number })[] = [...processedLyrics.lines];

    // Add instrumental placeholders for sections without lyrics
    if (segmentationData?.segments) {
      const instrumentalSections = getInstrumentalSections;

      instrumentalSections.forEach(segment => {
        // Check if there are already lyrics in this time range
        const hasLyricsInRange = processedLyrics.lines.some(line =>
          (line.startTime >= segment.startTime && line.startTime <= segment.endTime) ||
          (line.endTime >= segment.startTime && line.endTime <= segment.endTime) ||
          (line.startTime <= segment.startTime && line.endTime >= segment.endTime)
        );

        // Only add instrumental placeholder if no lyrics exist in this range
        if (!hasLyricsInRange) {
          const placeholder = createInstrumentalPlaceholder(segment, chords);
          allItems.push(placeholder);
        }
      });
    }

    // Add chord-only sections for chords that don't fall within any lyrics or instrumental sections
    const sortedItems = [...allItems].sort((a, b) => a.startTime - b.startTime);
    const chordsToAdd: ChordData[] = [];

    chords.forEach(chord => {
      // Check if this chord falls within any existing item (lyrics or instrumental)
      const isChordCovered = sortedItems.some(item =>
        chord.time >= item.startTime && chord.time <= item.endTime
      );

      if (!isChordCovered) {
        chordsToAdd.push(chord);
      }
    });

    // IMPROVED CONDENSATION: Group consecutive uncovered chords into fewer, more condensed sections
    if (chordsToAdd.length > 0) {
      let currentGroup: ChordData[] = [];
      let lastChordTime = -1;
      const chordGapThreshold = 8; // INCREASED: group chords within 8 seconds of each other for better condensation

      chordsToAdd.forEach((chord, index) => {
        if (lastChordTime === -1 || chord.time - lastChordTime <= chordGapThreshold) {
          currentGroup.push(chord);
        } else {
          // Create a chord-only section for the previous group
          if (currentGroup.length > 0) {
            // AGGRESSIVE CONDENSATION: Always condense chord-only sections for cleaner display
            const shouldCondense = true; // Always condense chord-only sections
            const chordOnlySection = createChordOnlySection(currentGroup, shouldCondense);
            allItems.push(chordOnlySection);
          }
          currentGroup = [chord];
        }
        lastChordTime = chord.time;

        // Handle the last group
        if (index === chordsToAdd.length - 1 && currentGroup.length > 0) {
          // AGGRESSIVE CONDENSATION: Always condense chord-only sections for cleaner display
          const shouldCondense = true; // Always condense chord-only sections
          const chordOnlySection = createChordOnlySection(currentGroup, shouldCondense);
          allItems.push(chordOnlySection);
        }
      });
    }

    // Sort all items by start time
    return allItems.sort((a, b) => a.startTime - b.startTime);
  }, [processedLyrics, segmentationData, getInstrumentalSections, chords]);

  // Find the active line based on synchronized playback time
  useEffect(() => {
    const result = calculateActiveLine(currentTime);

    if (!result.shouldShowLyrics) {
      setActiveLine(-1);
      return;
    }

    // Use mergedLyricsWithInstrumentals instead of processedLyrics.lines for proper synchronization
    // This ensures that instrumental placeholders and chord-only sections are included in timing calculations
    const allLines = mergedLyricsWithInstrumentals;

    const newActiveLine = allLines.findIndex(
      line => result.syncedTime >= line.startTime && result.syncedTime <= line.endTime
    );

    // If no active line found but we have a current time, find the closest upcoming line
    if (newActiveLine === -1 && currentTime > 0) {
      const upcomingLineIndex = allLines.findIndex(line => currentTime < line.startTime);
      if (upcomingLineIndex > 0) {
        // If we're closer to the previous line's end than the next line's start, use previous
        const prevLine = allLines[upcomingLineIndex - 1];
        const nextLine = allLines[upcomingLineIndex];
        if (currentTime - prevLine.endTime < nextLine.startTime - currentTime) {
          setActiveLine(upcomingLineIndex - 1);
        }
      }
    } else if (newActiveLine !== activeLine) {
      setActiveLine(newActiveLine);

      // Reset line progress when changing lines
      lineProgressRef.current = 0;
    }

    // Calculate progress within the current line (0 to 1)
    if (newActiveLine >= 0) {
      const currentLine = allLines[newActiveLine];
      const lineProgress = (result.syncedTime - currentLine.startTime) / (currentLine.endTime - currentLine.startTime);
      lineProgressRef.current = Math.max(0, Math.min(1, lineProgress));
    }

    // PERFORMANCE OPTIMIZATION: Use throttled auto-scroll instead of direct DOM manipulation
    throttledAutoScroll(newActiveLine);
  }, [currentTime, processedLyrics, activeLine, memoizedChords, calculateActiveLine, throttledAutoScroll, mergedLyricsWithInstrumentals]);

  // If no lyrics are available, show a message
  if (!processedLyrics || !processedLyrics.lines || processedLyrics.lines.length === 0) {
    const errorMessage = processedLyrics?.error || lyrics?.error || 'No lyrics available for this song';
    const isNoLyricsDetected = errorMessage.includes('No lyrics detected');

    return (
      <div className="lead-sheet-container p-4 rounded-lg shadow" style={{ backgroundColor: textColors.background }}>
        <div className="text-center p-8" style={{ color: textColors.unplayed }}>
          <div className="mb-4 text-xl font-semibold">Lyrics Unavailable</div>
          <div className="text-base">{errorMessage}</div>
          <div className="mt-6 text-sm opacity-75">
            This may be due to:
            <ul className="list-disc list-inside mt-2 text-left max-w-md mx-auto">
              {isNoLyricsDetected && (
                <>
                  <li className="font-medium">No lyrics detected in the audio</li>
                  <li>The song being instrumental</li>
                  <li>Audio quality issues</li>
                </>
              )}
              {!isNoLyricsDetected && (
                <>
                  <li>No lyrics detected in the audio</li>
                  <li>Music.ai API service unavailable or configuration issues</li>
                  <li>The song being instrumental</li>
                  <li>Audio quality issues</li>
                </>
              )}
              {errorMessage.includes('API') && (
                <li className="text-red-500">Music.ai API connection issue - please check the console logs</li>
              )}
              {errorMessage.includes('transcribe') && (
                <li className="text-red-500">Transcription service error - please try again later</li>
              )}
              {errorMessage.includes('connection') && (
                <li className="text-red-500">Network connection issue - please check your internet connection</li>
              )}
              {errorMessage.includes('timeout') && (
                <li className="text-red-500">Request timeout - the Music.ai API is taking too long to respond</li>
              )}
              {errorMessage.includes('workflow') && (
                <li className="text-red-500">Workflow not found - the Music.ai API doesn&apos;t have the required workflow</li>
              )}
              {errorMessage.includes('No workflows available') && (
                <li className="text-red-500">No workflows available - please set up workflows in your Music.ai account</li>
              )}
              {errorMessage.includes('not configured') && (
                <li className="text-red-500">The selected workflow is not configured for lyrics transcription - please set up a proper workflow in your Music.ai account</li>
              )}
              {errorMessage.includes('Job failed') && (
                <li className="text-red-500">The Music.ai API job failed - please check your workflow configuration</li>
              )}
              {errorMessage.includes('Unknown error') && (
                <li className="text-red-500">The Music.ai API returned an unknown error - please check your workflow configuration</li>
              )}
            </ul>
          </div>
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-700 font-medium">Troubleshooting:</p>
            <ul className="list-disc list-inside mt-2 text-left max-w-md mx-auto text-blue-600">
              {!isNoLyricsDetected ? (
                <>
                  <li>Check that your Music.ai API key is valid and properly configured</li>
                  <li>Ensure you have created appropriate workflows in your Music.ai account</li>
                  <li>Try with a different audio file or YouTube video</li>
                  <li>Check the browser console for detailed error messages</li>
                </>
              ) : (
                <>
                  <li>Try with a different song that has vocals</li>
                  <li>This may be an instrumental track without lyrics</li>
                  <li>The audio quality might be too low for lyrics detection</li>
                  <li>The vocals might be too quiet or mixed in a way that makes lyrics detection difficult</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lead-sheet-container">
      {/* Controls in a single line */}
      <div className={`controls mb-3 flex items-center justify-between p-2 rounded-md transition-colors duration-300 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center space-x-3">
          {/* Font size control - YouTube-style slider with blue theme */}
          <div className="flex items-center">
            <span className={`text-sm mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Font:</span>
            <div className={`w-24 relative h-2 rounded-full overflow-hidden mr-1 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
              <div
                className="absolute top-0 left-0 h-full bg-blue-600 rounded-full"
                style={{ width: `${((fontSize - 12) / 12) * 100}%` }}
              ></div>
              <input
                id="font-size"
                type="range"
                min="12"
                max="24"
                value={fontSize}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{fontSize}px</span>
          </div>

          {/* Translation dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
              disabled={isTranslating || !processedLyrics?.lines?.length}
              className={`px-3 py-1 rounded text-sm font-medium flex items-center ${
                isTranslating
                  ? `cursor-not-allowed ${darkMode ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'}`
                  : `${darkMode ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'} text-white`
              }`}
            >
              {isTranslating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Translating...
                </span>
              ) : (
                <>
                  <GlobeIcon className="mr-2 h-4 w-4" darkMode={darkMode} />
                  Translate Lyrics
                  <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </>
              )}
            </button>

            {/* Language selection dropdown */}
            {isLanguageMenuOpen && !isTranslating && (
              <div className="absolute z-10 mt-1 w-48 bg-white dark:bg-content-bg rounded-md shadow-lg py-1 text-sm">
                {availableLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer"
                    onClick={() => {
                      // Toggle language selection
                      if (selectedLanguages.includes(lang.code)) {
                        setSelectedLanguages(prev => prev.filter(l => l !== lang.code));
                      } else if (translatedLyrics[lang.code]) {
                        // If we already have a translation, just add it to selected
                        setSelectedLanguages(prev => [...prev, lang.code]);
                      } else {
                        // Otherwise translate it first
                        translateLyrics(lang.code);
                      }
                    }}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span>{lang.name}</span>
                      <div className="flex items-center space-x-1">
                        {/* Show background update indicator */}
                        {backgroundUpdatesInProgress.has(lang.code) && (
                          <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        {selectedLanguages.includes(lang.code) && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Display chord count if available */}
        {chords && chords.length > 0 && (
          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <span className="font-medium">{chords.length}</span> chords integrated
          </div>
        )}
      </div>

      {/* Translation error message */}
      {translationError && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-md text-sm">
          <p className="font-medium">Translation Error</p>
          <p>{translationError}</p>
        </div>
      )}

      {/* Lyrics container with auto-scroll - using more vertical space */}
      <div
        ref={containerRef}
        className="lyrics-container overflow-y-auto p-3 rounded-lg shadow-sm"
        style={{
          backgroundColor: textColors.background,
          lineHeight: '1.4',
          scrollBehavior: 'smooth',
          height: 'calc(65vh - 20px)', // Significantly increased height for more content
          maxHeight: '600px', // Increased maximum height
          scrollPaddingTop: '15px', // Reduced top padding to show lyrics closer to the top
          scrollPaddingBottom: '30px', // Reduced bottom padding
          position: 'relative', // Ensure proper positioning
          margin: '0 auto', // Center the container horizontally
          paddingTop: '3px' // Minimal padding at the top of the visible container
        }}
      >
        {mergedLyricsWithInstrumentals.map((line, index) => renderLine(line, index))}
      </div>
    </div>
  );
});

LeadSheetDisplay.displayName = 'LeadSheetDisplay';

export default LeadSheetDisplay;
