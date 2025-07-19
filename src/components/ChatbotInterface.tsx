'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage, SongContext, SegmentationResult } from '@/types/chatbotTypes';
import { sendChatMessageWithLyricsRetrieval, createChatMessage, truncateConversationHistory, requestSongSegmentation } from '@/services/chatbotService';
import { useApiKeys } from '@/hooks/useApiKeys';
import MarkdownRenderer from './MarkdownRenderer';
import SegmentationOptionBubbles from './SegmentationOptionBubbles';
import ConfirmationButtons from './ConfirmationButtons';



interface ChatbotInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  songContext?: SongContext;
  className?: string;
  onSegmentationResult?: (result: SegmentationResult) => void;
}

/**
 * Main chatbot interface component with conversation display and input
 */
const ChatbotInterface: React.FC<ChatbotInterfaceProps> = ({
  isOpen,
  onClose,
  songContext,
  className = '',
  onSegmentationResult
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptionBubbles, setShowOptionBubbles] = useState(true);
  const [selectedOption, setSelectedOption] = useState<'analysis' | 'segmentation' | null>(null);
  const [showConfirmationButtons, setShowConfirmationButtons] = useState(false);
  const [pendingSegmentationMessage, setPendingSegmentationMessage] = useState<ChatMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { getApiKey } = useApiKeys();

  // Check if Music.AI API key is available and lyrics exist
  const checkSegmentationRequirements = async () => {
    const musicAiKey = await getApiKey('musicAi');
    const hasApiKey = !!musicAiKey;
    const hasLyrics = !!(songContext?.lyrics && songContext.lyrics.lines.length > 0);
    return { hasApiKey, hasLyrics };
  };

  // Clear conversation and reset to initial state
  const clearConversation = () => {
    setMessages([]);
    setShowOptionBubbles(true);
    setSelectedOption(null);
    setError(null);

    // Re-add welcome message
    const welcomeMessage = createChatMessage(
      'assistant',
      `Hello! I'm your AI music assistant. I can help you understand the analysis of this song, including its chord progressions, beat patterns, and lyrics. I also offer advanced song segmentation analysis to visualize song structure. What would you like to explore?`
    );
    setMessages([welcomeMessage]);
  };



  // Handle segmentation analysis
  const handleSegmentationAnalysis = async () => {
    if (!songContext) {
      setError('No song context available for segmentation analysis');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get user's Gemini API key if available
      const geminiApiKey = await getApiKey('gemini');

      // Add processing message
      const processingMessage = createChatMessage(
        'assistant',
        'Analyzing song structure... This may take a moment as I examine the beats, chords, and lyrics to identify different sections.'
      );
      setMessages(prev => [...prev, processingMessage]);

      // Request segmentation analysis
      const segmentationResult = await requestSongSegmentation(songContext, geminiApiKey || undefined);

      // Create success message with results
      const resultMessage = createChatMessage(
        'assistant',
        `**Song segmentation analysis complete!**

I've identified **${segmentationResult.segments.length} sections** in this song:

${segmentationResult.segments.map((segment, index) =>
  `${index + 1}. **${segment.label || segment.type}** (${segment.startTime.toFixed(1)}s - ${segment.endTime.toFixed(1)}s)`
).join('\n')}

**Song Structure**: ${segmentationResult.analysis.structure}

**Visual Enhancement**: The beat/chord grid above now shows color-coded sections! Each section type has its own color:
- **Intro/Outro**: Light gray
- **Verse**: Light green
- **Pre-Chorus**: Light orange
- **Chorus**: Light red/pink
- **Bridge**: Light purple
- **Instrumental**: Light yellow

You can now see the song's structure at a glance and understand how different sections flow together!`
      );

      setMessages(prev => [...prev, resultMessage]);

      // Trigger grid color update by calling the callback
      if (onSegmentationResult) {
        onSegmentationResult(segmentationResult);
        console.log('Segmentation result passed to parent component');
      }

    } catch (error) {
      console.error('Segmentation analysis failed:', error);
      const errorMessage = createChatMessage(
        'assistant',
        `**Segmentation analysis failed**

${error instanceof Error ? error.message : 'An unexpected error occurred during analysis.'}

This could be due to:
- Missing or insufficient lyrics data
- API key issues
- Complex song structure that's difficult to analyze

Would you like to try the regular analysis instead, or check your API key configuration?`
      );
      setMessages(prev => [...prev, errorMessage]);
      setError(error instanceof Error ? error.message : 'Segmentation analysis failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle option selection from bubbles
  const handleOptionSelect = async (option: 'analysis' | 'segmentation') => {
    setSelectedOption(option);
    setShowOptionBubbles(false);

    if (option === 'analysis') {
      const analysisMessage = createChatMessage(
        'assistant',
        `Great! I'm ready to help you analyze this song's musical elements. You can ask me about:

• **Chord progressions** - How chords change throughout the song
• **Beat patterns** - Timing, tempo, and rhythm analysis
• **Song structure** - Verses, choruses, and musical sections
• **Lyrics analysis** - Meaning, themes, and lyrical structure
• **Music theory** - Key signatures, harmonic relationships, and more

What specific aspect would you like to explore first?`
      );
      setMessages(prev => [...prev, analysisMessage]);
    } else if (option === 'segmentation') {
      const { hasApiKey, hasLyrics } = await checkSegmentationRequirements();

      if (!hasApiKey || !hasLyrics) {
        const errorMessage = createChatMessage(
          'assistant',
          `I'd love to help with song segmentation, but I need a few things first:

${!hasApiKey ? '• **Music.AI API Key**: Please configure your Music.AI API key in the settings' : ''}
${!hasLyrics ? '• **Lyrics Data**: The song needs lyrics for accurate segmentation analysis' : ''}

Once these requirements are met, I can analyze the song structure and create a beautiful color-coded visualization showing intro, verses, choruses, bridges, and other sections!

Would you like me to help with the regular analysis instead?`
        );
        setMessages(prev => [...prev, errorMessage]);
        setShowOptionBubbles(true); // Show options again
        setSelectedOption(null);
      } else {
        const segmentationMessage = createChatMessage(
          'assistant',
          `Perfect! I can perform song segmentation analysis for you. This will:

• **Analyze song structure** - Identify intro, verse, chorus, bridge, outro sections
• **Create color-coded visualization** - Each section gets a unique color on the beat/chord grid
• **Provide precise timestamps** - Know exactly when each section starts and ends
• **Show structural patterns** - See how the song is organized musically

To proceed, I'll analyze the complete song data including beats, chords, and lyrics to identify the structural sections. This may take a moment.

Would you like me to start the segmentation analysis now?`
        );
        setMessages(prev => [...prev, segmentationMessage]);
        setPendingSegmentationMessage(segmentationMessage);
        setShowConfirmationButtons(true);
      }
    }
  };

  // Handle confirmation button responses
  const handleConfirmSegmentation = async () => {
    setShowConfirmationButtons(false);
    await handleSegmentationAnalysis();
  };

  const handleCancelSegmentation = () => {
    setShowConfirmationButtons(false);
    const cancelMessage = createChatMessage(
      'assistant',
      'No problem! Feel free to ask me about the song analysis or choose a different option when you\'re ready.'
    );
    setMessages(prev => [...prev, cancelMessage]);
    setShowOptionBubbles(true);
    setSelectedOption(null);
  };

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chatbot opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Add welcome message when chatbot first opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage = createChatMessage(
        'assistant',
        `Hello! I'm your AI music assistant. I can help you understand the analysis of this song, including its chord progressions, beat patterns, and lyrics. I also offer advanced song segmentation analysis to visualize song structure. What would you like to explore?`
      );
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = createChatMessage('user', inputMessage.trim());
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const messageContent = inputMessage.trim();
    setInputMessage('');
    setError(null);

    // Check if user is confirming segmentation analysis
    const isSegmentationConfirmation = selectedOption === 'segmentation' &&
      (messageContent.toLowerCase().includes('yes') ||
       messageContent.toLowerCase().includes('start') ||
       messageContent.toLowerCase().includes('proceed') ||
       messageContent.toLowerCase().includes('analyze'));

    if (isSegmentationConfirmation) {
      // User confirmed segmentation analysis
      await handleSegmentationAnalysis();
      return;
    }

    setIsLoading(true);

    try {
      // Truncate conversation history to prevent payload from becoming too large
      const truncatedHistory = truncateConversationHistory(newMessages);

      if (!songContext) {
        throw new Error("No song context available. Please make sure a song is loaded.");
      }

      // Get user's Gemini API key if available
      const geminiApiKey = await getApiKey('gemini');

      const response = await sendChatMessageWithLyricsRetrieval(
        messageContent,
        truncatedHistory,
        songContext,
        geminiApiKey || undefined
      );

      const assistantMessage = createChatMessage('assistant', response.message);
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      // Log chatbot error for monitoring
      setError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };



  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop overlay */}
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-30 z-[9997] sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
          className={`
            fixed z-[9998]
            bg-white dark:bg-content-bg rounded-lg shadow-2xl
            border border-gray-200 dark:border-gray-700
            flex flex-col

            /* Desktop positioning and sizing */
            bottom-16 right-4
            w-96 max-w-[calc(100vw-2rem)]
            h-[calc(100vh-6rem)] max-h-[800px] min-h-[400px]

            /* Mobile responsive - full screen on small devices */
            sm:bottom-16 sm:right-4 sm:w-96 sm:max-w-[calc(100vw-2rem)]
            sm:h-[calc(100vh-6rem)] sm:max-h-[800px] sm:min-h-[400px]

            /* Mobile slide-up panel - takes 80% of screen height */
            max-sm:bottom-0 max-sm:right-0 max-sm:left-0
            max-sm:w-full max-sm:h-[80vh] max-sm:max-h-[80vh] max-sm:min-h-[60vh]
            max-sm:rounded-t-xl max-sm:rounded-b-none

            ${className}
          `}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex items-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-blue-600"
                viewBox="0 0 512 512"
              >
                <path d="M259.92 262.91L216.4 149.77a9 9 0 00-16.8 0l-43.52 113.14a9 9 0 01-5.17 5.17L37.77 311.6a9 9 0 000 16.8l113.14 43.52a9 9 0 015.17 5.17l43.52 113.14a9 9 0 0016.8 0l43.52-113.14a9 9 0 015.17-5.17l113.14-43.52a9 9 0 000-16.8l-113.14-43.52a9 9 0 01-5.17-5.17zM108 68L88 16 68 68 16 88l52 20 20 52 20-52 52-20-52-20zM426.67 117.33L400 48l-26.67 69.33L304 144l69.33 26.67L400 240l26.67-69.33L496 144l-69.33-26.67z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32"/>
              </svg>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm sm:text-base">AI Music Assistant</h3>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={clearConversation}
                className="
                  p-2 sm:p-1 rounded-lg text-gray-500 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  hover:text-gray-700 dark:hover:text-gray-200
                  transition-colors duration-200
                  touch-manipulation
                "
                title="Clear conversation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="
                  p-2 sm:p-1 rounded-lg text-gray-500 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  hover:text-gray-700 dark:hover:text-gray-200
                  transition-colors duration-200
                  touch-manipulation
                "
                aria-label="Close chatbot"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, index) => (
              <div key={message.id}>
                <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`
                      max-w-[80%] p-3 rounded-lg
                      ${message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      }
                    `}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <MarkdownRenderer
                        content={message.content}
                        className="text-sm"
                      />
                    )}
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Show option bubbles after the first assistant message */}
                {index === 0 && message.role === 'assistant' && showOptionBubbles && (
                  <div className="flex justify-start mt-4">
                    <div className="max-w-[90%]">
                      <SegmentationOptionBubbles
                        songContext={songContext}
                        onOptionSelect={handleOptionSelect}
                      />
                    </div>
                  </div>
                )}

                {/* Show confirmation buttons for segmentation */}
                {message === pendingSegmentationMessage && showConfirmationButtons && (
                  <div className="flex justify-start mt-4">
                    <div className="max-w-[90%]">
                      <ConfirmationButtons
                        onConfirm={handleConfirmSegmentation}
                        onCancel={handleCancelSegmentation}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error Display */}
          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about the song analysis..."
                disabled={isLoading}
                className="
                  flex-1 px-3 py-3 sm:py-2 text-sm
                  border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-700
                  text-gray-800 dark:text-gray-200
                  placeholder-gray-500 dark:placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                  touch-manipulation
                "
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className="
                  px-4 py-3 sm:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
                  text-white text-sm rounded-lg
                  transition-colors duration-200
                  disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                  touch-manipulation
                  min-w-[60px] sm:min-w-[auto]
                "
              >
                Send
              </button>
            </div>
          </div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatbotInterface;
