/**
 * Utilities for enhancing lyrics timing information
 */
import { LyricLine, LyricsData } from '@/types/musicAiTypes';

/**
 * Character timing information
 */
export interface CharacterTiming {
  startTime: number;
  endTime: number;
  char: string;
}

/**
 * Enhanced lyric line with character-level timing
 */
export interface EnhancedLyricLine extends LyricLine {
  characterTimings?: CharacterTiming[];
}

/**
 * Enhanced lyrics data with character-level timing
 */
export interface EnhancedLyricsData extends LyricsData {
  lines: EnhancedLyricLine[];
}

/**
 * Calculate character-level timing for lyrics based on line start and end times
 * This distributes the time between two timestamps evenly across the characters
 * 
 * @param lyrics - The original lyrics data
 * @returns Enhanced lyrics data with character-level timing
 */
export function enhanceLyricsWithCharacterTiming(lyrics: LyricsData): EnhancedLyricsData {
  if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
    return lyrics as EnhancedLyricsData;
  }

  const enhancedLines: EnhancedLyricLine[] = lyrics.lines.map((line) => {
    // Skip empty lines or lines without proper timing
    if (!line.text || line.startTime === undefined || line.endTime === undefined) {
      return line as EnhancedLyricLine;
    }

    const lineDuration = line.endTime - line.startTime;
    const charCount = line.text.length;
    
    // Skip if line has no duration or no characters
    if (lineDuration <= 0 || charCount === 0) {
      return line as EnhancedLyricLine;
    }

    // Calculate time per character
    const timePerChar = lineDuration / charCount;
    
    // Create timing information for each character
    const characterTimings: CharacterTiming[] = [];
    
    for (let i = 0; i < charCount; i++) {
      const char = line.text[i];
      const startTime = line.startTime + (i * timePerChar);
      const endTime = line.startTime + ((i + 1) * timePerChar);
      
      characterTimings.push({
        startTime,
        endTime,
        char
      });
    }

    return {
      ...line,
      characterTimings
    };
  });

  return {
    ...lyrics,
    lines: enhancedLines
  };
}

/**
 * Calculate the active character index based on current playback time
 * 
 * @param line - The enhanced lyric line with character timings
 * @param currentTime - Current playback time in seconds
 * @returns The index of the active character, or -1 if no character is active
 */
export function getActiveCharacterIndex(line: EnhancedLyricLine, currentTime: number): number {
  if (!line.characterTimings || line.characterTimings.length === 0) {
    return -1;
  }

  // Find the character that corresponds to the current time
  return line.characterTimings.findIndex(
    (charTiming) => currentTime >= charTiming.startTime && currentTime <= charTiming.endTime
  );
}

/**
 * Calculate the progress within the current character (0 to 1)
 * 
 * @param line - The enhanced lyric line with character timings
 * @param currentTime - Current playback time in seconds
 * @param characterIndex - The index of the character to calculate progress for
 * @returns Progress value between 0 and 1, or 0 if character is not found
 */
export function getCharacterProgress(
  line: EnhancedLyricLine, 
  currentTime: number, 
  characterIndex: number
): number {
  if (!line.characterTimings || characterIndex < 0 || characterIndex >= line.characterTimings.length) {
    return 0;
  }

  const charTiming = line.characterTimings[characterIndex];
  const charDuration = charTiming.endTime - charTiming.startTime;
  
  if (charDuration <= 0) {
    return 0;
  }

  const progress = (currentTime - charTiming.startTime) / charDuration;
  return Math.max(0, Math.min(1, progress));
}
