'use client';

import React, { useState } from 'react';
import { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import { BeatInfo } from '@/services/audio/beatDetectionService';

interface AnalysisSummaryProps {
  analysisResults: {
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
  };
  audioDuration?: number;
}

const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({
  analysisResults,
  audioDuration = 0
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Format time helper function (mm:ss)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Find the most common chord
  const getMostCommonChord = () => {
    // Check if synchronizedChords exists and has forEach method
    if (!analysisResults.synchronizedChords || !analysisResults.synchronizedChords.forEach) {
      return 'N/A';
    }

    const counts: Record<string, number> = {};

    try {
      analysisResults.synchronizedChords.forEach(item => {
        if (item && item.chord) {
          counts[item.chord] = (counts[item.chord] || 0) + 1;
        }
      });

      let mostCommonChord = '';
      let highestCount = 0;

      for (const chord in counts) {
        if (counts[chord] > highestCount) {
          mostCommonChord = chord;
          highestCount = counts[chord];
        }
      }

      return mostCommonChord || 'N/A';
    } catch (error) {
      console.error('Error calculating most common chord:', error);
      return 'N/A';
    }
  };

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">Analysis Summary</h3>
        <button className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-300">
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>

      {/* Summary tags - compact display */}
      <div className="flex flex-wrap gap-2 mt-3">
        <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 transition-colors duration-300">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Chords: {analysisResults.chords && analysisResults.chords.length ? analysisResults.chords.length : 0}
          </span>
        </div>

        <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 transition-colors duration-300">
          <span className="text-sm font-medium text-green-800 dark:text-green-200">
            Beats: {analysisResults.beats && analysisResults.beats.length ? analysisResults.beats.length : 0}
          </span>
        </div>

        <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 transition-colors duration-300">
          <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
            BPM: {analysisResults.beatDetectionResult?.bpm ||
              (analysisResults.beats && analysisResults.beats.length > 1 && analysisResults.beats[0] && analysisResults.beats[1]
                ? Math.round(60 / (analysisResults.beats[1].time - analysisResults.beats[0].time))
                : 'N/A')}
          </span>
        </div>

        <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 transition-colors duration-300">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Time: {analysisResults.beatDetectionResult?.time_signature ?
              (analysisResults.beatDetectionResult.time_signature === 6 ? '6/8' : `${analysisResults.beatDetectionResult.time_signature}/4`)
              : '4/4'}
          </span>
        </div>

        <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 transition-colors duration-300">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Common: {(() => {
              try {
                return getMostCommonChord();
              } catch (error) {
                console.error('Error displaying most common chord:', error);
                return 'N/A';
              }
            })()}
          </span>
        </div>
      </div>

      {/* Detailed information - only visible when expanded */}
      {isExpanded && (
        <div className="mt-4 bg-gray-50 dark:bg-content-bg p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm transition-colors duration-300">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2 text-gray-700 dark:text-gray-300 transition-colors duration-300">
            <p className="flex items-baseline">
              <span className="font-medium mr-1 whitespace-nowrap text-gray-700 dark:text-gray-300 transition-colors duration-300">Beat model:</span>
              <span className="truncate text-gray-700 dark:text-gray-300 transition-colors duration-300">{analysisResults.beatModel || 'Unknown'}</span>
            </p>
            <p>
              <span className="font-medium mr-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">Time Sig:</span> {analysisResults.beatDetectionResult?.time_signature ? `${analysisResults.beatDetectionResult.time_signature}/4` : '4/4'}
            </p>
            {analysisResults.downbeats && analysisResults.downbeats.length && (
              <p>
                <span className="font-medium mr-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">Downbeats:</span> {analysisResults.downbeats.length}
              </p>
            )}
            <p className="flex items-baseline">
              <span className="font-medium mr-1 whitespace-nowrap text-gray-700 dark:text-gray-300 transition-colors duration-300">Chord model:</span>
              <span className="truncate text-gray-700 dark:text-gray-300 transition-colors duration-300">{analysisResults.chordModel || 'Unknown'}</span>
            </p>
            <p>
              <span className="font-medium mr-1 text-gray-700 dark:text-gray-300 transition-colors duration-300">Duration:</span> {formatTime(audioDuration)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisSummary;
