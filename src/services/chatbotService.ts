/**
 * Chatbot Service
 *
 * This service handles communication with the chatbot API and provides
 * utilities for managing conversation context and song data formatting.
 */

import axios from 'axios';
import { ChatMessage, ChatbotRequest, ChatbotResponse, SongContext } from '@/types/chatbotTypes';
import { LyricsData } from '@/types/musicAiTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sends a message to the chatbot API
 */
export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
  songContext: SongContext
): Promise<ChatbotResponse> {
  try {
    const request: ChatbotRequest = {
      message,
      conversationHistory,
      songContext
    };

    const response = await axios.post('/api/chatbot', request, {
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error sending chat message:', error);

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 500) {
        throw new Error('Chatbot service is temporarily unavailable. Please try again later.');
      } else if (error.response?.status === 400) {
        throw new Error('Invalid request. Please check your message and try again.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please try again.');
      }
    }

    throw new Error('Failed to send message. Please check your connection and try again.');
  }
}

/**
 * Creates a new chat message
 */
export function createChatMessage(
  role: 'user' | 'assistant',
  content: string
): ChatMessage {
  return {
    id: uuidv4(),
    role,
    content,
    timestamp: Date.now()
  };
}

/**
 * Formats song context into comprehensive data for the AI
 */
export function formatSongContextForAI(songContext: SongContext): string {
  const parts: string[] = [];

  // Basic metadata
  if (songContext.title) {
    parts.push(`Song: ${songContext.title}`);
  }
  if (songContext.duration) {
    parts.push(`Duration: ${Math.floor(songContext.duration / 60)}:${String(Math.floor(songContext.duration % 60)).padStart(2, '0')}`);
  }

  // Beat detection results - COMPREHENSIVE DATA
  if (songContext.bpm) {
    parts.push(`BPM: ${Math.round(songContext.bpm)}`);
  }
  if (songContext.time_signature) {
    parts.push(`Time Signature: ${songContext.time_signature}/4`);
  }
  if (songContext.beatModel) {
    parts.push(`Beat Detection Model: ${songContext.beatModel}`);
  }

  // Complete beat data with timestamps
  if (songContext.beats && songContext.beats.length > 0) {
    parts.push(`\n=== COMPLETE BEAT DATA ===`);
    parts.push(`Total Beats: ${songContext.beats.length}`);

    // Include first 20 beats with timestamps for context
    const beatSample = songContext.beats.slice(0, 20).map((beat, index) =>
      `Beat ${index + 1}: ${beat.time.toFixed(3)}s`
    ).join(', ');
    parts.push(`Beat timestamps (first 20): ${beatSample}`);

    // Include downbeats if available
    if (songContext.downbeats && songContext.downbeats.length > 0) {
      parts.push(`Downbeats: ${songContext.downbeats.slice(0, 10).map(d => `${d.toFixed(3)}s`).join(', ')}`);
    }
  }

  // Chord detection results - COMPREHENSIVE DATA
  if (songContext.chordModel) {
    parts.push(`\nChord Detection Model: ${songContext.chordModel}`);
  }

  if (songContext.chords && songContext.chords.length > 0) {
    parts.push(`\n=== COMPLETE CHORD PROGRESSION ===`);
    parts.push(`Total Chord Changes: ${songContext.chords.length}`);

    // Get unique chords
    const uniqueChords = [...new Set(songContext.chords.map(c => c.chord))];
    parts.push(`Unique Chords (${uniqueChords.length}): ${uniqueChords.join(', ')}`);

    // Include complete chord progression with timestamps
    const chordProgression = songContext.chords.map(chord =>
      `${chord.chord} (${chord.start.toFixed(2)}s-${chord.end.toFixed(2)}s)`
    ).join(', ');
    parts.push(`Complete Chord Progression: ${chordProgression}`);

    // Include synchronized chords if available
    if (songContext.synchronizedChords && songContext.synchronizedChords.length > 0) {
      const syncChords = songContext.synchronizedChords.map(sc =>
        `${sc.chord} (beat ${sc.beatIndex}${sc.beatNum ? `, measure beat ${sc.beatNum}` : ''})`
      ).join(', ');
      parts.push(`Synchronized with beats: ${syncChords}`);
    }
  }

  // Lyrics information - COMPREHENSIVE DATA
  if (songContext.lyrics && songContext.lyrics.lines.length > 0) {
    parts.push(`\n=== COMPLETE LYRICS ===`);
    parts.push(`Total Lines: ${songContext.lyrics.lines.length}`);

    // Include ALL lyrics with timestamps
    const lyricsWithTimestamps = songContext.lyrics.lines.map(line =>
      `[${line.startTime.toFixed(1)}s-${line.endTime.toFixed(1)}s] ${line.text}`
    ).join('\n');
    parts.push(`Full Lyrics with Timestamps:\n${lyricsWithTimestamps}`);
  }

  // Translation information
  if (songContext.translatedLyrics) {
    const languages = Object.keys(songContext.translatedLyrics);
    if (languages.length > 0) {
      parts.push(`\n=== TRANSLATIONS ===`);
      parts.push(`Available in: ${languages.join(', ')}`);

      // Include translated content
      Object.entries(songContext.translatedLyrics).forEach(([lang, translation]) => {
        parts.push(`\n${lang.toUpperCase()} Translation:`);
        parts.push(translation.translatedLyrics);
      });
    }
  }

  return parts.join('\n');
}

