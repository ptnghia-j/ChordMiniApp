import { useMemo } from 'react';
import { enhanceLyricsWithCharacterTiming, EnhancedLyricLine } from '@/utils/lyricsTimingUtils';
import { SegmentationResult, SongSegment } from '@/types/chatbotTypes';
import { normalizeChordForDedup } from '@/utils/chordNormalization';
import { isInstrumentalLikeSegment } from '@/utils/segmentationSections';
import type { LyricWordTiming } from '@/types/musicAiTypes';

// Types: beat-aligned chord events
export interface BeatAlignedChordEvent {
  time: number;
  chord: string;
}

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

const WORD_REGEX = /\S+/g;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const findWordMatches = (text: string): Array<Pick<LyricWordTiming, 'text' | 'startChar' | 'endChar'>> => {
  const matches: Array<Pick<LyricWordTiming, 'text' | 'startChar' | 'endChar'>> = [];
  let match: RegExpExecArray | null;

  WORD_REGEX.lastIndex = 0;

  while ((match = WORD_REGEX.exec(text)) !== null) {
    matches.push({
      text: match[0],
      startChar: match.index,
      endChar: match.index + match[0].length - 1,
    });
  }

  return matches;
};

const estimateWordTimings = (line: LyricLine): LyricWordTiming[] => {
  const matches = findWordMatches(line.text);
  if (matches.length === 0) return [];

  let currentTime = line.startTime;
  let remainingWeight = matches.reduce((sum, match) => sum + Math.max(1, match.text.length), 0);

  return matches.map((match, index) => {
    const weight = Math.max(1, match.text.length);
    const isLastWord = index === matches.length - 1;
    const remainingDuration = Math.max(line.endTime - currentTime, 0);
    const duration = isLastWord || remainingWeight <= 0
      ? remainingDuration
      : remainingDuration * (weight / remainingWeight);
    const endTime = isLastWord ? line.endTime : Math.min(line.endTime, currentTime + duration);
    const wordTiming: LyricWordTiming = {
      text: match.text,
      startTime: currentTime,
      endTime,
      startChar: match.startChar,
      endChar: match.endChar,
    };

    currentTime = endTime;
    remainingWeight -= weight;
    return wordTiming;
  });
};

const getWordTimingsForLine = (line: LyricLine): LyricWordTiming[] => {
  if (!line.text) return [];

  const lineLength = line.text.length;
  if (line.wordTimings?.length) {
    const sanitized = line.wordTimings
      .filter((wordTiming) => Number.isFinite(wordTiming.startTime) && Number.isFinite(wordTiming.endTime))
      .map((wordTiming) => {
        const startChar = clamp(wordTiming.startChar, 0, Math.max(lineLength - 1, 0));
        const endChar = clamp(wordTiming.endChar, startChar, Math.max(lineLength - 1, 0));

        return {
          text: wordTiming.text,
          startTime: clamp(wordTiming.startTime, line.startTime, line.endTime),
          endTime: clamp(wordTiming.endTime, line.startTime, line.endTime),
          startChar,
          endChar,
        };
      })
      .filter((wordTiming) => wordTiming.text.trim().length > 0)
      .sort((a, b) => a.startTime - b.startTime || a.startChar - b.startChar);

    if (sanitized.length > 0) {
      return sanitized.map((wordTiming, index) => {
        const startTime = index > 0 ? Math.max(wordTiming.startTime, sanitized[index - 1].endTime) : wordTiming.startTime;
        const endTime = Math.max(startTime, wordTiming.endTime);
        return {
          ...wordTiming,
          startTime,
          endTime,
        };
      });
    }
  }

  return estimateWordTimings(line);
};

