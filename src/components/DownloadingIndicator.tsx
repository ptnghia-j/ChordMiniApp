'use client';

import React, { useState, useEffect } from 'react';
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';

interface DownloadingIndicatorProps {
  isVisible: boolean;
  videoDuration?: number; // Duration in seconds
}

const DownloadingIndicator: React.FC<DownloadingIndicatorProps> = ({
  isVisible,
  videoDuration
}) => {
  // Get progress, stage, and statusMessage from the ProcessingContext
  const { progress, stage, statusMessage, elapsedTime } = useProcessing();
  const { theme } = useTheme();
  const [estimatedProgress, setEstimatedProgress] = useState(0);

  // Calculate estimated progress based on time elapsed and video duration
  useEffect(() => {
    if (!isVisible || !videoDuration) return;

    const elapsedSeconds = elapsedTime / 1000;

    if (stage === 'downloading') {
      // For downloading: estimate 30 seconds for 5 minutes of video
      // Formula: 6 seconds per minute of video
      const estimatedDownloadTime = (videoDuration / 60) * 6;
      const downloadProgress = Math.min((elapsedSeconds / estimatedDownloadTime) * 100, 95);
      setEstimatedProgress(downloadProgress);
    } else if (stage === 'extracting') {
      // For extraction: estimate 5-10 seconds regardless of video length
      const estimatedExtractionTime = 8;
      const extractionProgress = Math.min((elapsedSeconds / estimatedExtractionTime) * 100, 95);
      setEstimatedProgress(extractionProgress);
    }
  }, [elapsedTime, stage, videoDuration, isVisible]);

  if (!isVisible) return null;

  // Use estimated progress if available, otherwise fall back to context progress
  const displayProgress = estimatedProgress > 0 ? estimatedProgress : progress;

  return (
    <div className="w-full z-40 transition-all duration-300 ease-in-out mb-4">
      <div className="max-w-screen-lg mx-auto px-4">
        <div className={`flex items-center justify-between py-3 px-4 rounded-lg shadow-md border ${
          theme === 'dark'
            ? 'bg-yellow-900/30 border-yellow-600'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center space-x-3 w-full">
            {/* Animated spinner */}
            <div className={`animate-spin h-5 w-5 ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-500'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <p className={`font-medium text-sm ${
                  theme === 'dark' ? 'text-yellow-200' : 'text-yellow-800'
                }`}>
                  {stage === 'downloading' ? 'Downloading YouTube Video...' : 'Extracting Audio...'}
                </p>
                <p className={`text-xs ${
                  theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'
                }`}>{Math.round(displayProgress)}%</p>
              </div>

              {/* Progress bar */}
              <div className={`w-full rounded-full h-1.5 ${
                theme === 'dark' ? 'bg-yellow-800/50' : 'bg-yellow-200'
              }`}>
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ease-in-out ${
                    theme === 'dark' ? 'bg-yellow-400' : 'bg-yellow-500'
                  }`}
                  style={{ width: `${displayProgress}%` }}
                ></div>
              </div>

              <p className={`text-xs mt-1 ${
                theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
              }`}>
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
