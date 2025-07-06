'use client';

import React from 'react';
import BeatModelSelector from '@/components/BeatModelSelector';
import ChordModelSelector from '@/components/ChordModelSelector';

// Define the detector types to match the main page
type BeatDetectorType = 'auto' | 'madmom' | 'beat-transformer';
type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

interface AnalysisControlsProps {
  isExtracted: boolean;
  isAnalyzed: boolean;
  isAnalyzing: boolean;
  hasError: boolean;
  stage: string;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  onBeatDetectorChange: (detector: BeatDetectorType) => void;
  onChordDetectorChange: (detector: ChordDetectorType) => void;
  onStartAnalysis: () => void;
  cacheAvailable?: boolean;
  cacheCheckCompleted?: boolean;
}

export const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  isExtracted,
  isAnalyzed,
  isAnalyzing,
  hasError,
  stage,
  beatDetector,
  chordDetector,
  onBeatDetectorChange,
  onChordDetectorChange,
  onStartAnalysis,
  cacheAvailable = false,
  cacheCheckCompleted = false
}) => {
  // Only show when audio is extracted but not yet analyzed
  if (!isExtracted || isAnalyzed || isAnalyzing || hasError || stage === 'complete') {
    return null;
  }

  return (
    <div className="w-full p-4 rounded-lg bg-white dark:bg-content-bg overflow-visible transition-colors duration-300">
      <div className="flex flex-col h-full">
        <div className="mb-2">
          <h3 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">
            Select Models for Analysis
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 transition-colors duration-300">
            Choose beat and chord detection models to analyze the audio.
          </p>

          {/* Cache availability indicator */}
          {cacheCheckCompleted && (
            <div className={`mt-2 p-2 rounded-md border-2 ${
              cacheAvailable
                ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500'
                : 'bg-orange-50 dark:bg-orange-900/20 border-orange-400 dark:border-orange-500'
            }`}>
              {cacheAvailable ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 bg-green-500 rounded-full border border-green-600"></span>
                  <span className="text-green-700 dark:text-green-300">
                    Cached results available for {beatDetector} + {chordDetector}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 bg-orange-500 rounded-full border border-orange-600"></span>
                  <span className="text-orange-700 dark:text-orange-300">
                    No cached results for {beatDetector} + {chordDetector} - will run new analysis
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start overflow-visible">
          <div className="w-full md:w-1/3 relative z-40">
            <BeatModelSelector
              onChange={onBeatDetectorChange}
              defaultValue={beatDetector}
            />
          </div>

          <div className="w-full md:w-1/3 relative z-30">
            <ChordModelSelector
              selectedModel={chordDetector}
              onModelChange={onChordDetectorChange}
            />
          </div>

          <div className="w-full md:w-1/3 flex items-center justify-center mt-4 md:mt-0">
            <button
              onClick={onStartAnalysis}
              className="w-full px-4 py-2.5 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors font-medium"
            >
              {cacheCheckCompleted && cacheAvailable
                ? 'Load Cached Results'
                : 'Start Audio Analysis'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
