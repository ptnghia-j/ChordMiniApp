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
        fixed bottom-4 right-4 z-[9999]
        w-10 h-10 rounded-full
        bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
        text-white shadow-md hover:shadow-lg
        flex items-center justify-center
        transition-all duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-blue-300
        group
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
            className="h-4 w-4"
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
            className="h-4 w-4"
            viewBox="0 0 512 512"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <path d="M259.92 262.91L216.4 149.77a9 9 0 00-16.8 0l-43.52 113.14a9 9 0 01-5.17 5.17L37.77 311.6a9 9 0 000 16.8l113.14 43.52a9 9 0 015.17 5.17l43.52 113.14a9 9 0 0016.8 0l43.52-113.14a9 9 0 015.17-5.17l113.14-43.52a9 9 0 000-16.8l-113.14-43.52a9 9 0 01-5.17-5.17zM108 68L88 16 68 68 16 88l52 20 20 52 20-52 52-20-52-20zM426.67 117.33L400 48l-26.67 69.33L304 144l69.33 26.67L400 240l26.67-69.33L496 144l-69.33-26.67z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32"/>
          </motion.svg>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <div className={`
        absolute bottom-full left-0 mb-1
        px-2 py-1 bg-gray-800 text-white text-xs rounded
        opacity-0 pointer-events-none
        transition-opacity duration-200
        whitespace-nowrap
        group-hover:opacity-100
      `}>
        {isOpen ? 'Close AI' : 'AI Chat'}
        <div className="absolute top-full left-3 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-gray-800"></div>
      </div>
    </motion.button>
  );
};

export default ChatbotButton;
