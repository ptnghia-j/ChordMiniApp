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
