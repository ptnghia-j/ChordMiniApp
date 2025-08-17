'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Using react-icons as requested
import { HiSparkles, HiArrowPath, HiXMark } from 'react-icons/hi2';

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
 * Main chatbot interface component with a modern design applied to the original functionality.
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
  // Using a textarea for a better multi-line chat experience, ref type is updated.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { getApiKey } = useApiKeys();

  
  const checkSegmentationRequirements = async () => {
    const musicAiKey = await getApiKey('musicAi');
    const hasApiKey = !!musicAiKey;
    const hasLyrics = !!(songContext?.lyrics && songContext.lyrics.lines.length > 0);
    return { hasApiKey, hasLyrics };
  };

  const clearConversation = () => {
    setMessages([]);
    setShowOptionBubbles(true);
    setSelectedOption(null);
    setError(null);
    const welcomeMessage = createChatMessage(
      'assistant',
      `Hello! I'm your AI music assistant. I can help you understand the analysis of this song, including its chord progressions, beat patterns, and lyrics. I also offer advanced song segmentation analysis to visualize song structure. What would you like to explore?`
    );
    setMessages([welcomeMessage]);
  };

  const handleSegmentationAnalysis = async () => {
    if (!songContext) {
      setError('No song context available for segmentation analysis');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const geminiApiKey = await getApiKey('gemini');
      const processingMessage = createChatMessage(
        'assistant',
        'Analyzing song structure... This may take a moment as I examine the beats, chords, and lyrics to identify different sections.'
      );
      setMessages(prev => [...prev, processingMessage]);
      const segmentationResult = await requestSongSegmentation(songContext, geminiApiKey || undefined);
      const resultMessage = createChatMessage(
        'assistant',
        `**Song segmentation analysis complete!**\n\nI've identified **${segmentationResult.segments.length} sections** in this song:\n\n${segmentationResult.segments.map((segment, index) => `${index + 1}. **${segment.label || segment.type}** (${segment.startTime.toFixed(1)}s - ${segment.endTime.toFixed(1)}s)`).join('\n')}\n\n**Song Structure**: ${segmentationResult.analysis.structure}\n\n**Visual Enhancement**: The beat/chord grid above now shows color-coded sections! Each section type has its own color:\n- **Intro/Outro**: Light gray\n- **Verse**: Light green\n- **Pre-Chorus**: Light orange\n- **Chorus**: Light red/pink\n- **Bridge**: Light purple\n- **Instrumental**: Light yellow\n\nYou can now see the song's structure at a glance and understand how different sections flow together!`
      );
      setMessages(prev => [...prev, resultMessage]);
      if (onSegmentationResult) {
        onSegmentationResult(segmentationResult);
        console.log('Segmentation result passed to parent component');
      }
    } catch (error) {
      console.error('Segmentation analysis failed:', error);
      const errorMessage = createChatMessage('assistant', `**Segmentation analysis failed**\n\n${error instanceof Error ? error.message : 'An unexpected error occurred during analysis.'}\n\nThis could be due to:\n- Missing or insufficient lyrics data\n- API key issues\n- Complex song structure that's difficult to analyze\n\nWould you like to try the regular analysis instead, or check your API key configuration?`);
      setMessages(prev => [...prev, errorMessage]);
      setError(error instanceof Error ? error.message : 'Segmentation analysis failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionSelect = async (option: 'analysis' | 'segmentation') => {
    setSelectedOption(option);
    setShowOptionBubbles(false);
    if (option === 'analysis') {
      const analysisMessage = createChatMessage('assistant', `Great! I'm ready to help you analyze this song's musical elements. You can ask me about:\n\n• **Chord progressions** - How chords change throughout the song\n• **Beat patterns** - Timing, tempo, and rhythm analysis\n• **Song structure** - Verses, choruses, and musical sections\n• **Lyrics analysis** - Meaning, themes, and lyrical structure\n• **Music theory** - Key signatures, harmonic relationships, and more\n\nWhat specific aspect would you like to explore first?`);
      setMessages(prev => [...prev, analysisMessage]);
    } else if (option === 'segmentation') {
      const { hasApiKey, hasLyrics } = await checkSegmentationRequirements();
      if (!hasApiKey || !hasLyrics) {
        const errorMessage = createChatMessage('assistant', `I'd love to help with song segmentation, but I need a few things first:\n\n${!hasApiKey ? '• **Music.AI API Key**: Please configure your Music.AI API key in the settings' : ''}\n${!hasLyrics ? '• **Lyrics Data**: The song needs lyrics for accurate segmentation analysis' : ''}\n\nOnce these requirements are met, I can analyze the song structure and create a beautiful color-coded visualization showing intro, verses, choruses, bridges, and other sections!\n\nWould you like me to help with the regular analysis instead?`);
        setMessages(prev => [...prev, errorMessage]);
        setShowOptionBubbles(true);
        setSelectedOption(null);
      } else {
        const segmentationMessage = createChatMessage('assistant', `Perfect! I can perform song segmentation analysis for you. This will:\n\n• **Analyze song structure** - Identify intro, verse, chorus, bridge, outro sections\n• **Create color-coded visualization** - Each section gets a unique color on the beat/chord grid\n• **Provide precise timestamps** - Know exactly when each section starts and ends\n• **Show structural patterns** - See how the song is organized musically\n\nTo proceed, I'll analyze the complete song data including beats, chords, and lyrics to identify the structural sections. This may take a moment.\n\nWould you like me to start the segmentation analysis now?`);
        setMessages(prev => [...prev, segmentationMessage]);
        setPendingSegmentationMessage(segmentationMessage);
        setShowConfirmationButtons(true);
      }
    }
  };

  const handleConfirmSegmentation = async () => {
    setShowConfirmationButtons(false);
    await handleSegmentationAnalysis();
  };

  const handleCancelSegmentation = () => {
    setShowConfirmationButtons(false);
    const cancelMessage = createChatMessage('assistant', 'No problem! Feel free to ask me about the song analysis or choose a different option when you\'re ready.');
    setMessages(prev => [...prev, cancelMessage]);
    setShowOptionBubbles(true);
    setSelectedOption(null);
  };
  
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    const userMessage = createChatMessage('user', inputMessage.trim());
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const messageContent = inputMessage.trim();
    setInputMessage('');
    setError(null);
    if (textareaRef.current) { // Reset textarea height after send
        textareaRef.current.style.height = 'auto';
    }
    const isSegmentationConfirmation = selectedOption === 'segmentation' && (messageContent.toLowerCase().includes('yes') || messageContent.toLowerCase().includes('start') || messageContent.toLowerCase().includes('proceed') || messageContent.toLowerCase().includes('analyze'));
    if (isSegmentationConfirmation) {
      await handleSegmentationAnalysis();
      return;
    }
    setIsLoading(true);
    try {
      const truncatedHistory = truncateConversationHistory(newMessages);
      if (!songContext) {
        throw new Error("No song context available. Please make sure a song is loaded.");
      }
      const geminiApiKey = await getApiKey('gemini');
      const response = await sendChatMessageWithLyricsRetrieval(messageContent, truncatedHistory, songContext, geminiApiKey || undefined);
      const assistantMessage = createChatMessage('assistant', response.message);
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
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
  
  // Auto-adjust textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Limit max height to prevent infinite growth
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage = createChatMessage('assistant', `Hello! I'm your AI music assistant. I can help you understand the analysis of this song, including its chord progressions, beat patterns, and lyrics. I also offer advanced song segmentation analysis to visualize song structure. What would you like to explore?`);
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-30 z-[9997] sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          {/* Main Container: Preserved original sizing, updated colors */}
          <motion.div
            className={`
              fixed z-[9998] flex flex-col
              bg-white dark:bg-content-bg
              border border-neutral-200 dark:border-gray-700
              shadow-2xl rounded-xl
              bottom-16 right-4
              w-96 max-w-[calc(100vw-2rem)]
              h-[calc(100vh-8rem)] max-h-[700px] min-h-[400px]
              sm:bottom-16 sm:right-4 sm:w-96 sm:max-w-[calc(100vw-2rem)]
              sm:h-[calc(100vh-8rem)] sm:max-h-[700px] sm:min-h-[400px]
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
            {/* Header: Preserved original content, updated styles */}
            <div className="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
              <div className="flex items-center gap-2">
                <HiSparkles className="h-5 w-5 text-blue-500" />
                <h3 className="font-semibold text-neutral-800 dark:text-white text-sm sm:text-base">AI Music Assistant</h3>
              </div>
              <div className="flex items-center text-neutral-500 dark:text-white">
                <button onClick={clearConversation} className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" title="Clear conversation">
                  <HiArrowPath className="h-5 w-5" />
                </button>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" aria-label="Close chatbot">
                  <HiXMark className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Messages: Preserved all logic, updated bubble colors */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, index) => (
                <div key={message.id}>
                  <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-lg ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'}`}>
                      {message.role === 'user' ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      ) : (
                        <MarkdownRenderer content={message.content} className="text-sm" />
                      )}
                      {/* Original timestamp preserved */}
                      <p className="text-xs opacity-70 mt-1 text-right">{new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  {/* All original conditional rendering logic is preserved */}
                  {index === 0 && message.role === 'assistant' && showOptionBubbles && (
                    <div className="flex justify-start mt-4"><div className="max-w-[90%]"><SegmentationOptionBubbles songContext={songContext} onOptionSelect={handleOptionSelect} /></div></div>
                  )}
                  {message === pendingSegmentationMessage && showConfirmationButtons && (
                    <div className="flex justify-start mt-4"><div className="max-w-[90%]"><ConfirmationButtons onConfirm={handleConfirmSegmentation} onCancel={handleCancelSegmentation} disabled={isLoading} /></div></div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start"><div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg"><div className="flex space-x-1"><div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div><div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div></div></div></div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error Display: Preserved original functionality */}
            {error && (
              <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 border-t border-red-200 dark:border-red-500/30"><p className="text-sm text-red-700 dark:text-red-400">{error}</p></div>
            )}

            {/* Input: New design applied to original input and button */}
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 shrink-0">
              <div className="flex flex-col p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about the song analysis..."
                  disabled={isLoading}
                  rows={1}
                  className="w-full px-3 pt-3 bg-transparent text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none resize-none"
                />
                <div className="flex items-center justify-end mt-2 p-1">
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white disabled:text-neutral-500 dark:disabled:text-neutral-400 text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChatbotInterface;