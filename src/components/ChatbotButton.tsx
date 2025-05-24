'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatbotButtonProps {
  isOpen: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Floating action button for opening/closing the chatbot interface
 */
const ChatbotButton: React.FC<ChatbotButtonProps> = ({
  isOpen,
  onClick,
  disabled = false,
  className = ''
}) => {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`
        fixed bottom-6 right-6 z-[9999]
        w-14 h-14 rounded-full
        bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
        text-white shadow-lg hover:shadow-xl
        flex items-center justify-center
        transition-all duration-200 ease-in-out
        focus:outline-none focus:ring-4 focus:ring-blue-300
        ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.svg
            key="close"
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </motion.svg>
        ) : (
          <motion.svg
            key="chat"
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </motion.svg>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <div className={`
        absolute bottom-full left-0 mb-2
        px-3 py-1 bg-gray-800 text-white text-sm rounded-lg
        opacity-0 pointer-events-none
        transition-opacity duration-200
        whitespace-nowrap
        group-hover:opacity-100
      `}>
        {isOpen ? 'Close AI Assistant' : 'Ask AI Assistant'}
        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
      </div>
    </motion.button>
  );
};

export default ChatbotButton;
