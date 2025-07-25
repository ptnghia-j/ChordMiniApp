'use client';

import React from 'react';
import HeroUIBeatModelSelector from '@/components/HeroUIBeatModelSelector';
import HeroUIChordModelSelector from '@/components/HeroUIChordModelSelector';
import { Button, Chip } from '@heroui/react';

// Define the detector types to match the main page
type BeatDetectorType = 'madmom' | 'beat-transformer';
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
  // PERFORMANCE FIX: Always show model selection UI, regardless of extraction state
  // This allows users to select models immediately, even during cold starts
  // Only hide when analysis is actually complete (isAnalyzed is true)
  if (isAnalyzed || (stage === 'complete' && isAnalyzed)) {
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

          {/* Status indicator */}
          <div className="mt-2">
            {!isExtracted ? (
              <Chip
                color="primary"
                variant="flat"
                size="sm"
                startContent={
                  <span className="w-2 h-2 rounded-full bg-primary-500" />
                }
              >
                Audio extraction in progress - models ready for selection
              </Chip>
            ) : cacheCheckCompleted ? (
              <Chip
                color={cacheAvailable ? "success" : "warning"}
                variant="flat"
                size="sm"
                startContent={
                  <span className={`w-2 h-2 rounded-full ${
                    cacheAvailable ? 'bg-success-500' : 'bg-warning-500'
                  }`} />
                }
              >
                {cacheAvailable
                  ? `Cached results available for ${beatDetector} + ${chordDetector}`
                  : `No cached results for ${beatDetector} + ${chordDetector} - will run new analysis`
                }
              </Chip>
            ) : (
              <Chip
                color="default"
                variant="flat"
                size="sm"
                startContent={
                  <span className="w-2 h-2 rounded-full bg-default-500" />
                }
              >
                Checking for cached results...
              </Chip>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start overflow-visible">
          <div className="w-full md:w-1/3 relative z-40">
            <HeroUIBeatModelSelector
              onChange={onBeatDetectorChange}
              defaultValue={beatDetector}
            />
          </div>

          <div className="w-full md:w-1/3 relative z-30">
            <HeroUIChordModelSelector
              selectedModel={chordDetector}
              onModelChange={onChordDetectorChange}
            />
          </div>

          <div className="w-full md:w-1/3 flex items-center justify-center mt-4 md:mt-0">
            <Button
              onPress={onStartAnalysis}
              color="primary"
              size="lg"
              className="w-full font-medium bg-blue-600 text-white"
              variant="solid"
              isDisabled={!isExtracted || isAnalyzing || hasError}
            >
              {!isExtracted
                ? 'Waiting for Audio Extraction...'
                : isAnalyzing
                ? 'Analyzing...'
                : cacheCheckCompleted && cacheAvailable
                ? 'Load Cached Results'
                : 'Start Audio Analysis'
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
