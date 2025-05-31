'use client';

import React from 'react';
import ProgressBar from './ProgressBar';
import { useProcessing, ProcessingStage } from '../contexts/ProcessingContext';
import { ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo } from '@/services/beatDetectionService';

interface ProcessingStatusProps {
  className?: string;
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

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  className = '',
  analysisResults = null,
  audioDuration = 0,
  fromCache = false,
  fromFirestoreCache = false
}) => {
  const { stage, progress, statusMessage, getFormattedElapsedTime } = useProcessing();

  // Format time helper function (mm:ss)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Hide during idle, downloading, and extracting stages
  if (stage === 'idle' || stage === 'downloading' || stage === 'extracting') {
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
    <div className={`bg-white border border-blue-800 rounded-lg p-6 shadow-md ${className}`}>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-xl font-medium text-gray-800">{title}</h3>
        {/* Only show the timer during active processing (not when complete) */}
        {(stage === 'beat-detection' || stage === 'chord-recognition') && (
          <div className="text-sm font-mono bg-gray-100 px-3 py-2 rounded-md text-gray-700 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
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
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
          {statusMessage}
        </div>
      )}

      {stage === 'complete' && (
        <div className="mt-4">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start">
            <div className="text-green-600 text-base flex items-center mb-4 md:mb-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Beat and chord analysis completed in {getFormattedElapsedTime()}
            </div>

            {analysisResults && (
              <div className="md:ml-6 md:flex-grow">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium text-gray-700">Analysis Results</h4>
                  <div className="flex space-x-2">
                    {fromCache && (
                      <span className="text-xs px-3 py-1 bg-blue-100 text-blue-800 rounded-full flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                        Audio Cache
                      </span>
                    )}
                    {fromFirestoreCache && (
                      <span className="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                        DB Cache
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm text-gray-700">
                  <p className="flex items-baseline">
                    <span className="font-medium mr-1 whitespace-nowrap">Beat model:</span>
                    <span className="truncate">{analysisResults.beatModel || 'Unknown'}</span>
                  </p>
                  <p>
                    <span className="font-medium mr-1">Beats:</span> {analysisResults.beats && analysisResults.beats.length ? analysisResults.beats.length : 0}
                  </p>
                  <p>
                    <span className="font-medium mr-1">BPM:</span> {
                      analysisResults.beatDetectionResult?.bpm ||
                      (analysisResults.beats && analysisResults.beats.length > 1 &&
                       analysisResults.beats[0] &&
                       analysisResults.beats[analysisResults.beats.length - 1] ?
                        Math.round(60 / ((analysisResults.beats[analysisResults.beats.length - 1].time - analysisResults.beats[0].time) / analysisResults.beats.length)) :
                        'N/A')
                    }
                  </p>
                  <p>
                    <span className="font-medium mr-1">Time Sig:</span> {analysisResults.beatDetectionResult?.time_signature ? `${analysisResults.beatDetectionResult.time_signature}/4` : '4/4'}
                  </p>
                  <p className="flex items-baseline">
                    <span className="font-medium mr-1 whitespace-nowrap">Chord model:</span>
                    <span className="truncate">{analysisResults.chordModel || 'Unknown'}</span>
                  </p>
                  <p>
                    <span className="font-medium mr-1">Chords:</span> {analysisResults.chords && analysisResults.chords.length ? analysisResults.chords.length : 0}
                  </p>
                  {analysisResults.downbeats && analysisResults.downbeats.length && (
                    <p>
                      <span className="font-medium mr-1">Downbeats:</span> {analysisResults.downbeats.length}
                    </p>
                  )}
                  <p className="md:col-span-3">
                    <span className="font-medium mr-1">Duration:</span> {formatTime(audioDuration)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingStatus;
