'use client';

import React from 'react';
import HeroUIBeatModelSelector from '@/components/analysis/HeroUIBeatModelSelector';
import HeroUIChordModelSelector from '@/components/analysis/HeroUIChordModelSelector';
import { Button, Chip, Card, CardBody, CardHeader, Divider } from '@heroui/react';

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
    <Card
      className="w-full overflow-visible border border-default-200 dark:border-default-100"
      shadow="sm"
      radius="lg"
    >
      <CardHeader className="flex flex-col items-start gap-1 pb-2">
        <h3 className="text-lg font-semibold text-foreground">
          Select Models for Analysis
        </h3>
        <p className="text-sm text-default-500">
          Choose beat and chord detection models to analyze the audio.
        </p>

        {/* Status indicator */}
        <div className="mt-1">
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
      </CardHeader>

      <Divider className="opacity-50" />

      <CardBody className="overflow-visible pt-4">
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
              isLoading={isAnalyzing}
              spinner={
                <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              }
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
      </CardBody>
    </Card>
  );
};
