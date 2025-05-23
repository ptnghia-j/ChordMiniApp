/**
 * LeadSheetDisplay Component
 *
 * This component displays lyrics in a lead sheet format with chords positioned
 * above the corresponding words. It includes dynamic styling that changes
 * as the song plays, with unplayed lyrics in gray and played lyrics in blue.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  formatChordWithMusicalSymbols,
  getResponsiveChordFontSize,
  getChordLabelStyles
} from '@/utils/chordFormatting';
import {
  enhanceLyricsWithCharacterTiming,
  EnhancedLyricsData,
  EnhancedLyricLine,
  getActiveCharacterIndex,
  getCharacterProgress
} from '@/utils/lyricsTimingUtils';

/**
 * Utility function to detect if text contains Chinese characters
 */
const containsChineseCharacters = (text: string): boolean => {
  // Unicode ranges for Chinese characters
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]/;
  return chineseRegex.test(text);
};

/**
 * Utility function to add spacing between Chinese characters for better chord alignment
 */
const addSpacingToChineseText = (text: string): string => {
  if (!containsChineseCharacters(text)) {
    return text;
  }

  // Add a small space between each Chinese character
  // but preserve existing spaces and non-Chinese characters
  return text.split('').map((char, i) => {
    // Check if the character is Chinese
    if (containsChineseCharacters(char)) {
      // Add a space after each Chinese character except the last one
      return i < text.length - 1 ? char + ' ' : char;
    }
    return char;
  }).join('');
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
}

interface ChordData {
  time: number;
  chord: string;
}

interface LeadSheetProps {
  lyrics: SynchronizedLyrics;
  currentTime: number;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  darkMode?: boolean;
  chords?: ChordData[]; // Optional chord data from analysis results
}

/**
 * LeadSheetDisplay Component
 */