const getChordPositionForLine = (
  line: LyricLine,
  chordTime: number,
  wordTimings: LyricWordTiming[]
): number => {
  if (line.text.length === 0) return 0;

  if (wordTimings.length === 0) {
    const relativePosition = clamp(
      (chordTime - line.startTime) / Math.max(line.endTime - line.startTime, 0.001),
      0,
      1
    );
    return clamp(Math.floor(relativePosition * Math.max(line.text.length - 1, 0)), 0, Math.max(line.text.length - 1, 0));
  }

  const targetWord = wordTimings.reduce<LyricWordTiming>((closest, candidate) => {
    const closestDistance = chordTime < closest.startTime
      ? closest.startTime - chordTime
      : chordTime > closest.endTime
        ? chordTime - closest.endTime
        : 0;
    const candidateDistance = chordTime < candidate.startTime
      ? candidate.startTime - chordTime
      : chordTime > candidate.endTime
        ? chordTime - candidate.endTime
        : 0;

    return candidateDistance < closestDistance ? candidate : closest;
  }, wordTimings[0]);

  const wordDuration = Math.max(targetWord.endTime - targetWord.startTime, 0.001);
  const withinWordProgress = clamp((chordTime - targetWord.startTime) / wordDuration, 0, 1);
  const wordCharSpan = Math.max(targetWord.endChar - targetWord.startChar, 0);

  return clamp(
    targetWord.startChar + Math.round(wordCharSpan * withinWordProgress),
    targetWord.startChar,
    targetWord.endChar
  );
};

// Utility functions
/**
 * Deduplicate consecutive identical chords - only show chords on changes
 */
const deduplicateChords = (chords: BeatAlignedChordEvent[]): BeatAlignedChordEvent[] => {
  if (chords.length === 0) return [];

  const deduplicated: BeatAlignedChordEvent[] = [chords[0]]; // Always include the first chord

  for (let i = 1; i < chords.length; i++) {
    const currentChord = chords[i];
    const previousChord = chords[i - 1];

    // Only add chord if its normalized display form differs from the previous one
    if (normalizeChordForDedup(currentChord.chord) !== normalizeChordForDedup(previousChord.chord)) {
      deduplicated.push(currentChord);
    }
  }

  return deduplicated;
};

/**
 * Create instrumental placeholders for sections without lyrics
 */
