'use client';

import React, { useState } from 'react';
import { ChordDetectionResult } from '@/services/chordRecognitionService';
import { BeatInfo } from '@/services/beatDetectionService';

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
        <h3 className="text-lg font-medium text-gray-800">Analysis Summary</h3>
        <button className="text-gray-500 hover:text-gray-700">
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

      {/* Summary cards - always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
        <div className="bg-blue-50 p-3 rounded-lg border-2 border-blue-700">
          <p className="text-sm text-gray-600 font-medium">Total Chords</p>
          <p className="text-xl font-semibold text-blue-800">
            {analysisResults.chords && analysisResults.chords.length ? analysisResults.chords.length : 0}
          </p>
        </div>
        <div className="bg-green-50 p-3 rounded-lg border-2 border-blue-700">
          <p className="text-sm text-gray-600 font-medium">Total Beats</p>
          <p className="text-xl font-semibold text-green-800">
            {analysisResults.beats && analysisResults.beats.length ? analysisResults.beats.length : 0}
          </p>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg border-2 border-blue-700">
          <p className="text-sm text-gray-600 font-medium">BPM (Estimated)</p>
          <p className="text-xl font-semibold text-purple-800">
            {analysisResults.beatDetectionResult?.bpm ||
              (analysisResults.beats && analysisResults.beats.length > 1 && analysisResults.beats[0] && analysisResults.beats[1]
                ? Math.round(60 / (analysisResults.beats[1].time - analysisResults.beats[0].time))
                : 'N/A')}
          </p>
        </div>
        <div className="bg-amber-50 p-3 rounded-lg border-2 border-blue-700">
          <p className="text-sm text-gray-600 font-medium">Most Common Chord</p>
          <p className="text-xl font-semibold text-amber-800">
            {(() => {
              try {
                return getMostCommonChord();
              } catch (error) {
                console.error('Error displaying most common chord:', error);
                return 'N/A';
              }
            })()}
          </p>
        </div>
      </div>

      {/* Detailed information - only visible when expanded */}
      {isExpanded && (
        <div className="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2 text-gray-700">
            <p className="flex items-baseline">
              <span className="font-medium mr-1 whitespace-nowrap">Beat model:</span>
              <span className="truncate">{analysisResults.beatModel || 'Unknown'}</span>
            </p>
            <p>
              <span className="font-medium mr-1">Time Sig:</span> {analysisResults.beatDetectionResult?.time_signature ? `${analysisResults.beatDetectionResult.time_signature}/4` : '4/4'}
            </p>
            {analysisResults.downbeats && analysisResults.downbeats.length && (
              <p>
                <span className="font-medium mr-1">Downbeats:</span> {analysisResults.downbeats.length}
              </p>
            )}
            <p className="flex items-baseline">
              <span className="font-medium mr-1 whitespace-nowrap">Chord model:</span>
              <span className="truncate">{analysisResults.chordModel || 'Unknown'}</span>
            </p>
            <p>
              <span className="font-medium mr-1">Duration:</span> {formatTime(audioDuration)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisSummary;
