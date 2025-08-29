import { useMemo } from 'react';
import { enhanceLyricsWithCharacterTiming, EnhancedLyricLine } from '@/utils/lyricsTimingUtils';
import { SegmentationResult, SongSegment } from '@/types/chatbotTypes';

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
}

interface SynchronizedLyrics {
  lines: LyricLine[];
  error?: string; // Optional error message when lyrics synchronization fails
}

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

    // Only add chord if it's different from the previous one
    if (currentChord.chord !== previousChord.chord) {
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
          chords: line.chords ? [...line.chords] : []
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
          })) : []
        })),
        error: lyrics.error
      };

      // Map chords to lyrics lines and words
      lyricsWithChords.lines.forEach((line, lineIndex) => {
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
        lyricsWithChords.lines[lineIndex].chords = chordMarkers;
      });
    }

    // 2. Enhance with character timing
    const enhancedLyrics = enhanceLyricsWithCharacterTiming(lyricsWithChords);

    // 3. Merge with instrumental and chord-only sections
    const allItems: ProcessedLyricLine[] = [...enhancedLyrics.lines];

    // Add instrumental placeholders for sections without lyrics
    if (segmentationData?.segments) {
      const instrumentalSections = segmentationData.segments.filter(segment => {
        const type = (segment.label || segment.type || '').toLowerCase();
        return type.includes('intro') ||
               type.includes('outro') ||
               type.includes('instrumental') ||
               type.includes('solo') ||
               type.includes('bridge') && !type.includes('vocal');
      });

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
