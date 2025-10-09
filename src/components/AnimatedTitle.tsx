'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface AnimatedTitleProps {
  text: string;
  className?: string;
}

export default function AnimatedTitle({ text, className = '' }: AnimatedTitleProps) {
  const { theme } = useTheme();
  const [animationKey, setAnimationKey] = useState(0);

  // Restart animation every 45 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationKey(prev => prev + 1);
    }, 45000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Base text */}
      <h2
        className={`text-4xl md:text-5xl font-bold transition-colors duration-300 ${
          theme === 'dark' ? 'text-gray-100' : 'text-gray-800'
        }`}
      >
        {text}
      </h2>

      {/* Animated overlay text with gradient sweep - Optimized with will-change */}
      <h2
        key={animationKey}
        className={`absolute inset-0 text-4xl md:text-5xl font-bold bg-gradient-to-r ${
          theme === 'dark'
            ? 'from-transparent via-blue-400 to-transparent'
            : 'from-transparent via-blue-600 to-transparent'
        } bg-clip-text text-transparent animate-sweep-text`}
        style={{
          backgroundSize: '200% 100%',
          willChange: 'background-position, opacity'
        }}
      >
        {text}
      </h2>
    </div>
  );
}
