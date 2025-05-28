'use client';

import { useState, useEffect } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number; // Characters per second
  delay?: number; // Initial delay before starting
  className?: string;
  showCursor?: boolean;
  cursorChar?: string;
  onComplete?: () => void;
}

const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  speed = 50, // Default 50 characters per second
  delay = 500, // Default 500ms delay
  className = '',
  showCursor = true,
  cursorChar = '|',
  onComplete
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [showCursorBlink, setShowCursorBlink] = useState(true);

  // Calculate typing interval based on speed (characters per second)
  const typingInterval = 1000 / speed;

  useEffect(() => {
    // Reset state when text changes
    setDisplayedText('');
    setCurrentIndex(0);
    setIsComplete(false);
    setShowCursorBlink(true);

    // Start typing after initial delay
    const startTimeout = setTimeout(() => {
      const typeNextChar = () => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1));
          setCurrentIndex(prev => prev + 1);
        } else {
          setIsComplete(true);
          onComplete?.();
        }
      };

      // Start typing immediately after delay
      typeNextChar();
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, delay, onComplete]);

  useEffect(() => {
    if (currentIndex < text.length && currentIndex > 0) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(prev => prev + 1);
      }, typingInterval);

      return () => clearTimeout(timeout);
    } else if (currentIndex >= text.length) {
      setIsComplete(true);
      onComplete?.();
    }
  }, [currentIndex, text, typingInterval, onComplete]);

  // Cursor blinking effect
  useEffect(() => {
    if (!showCursor) return;

    const blinkInterval = setInterval(() => {
      setShowCursorBlink(prev => !prev);
    }, 530); // Slightly different from 500ms for more natural feel

    return () => clearInterval(blinkInterval);
  }, [showCursor]);

  return (
    <span className={className}>
      {displayedText}
      {showCursor && (
        <span 
          className={`inline-block transition-opacity duration-100 ${
            showCursorBlink ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ 
            animation: isComplete ? 'none' : undefined,
            color: 'currentColor'
          }}
        >
          {cursorChar}
        </span>
      )}
    </span>
  );
};

export default TypewriterText;
