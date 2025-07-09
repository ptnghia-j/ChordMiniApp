'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface FramerTypewriterProps {
  text: string;
  speed?: number; // Characters per second
  delay?: number; // Initial delay before starting
  className?: string;
  showCursor?: boolean;
  cursorChar?: string;
  onComplete?: () => void;
}

const FramerTypewriter: React.FC<FramerTypewriterProps> = ({
  text,
  speed = 20, // Default 20 characters per second
  delay = 1000, // Default 1000ms delay
  className = '',
  showCursor = true,
  cursorChar = '|',
  onComplete
}) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // Reset state when text changes
    setDisplayedText('');

    // Start typing after initial delay
    const startTimeout = setTimeout(() => {
      // Animate the text typing
      let currentIndex = 0;
      const interval = setInterval(() => {
        currentIndex++;
        setDisplayedText(text.slice(0, currentIndex));

        if (currentIndex >= text.length) {
          clearInterval(interval);
          onComplete?.();
        }
      }, 1000 / speed); // Convert speed to interval

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, speed, delay, onComplete]);

  return (
    <span className={className}>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      >
        {displayedText}
      </motion.span>
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{
            duration: 1.06,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="inline-block"
          style={{ 
            color: 'currentColor'
          }}
        >
          {cursorChar}
        </motion.span>
      )}
    </span>
  );
};

export default FramerTypewriter;