/**
 * Retrieves lyrics for a video if not available in the current context
 */
export async function retrieveLyricsForChatbot(videoId: string): Promise<LyricsData | null> {
  try {
    console.log(`Retrieving lyrics for chatbot context: ${videoId}`);

    const response = await axios.post('/api/transcribe-lyrics', {
      videoId,
      forceRefresh: false, // Use cached lyrics if available
      checkCacheOnly: true // Only check cache, don't auto-transcribe
    });

    if (response.data && response.data.lyrics) {
      console.log(`Successfully retrieved lyrics for chatbot: ${response.data.lyrics.lines?.length || 0} lines`);
      return response.data.lyrics;
    }

    console.warn('No lyrics data returned from API');
    return null;
  } catch (error) {
    console.error('Error retrieving lyrics for chatbot:', error);
    return null;
  }
}

/**
 * Enhanced function to send message with automatic lyrics retrieval
 */
export async function sendChatMessageWithLyricsRetrieval(
  message: string,
  conversationHistory: ChatMessage[],
  songContext: SongContext
): Promise<ChatbotResponse> {
  try {
    // Check if lyrics are missing and try to retrieve them
    if (!songContext.lyrics || songContext.lyrics.lines.length === 0) {
      console.log('Lyrics not available in context, attempting to retrieve...');
      const retrievedLyrics = await retrieveLyricsForChatbot(songContext.videoId);

      if (retrievedLyrics && retrievedLyrics.lines.length > 0) {
        // Update the song context with retrieved lyrics
        songContext = {
          ...songContext,
          lyrics: retrievedLyrics
        };
        console.log(`Enhanced context with ${retrievedLyrics.lines.length} lyrics lines`);
      }
    }

    // Send the message with the enhanced context
    return await sendChatMessage(message, conversationHistory, songContext);
  } catch (error) {
    console.error('Error in enhanced chat message sending:', error);
    // Fallback to regular message sending without lyrics
    return await sendChatMessage(message, conversationHistory, songContext);
  }
}

/**
 * Validates if song context has sufficient data for chatbot interaction
 */
export function validateSongContext(songContext: SongContext): boolean {
  // At minimum, we need a video ID and either beats, chords, or lyrics
  return !!(
    songContext.videoId && (
      (songContext.beats && songContext.beats.length > 0) ||
      (songContext.chords && songContext.chords.length > 0) ||
      (songContext.lyrics && songContext.lyrics.lines.length > 0)
    )
  );
}

/**
 * Truncates conversation history to prevent API payload from becoming too large
 */
export function truncateConversationHistory(
  messages: ChatMessage[],
  maxMessages: number = 20
): ChatMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  // Keep the most recent messages
  return messages.slice(-maxMessages);
}