const LeadSheetDisplay: React.FC<LeadSheetProps> = ({
  lyrics,
  currentTime,
  fontSize,
  onFontSizeChange,
  darkMode = false,
  chords = []
}): React.ReactNode => {
  // State to track the currently active line
  const [activeLine, setActiveLine] = useState<number>(-1);

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

  // Colors based on dark/light mode
  const textColors = {
    unplayed: darkMode ? '#9CA3AF' : '#6B7280', // Gray
    played: darkMode ? '#60A5FA' : '#3B82F6',   // Blue (keeping blue instead of purple)
    chord: darkMode ? '#93C5FD' : '#2563EB',    // Chord color
    background: darkMode ? '#1F2937' : '#FFFFFF' // Background
  };

  // Process lyrics and integrate chord data when either changes
  useEffect(() => {
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
      setProcessedLyrics(enhanceLyricsWithCharacterTiming(lyrics as SynchronizedLyrics));
      return;
    }

    // If no chord data is provided, use the lyrics as is
    if (!chords || chords.length === 0) {
      setProcessedLyrics(enhanceLyricsWithCharacterTiming(lyrics as SynchronizedLyrics));
      return;
    }

    // Clone the lyrics to avoid mutating the original
    const newLyrics: SynchronizedLyrics = {
      lines: JSON.parse(JSON.stringify(lyrics.lines)),
      error: lyrics.error
    };

    // Map chords to lyrics lines and words
    newLyrics.lines.forEach((line, lineIndex) => {
      // Find chords that occur during this line's time range
      const lineChords = chords.filter(chord =>
        chord.time >= line.startTime && chord.time <= line.endTime
      );

      // Create chord markers for each chord
      const chordMarkers: ChordMarker[] = lineChords.map(chord => {
        // Calculate the relative position of the chord within the line
        const relativePosition = (chord.time - line.startTime) / (line.endTime - line.startTime);

        // Map to character position in the text
        const position = Math.floor(relativePosition * line.text.length);

        return {
          time: chord.time,
          chord: chord.chord,
          position: position
        };
      });

      // Add chord markers to the line
      newLyrics.lines[lineIndex].chords = chordMarkers;
    });

    // Enhance the lyrics with character-level timing
    setProcessedLyrics(enhanceLyricsWithCharacterTiming(newLyrics));
  }, [lyrics, chords]);

  // Debug log the lyrics prop
  useEffect(() => {
    console.log('LeadSheetDisplay received lyrics:', lyrics);
    if (lyrics && lyrics.lines) {
      console.log(`LeadSheetDisplay has ${lyrics.lines.length} lines`);
    } else {
      console.warn('LeadSheetDisplay received empty or invalid lyrics');
    }

    if (chords && chords.length > 0) {
      console.log(`LeadSheetDisplay received ${chords.length} chords`);
    }
  }, [lyrics, chords]);

  // Function to translate lyrics to a specific language
  const translateLyrics = async (targetLanguage: string) => {
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

      // Call the translation API with the target language
      const response = await axios.post('/api/translate-lyrics', {
        lyrics: lyricsText,
        targetLanguage,
        videoId
      });

      // Update the translations state with the new translation
      setTranslatedLyrics(prev => ({
        ...prev,
        [targetLanguage]: response.data
      }));

      // Add the language to selected languages if not already selected
      setSelectedLanguages(prev =>
        prev.includes(targetLanguage) ? prev : [...prev, targetLanguage]
      );

    } catch (error) {
      console.error('Translation error:', error);
      setTranslationError(
        error instanceof Error ? error.message : 'Failed to translate lyrics'
      );
    } finally {
      setIsTranslating(false);
    }
  };

  // Debug log processed lyrics
  useEffect(() => {
    if (processedLyrics && processedLyrics.lines) {
      console.log(`LeadSheetDisplay has ${processedLyrics.lines.length} processed lines with chords`);

      // Log a sample of lines with chords
      const sampleLine = processedLyrics.lines.find(line => line.chords && line.chords.length > 0);
      if (sampleLine) {
        console.log('Sample line with chords:', sampleLine);
      }

      // Log character timing information
      const sampleLineWithCharTimings = processedLyrics.lines.find(line =>
        line.characterTimings && line.characterTimings.length > 0
      );

      if (sampleLineWithCharTimings && sampleLineWithCharTimings.characterTimings) {
        console.log('Character-level timing enabled. Sample line:', {
          text: sampleLineWithCharTimings.text,
          startTime: sampleLineWithCharTimings.startTime,
          endTime: sampleLineWithCharTimings.endTime,
          characterCount: sampleLineWithCharTimings.characterTimings.length,
          firstChar: sampleLineWithCharTimings.characterTimings[0],
          lastChar: sampleLineWithCharTimings.characterTimings[sampleLineWithCharTimings.characterTimings.length - 1]
        });
      }
    }
  }, [processedLyrics]);

  // Track the last scroll time to prevent too frequent scrolling
  const lastScrollTimeRef = useRef<number>(0);

  // Track the progress within the current line
  const lineProgressRef = useRef<number>(0);

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

  // Find the active line based on current playback time
  useEffect(() => {
    if (!processedLyrics || !processedLyrics.lines || processedLyrics.lines.length === 0) {
      setActiveLine(-1);
      return;
    }

    const newActiveLine = processedLyrics.lines.findIndex(
      line => currentTime >= line.startTime && currentTime <= line.endTime
    );

    // If no active line found but we have a current time, find the closest upcoming line
    if (newActiveLine === -1 && currentTime > 0) {
      const upcomingLineIndex = processedLyrics.lines.findIndex(line => currentTime < line.startTime);
      if (upcomingLineIndex > 0) {
        // If we're closer to the previous line's end than the next line's start, use previous
        const prevLine = processedLyrics.lines[upcomingLineIndex - 1];
        const nextLine = processedLyrics.lines[upcomingLineIndex];
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
      const line = processedLyrics.lines[newActiveLine];
      const lineProgress = (currentTime - line.startTime) / (line.endTime - line.startTime);
      lineProgressRef.current = Math.max(0, Math.min(1, lineProgress));
    }

    // Handle auto-scrolling with improved timing and centering
    if (newActiveLine >= 0 && containerRef.current) {
      const lineElement = document.getElementById(`line-${newActiveLine}`);
      if (lineElement) {
        // Get the container's viewport dimensions
        const containerHeight = containerRef.current.clientHeight;
        const containerScrollTop = containerRef.current.scrollTop;
        const containerBottom = containerScrollTop + containerHeight;

        // Get the line element's position
        const lineTop = lineElement.offsetTop;
        const lineHeight = lineElement.clientHeight;
        const lineBottom = lineTop + lineHeight;

        // Calculate the ideal position - position the line at 1/3 from the bottom of the container
        // This ensures the active line is positioned for better readability with more context above
        const oneThirdFromBottom = containerHeight * (2/3); // Position at 1/3 from bottom (2/3 from top)
        const idealScrollTop = lineTop - oneThirdFromBottom + (lineHeight / 2);

        // Calculate buffer space in terms of lines (we want at least 2-3 lines visible above)
        // Estimate average line height based on current line
        const avgLineHeight = lineHeight + 8; // Add 8px for margin (reduced from 10px)
        const linesVisible = Math.floor(containerHeight / avgLineHeight);
        const bufferLines = Math.max(2, Math.floor(linesVisible / 4)); // At least 2 lines, or 1/4 of visible lines

        // Convert buffer lines to pixels
        const bufferSize = bufferLines * avgLineHeight;

        // Check if the line is already properly positioned in the container
        const targetPosition = containerScrollTop + oneThirdFromBottom; // 1/3 from bottom of visible area
        const isCorrectlyPositioned =
          Math.abs(targetPosition - (lineTop + lineHeight / 2)) < (avgLineHeight / 2);

        const isLineVisible =
          lineTop >= containerScrollTop + bufferSize &&
          lineBottom <= containerBottom - bufferSize;

        // Determine if we should scroll based on timing and visibility
        const shouldScroll = !isCorrectlyPositioned || !isLineVisible;

        // Add a delay to prevent scrolling too early in the line
        // Only scroll when a new line becomes active or if we're near the end of the current line
        const isNewLine = newActiveLine !== activeLine;
        const isNearEndOfLine = lineProgressRef.current > 0.85;
        const currentTime = Date.now();
        const timeSinceLastScroll = currentTime - lastScrollTimeRef.current;
        const minTimeBetweenScrolls = 800; // Minimum 0.8 seconds between scrolls

        // Log for debugging
        console.log(`Line ${newActiveLine}: progress=${lineProgressRef.current.toFixed(2)}, isPositioned=${isCorrectlyPositioned}, isVisible=${isLineVisible}, targetPos=${Math.round(targetPosition)}, linePos=${Math.round(lineTop + lineHeight / 2)}`);

        if ((isNewLine || (shouldScroll && isNearEndOfLine)) &&
            timeSinceLastScroll > minTimeBetweenScrolls) {

          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            if (containerRef.current) {
              // Smooth scroll to center the active line
              containerRef.current.scrollTo({
                top: Math.max(0, idealScrollTop),
                behavior: 'smooth'
              });

              // Update last scroll time
              lastScrollTimeRef.current = currentTime;

              console.log(`Scrolled to line ${newActiveLine} at position ${idealScrollTop}`);
            }
          });
        }
      }
    }
  }, [currentTime, processedLyrics, activeLine]);

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

    // Assign each chord to a word
    sortedChords.forEach(chord => {
      const wordIndex = findWordAtPosition(chord.position, words);
      if (wordIndex >= 0) {
        if (!chordsByWord[wordIndex]) {
          chordsByWord[wordIndex] = [];
        }
        chordsByWord[wordIndex].push(chord.chord);
      }
    });

    // Create word segments with their associated chords
    const wordSegments: { text: string; chords: string[]; isChineseChar?: boolean }[] = [];

    // Check if this line contains Chinese characters
    const hasChineseChars = containsChineseCharacters(line.text);

    // For Chinese text, we need special handling for character spacing
    if (hasChineseChars) {
      // For Chinese text, treat each character as a separate word for better chord alignment
      for (let i = 0; i < line.text.length; i++) {
        const char = line.text[i];

        // Skip spaces
        if (char === ' ') {
          wordSegments.push({
            text: ' ',
            chords: []
          });
          continue;
        }

        // Find chords that align with this character position
        const charChords: string[] = [];
        sortedChords.forEach(chord => {
          if (chord.position === i) {
            charChords.push(chord.chord);
          }
        });

        // Add the character as a segment
        wordSegments.push({
          text: char,
          chords: charChords,
          isChineseChar: containsChineseCharacters(char)
        });

        // Add a small space after each Chinese character (except the last one)
        if (containsChineseCharacters(char) && i < line.text.length - 1) {
          wordSegments.push({
            text: ' ',
            chords: []
          });
        }
      }
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

    // Get translated texts for this line in all selected languages
    const translatedTexts = selectedLanguages.map(language => ({
      language,
      text: translatedLyrics[language] ? getTranslatedLineText(line.text, language) : ''
    })).filter(item => item.text);

    return (
      <div
        id={`line-${index}`}
        key={index}
        className={`mb-4 ${isActive ? 'active bg-blue-50 p-2 rounded-lg -mx-1 border-l-3 border-blue-400' : ''} ${isPast ? 'past' : ''}`}
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
                marginRight: segment.isChineseChar ? '0' : '1px',
                letterSpacing: segment.isChineseChar ? '0.05em' : 'normal'
              }}
            >
              {segment.chords.length > 0 && (
                <div
                  className={getResponsiveChordFontSize(segment.chords[0])}
                  style={{
                    ...getChordLabelStyles(segment.chords[0]),
                    marginBottom: '2px',
                    minHeight: 'auto',
                    fontSize: `${fontSize * 0.9}px`,
                    color: textColors.chord,
                    fontWeight: 600,
                    display: 'inline-block',
                    position: 'relative',
                    width: 'auto'
                  }}
                >
                  {segment.chords.map(chord =>
                    <span
                      key={chord}
                      className="inline-block mx-0.5"
                      dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(chord) }}
                    ></span>
                  ).reduce((prev, curr, i) =>
                    i === 0 ? [curr] : [...prev, <span key={`space-${i}`}> </span>, curr], [] as React.ReactNode[]
                  )}
                  {/* Add a darker underline bar that's limited to the chord width */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '-2px',
                      left: '0',
                      right: '0',
                      height: '2px',
                      backgroundColor: '#94a3b8', // Darker gray for better visibility
                      borderRadius: '1px'
                    }}
                  ></div>
                </div>
              )}

              {/* Render text with character-by-character animation for active lines */}
              <div
                style={{ fontSize: `${fontSize}px` }}
                className={segment.chords.length > 0 ? "pt-1 font-medium" : ""}
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

                        // Simple word boundary detection (split by spaces)
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

                        // Process each character with awareness of word boundaries
                        return segment.text.split('').map((char, charIndex) => {
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
          <div className="mt-2 pt-2 border-t border-gray-200">
            {translatedTexts.map((translation, i) => (
              <div key={i} className="mb-1">
                <div
                  className="text-gray-600 italic mt-0.5"
                  style={{ fontSize: `${fontSize * 0.85}px` }}
                >
                  {translation.text}
                </div>
              </div>
            ))}
          </div>
        )}
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
      <div className="controls mb-3 flex items-center justify-between bg-gray-50 p-2 rounded-md">
        <div className="flex items-center space-x-3">
          {/* Font size control - YouTube-style slider with blue theme */}
          <div className="flex items-center">
            <span className="text-sm mr-2">Font:</span>
            <div className="w-24 relative h-2 bg-gray-200 rounded-full overflow-hidden mr-1">
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
            <span className="text-sm">{fontSize}px</span>
          </div>

          {/* Translation dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
              disabled={isTranslating || !processedLyrics?.lines?.length}
              className={`px-3 py-1 rounded text-sm font-medium flex items-center ${
                isTranslating
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
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
                  Translate Lyrics
                  <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </>
              )}
            </button>

            {/* Language selection dropdown */}
            {isLanguageMenuOpen && !isTranslating && (
              <div className="absolute z-10 mt-1 w-48 bg-white rounded-md shadow-lg py-1 text-sm">
                {availableLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className="px-4 py-2 hover:bg-gray-100 flex items-center cursor-pointer"
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
                      {selectedLanguages.includes(lang.code) && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Display chord count if available */}
        {chords && chords.length > 0 && (
          <div className="text-sm text-gray-600">
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
        {processedLyrics.lines.map((line, index) => renderLine(line, index))}
      </div>
    </div>
  );
};

export default LeadSheetDisplay;
