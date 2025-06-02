'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useProcessing, ProcessingStage } from '../contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo } from '@/services/beatDetectionService';

interface ProcessingStatusBannerProps {
  analysisResults?: {
    chords: ChordDetectionResult[];
    beats: BeatInfo[];
    downbeats?: number[];
    synchronizedChords: {chord: string, beatIndex: number, beatNum?: number}[];
    beatModel?: string;
    chordModel?: string;
    beatDetectionResult?: {
      time_signature?: number;
      bpm?: number;
    };
  } | null;
  audioDuration?: number;
  fromCache?: boolean;
  fromFirestoreCache?: boolean;
}

const ProcessingStatusBanner: React.FC<ProcessingStatusBannerProps> = ({
  analysisResults = null,
  audioDuration = 0,
  fromCache = false,
  fromFirestoreCache = false
}) => {
  const { stage, progress, statusMessage, getFormattedElapsedTime } = useProcessing();
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(true);
  const [dismissCountdown, setDismissCountdown] = useState(5);


  const autoDismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss the banner after 5 seconds when processing is complete
  useEffect(() => {
    // Clear any existing timeout when stage changes
    if (autoDismissTimeoutRef.current) {
      clearTimeout(autoDismissTimeoutRef.current);
      autoDismissTimeoutRef.current = null;
    }

    // Clear any existing countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Reset countdown when stage changes
    setDismissCountdown(5);

    // Reset visibility when starting new processing
    if (stage === 'beat-detection' || stage === 'chord-recognition') {
      setIsVisible(true);
    }

    // Set a new timeout when processing is complete
    if (stage === 'complete' && isVisible) {
      // Start the auto-dismiss countdown
      autoDismissTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000); // 5 seconds

      // Update the countdown every second
      countdownIntervalRef.current = setInterval(() => {
        setDismissCountdown(prev => {
          const newCount = prev <= 1 ? 0 : prev - 1;

          if (newCount <= 0) {
            // Clear the interval when we reach 0
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
          }
          return newCount;
        });
      }, 1000);
    }

    // Cleanup on unmount
    return () => {
      if (autoDismissTimeoutRef.current) {
        clearTimeout(autoDismissTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [stage, isVisible]);

  const getStageInfo = (stage: ProcessingStage) => {
    switch (stage) {
      case 'beat-detection':
        return {
          title: 'Detecting Beats',
          color: theme === 'dark' ? 'bg-blue-200 border-blue-300' : 'bg-blue-50 border-blue-200',
          textColor: theme === 'dark' ? 'text-blue-900' : 'text-blue-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
              <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
            </svg>
          )
        };
      case 'chord-recognition':
        return {
          title: 'Recognizing Chords',
          color: theme === 'dark' ? 'bg-purple-200 border-purple-300' : 'bg-purple-50 border-purple-200',
          textColor: theme === 'dark' ? 'text-purple-900' : 'text-purple-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'complete':
        return {
          title: 'Processing Complete',
          color: theme === 'dark' ? 'bg-green-200 border-green-300' : 'bg-green-50 border-green-200',
          textColor: theme === 'dark' ? 'text-green-900' : 'text-green-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'error':
        return {
          title: 'Error',
          color: theme === 'dark' ? 'bg-red-200 border-red-300' : 'bg-red-50 border-red-200',
          textColor: theme === 'dark' ? 'text-red-900' : 'text-red-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )
        };
      default:
        return {
          title: 'Processing',
          color: theme === 'dark' ? 'bg-content-bg border-gray-600' : 'bg-gray-50 border-gray-200',
          textColor: theme === 'dark' ? 'text-gray-300' : 'text-gray-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          )
        };
    }
  };

  const { title, color, textColor, icon } = getStageInfo(stage);

  if (!isVisible) return null;

  // Don't render during idle, downloading, and extracting stages
  if (stage === 'idle' || stage === 'downloading' || stage === 'extracting') {
    return null;
  }

  return (
    <div className="fixed top-16 left-0 right-0 z-40 transition-transform duration-300 ease-in-out">
      <div className="max-w-screen-lg mx-auto px-4">
        <div className={`flex items-center justify-between py-3 px-4 rounded-b-lg shadow-md ${color} border-x border-b`}>
          <div className="flex items-center space-x-3">
            {icon}

            <div>
              <p className={`font-medium text-base ${textColor}`}>
                {title}
              </p>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {stage === 'complete'
                  ? `Beat and chord analysis completed in ${getFormattedElapsedTime()}`
                  : statusMessage || `Processing ${title.toLowerCase()}...`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {stage === 'complete' && (
              <div className="flex space-x-1">
                {fromCache && (
                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center ${theme === 'dark' ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-800'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    Audio Cache
                  </span>
                )}
                {fromFirestoreCache && (
                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center ${theme === 'dark' ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                    </svg>
                    Results Cache
                  </span>
                )}

                {/* Auto-dismiss countdown indicator */}
                <div className={`relative text-xs px-2 py-0.5 rounded-full flex items-center overflow-hidden ${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-700 border border-gray-200'}`}>
                  {/* Progress bar background */}
                  <div
                    className={`absolute inset-0 transition-all duration-1000 ease-linear ${theme === 'dark' ? 'bg-blue-800' : 'bg-blue-100'}`}
                    style={{
                      width: `${(dismissCountdown / 5) * 100}%`,
                      opacity: 0.5
                    }}
                  />

                  {/* Content */}
                  <div className="relative flex items-center z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    Auto-close: {dismissCountdown}s
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setIsVisible(false)}
              className={`${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
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

export default ProcessingStatusBanner;
