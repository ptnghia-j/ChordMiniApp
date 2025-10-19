'use client';

import React, { useState, useEffect, useRef } from 'react';


import { useProcessing, ProcessingStage } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import { BeatInfo } from '@/services/audio/beatDetectionService';
import { getAudioDurationFromUrl, isValidDuration } from '@/utils/audioDurationUtils';

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
  audioUrl?: string; // Add audioUrl for dynamic duration detection
  fromCache?: boolean;
  fromFirestoreCache?: boolean;
  videoId?: string; // Optional videoId to prefer cached file for duration detection
}

const ProcessingStatusBanner: React.FC<ProcessingStatusBannerProps> = React.memo(({
  audioDuration,
  audioUrl,
  fromCache = false,
  fromFirestoreCache = false,
  videoId
}) => {
  const { stage, statusMessage, getFormattedElapsedTime, elapsedTime } = useProcessing();
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false); // Start hidden by default
  const [dismissCountdown, setDismissCountdown] = useState(5);
  const [estimatedProgress, setEstimatedProgress] = useState(0);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [isDurationDetecting, setIsDurationDetecting] = useState(false);


  const autoDismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Detect audio duration when processing starts and no duration is available
  useEffect(() => {
    const shouldDetectDuration = (stage === 'beat-detection' || stage === 'chord-recognition') &&
                                 !audioDuration &&
                                 audioUrl &&
                                 !detectedDuration &&
                                 !isDurationDetecting;

    if (shouldDetectDuration) {
      setIsDurationDetecting(true);

      getAudioDurationFromUrl(audioUrl, videoId)
        .then((duration) => {
          if (isValidDuration(duration)) {
            setDetectedDuration(duration);
          } else {
            setDetectedDuration(180); // Fallback to 3 minutes
          }
        })
        .catch((error) => {
          console.error('❌ Duration detection failed:', error);
          setDetectedDuration(180); // Fallback to 3 minutes
        })
        .finally(() => {
          setIsDurationDetecting(false);
        });
    }

    // Reset detected duration when stage changes to idle
    if (stage === 'idle') {
      setDetectedDuration(null);
      setIsDurationDetecting(false);
    }
  }, [stage, audioDuration, audioUrl, detectedDuration, isDurationDetecting, videoId]);

  // Calculate estimated progress for beat and chord detection
  useEffect(() => {
    const elapsedSeconds = elapsedTime / 1000;

    if (stage === 'beat-detection' || stage === 'chord-recognition') {
      // Use the best available duration: provided > detected > fallback
      const effectiveDuration = audioDuration || detectedDuration;

      if (effectiveDuration && effectiveDuration > 0) {
        // Use 1:0.35 ratio: x minutes audio = 0.35 * x minutes processing
        const estimatedTime = 0.35 * effectiveDuration;
        const progress = Math.min((elapsedSeconds / estimatedTime) * 100, 100);
        setEstimatedProgress(progress);

      } else {
        // Fallback: Use time-based estimation when duration is not available yet
        // Show a more conservative progress while duration is being detected
        const fallbackDuration = 180; // 3 minutes in seconds
        const estimatedTime = fallbackDuration; // 1:1 ratio
        const fallbackProgress = Math.min((elapsedSeconds / estimatedTime) * 100,
                                         isDurationDetecting ? 15 : 30); // Lower cap while detecting
        setEstimatedProgress(fallbackProgress);
      }
    } else {
      setEstimatedProgress(0);
    }
  }, [elapsedTime, stage, audioDuration, detectedDuration, isDurationDetecting]);



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

    // Show banner when processing starts
    if (stage === 'beat-detection' || stage === 'chord-recognition') {
      setIsVisible(true);
    }

    // Hide banner when returning to idle state
    if (stage === 'idle') {
      setIsVisible(false);
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
          color: theme === 'dark' ? 'bg-blue-900/80 border-blue-600' : 'bg-blue-50/90 border-blue-200',
          textColor: theme === 'dark' ? 'text-blue-200' : 'text-blue-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-500'}`} viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
              <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
            </svg>
          )
        };
      case 'chord-recognition':
        return {
          title: 'Recognizing Chords',
          color: theme === 'dark' ? 'bg-purple-900/80 border-purple-600' : 'bg-purple-50/90 border-purple-200',
          textColor: theme === 'dark' ? 'text-purple-200' : 'text-purple-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-500'}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'complete':
        return {
          title: 'Processing Complete',
          color: theme === 'dark' ? 'bg-green-900/80 border-green-600' : 'bg-green-50/90 border-green-200',
          textColor: theme === 'dark' ? 'text-green-200' : 'text-green-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-green-400' : 'text-green-500'}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'error':
        return {
          title: 'Error',
          color: theme === 'dark' ? 'bg-red-900/80 border-red-600' : 'bg-red-50/90 border-red-200',
          textColor: theme === 'dark' ? 'text-red-200' : 'text-red-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-red-400' : 'text-red-500'}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )
        };
      default:
        return {
          title: 'Processing',
          color: theme === 'dark' ? 'bg-gray-800/80 border-gray-600' : 'bg-gray-50/90 border-gray-200',
          textColor: theme === 'dark' ? 'text-gray-200' : 'text-gray-700',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          )
        };
    }
  };

  const { title, color, textColor, icon } = getStageInfo(stage);

  if (!isVisible) return null;

  // Don't render during idle, downloading, and extracting stages, or when not visible
  if (stage === 'idle' || stage === 'downloading' || stage === 'extracting' || !isVisible) {
    return null;
  }

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[80] transition-all duration-300 ease-in-out">
        <div className="px-4">
        {/* Single banner that adapts based on stage */}
        <div className={`flex items-center justify-between py-3 px-4 rounded-lg shadow-lg backdrop-blur-sm ${color} border`}>
          <div className="flex items-center space-x-3">
            {/* Show 3-dot animation for processing stages, icon for others */}
            {(stage === 'beat-detection' || stage === 'chord-recognition') ? (
              <div className="flex space-x-1">
                <div className={`w-2 h-2 rounded-full bounce-dot bounce-dot-1 ${theme === 'dark' ? 'bg-blue-400' : 'bg-blue-500'}`}></div>
                <div className={`w-2 h-2 rounded-full bounce-dot bounce-dot-2 ${theme === 'dark' ? 'bg-blue-400' : 'bg-blue-500'}`}></div>
                <div className={`w-2 h-2 rounded-full bounce-dot bounce-dot-3 ${theme === 'dark' ? 'bg-blue-400' : 'bg-blue-500'}`}></div>
              </div>
            ) : (
              icon
            )}

            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <p className={`font-medium text-base ${textColor}`}>
                  {title}
                </p>
                {(stage === 'beat-detection' || stage === 'chord-recognition') && (
                  <p className={`text-sm ${textColor}`}>
                    {estimatedProgress > 0 ? Math.round(estimatedProgress) : 0}%
                    {(!audioDuration && !detectedDuration) && (
                      <span className="text-xs opacity-75 ml-1">
                        {isDurationDetecting ? ' ...' : ' ~'}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Progress bar for beat and chord detection - always show during processing stages */}
              {(stage === 'beat-detection' || stage === 'chord-recognition') && (
                <div className={`w-full rounded-full h-1.5 mb-2 ${
                  stage === 'beat-detection'
                    ? (theme === 'dark' ? 'bg-blue-800/50' : 'bg-blue-200')
                    : (theme === 'dark' ? 'bg-purple-800/50' : 'bg-purple-200')
                }`}>
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ease-in-out ${
                      stage === 'beat-detection'
                        ? (theme === 'dark' ? 'bg-blue-400' : 'bg-blue-500')
                        : (theme === 'dark' ? 'bg-purple-400' : 'bg-purple-500')
                    } ${(!audioDuration && !detectedDuration) ? 'opacity-75' : ''}`}
                    style={{
                      width: `${Math.max(estimatedProgress, 2)}%`, // Minimum 2% width for visibility
                      minWidth: estimatedProgress === 0 ? '8px' : 'auto' // Show at least 8px when starting
                    }}
                  ></div>
                </div>
              )}

              <p className={`text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-600'}`}>
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
                  <span className={`text-xs px-2 py-0.5 border-2 rounded-md flex items-center ${theme === 'dark' ? 'border-blue-500 bg-blue-900/20 text-blue-300' : 'border-blue-400 bg-blue-50 text-blue-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    Audio Cache
                  </span>
                )}
                {fromFirestoreCache && (
                  <span className={`text-xs px-2 py-0.5 border-2 rounded-md flex items-center ${theme === 'dark' ? 'border-green-500 bg-green-900/20 text-green-300' : 'border-green-400 bg-green-50 text-green-700'}`}>
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
});

ProcessingStatusBanner.displayName = 'ProcessingStatusBanner';

export default ProcessingStatusBanner;
