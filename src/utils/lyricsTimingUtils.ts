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
 * Uses natural speech patterns and word boundaries for more realistic timing
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

    // Create timing information for each character using natural speech patterns
    const characterTimings: CharacterTiming[] = calculateNaturalCharacterTiming(
      line.text,
      line.startTime,
      line.endTime
    );

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
 * Calculate character timing based on natural speech patterns
 * Accounts for word boundaries, syllables, and speech rhythm
 */
function calculateNaturalCharacterTiming(
  text: string,
  startTime: number,
  endTime: number
): CharacterTiming[] {
  const lineDuration = endTime - startTime;
  const words = text.split(/(\s+)/); // Split but keep spaces
  const characterTimings: CharacterTiming[] = [];

  // Calculate word weights based on length and complexity
  const wordWeights = words.map(word => {
    if (/^\s+$/.test(word)) return 0.1; // Spaces get minimal time

    // Longer words and words with consonant clusters take more time
    const baseWeight = word.length;
    const consonantClusters = (word.match(/[bcdfghjklmnpqrstvwxyz]{2,}/gi) || []).length;
    const syllableCount = estimateSyllableCount(word);

    return baseWeight + (consonantClusters * 0.5) + (syllableCount * 0.3);
  });

  const totalWeight = wordWeights.reduce((sum, weight) => sum + weight, 0);

  let currentTime = startTime;

  words.forEach((word, wordIndex) => {
    const wordWeight = wordWeights[wordIndex];
    const wordDuration = (wordWeight / totalWeight) * lineDuration;
    const wordEndTime = currentTime + wordDuration;

    if (/^\s+$/.test(word)) {
      // Handle spaces - give them minimal time
      for (let i = 0; i < word.length; i++) {
        const charStartTime = currentTime + (i / word.length) * wordDuration;
        const charEndTime = currentTime + ((i + 1) / word.length) * wordDuration;

        characterTimings.push({
          startTime: charStartTime,
          endTime: charEndTime,
          char: word[i]
        });
      }
    } else {
      // Handle actual words with natural timing
      for (let i = 0; i < word.length; i++) {
        // Characters at syllable boundaries get slightly more time
        const isVowel = /[aeiouAEIOU]/.test(word[i]);
        const charWeight = isVowel ? 1.2 : 0.8; // Vowels take slightly longer

        const baseCharTime = wordDuration / word.length;
        const adjustedCharTime = baseCharTime * charWeight;

        const charStartTime = currentTime + (i / word.length) * wordDuration;
        const charEndTime = Math.min(charStartTime + adjustedCharTime, wordEndTime);

        characterTimings.push({
          startTime: charStartTime,
          endTime: charEndTime,
          char: word[i]
        });
      }
    }

    currentTime = wordEndTime;
  });

  return characterTimings;
}

/**
 * Estimate syllable count in a word
 */
function estimateSyllableCount(word: string): number {
  if (!word || word.length === 0) return 0;

  const vowelGroups = word.toLowerCase().match(/[aeiouy]+/g) || [];
  let syllables = vowelGroups.length;

  // Adjust for silent 'e'
  if (word.toLowerCase().endsWith('e') && syllables > 1) {
    syllables--;
  }

  return Math.max(1, syllables);
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
