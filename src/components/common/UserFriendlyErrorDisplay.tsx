'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { createUserFriendlyError } from '@/utils/errorMessageUtils';
import { HiLightBulb } from 'react-icons/hi2';

interface UserFriendlyErrorDisplayProps {
  error: string;
  suggestion?: string;
  onTryAnotherVideo?: () => void;
  onRetry?: () => void;
  className?: string;
}

const UserFriendlyErrorDisplay: React.FC<UserFriendlyErrorDisplayProps> = ({
  error,
  suggestion,
  onTryAnotherVideo,
  onRetry,
  className = ''
}) => {
  const { theme } = useTheme();
  
  // Convert technical error to user-friendly message
  const friendlyError = createUserFriendlyError(error);

  // Use provided suggestion or the generated one
  const displaySuggestion = suggestion || friendlyError.suggestion;

  return (
    <div className={`${theme === 'dark' ? 'bg-red-900/30 border-red-600' : 'bg-red-50 border-red-200'} border rounded-lg p-4 ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0 mt-0.5">
          <svg 
            className={`h-5 w-5 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`} 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path 
              fillRule="evenodd" 
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
              clipRule="evenodd" 
            />
          </svg>
        </div>
        
        <div className="ml-3 flex-1">
          {/* Error Title */}
          <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-red-200' : 'text-red-800'}`}>
            {friendlyError.title}
          </h3>
          
          {/* Error Message */}
          <p className={`${theme === 'dark' ? 'text-red-300' : 'text-red-700'} mt-1 text-sm`}>
            {friendlyError.message}
          </p>

          {/* Suggestion */}
          {displaySuggestion && (
            <div className={`${theme === 'dark' ? 'text-red-300' : 'text-red-700'} mt-2 text-sm italic flex items-start gap-2`}>
              <HiLightBulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{displaySuggestion}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {friendlyError.showTryAnotherButton && onTryAnotherVideo && (
              <button
                onClick={onTryAnotherVideo}
                className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  theme === 'dark'
                    ? 'bg-red-800 text-red-200 hover:bg-red-700 border border-red-600'
                    : 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-300'
                }`}
              >
                <svg 
                  className="w-3 h-3 mr-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                  />
                </svg>
                Try Another Video
              </button>
            )}

            {onRetry && (
              <button
                onClick={onRetry}
                className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-300'
                }`}
              >
                <svg 
                  className="w-3 h-3 mr-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                  />
                </svg>
                Try Again
              </button>
            )}
          </div>



          {/* Alternative Options */}
          {friendlyError.isQuickTubeError && (
            <div className={`mt-3 p-2 rounded-md ${theme === 'dark' ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
              <div className={`text-xs ${theme === 'dark' ? 'text-blue-200' : 'text-blue-800'} font-medium mb-1 flex items-center gap-1`}>
                <HiLightBulb className="w-3 h-3" />
                <span>Alternative Options:</span>
              </div>
              <ul className={`text-xs ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'} space-y-0.5`}>
                <li>• Use the &quot;Upload Audio File&quot; option for immediate processing</li>
                <li>• Try searching for a different version of the song</li>
                <li>• Look for official music videos or verified uploads</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserFriendlyErrorDisplay;
