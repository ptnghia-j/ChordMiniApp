'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex items-center">
      {/* Sun icon for light mode */}
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={`h-4 w-4 mr-1.5 ${theme === 'dark' ? 'text-gray-400' : 'text-yellow-500'}`} 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" 
        />
      </svg>
      
      {/* Toggle Switch */}
      <label htmlFor="theme-toggle" className="toggle-label relative inline-block w-10 h-5 rounded-full bg-gray-300 dark:bg-gray-600 cursor-pointer transition-colors">
        <input 
          id="theme-toggle" 
          type="checkbox" 
          className="toggle-checkbox sr-only" 
          checked={theme === 'dark'}
          onChange={toggleTheme}
        />
        <span 
          className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full transition-transform duration-300 ease-in-out ${
            theme === 'dark' ? 'transform translate-x-5 bg-blue-500' : 'bg-white'
          }`}
        ></span>
      </label>
      
      {/* Moon icon for dark mode */}
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={`h-4 w-4 ml-1.5 ${theme === 'dark' ? 'text-blue-300' : 'text-gray-400'}`} 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" 
        />
      </svg>
    </div>
  );
};

export default ThemeToggle;
