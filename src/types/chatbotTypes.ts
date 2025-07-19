/**
 * Types for AI Chatbot functionality
 */

import { ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo, DownbeatInfo, BeatPosition } from '@/services/beatDetectionService';
import { LyricsData } from '@/types/musicAiTypes';

/**
 * Represents a single chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Represents the conversation history
 */
export interface ConversationHistory {
  messages: ChatMessage[];
  songContext?: SongContext;
}

/**
 * Represents the complete song context for the AI
 */
export interface SongContext {
  // Basic metadata
  videoId: string;
  title?: string;
  duration?: number;
  
  // Beat detection results
  beats?: BeatInfo[];
  downbeats?: number[];
  downbeats_with_measures?: DownbeatInfo[];
  beats_with_positions?: BeatPosition[];
  bpm?: number;
  time_signature?: number;
  beatModel?: string;
  
  // Chord detection results
  chords?: ChordDetectionResult[];
  synchronizedChords?: {chord: string, beatIndex: number, beatNum?: number}[];
  chordModel?: string;
  
  // Lyrics data
  lyrics?: LyricsData;
  translatedLyrics?: {
    [language: string]: {
      originalLyrics: string;
      translatedLyrics: string;
      sourceLanguage: string;
      targetLanguage: string;
    };
  };
}

/**
 * Request interface for chatbot API
 */
export interface ChatbotRequest {
  message: string;
  conversationHistory: ChatMessage[];
  songContext: SongContext;
  geminiApiKey?: string; // Optional user-provided Gemini API key (BYOK)
}

/**
 * Response interface for chatbot API
 */
export interface ChatbotResponse {
  message: string;
  error?: string;
}

/**
 * Chatbot state interface for component management
 */
export interface ChatbotState {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  conversationHistory: ChatMessage[];
}

/**
 * Song segmentation types
 */
export interface SongSegment {
  type: string; // Flexible to accept any segment type from AI analysis
  startTime: number;
  endTime: number;
  startBeat?: number;
  endBeat?: number;
  confidence?: number;
  label?: string; // Optional custom label (e.g., "Verse 1", "Chorus 2")
  reasoning?: string; // Optional reasoning for why this segment was identified
}

export interface SegmentationResult {
  segments: SongSegment[];
  analysis: {
    structure: string;
    keyChanges?: Array<{time: number, key: string}>;
    tempo?: number;
    timeSignature?: number;
    coverageCheck?: string; // Confirmation of complete song coverage
  };
  metadata: {
    totalDuration: number;
    analysisTimestamp: number;
    model: string;
  };
}

export interface SegmentationRequest {
  songContext: SongContext;
  geminiApiKey?: string;
}
