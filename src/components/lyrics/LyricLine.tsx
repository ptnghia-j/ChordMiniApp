import React from 'react';
import { motion } from 'framer-motion';
import {
  formatChordWithMusicalSymbols,
  getResponsiveChordFontSize,
  getChordLabelStyles
} from '@/utils/chordFormatting';
import { normalizeChordForDedup } from '@/utils/chordNormalization';
import { EnhancedLyricLine } from '@/utils/lyricsTimingUtils';
import { SegmentationResult } from '@/types/chatbotTypes';

// Types

interface TextColors {
  unplayed: string;
  played: string;
  chord: string;
  background: string;
}

interface TranslatedLyrics {
  translatedLyrics: string;
  fromCache: boolean;
  backgroundUpdateInProgress?: boolean;
}

interface LyricLineProps {
  line: EnhancedLyricLine & {
    isInstrumental?: boolean;
    isChordOnly?: boolean;
    isCondensed?: boolean;
  };
  index: number;
  isActive: boolean;
  isPast: boolean;
  currentTime: number;
  fontSize: number;
  textColors: TextColors;
  darkMode: boolean;
  selectedLanguages: string[];
  translatedLyrics: { [language: string]: TranslatedLyrics };
  processedLines: (EnhancedLyricLine & {
    isInstrumental?: boolean;
    isChordOnly?: boolean;
    isCondensed?: boolean;
  })[];
  segmentationData?: SegmentationResult | null;
  memoizedCharacterArrays: {
    getCharArray: (text: string) => string[];
    clear: () => void;
  };
  accidentalPreference?: 'sharp' | 'flat'; // Enharmonic spelling preference for chord labels
}

/**
 * Utility function to detect if text contains Chinese characters
 */
const containsChineseCharacters = (text: string): boolean => {
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]/;
  return chineseRegex.test(text);
};

/**
 * Find word boundaries in a string
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
  return -1;
};

/**
 * Find the nearest word to a given character position (for gap/space positions).
 * Prefers the word whose start is closest, biasing toward the next word
 * (musically, chord changes usually land at word onsets).
 */
const findNearestWord = (
  position: number,
  words: { start: number; end: number }[]
): number => {
  if (words.length === 0) return -1;
  let minDist = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < words.length; i++) {
    const dist = Math.min(
      Math.abs(position - words[i].start),
      Math.abs(position - words[i].end)
    );
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
};

/**
 * Get section label for a given timestamp
 */
const getSectionLabel = (timestamp: number, segmentationData?: SegmentationResult | null): string | null => {
  if (!segmentationData?.segments) return null;

  const segment = segmentationData.segments.find(seg =>
    timestamp >= seg.startTime && timestamp <= seg.endTime
  );

  return segment ? (segment.label || segment.type || null) : null;
};

/**
 * Get the translated text for a specific line in a specific language
 */
