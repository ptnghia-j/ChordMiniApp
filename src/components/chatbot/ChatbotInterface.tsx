'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiSparkles, HiArrowPath, HiXMark } from 'react-icons/hi2';

import { ChatMessage, SongContext } from '@/types/chatbotTypes';
import { createChatMessage, sendChatMessageWithLyricsRetrieval, truncateConversationHistory } from '@/services/api/chatbotService';
import { useApiKeys } from '@/hooks/settings/useApiKeys';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';

interface ChatbotInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  songContext?: SongContext;
  className?: string;
  embedded?: boolean;
}

const WELCOME_MESSAGE = `Hello! I'm your AI music assistant. I can help you understand this song's chord progressions, beat patterns, harmonic movement, structure, and lyrics. What would you like to explore?`;

const ChatbotInterface: React.FC<ChatbotInterfaceProps> = ({
  isOpen,
  onClose,
  songContext,
  className = '',
  embedded = false,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { getApiKey } = useApiKeys();

  const clearConversation = () => {
    setMessages([createChatMessage('assistant', WELCOME_MESSAGE)]);
    setError(null);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = createChatMessage('user', inputMessage.trim());
    const newMessages = [...messages, userMessage];
    const messageContent = inputMessage.trim();

    setMessages(newMessages);
    setInputMessage('');
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setIsLoading(true);
    try {
      if (!songContext) {
        throw new Error('No song context available. Please make sure a song is loaded.');
      }

      const geminiApiKey = await getApiKey('gemini');
      const truncatedHistory = truncateConversationHistory(newMessages);
      const response = await sendChatMessageWithLyricsRetrieval(messageContent, truncatedHistory, songContext, geminiApiKey || undefined);
      setMessages((prev) => [...prev, createChatMessage('assistant', response.message)]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      const el = textareaRef.current as unknown as { focus: (opts?: { preventScroll?: boolean }) => void };
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([createChatMessage('assistant', WELCOME_MESSAGE)]);
    }
  }, [isOpen, messages.length]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {!embedded && (
            <motion.div
              className="fixed inset-0 z-[9997] bg-black/20 backdrop-blur-[1px] sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
            />
          )}
          <motion.div
            className={`${embedded ? 'relative' : 'fixed bottom-16 right-4 max-sm:bottom-0 max-sm:right-0 max-sm:left-0'} ${embedded ? '' : 'z-[9998]'} flex flex-col rounded-xl border border-white/45 bg-white/72 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.72)] backdrop-blur-xl dark:border-white/12 dark:bg-slate-900/42 ${embedded ? 'w-full h-full max-h-none min-h-[400px]' : 'w-96 max-w-[calc(100vw-2rem)] h-[calc(100vh-8rem)] max-h-[700px] min-h-[400px] sm:bottom-16 sm:right-4 sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:h-[calc(100vh-8rem)] sm:max-h-[700px] sm:min-h-[400px]'} ${className}`}
            initial={embedded ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
            animate={embedded ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={embedded ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="shrink-0 border-b border-black/5 bg-white/34 p-3 backdrop-blur-md dark:border-white/8 dark:bg-slate-900/12">
              <div className="flex items-center justify-between">
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
            </div>

            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-black/5 bg-white/78 text-neutral-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-neutral-200'}`}>
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <MarkdownRenderer content={message.content} className="text-sm" />
                    )}
                    <p className="text-xs opacity-70 mt-1 text-right">{new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start"><div className="rounded-lg border border-black/5 bg-white/78 p-3 dark:border-white/10 dark:bg-white/[0.06]"><div className="flex space-x-1"><div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div><div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div></div></div></div>
              )}
            </div>

            {error && (
              <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 border-t border-red-200 dark:border-red-500/30"><p className="text-sm text-red-700 dark:text-red-400">{error}</p></div>
            )}

            <div className="p-3 shrink-0">
              <div className="flex flex-col rounded-xl border border-black/5 bg-white/78 p-1 backdrop-blur-sm transition-shadow focus-within:ring-2 focus-within:ring-blue-500 dark:border-white/10 dark:bg-white/[0.06]">
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
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