/**
 * Types for Music.ai API integration
 */

/**
 * Represents a single line of lyrics with start and end times
 */
export interface LyricLine {
  startTime: number;
  endTime: number;
  text: string;
  chords?: ChordMarker[]; // Optional array of chord markers
}

/**
 * Represents a complete lyrics transcription
 */
export interface LyricsData {
  lines: LyricLine[];
  error?: string; // Optional error message when lyrics transcription fails
}

/**
 * Represents a chord marker with timing information
 */
export interface ChordData {
  time: number;
  chord: string;
}

/**
 * Represents a chord marker with timing and position information
 */
export interface ChordMarker {
  time: number;
  chord: string;
  position: number; // Character position in the line
}

/**
 * Represents synchronized lyrics with chord information
 */
export interface SynchronizedLyrics {
  lines: Array<{
    startTime: number;
    endTime: number;
    text: string;
    chords: ChordMarker[];
  }>;
  error?: string; // Optional error message when lyrics synchronization fails
}

/**
 * Represents a Music.ai API job
 */
export interface MusicAiJob {
  id: string;
  status: string;
  result?: any;
  error?: string;
}

/**
 * Represents a Music.ai API workflow
 */
export interface MusicAiWorkflow {
  id: string;
  name: string;
  description?: string;
  slug: string;
}

/**
 * Represents a Music.ai API job result
 */
export interface MusicAiJobResult {
  [key: string]: any;
}
