import React, { useMemo } from 'react';
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

interface WordSegment {
  text: string;
  chords: string[];
  isChineseChar?: boolean;
  startPos: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface CharacterTiming {
  startTime: number;
  endTime: number;
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

export function parseHexColor(color: string): RgbColor | null {
  const normalized = color.trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return null;

  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  };
}

export function interpolateRgbColor(
  from: RgbColor | null,
  to: RgbColor | null,
  progress: number,
  fallback: string,
): string {
  if (!from || !to) return fallback;

  const safeProgress = Math.max(0, Math.min(1, progress));
  const r = Math.round(from.r + (to.r - from.r) * safeProgress);
  const g = Math.round(from.g + (to.g - from.g) * safeProgress);
  const b = Math.round(from.b + (to.b - from.b) * safeProgress);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getLyricColorChangePosition({
  currentTime,
  lineStartTime,
  lineEndTime,
  textLength,
  characterTimings,
}: {
  currentTime: number;
  lineStartTime: number;
  lineEndTime: number;
  textLength: number;
  characterTimings?: CharacterTiming[];
}): { colorChangePosition: number; lineProgress: number } {
  const duration = lineEndTime - lineStartTime;
  const lineProgress = duration > 0
    ? Math.max(0, Math.min(1, (currentTime - lineStartTime) / duration))
    : 0;

  if (characterTimings?.length) {
    const activeCharIndex = characterTimings.findIndex(
      (charTiming) => currentTime >= charTiming.startTime && currentTime <= charTiming.endTime,
    );

    if (activeCharIndex >= 0) {
      return { colorChangePosition: activeCharIndex, lineProgress };
    }
  }

  return {
    colorChangePosition: Math.floor(lineProgress * textLength),
    lineProgress,
  };
}

export function getSegmentWordRanges(segmentText: string): { start: number; end: number; text: string }[] {
  if (segmentText.trim().length > 0 && !segmentText.includes(' ')) {
    return [{
      start: 0,
      end: segmentText.length - 1,
      text: segmentText,
    }];
  }

  const segmentWords: { start: number; end: number; text: string }[] = [];
  let wordStart = 0;

  for (let index = 0; index < segmentText.length; index += 1) {
    if (segmentText[index] === ' ' || index === segmentText.length - 1) {
      const end = index === segmentText.length - 1 ? index : index - 1;
      if (end >= wordStart) {
        segmentWords.push({
          start: wordStart,
          end,
          text: segmentText.substring(wordStart, end + 1),
        });
      }
      wordStart = index + 1;
    }
  }

  return segmentWords;
}

/**
 * LyricLine component - extracted from LeadSheetDisplay
 * Handles rendering of individual lyric lines with complex character-by-character animation
 */
const LyricLineComponent: React.FC<LyricLineProps> = ({
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
  accidentalPreference
}) => {
  // Check if this is an instrumental placeholder or chord-only section
  const isInstrumental = line.isInstrumental;
  const isChordOnly = line.isChordOnly;
  const isCondensed = line.isCondensed;

  const wordSegments = useMemo(() => {
    const words = findWordBoundaries(line.text);
    const chordsByWord: { [wordIndex: number]: string[] } = {};
    const sortedChords = [...(line.chords || [])].sort((a, b) => {
      const posA = a.position !== undefined ? a.position : 0;
      const posB = b.position !== undefined ? b.position : 0;
      return posA - posB;
    });

    const lineDeduplicatedChords: { chord: string; position: number; time: number }[] = [];
    let lastNormalizedInLine = '';
    sortedChords.forEach(chord => {
      const normalized = normalizeChordForDedup(chord.chord);
      if (normalized !== lastNormalizedInLine) {
        lineDeduplicatedChords.push(chord);
        lastNormalizedInLine = normalized;
      }
    });

    let lastAssignedNormalized = '';
    lineDeduplicatedChords.forEach(chord => {
      let wordIndex = findWordAtPosition(chord.position, words);
      if (wordIndex < 0 && words.length > 0) {
        wordIndex = findNearestWord(chord.position, words);
      }
      if (wordIndex >= 0) {
        if (!chordsByWord[wordIndex]) {
          chordsByWord[wordIndex] = [];
        }
        const normalized = normalizeChordForDedup(chord.chord);
        if (normalized === lastAssignedNormalized) return;
        if (chordsByWord[wordIndex].some(c => normalizeChordForDedup(c) === normalized)) return;
        chordsByWord[wordIndex].push(chord.chord);
        lastAssignedNormalized = normalized;
      }
    });

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

    const rawWordSegments: Array<Omit<WordSegment, 'startPos'>> = [];

    if (isChordOnly && isCondensed) {
      const allChords = (line.chords || []).map(c => normalizeChordForDedup(c.chord));
      allChords.forEach((chord, idx) => {
        if (idx > 0) {
          rawWordSegments.push({ text: '  ', chords: [] });
        }
        rawWordSegments.push({
          text: '♪',
          chords: [chord]
        });
      });
    } else {
      const hasChineseChars = containsChineseCharacters(line.text);

      if (hasChineseChars) {
        const chineseWords = line.text.split(' ').filter(word => word.length > 0);
        let searchStartIndex = 0;

        chineseWords.forEach((word, wordIndex) => {
          const wordChords: string[] = [];
          const wordStartPos = line.text.indexOf(word, searchStartIndex);
          const wordEndPos = wordStartPos + word.length - 1;

          sortedChords.forEach(chord => {
            if (chord.position >= wordStartPos && chord.position <= wordEndPos) {
              wordChords.push(chord.chord);
            }
          });

          rawWordSegments.push({
            text: word,
            chords: wordChords,
            isChineseChar: containsChineseCharacters(word)
          });

          if (wordIndex < chineseWords.length - 1) {
            rawWordSegments.push({
              text: ' ',
              chords: []
            });
          }

          searchStartIndex = wordEndPos + 1;
        });
      } else {
        const maxChordsPerWord = 2;
        let lastIndex = 0;
        words.forEach((word, wordIndex) => {
          const wordChords = chordsByWord[wordIndex] || [];
          const displayChords = wordChords.slice(0, maxChordsPerWord);
          const excessChords = wordChords.slice(maxChordsPerWord);

          if (word.start > lastIndex) {
            if (excessChords.length > 0) {
              rawWordSegments.push({ text: '♪ ', chords: excessChords });
            } else {
              rawWordSegments.push({
                text: line.text.substring(lastIndex, word.start),
                chords: []
              });
            }
          } else if (excessChords.length > 0) {
            rawWordSegments.push({ text: '♪ ', chords: excessChords });
          }

          rawWordSegments.push({
            text: line.text.substring(word.start, word.end + 1),
            chords: displayChords
          });

          lastIndex = word.end + 1;
        });

        if (lastIndex < line.text.length) {
          rawWordSegments.push({
            text: line.text.substring(lastIndex),
            chords: []
          });
        }
      }
    }

    let startPos = 0;
    const wordSegments = rawWordSegments.map((segment) => {
      const segmentWithStart = {
        ...segment,
        startPos,
      };
      startPos += segment.text.length;
      return segmentWithStart;
    });

    return wordSegments;
  }, [line.text, line.chords, isChordOnly, isCondensed]);

  const translatedLineIndex = useMemo(() => (
    processedLines.findIndex((processedLine) => (
      processedLine.text === line.text
      && processedLine.startTime === line.startTime
      && processedLine.endTime === line.endTime
    ))
  ), [processedLines, line.text, line.startTime, line.endTime]);

  const translatedTexts = useMemo(() => (
    selectedLanguages
      .map((language) => {
        const translatedText = translatedLineIndex >= 0 && translatedLyrics[language]?.translatedLyrics
          ? translatedLyrics[language].translatedLyrics.split('\n')[translatedLineIndex] || ''
          : '';

        return {
          language,
          text: translatedText,
        };
      })
      .filter(item => item.text)
  ), [selectedLanguages, translatedLyrics, translatedLineIndex]);

  const { sectionLabel, isFirstLineOfSection } = useMemo(() => {
    const sectionLabel = getSectionLabel(line.startTime, segmentationData);
    return {
      sectionLabel,
      isFirstLineOfSection: index === 0 || getSectionLabel(processedLines[index - 1]?.startTime, segmentationData) !== sectionLabel,
    };
  }, [index, line.startTime, processedLines, segmentationData]);

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
                  // For active lines, render with dynamic gradient sweep
                  (() => {
                    const totalLineLength = line.text.length;
                    const { colorChangePosition, lineProgress } = getLyricColorChangePosition({
                      currentTime,
                      lineStartTime: line.startTime,
                      lineEndTime: line.endTime,
                      textLength: totalLineLength,
                      characterTimings: line.characterTimings,
                    });

                    const segmentStartPos = segment.startPos;
                    const segmentEndPos = segmentStartPos + segment.text.length - 1;

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
                      // Segment contains the color change. Calculate progress.
                      let charProgress = 0;
                      if (line.characterTimings && line.characterTimings.length > colorChangePosition) {
                        const charTiming = line.characterTimings[colorChangePosition];
                        const charDuration = charTiming.endTime - charTiming.startTime;
                        if (charDuration > 0) {
                          charProgress = Math.max(0, Math.min(1, (currentTime - charTiming.startTime) / charDuration));
                        } else {
                          charProgress = ((lineProgress * totalLineLength) % 1);
                        }
                      } else {
                        charProgress = ((lineProgress * totalLineLength) % 1);
                      }

                      const progressInSegment = (colorChangePosition + charProgress) - segmentStartPos;
                      const segmentProgressPercent = Math.max(0, Math.min(1, progressInSegment / segment.text.length)) * 100;

                      const gradientStyle: React.CSSProperties = {
                        backgroundImage: `linear-gradient(to right, ${textColors.played} 0%, ${textColors.played} ${segmentProgressPercent}%, ${textColors.unplayed} ${segmentProgressPercent}%, ${textColors.unplayed} 100%)`,
                        backgroundSize: '100% 100%',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      };

                      return (
                        <span style={gradientStyle}>
                          {segment.text}
                        </span>
                      );
                    }
                  })()
                ) : (
                  // For non-active lines, use native CSS transitions to prevent Framer Motion overhead
                  <span
                    className="transition-colors duration-500 ease-out"
                    style={{ color: isPast ? textColors.played : textColors.unplayed }}
                  >
                    {segment.text}
                  </span>
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

const areSelectedLanguagesEqual = (prev: string[], next: string[]): boolean => (
  prev.length === next.length && prev.every((language, index) => language === next[index])
);

const areTextColorsEqual = (prev: TextColors, next: TextColors): boolean => (
  prev.unplayed === next.unplayed
  && prev.played === next.played
  && prev.chord === next.chord
  && prev.background === next.background
);

const areLyricLinePropsEqual = (prevProps: LyricLineProps, nextProps: LyricLineProps): boolean => {
  if (prevProps.line !== nextProps.line) return false;
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.isPast !== nextProps.isPast) return false;
  if ((prevProps.isActive || nextProps.isActive) && prevProps.currentTime !== nextProps.currentTime) return false;
  if (prevProps.fontSize !== nextProps.fontSize) return false;
  if (prevProps.darkMode !== nextProps.darkMode) return false;
  if (prevProps.accidentalPreference !== nextProps.accidentalPreference) return false;
  if (!areTextColorsEqual(prevProps.textColors, nextProps.textColors)) return false;
  if (!areSelectedLanguagesEqual(prevProps.selectedLanguages, nextProps.selectedLanguages)) return false;
  if (prevProps.translatedLyrics !== nextProps.translatedLyrics) return false;
  if (prevProps.processedLines !== nextProps.processedLines) return false;
  if (prevProps.segmentationData !== nextProps.segmentationData) return false;
  return true;
};

export const LyricLine = React.memo(LyricLineComponent, areLyricLinePropsEqual);
LyricLine.displayName = 'LyricLine';

export default LyricLine;