const getTranslatedLineText = (
  originalText: string,
  language: string,
  translatedLyrics: { [language: string]: TranslatedLyrics },
  processedLines: (EnhancedLyricLine & {
    isInstrumental?: boolean;
    isChordOnly?: boolean;
    isCondensed?: boolean;
  })[]
): string => {
  if (!translatedLyrics[language] || !translatedLyrics[language].translatedLyrics) {
    return '';
  }

  // Get all original lines from the current processed lyrics
  const originalLines = processedLines.map((line) => line.text);

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
 * LyricLine component - extracted from LeadSheetDisplay
 * Handles rendering of individual lyric lines with complex character-by-character animation
 */
export const LyricLine: React.FC<LyricLineProps> = ({
  line,
  index,
  isActive,
  isPast,
  currentTime,
  fontSize,
  textColors,
  darkMode,
  selectedLanguages,
  translatedLyrics,
  processedLines,
  segmentationData,
  memoizedCharacterArrays,
  accidentalPreference
}) => {
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
  // Uses normalized display form so chords that render identically (e.g. B:maj and B)
  // are treated as duplicates even if their raw strings differ.
  const lineDeduplicatedChords: { chord: string; position: number; time: number }[] = [];
  let lastNormalizedInLine = '';

  sortedChords.forEach(chord => {
    const normalized = normalizeChordForDedup(chord.chord);
    if (normalized !== lastNormalizedInLine) {
      lineDeduplicatedChords.push(chord);
      lastNormalizedInLine = normalized;
    }
  });

  // Assign each deduplicated chord to a word, with cross-word dedup.
  // Track the last chord shown across ALL words so that "E B" on word 0
  // followed by "B" on word 1 collapses the second "B".
  let lastAssignedNormalized = '';
  lineDeduplicatedChords.forEach(chord => {
    let wordIndex = findWordAtPosition(chord.position, words);
    // If chord falls on a gap between words, assign to nearest word
    if (wordIndex < 0 && words.length > 0) {
      wordIndex = findNearestWord(chord.position, words);
    }
    if (wordIndex >= 0) {
      if (!chordsByWord[wordIndex]) {
        chordsByWord[wordIndex] = [];
      }
      const normalized = normalizeChordForDedup(chord.chord);
      // Skip if this chord visually matches the last chord already assigned
      // (either on this word or on a previous word)
      if (normalized === lastAssignedNormalized) return;
      // Also skip if already on THIS word (by visual form)
      if (chordsByWord[wordIndex].some(c => normalizeChordForDedup(c) === normalized)) return;
      chordsByWord[wordIndex].push(chord.chord);
      lastAssignedNormalized = normalized;
    }
  });

  // Inter-word boundary dedup: if the last chord on word N matches
  // the first chord on word N+1, remove the leading duplicate from N+1.
  const occupiedWords = Object.keys(chordsByWord).map(Number).sort((a, b) => a - b);
  let prevBoundaryChord = '';
  for (const wi of occupiedWords) {
    const wChords = chordsByWord[wi];
    while (wChords.length > 0 && normalizeChordForDedup(wChords[0]) === prevBoundaryChord) {
      wChords.shift();
    }
    if (wChords.length > 0) {
      prevBoundaryChord = normalizeChordForDedup(wChords[wChords.length - 1]);
    }
    if (wChords.length === 0) {
      delete chordsByWord[wi];
    }
  }

  // Check if this is an instrumental placeholder or chord-only section
  const isInstrumental = line.isInstrumental;
  const isChordOnly = line.isChordOnly;
  const isCondensed = line.isCondensed;

  // Create word segments with their associated chords
  const wordSegments: { text: string; chords: string[]; isChineseChar?: boolean }[] = [];

  // SPECIAL HANDLING: For condensed chord-only sections, create separate segments
  // so each chord label is properly spaced above its own ♪ symbol.
  if (isChordOnly && isCondensed) {
    // Use ALL chords in order (preserving repeated progressions like A-B-C-D-A-B-C-D).
    // Previous code used globally-unique filtering which collapsed repeats to just A-B-C-D.
    const allChords = (line.chords || []).map(c =>
      normalizeChordForDedup(c.chord) // strips invisible quality markers (e.g. :maj)
    );

    // Create a separate segment for each chord/♪ pair
    allChords.forEach((chord, idx) => {
      if (idx > 0) {
        // Add spacing between chord/♪ pairs
        wordSegments.push({ text: '  ', chords: [] });
      }
      wordSegments.push({
        text: '♪',
        chords: [chord]
      });
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
      const maxChordsPerWord = 2;
      let lastIndex = 0;
      words.forEach((word, wordIndex) => {
        const wordChords = chordsByWord[wordIndex] || [];
        const displayChords = wordChords.slice(0, maxChordsPerWord);
        const excessChords = wordChords.slice(maxChordsPerWord);

        // Add any space before this word (or ♪ for excess chords)
        if (word.start > lastIndex) {
          if (excessChords.length > 0) {
            // Insert ♪ segment carrying excess chords in the gap before this word
            wordSegments.push({ text: '♪ ', chords: excessChords });
          } else {
            wordSegments.push({
              text: line.text.substring(lastIndex, word.start),
              chords: []
            });
          }
        } else if (excessChords.length > 0) {
          // No space before word but have excess chords - insert ♪ anyway
          wordSegments.push({ text: '♪ ', chords: excessChords });
        }

        // Add the word with its chords (capped at maxChordsPerWord)
        wordSegments.push({
          text: line.text.substring(word.start, word.end + 1),
          chords: displayChords
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
    text: translatedLyrics[language] ? getTranslatedLineText(line.text, language, translatedLyrics, processedLines) : ''
  })).filter(item => item.text);

  // Get section label for this line
  const sectionLabel = getSectionLabel(line.startTime, segmentationData);
  const isFirstLineOfSection = index === 0 || getSectionLabel(processedLines[index - 1]?.startTime, segmentationData) !== sectionLabel;

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
        className={`mb-4 ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${
          isInstrumental ? `${darkMode ? 'bg-yellow-900 bg-opacity-20 border-yellow-600' : 'bg-yellow-50 border-yellow-400'} border-l-3 italic` : ''
        } ${
          isChordOnly ? 'text-center' : ''
        }`}
      >
        <div className="flex flex-wrap">
          {wordSegments.map((segment, i) => (
            <div
              key={i}
              className="relative inline-flex flex-col justify-end"
              style={{
                alignItems: isChordOnly ? 'center' : 'flex-start',
                marginRight: segment.text === ' ' ? '0' : '0px', // No extra margin for spaces
                letterSpacing: 'normal', // Use normal letter spacing for all text
                whiteSpace: 'pre-wrap', // Preserve whitespace
                ...(isChordOnly && segment.chords.length > 0 ? { minWidth: '2.5em' } : {})
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
                      dangerouslySetInnerHTML={{ __html: formatChordWithMusicalSymbols(chord, darkMode, accidentalPreference) }}
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
                  fontSize: `${isChordOnly ? fontSize * 1.15 : fontSize}px`,
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

export default LyricLine;
