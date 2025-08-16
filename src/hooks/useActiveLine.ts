import { useState, useEffect, useRef, useCallback } from 'react';

// Types
interface ChordData {
  time: number;
  chord: string;
}

interface ProcessedLyricLine {
  startTime: number;
  endTime: number;
  text: string;
  chords?: Array<{
    position: number;
    chord: string;
    time: number;
  }>;
  isInstrumental?: boolean;
  isChordOnly?: boolean;
  sectionLabel?: string;
  duration?: number;
  isCondensed?: boolean;
}

// Hook interface
interface UseActiveLineProps {
  processedLines: ProcessedLyricLine[];
  currentTime: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  chords: ChordData[];
}

interface UseActiveLineReturn {
  activeLine: number;
  lineProgress: number;
}

/**
 * Custom hook for managing active line calculation and auto-scroll
 * Extracted from LeadSheetDisplay component for better maintainability
 */
export const useActiveLine = ({
  processedLines,
  currentTime,
  containerRef,
  chords
}: UseActiveLineProps): UseActiveLineReturn => {
  // State to track the currently active line
  const [activeLine, setActiveLine] = useState<number>(-1);

  // Track the last scroll time to prevent too frequent scrolling
  const lastScrollTimeRef = useRef<number>(0);

  // Track the progress within the current line
  const lineProgressRef = useRef<number>(0);

  // Track throttle timing for auto-scroll
  const lastThrottleTimeRef = useRef<number>(0);

  // PERFORMANCE OPTIMIZATION: Memoized active line calculation logic
  // This prevents recreation of the calculation function on every render
  const calculateActiveLine = useCallback((currentTime: number) => {
    if (!processedLines || processedLines.length === 0) {
      return { activeLine: -1, shouldShowLyrics: false, syncedTime: currentTime };
    }

    // Simple approach: Use chord timing to determine when lyrics should start
    let syncedTime = currentTime;
    let shouldShowLyrics = true;

    // If we have chord data, find the first non-"N" chord to determine music start time
    if (chords && chords.length > 0) {
      // Find the first actual chord (not "N" which represents no chord/silence)
      const firstActualChord = chords.find(chord =>
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
  }, [processedLines, chords]);

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

            // Calculate the ideal position - improved centering logic
            // Account for tab labels and controls at the top
            let idealScrollTop: number;
            if (newActiveLine <= 1) {
              // Show first lyrics near the top with padding for controls
              idealScrollTop = Math.max(0, lineTop - 20);
            } else {
              // Center lyrics in the visible area, accounting for top controls
              const effectiveContainerHeight = containerHeight - 20; // Account for top controls
              idealScrollTop = lineTop - (effectiveContainerHeight / 2) + (lineHeight / 2) - 10;
            }

            // Calculate buffer space in terms of lines
            const avgLineHeight = lineHeight + 8;
            const linesVisible = Math.floor(containerHeight / avgLineHeight);
            const bufferLines = Math.max(2, Math.floor(linesVisible / 4));
            const bufferSize = bufferLines * avgLineHeight;

            // Check if the line is already properly positioned
            let targetPosition: number;
            if (newActiveLine <= 1) {
              targetPosition = containerScrollTop + 20;
            } else {
              const effectiveContainerHeight = containerHeight - 20;
              targetPosition = containerScrollTop + (effectiveContainerHeight / 2) + 10;
            }
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
  }, [activeLine, containerRef]);

  // Find the active line based on synchronized playback time
  useEffect(() => {
    const result = calculateActiveLine(currentTime);

    if (!result.shouldShowLyrics) {
      setActiveLine(-1);
      return;
    }

    // Use processedLines for proper synchronization
    // This ensures that instrumental placeholders and chord-only sections are included in timing calculations
    const allLines = processedLines;

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
  }, [currentTime, processedLines, activeLine, chords, calculateActiveLine, throttledAutoScroll]);

  return {
    activeLine,
    lineProgress: lineProgressRef.current
  };
};