const createInstrumentalPlaceholder = (segment: SongSegment, chords: BeatAlignedChordEvent[]) => {
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
 * Create chord-only sections for chords that don't fall within lyrics or instrumental sections
 * Optimizes sections with minimal unique chords by condensing them
 */
const createChordOnlySection = (chords: BeatAlignedChordEvent[], isCondensed: boolean = false) => {
  // Deduplicate chords to only show chord changes
  const deduplicatedChords = deduplicateChords(chords as BeatAlignedChordEvent[]);

  const startTime = chords[0].time;
  // Use a small safety buffer to avoid overlapping into the next lyric line
  const endTime = chords[chords.length - 1].time + 0.5; // 0.5s buffer after last uncovered chord

  // Generate ♪ symbols as display text, one per chord change, with spacing.
  // Each ♪ is positioned to align with its corresponding chord label above.
  const displayText = deduplicatedChords.map(() => '♪').join('  ');

  return {
    startTime,
    endTime,
    text: displayText,
    chords: deduplicatedChords.map((chord, idx) => ({
      position: idx * 3, // Each '♪' + '  ' = 3 chars, matching the joined text positions
      chord: chord.chord,
      time: chord.time
    })),
    isChordOnly: true,
    isCondensed,
    duration: endTime - startTime
  };
};

// Hook interface
interface UseProcessedLyricsProps {
  lyrics: SynchronizedLyrics;
  // Beat-aligned chord events (same timeline as synchronizedChords)
  beatAlignedChords: BeatAlignedChordEvent[];
  segmentationData: SegmentationResult | null;
  // Optional filter to keep only downbeat chord changes
  downbeatsOnly?: boolean;
  // Optional downbeat times to support the filter (seconds)
  downbeatTimes?: number[];
}

export type ProcessedLyricLine = EnhancedLyricLine & {
  isInstrumental?: boolean;
  isChordOnly?: boolean;
  sectionLabel?: string;
  duration?: number;
  isCondensed?: boolean;
};

/**
 * Custom hook for processing lyrics with chords and segmentation data
 * Extracted from LeadSheetDisplay component for better maintainability
 */
export const useProcessedLyrics = ({
  lyrics,
  beatAlignedChords,
  segmentationData,
  downbeatsOnly = false,
  downbeatTimes = []
}: UseProcessedLyricsProps): ProcessedLyricLine[] => {
  // Memoize chords array to prevent unnecessary re-renders
  const memoizedChords = useMemo(() => {
    if (!beatAlignedChords || beatAlignedChords.length === 0) return [] as BeatAlignedChordEvent[];
    if (downbeatsOnly && downbeatTimes.length) {
      // Lightweight inline matcher (avoid circular import)
      const isNear = (t: number) => downbeatTimes.some((db) => Math.abs(db - t) <= 0.12);
      return beatAlignedChords.filter((c) => isNear(c.time));
    }
    return beatAlignedChords;
  }, [beatAlignedChords, downbeatsOnly, downbeatTimes]);

  // FIXED: Combined processing with useMemo to prevent infinite loops
  const processedAndMergedLyrics = useMemo(() => {
    // Return early if there are no lyrics to process
    if (!lyrics?.lines?.length) {
      return [];
    }

    // 1. Integrate Chords with Lyrics
    let lyricsWithChords: SynchronizedLyrics;

    if (!memoizedChords || memoizedChords.length === 0) {
      // If no chord data is provided, use the lyrics as is
      lyricsWithChords = {
        lines: lyrics.lines.map(line => ({
          startTime: line.startTime,
          endTime: line.endTime,
          text: line.text,
          chords: line.chords ? [...line.chords] : [],
          wordTimings: line.wordTimings ? line.wordTimings.map((wordTiming) => ({ ...wordTiming })) : undefined,
        })),
        error: lyrics.error
      };
    } else {
      // PERFORMANCE OPTIMIZATION: Efficient cloning instead of JSON.parse(JSON.stringify())
      lyricsWithChords = {
        lines: lyrics.lines.map(line => ({
          startTime: line.startTime,
          endTime: line.endTime,
          text: line.text,
          chords: line.chords ? line.chords.map(chord => ({
            position: chord.position,
            chord: chord.chord,
            time: chord.time
          })) : [],
          wordTimings: line.wordTimings ? line.wordTimings.map((wordTiming) => ({ ...wordTiming })) : undefined,
        })),
        error: lyrics.error
      };

      // Map chords to lyrics lines and words.
      // Track the last displayed chord across lines to prevent cross-line duplicates
      // (e.g., last chord of line N re-appearing as first chord of line N+1).
      // Uses normalized display form so visually identical chords are caught.
      let lastGlobalNormalized = '';
      lyricsWithChords.lines.forEach((line, lineIndex) => {
        // Inclusive boundaries [startTime, endTime]: every chord within the range is
        // assigned to this line. Cross-line deduplication (below) prevents the same
        // chord from appearing on both the ending and starting lines when boundaries
        // coincide. This avoids the gap caused by half-open intervals where a chord
        // at exactly endTime would be lost from both adjacent lines.
        const lineChords = memoizedChords.filter(chord =>
          chord.time >= line.startTime && chord.time <= line.endTime
        );

        // Cross-line deduplication: skip chords matching the last displayed chord (by visual form)
        const deduplicatedLineChords: BeatAlignedChordEvent[] = [];
        for (const chord of lineChords) {
          const normalized = normalizeChordForDedup(chord.chord);
          if (normalized !== lastGlobalNormalized) {
            deduplicatedLineChords.push(chord);
            lastGlobalNormalized = normalized;
          }
        }

        const wordTimings = getWordTimingsForLine(line);

        // Create chord markers for each chord
        const chordMarkers: ChordMarker[] = deduplicatedLineChords.map(chord => {
          return {
            time: chord.time,
            chord: chord.chord,
            position: getChordPositionForLine(line, chord.time, wordTimings)
          };
        });

        // Position-sorted dedup: remove consecutive same chord labels
        // by display position. This catches cases where non-consecutive
        // time-order duplicates (e.g. B→A→B where A maps to a gap) end
        // up on adjacent word positions after the mapping above.
        const sortedMarkers = [...chordMarkers].sort((a, b) => a.position - b.position);
        const dedupedMarkers: ChordMarker[] = [];
        let prevPosNorm = '';
        for (const m of sortedMarkers) {
          const norm = normalizeChordForDedup(m.chord);
          if (norm !== prevPosNorm) {
            dedupedMarkers.push(m);
            prevPosNorm = norm;
          }
        }

        // Add chord markers to the line
        lyricsWithChords.lines[lineIndex].chords = dedupedMarkers;
      });
    }

    // 2. Enhance with character timing
    const enhancedLyrics = enhanceLyricsWithCharacterTiming(lyricsWithChords);

    // 3. Merge with instrumental and chord-only sections
    const allItems: ProcessedLyricLine[] = [...enhancedLyrics.lines];

    // Add instrumental placeholders for sections without lyrics
    if (segmentationData?.segments) {
      const instrumentalSections = segmentationData.segments.filter(isInstrumentalLikeSegment);

      instrumentalSections.forEach(segment => {
        // Check if there are already lyrics in this time range
        const hasLyricsInRange = enhancedLyrics.lines.some(line =>
          (line.startTime >= segment.startTime && line.startTime <= segment.endTime) ||
          (line.endTime >= segment.startTime && line.endTime <= segment.endTime) ||
          (line.startTime <= segment.startTime && line.endTime >= segment.endTime)
        );

        // Only add instrumental placeholder if no lyrics exist in this range
        if (!hasLyricsInRange) {
          const placeholder = createInstrumentalPlaceholder(segment, memoizedChords);
          allItems.push(placeholder as ProcessedLyricLine);
        }
      });
    }

    // Add chord-only sections for chords that don't fall within any lyrics or instrumental sections
    const sortedItems = [...allItems].sort((a, b) => a.startTime - b.startTime);
    const chordsToAdd: BeatAlignedChordEvent[] = [];

    memoizedChords.forEach(chord => {
      // Check if this chord falls within any existing item (lyrics or instrumental)
      const isChordCovered = sortedItems.some(item =>
        chord.time >= item.startTime && chord.time <= item.endTime
      );

      if (!isChordCovered) {
        chordsToAdd.push(chord);
      }
    });

    // Group consecutive uncovered chords into condensed sections
    if (chordsToAdd.length > 0) {
      let currentGroup: BeatAlignedChordEvent[] = [];
      let lastChordTime = -1;
      const chordGapThreshold = 8;

      chordsToAdd.forEach((chord, index) => {
        if (lastChordTime === -1 || chord.time - lastChordTime <= chordGapThreshold) {
          currentGroup.push(chord);
        } else {
          // Create a chord-only section for the previous group
          if (currentGroup.length > 0) {
            const chordOnlySection = createChordOnlySection(currentGroup, true);
            allItems.push(chordOnlySection as ProcessedLyricLine);
          }
          currentGroup = [chord];
        }
        lastChordTime = chord.time;

        // Handle the last group
        if (index === chordsToAdd.length - 1 && currentGroup.length > 0) {
          const chordOnlySection = createChordOnlySection(currentGroup, true);
          allItems.push(chordOnlySection as ProcessedLyricLine);
        }
      });
    }

    // 4. Sort and then clip overlaps so placeholders can't swallow lyric lines
    const sorted = allItems.sort((a, b) => a.startTime - b.startTime);

    const minGap = 0.05; // 50ms guard gap
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur: ProcessedLyricLine = sorted[i];
      const next: ProcessedLyricLine = sorted[i + 1];

      if (cur.endTime > next.startTime - minGap) {
        // Prefer keeping the lyric line intact when overlapping with chord-only placeholder
        const preferNext = !!(!next.isChordOnly && !next.isInstrumental);
        const preferCur = !!(!cur.isChordOnly && !cur.isInstrumental);

        if (!preferCur && preferNext) {
          // Current is placeholder overlapping into a lyric line: clamp current endTime
          cur.endTime = Math.max(cur.startTime, next.startTime - minGap);
          if (typeof cur.duration === 'number') cur.duration = Math.max(0, cur.endTime - cur.startTime);
        } else {
          // Otherwise clamp to avoid any overlap
          cur.endTime = Math.max(cur.startTime, Math.min(cur.endTime, next.startTime - minGap));
          if (typeof cur.duration === 'number') cur.duration = Math.max(0, cur.endTime - cur.startTime);
        }
      }
    }

    // Drop zero-duration placeholders
    const cleaned = sorted.filter(item => (item.endTime - item.startTime) > 0);

    return cleaned;
  }, [lyrics, memoizedChords, segmentationData]);

  return processedAndMergedLyrics;
};
