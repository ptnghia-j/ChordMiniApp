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
  onStartAnalysis
}) => {
  // Only show when audio is extracted but not yet analyzed
  if (!isExtracted || isAnalyzed || isAnalyzing || hasError || stage === 'complete') {
    return null;
  }

  return (
    <div className="w-full p-4 rounded-lg bg-white dark:bg-content-bg overflow-visible transition-colors duration-300 border border-gray-200 dark:border-gray-600">
      <div className="flex flex-col h-full">
        <div className="mb-2">
          <h3 className="font-medium text-gray-800 dark:text-gray-100 transition-colors duration-300">
            Select Models for Analysis
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 transition-colors duration-300">
            Choose beat and chord detection models to analyze the audio.
          </p>
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
              Start Audio Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
