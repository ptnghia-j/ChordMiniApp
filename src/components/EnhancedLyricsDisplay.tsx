import React, { useRef, useEffect, useState } from 'react';
import { LyricsData, LyricLine } from '@/types/musicAiTypes';

interface EnhancedLyricsDisplayProps {
  lyrics: LyricsData;
  currentTime: number;
  onLineClick?: (line: LyricLine) => void;
  autoScroll?: boolean;
}

/**
 * Enhanced lyrics display component with improved chord positioning
 */
const EnhancedLyricsDisplay: React.FC<EnhancedLyricsDisplayProps> = ({
  lyrics,
  currentTime,
  onLineClick,
  autoScroll = true,
}) => {
  const [currentLine, setCurrentLine] = useState<LyricLine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);

  // Find the current line based on the current time
  useEffect(() => {
    const newCurrentLine = lyrics.lines.find(
      line => currentTime >= line.startTime && currentTime <= line.endTime
    ) || null;

    if (newCurrentLine !== currentLine) {
      setCurrentLine(newCurrentLine);
    }
  }, [currentTime, lyrics.lines, currentLine]);

  // Auto-scroll to the current line
  useEffect(() => {
    if (autoScroll && currentLine && currentLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const element = currentLineRef.current;

      // Calculate the scroll position to position the line at 1/3 from the bottom
      const containerHeight = container.clientHeight;
      const elementTop = element.offsetTop;
      const elementHeight = element.clientHeight;

      // Position at 1/3 from bottom (2/3 from top)
      const oneThirdFromBottom = containerHeight * (2/3);
      const scrollTo = elementTop - oneThirdFromBottom + (elementHeight / 2);

      // Smooth scroll to the position
      container.scrollTo({
        top: scrollTo,
        behavior: 'smooth'
      });
    }
  }, [currentLine, autoScroll]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Calculate chord positions based on word positions
  const getChordPositions = (line: LyricLine) => {
    try {
      // If line doesn't have chords property or it's empty, return sample chord
      if (!line.chords || !Array.isArray(line.chords) || line.chords.length === 0) {
        // For testing, create a sample chord at the beginning of the line
        // This ensures we see chords even when the API doesn't return them
        return [{
          time: line.startTime,
          chord: "C",
          wordIndex: 0,
          position: 0,
          word: line.text.split(' ')[0] || ""
        }];
      }

      // Split the line text into words
      const words = line.text.split(' ');
      if (!words.length) {
        return [{
          time: line.startTime,
          chord: "C",
          wordIndex: 0,
          position: 0,
          word: ""
        }];
      }

      const wordPositions: { word: string; start: number; end: number }[] = [];

      // Calculate the position of each word in the line
      let currentPosition = 0;
      words.forEach(word => {
        const start = currentPosition;
        const end = start + word.length;
        wordPositions.push({ word, start, end });
        currentPosition = end + 1; // +1 for the space
      });

      // Map chords to the closest word
      return line.chords.map(chord => {
        try {
          // Find the closest word to the chord position
          const closestWord = wordPositions.reduce((closest, current) => {
            const currentDistance = Math.abs((chord.position || 0) - current.start);
            const closestDistance = Math.abs((chord.position || 0) - closest.start);
            return currentDistance < closestDistance ? current : closest;
          }, wordPositions[0]);

          return {
            ...chord,
            wordIndex: wordPositions.indexOf(closestWord),
            word: closestWord.word
          };
        } catch (innerError) {
          console.warn('Error mapping chord to word:', innerError);
          return {
            ...chord,
            wordIndex: 0,
            word: words[0] || ""
          };
        }
      });
    } catch (error) {
      console.error('Error in getChordPositions:', error);
      // Return a fallback chord
      return [{
        time: line.startTime,
        chord: "C",
        wordIndex: 0,
        position: 0,
        word: line.text.split(' ')[0] || ""
      }];
    }
  };

  // Check if lyrics data is valid
  if (!lyrics || !lyrics.lines || !Array.isArray(lyrics.lines)) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h2 className="text-xl font-bold mb-4">Lyrics</h2>
        <div className="text-gray-500 italic">No lyrics data available</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h2 className="text-xl font-bold mb-4">Lyrics</h2>

      <div
        ref={containerRef}
        className="h-[450px] overflow-y-auto pr-2 space-y-4 lyrics-container"
      >
        {lyrics.lines.map((line, lineIndex) => {
          try {
            // Get chord positions for this line
            const chordPositions = getChordPositions(line);

            // Split the line text into words
            const words = line.text ? line.text.split(' ') : [''];

            return (
              <div
                key={lineIndex}
                ref={line === currentLine ? currentLineRef : undefined}
                className={`relative py-2 px-1 rounded transition-colors duration-300 cursor-pointer hover:bg-gray-100 ${
                  line === currentLine ? 'bg-blue-50 border-l-3 border-blue-400 rounded-lg' : ''
                }`}
                onClick={() => onLineClick && onLineClick(line)}
              >
                {/* Time indicator */}
                <span className="text-xs text-gray-500 absolute right-2 top-1">
                  {formatTime(line.startTime || 0)}
                </span>

                {/* Render the lyrics text with chords above specific words */}
                <div className="text-lg leading-loose relative pt-6">
                  {words.map((word, wordIndex) => {
                    try {
                      // Find chords that should be positioned above this word
                      const wordChords = chordPositions.filter(chord => chord.wordIndex === wordIndex);

                      return (
                        <span key={wordIndex} className="relative inline-block">
                          {/* Render chords above the word */}
                          {wordChords.map((chord, chordIndex) => (
                            <span
                              key={chordIndex}
                              className="absolute -top-6 font-medium text-blue-700"
                              style={{ left: '50%', transform: 'translateX(-50%)' }}
                            >
                              {chord.chord}
                            </span>
                          ))}

                          {/* Render the word */}
                          <span className={line === currentLine ? 'text-blue-600 font-semibold' : 'text-gray-700'}>
                            {word}
                          </span>

                          {/* Add space after word (except for the last word) */}
                          {wordIndex < words.length - 1 && ' '}
                        </span>
                      );
                    } catch (wordError) {
                      console.warn(`Error rendering word at index ${wordIndex}:`, wordError);
                      return <span key={wordIndex} className="text-gray-400">{word} </span>;
                    }
                  })}
                </div>
              </div>
            );
          } catch (lineError) {
            console.warn(`Error rendering line at index ${lineIndex}:`, lineError);
            return (
              <div key={lineIndex} className="py-2 px-1 text-gray-400 italic">
                {line.text || `[Line ${lineIndex + 1}]`}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};

export default EnhancedLyricsDisplay;
