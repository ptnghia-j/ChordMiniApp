'use client';

import React from 'react';
import { useProcessing } from '@/contexts/ProcessingContext';

interface DownloadingIndicatorProps {
  isVisible: boolean;
}

const DownloadingIndicator: React.FC<DownloadingIndicatorProps> = ({
  isVisible
}) => {
  // Get progress, stage, and statusMessage from the ProcessingContext
  const { progress, stage, statusMessage } = useProcessing();

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out translate-y-0">
      <div className="max-w-screen-lg mx-auto px-4">
        <div className="flex items-center justify-between py-3 px-4 rounded-b-lg shadow-md bg-yellow-50 border-x border-b border-yellow-200">
          <div className="flex items-center space-x-3 w-full">
            {/* Animated spinner */}
            <div className="animate-spin h-5 w-5 text-yellow-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <p className="font-medium text-sm text-yellow-800">
                  {stage === 'downloading' ? 'Downloading YouTube Video...' : 'Extracting Audio...'}
                </p>
                <p className="text-xs text-yellow-700">{Math.round(progress)}%</p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-yellow-200 rounded-full h-1.5">
                <div
                  className="bg-yellow-500 h-1.5 rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <p className="text-xs text-yellow-600 mt-1">
                {statusMessage || 'This may take a moment for longer videos...'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadingIndicator;
