import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ChatbotRequest, ChatbotResponse, ChatMessage } from '@/types/chatbotTypes';
import { formatSongContextForAI, validateSongContext } from '@/services/chatbotService';

// Get the API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

// Validate API key availability (production logging)
if (!apiKey) {
  console.error('CRITICAL: Gemini API Key not configured for chatbot service');
}

// Initialize Gemini API with the API key
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Define the model name to use
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

/**
 * Generates a system prompt with song context for the AI chatbot
 */
function generateSystemPrompt(songContextSummary: string): string {
  return `You are an AI assistant specialized in music analysis and chord recognition. You have access to detailed analysis data for a song that has been processed through advanced beat detection and chord recognition models.

SONG ANALYSIS DATA:
${songContextSummary}

Your role is to help users understand and work with this musical analysis. You can:

1. **Explain the musical analysis**: Help users understand the chord progressions, beat patterns, time signatures, and BPM
2. **Answer questions about the song structure**: Discuss verses, choruses, bridges, and how chords relate to song sections
3. **Provide musical insights**: Explain chord relationships, key signatures, harmonic progressions, and musical theory concepts
4. **Help with practice**: Suggest practice techniques, chord fingerings, strumming patterns, or playing tips
5. **Discuss lyrics**: If lyrics are available, help analyze their meaning, structure, or relationship to the musical content
6. **Compare with other songs**: Draw connections to similar chord progressions or musical styles
7. **Educational support**: Explain music theory concepts relevant to this song

Guidelines for your responses:
- Be helpful, informative, and encouraging
- Use clear, accessible language while being musically accurate
- Reference the specific analysis data when relevant
- If asked about something not in the analysis data, be honest about limitations
- Keep responses concise but comprehensive
- Focus on practical, actionable insights when possible

Remember: You have access to precise timing data, so you can reference specific moments in the song (e.g., "At 1:23, the chord changes from C to Am").`;
}

/**
 * Formats conversation history for the Gemini API
 */
function formatConversationForGemini(
  userMessage: string,
  conversationHistory: ChatMessage[],
  systemPrompt: string
): string {
  let prompt = systemPrompt + '\n\n';

  // Add conversation history
  if (conversationHistory.length > 0) {
    prompt += 'CONVERSATION HISTORY:\n';
    conversationHistory.forEach((message) => {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      prompt += `${role}: ${message.content}\n`;
    });
    prompt += '\n';
  }

  // Add current user message
  prompt += `User: ${userMessage}\n\nAssistant:`;

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body: ChatbotRequest = await request.json();
    const { message, conversationHistory, songContext, geminiApiKey } = body;

    // Validate input
    if (!message || message.trim() === '') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!songContext || !validateSongContext(songContext)) {
      console.warn('Invalid or insufficient song context provided');
      return NextResponse.json(
        { error: 'Valid song context is required for chatbot interaction' },
        { status: 400 }
      );
    }

    // Determine which API key to use (user-provided key takes precedence)
    const finalApiKey = geminiApiKey || apiKey;

    // Check if Gemini API key is available
    if (!finalApiKey) {
      console.error('Gemini API key is missing');
      return NextResponse.json(
        { error: 'Chatbot service is not configured properly. Please provide a Gemini API key.' },
        { status: 500 }
      );
    }

    // Create a Gemini AI instance with the appropriate API key
    const geminiAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : ai;

    // Format song context for AI
    const songContextSummary = formatSongContextForAI(songContext);
    console.log('Song context summary generated');

    // Generate system prompt
    const systemPrompt = generateSystemPrompt(songContextSummary);

    // Format the complete prompt with conversation history
    const fullPrompt = formatConversationForGemini(
      message,
      conversationHistory,
      systemPrompt
    );

    console.log('Sending request to Gemini API');

    // Generate content using the Gemini model
    const response = await geminiAI.models.generateContent({
      model: MODEL_NAME,
      contents: fullPrompt
    });

    // Extract and clean the response text
    const assistantMessage = response.text?.trim() || '';

    if (!assistantMessage) {
      console.error('Gemini API returned empty response');
      return NextResponse.json(
        { error: 'Chatbot service returned an empty response' },
        { status: 500 }
      );
    }

    console.log('Chatbot response generated successfully');
    console.log('Response length:', assistantMessage.length);

    const chatbotResponse: ChatbotResponse = {
      message: assistantMessage
    };

    return NextResponse.json(chatbotResponse);
  } catch (error) {
    console.error('Error in chatbot API:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: 'Chatbot service is temporarily busy. Please try again in a moment.' },
          { status: 429 }
        );
      }

      if (error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Request timed out. Please try again.' },
          { status: 408 }
        );
      }
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
