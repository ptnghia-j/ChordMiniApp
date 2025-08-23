// Centralized audio analysis types and interfaces
// Use type-only imports to avoid runtime circular dependencies

import type {
  BeatInfo,
  BeatPosition,
  DownbeatInfo,
  // BeatDetectionBackendResponse, // type re-export only; avoid local unused import
} from '@/services/beatDetectionService';

// Re-export beat detection types for convenience
export type {
  BeatInfo,
  BeatPosition,
  DownbeatInfo,
  BeatDetectionBackendResponse,
} from '@/services/beatDetectionService';

// Chord detection result from backend
export interface ChordDetectionResult {
  chord: string;       // Detected chord label (e.g., "C", "Am")
  start: number;       // Start time in seconds
  end: number;         // End time in seconds
  time: number;        // Alias for start for compatibility
  confidence: number;  // Confidence score (0-1)
}

// Beat detection info wrapper used by chord analysis
export interface BeatDetectionInfo {
  beats: BeatInfo[];
  downbeats?: number[]; // Optional downbeats
}

// Response shape from chord recognition backend
export interface ChordRecognitionBackendResponse {
  success: boolean;
  chords: ChordDetectionResult[];
  model_used?: string;
  total_chords?: number;
  processing_time?: number;
  error?: string;
}

// Chord detector model type
export type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

// Unified analysis result consumed by UI
export interface AnalysisResult {
  chords: ChordDetectionResult[];
  beats: BeatInfo[];
  downbeats?: number[];  // Downbeats from Beat-Transformer
  downbeats_with_measures?: DownbeatInfo[];
  beats_with_positions?: BeatPosition[];
  synchronizedChords: { chord: string; beatIndex: number; beatNum?: number }[];
  beatModel?: string;    // Which model was used for beat detection
  chordModel?: string;   // Which model was used for chord detection
  audioDuration?: number; // Audio duration in seconds
  beatDetectionResult?: {
    time_signature?: number; // Time signature (beats per measure)
    bpm?: number;           // Beats per minute
    beatShift?: number;     // Beat shift for alignment
    beat_time_range_start?: number; // Start time of beat detection range
    beat_time_range_end?: number;   // End time of beat detection range
    paddingCount?: number;  // Number of padding beats added
    shiftCount?: number;    // Number of beats shifted for alignment
    beats?: BeatInfo[];     // Beat information array
    animationRangeStart?: number; // Start time for animation range
  };
}

