'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface LyricsToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * Floating toggle button for the lyrics panel
 * Follows the same design pattern as the chatbot toggle button
 */
const LyricsToggleButton: React.FC<LyricsToggleButtonProps> = ({
  isOpen,
  onClick,
  className = ''
}) => {
  return (
    <motion.button
      onClick={onClick}
      className={`
        fixed z-[9999]
        w-14 h-14 rounded-full
        bg-green-600 hover:bg-green-700
        text-white shadow-lg
        flex items-center justify-center
        transition-all duration-300
        hover:scale-110 active:scale-95
        
        /* Desktop positioning - positioned to the left of chatbot button */
        bottom-6 right-24

        /* Mobile positioning - stack vertically */
        max-sm:bottom-24 max-sm:right-6
        
        ${className}
      `}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      title={isOpen ? 'Close lyrics' : 'Open lyrics'}
    >
      <motion.div
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {isOpen ? (
          // Close icon
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        ) : (
          // Music/lyrics icon
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" 
            />
          </svg>
        )}
      </motion.div>
      
      {/* Notification dot for new features */}
      {!isOpen && (
        <motion.div
          className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        />
      )}
    </motion.button>
  );
};

export default LyricsToggleButton;
