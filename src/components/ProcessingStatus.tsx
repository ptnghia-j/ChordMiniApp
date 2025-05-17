'use client';

import React from 'react';
import ProgressBar from './ProgressBar';
import { useProcessing, ProcessingStage } from '../contexts/ProcessingContext';

interface ProcessingStatusProps {
  className?: string;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ className = '' }) => {
  const { stage, progress, statusMessage, getFormattedElapsedTime } = useProcessing();

  if (stage === 'idle') {
    return null;
  }

  const getStageInfo = (stage: ProcessingStage) => {
    switch (stage) {
      case 'downloading':
        return {
          title: 'Downloading YouTube Video',
          isIndeterminate: progress === 0,
        };
      case 'extracting':
        return {
          title: 'Extracting Audio',
          isIndeterminate: progress === 0,
        };
      case 'beat-detection':
        return {
          title: 'Detecting Beats',
          isIndeterminate: true, // Beat detection doesn't have progress updates yet
        };
      case 'chord-recognition':
        return {
          title: 'Recognizing Chords',
          isIndeterminate: true, // Chord recognition doesn't have progress updates yet
        };
      case 'complete':
        return {
          title: 'Processing Complete',
          isIndeterminate: false,
        };
      case 'error':
        return {
          title: 'Error',
          isIndeterminate: false,
        };
      default:
        return {
          title: 'Processing',
          isIndeterminate: true,
        };
    }
  };

  const { title, isIndeterminate } = getStageInfo(stage);

  return (
    <div className={`bg-white border border-blue-800 rounded-lg p-4 shadow-md ${className}`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-medium">{title}</h3>
        {/* Only show the timer during active processing (not when complete) */}
        {stage !== 'idle' && stage !== 'error' && stage !== 'complete' && stage !== 'downloading' && stage !== 'extracting' && (
          <div className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-700 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            {getFormattedElapsedTime()}
          </div>
        )}
      </div>
      <ProgressBar
        progress={progress}
        status={statusMessage || `Processing ${title.toLowerCase()}...`}
        isIndeterminate={isIndeterminate}
      />

      {stage === 'error' && (
        <div className="mt-2 text-red-500 text-sm">
          {statusMessage}
        </div>
      )}

      {stage === 'complete' && (
        <div className="mt-2 text-green-600 text-sm flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Beat and chord analysis completed in {getFormattedElapsedTime()}
        </div>
      )}
    </div>
  );
};

export default ProcessingStatus;
