'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface ExtractionNotificationProps {
  isVisible: boolean;
  fromCache: boolean;
  onDismiss: () => void;
  onRefresh: () => void;
}

const ExtractionNotification: React.FC<ExtractionNotificationProps> = ({
  isVisible,
  fromCache,
  onDismiss,
  onRefresh
}) => {
  const [isShowing, setIsShowing] = useState(false);
  const { theme } = useTheme();

  // Handle animation states
  useEffect(() => {
    if (isVisible) {
      setIsShowing(true);
    } else {
      // Add a small delay before hiding to allow for animation
      const timer = setTimeout(() => {
        setIsShowing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Auto-dismiss after 5 seconds for all notifications
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onDismiss]);

  if (!isShowing) return null;

  return (
    <div className={`w-full z-40 transition-all duration-300 ease-in-out mb-4 ${
      isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
    }`}>
      <div className="max-w-screen-lg mx-auto px-4">
        <div className={`flex items-center justify-between py-2 px-4 rounded-lg shadow-md border ${
          fromCache
            ? theme === 'dark'
              ? 'bg-blue-900/30 border-blue-600'
              : 'bg-blue-50 border-blue-200'
            : theme === 'dark'
              ? 'bg-green-900/30 border-green-600'
              : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center space-x-2">
            {fromCache ? (
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-500'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm11 1H6v8l4-2 4 2V6z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-green-400' : 'text-green-500'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}

            <div>
              <p className={`font-medium text-sm ${
                fromCache
                  ? theme === 'dark' ? 'text-blue-200' : 'text-blue-800'
                  : theme === 'dark' ? 'text-green-200' : 'text-green-800'
              }`}>
                {fromCache ? 'Audio Loaded from Cache' : 'Audio Extracted Successfully'}
              </p>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                {fromCache
                  ? 'Using cached audio file. Select models to begin analysis.'
                  : 'Audio extraction complete. Select models to begin analysis.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {fromCache && (
              <button
                onClick={onRefresh}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Refresh
              </button>
            )}

            <button
              onClick={onDismiss}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Dismiss notification"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtractionNotification;
