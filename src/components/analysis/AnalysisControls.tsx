'use client';

import React from 'react';
import { Button, Chip, Card, CardBody, CardHeader, Divider } from '@heroui/react';
import { BeatDetectorType, ChordDetectorType } from '@/hooks/chord-analysis/useModelState';
import HeroUIBeatModelSelector from '@/components/analysis/HeroUIBeatModelSelector';
import HeroUIChordModelSelector from '@/components/analysis/HeroUIChordModelSelector';
import { isDevelopmentEnvironment } from '@/utils/modelFiltering';

const BEAT_MODEL_LABELS: Record<BeatDetectorType, string> = {
  madmom: 'Madmom',
  'beat-transformer': 'Beat Transformer',
};

const BEAT_MODEL_CHIP_COLORS: Record<BeatDetectorType, 'primary' | 'warning'> = {
  madmom: 'primary',
  'beat-transformer': 'warning',
};

const CHORD_MODEL_LABELS: Record<ChordDetectorType, string> = {
  'chord-cnn-lstm': 'Chord CNN-LSTM',
  'btc-sl': 'BTC SL',
  'btc-pl': 'BTC PL',
};

const CHORD_MODEL_CHIP_COLORS: Record<ChordDetectorType, 'success' | 'secondary'> = {
  'chord-cnn-lstm': 'success',
  'btc-sl': 'secondary',
  'btc-pl': 'secondary',
};

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
  actionDisabledReason?: string | null;
  hidden?: boolean;
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
  cacheCheckCompleted = false,
  actionDisabledReason = null,
  hidden = false,
}) => {
  // PERFORMANCE FIX: Always show model selection UI, regardless of extraction state
  // This allows users to select models immediately, even during cold starts
  // Only hide when analysis is actually complete (isAnalyzed is true)
  if (hidden || isAnalyzed || (stage === 'complete' && isAnalyzed)) {
    return null;
  }

  const canOpenCachedResults = cacheCheckCompleted && cacheAvailable;

  const actionLabel = isAnalyzing
    ? 'Analyzing...'
    : actionDisabledReason
      ? 'Analysis unavailable'
      : canOpenCachedResults
        ? 'Open cached results'
        : !isExtracted
          ? 'Preparing audio'
          : 'Run analysis';

  const statusTone = actionDisabledReason
    ? 'warning'
    : canOpenCachedResults
      ? 'success'
      : !isExtracted
        ? 'primary'
        : !cacheCheckCompleted
          ? 'default'
          : 'warning';

  const statusStyles = statusTone === 'success'
    ? 'border-success-200/80 bg-success-50/70 dark:border-success-700/40 dark:bg-success-900/10'
    : statusTone === 'warning'
      ? 'border-warning-200/80 bg-warning-50/80 dark:border-warning-700/40 dark:bg-warning-900/10'
      : statusTone === 'primary'
        ? 'border-primary-200/80 bg-primary-50/80 dark:border-primary-700/40 dark:bg-primary-900/10'
        : 'border-default-200/80 bg-default-50/80 dark:border-default-700/40 dark:bg-default-900/10';

  const statusDotStyles = statusTone === 'success'
    ? 'bg-success-500'
    : statusTone === 'warning'
      ? 'bg-warning-500'
      : statusTone === 'primary'
        ? 'bg-primary-500'
        : 'bg-default-400';

  const statusTitle = actionDisabledReason
    ? 'Analysis unavailable for this track'
    : canOpenCachedResults
      ? 'Cached results ready'
      : !isExtracted
        ? 'Preparing analysis session'
        : !cacheCheckCompleted
          ? 'Checking cache availability'
          : 'Fresh analysis required';

  const statusDescription = actionDisabledReason
    ? actionDisabledReason
    : canOpenCachedResults
      ? `We found saved results for ${BEAT_MODEL_LABELS[beatDetector]} and ${CHORD_MODEL_LABELS[chordDetector]}.`
      : !isExtracted
        ? 'Audio is still being prepared. You can choose models now and continue as soon as extraction finishes.'
        : !cacheCheckCompleted
          ? 'Looking for previously processed results for the selected model combination.'
          : `No saved results were found for ${BEAT_MODEL_LABELS[beatDetector]} and ${CHORD_MODEL_LABELS[chordDetector]}.`;

  const isActionDisabled = (!isExtracted && !canOpenCachedResults) || isAnalyzing || hasError || !!actionDisabledReason;

  return (
    <Card
      className="w-full overflow-visible border border-default-200/80 dark:border-default-100/10 bg-content1/90 shadow-sm"
      shadow="sm"
      radius="lg"
    >
      <CardHeader className="flex flex-col items-start gap-3 pb-3">
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Analysis setup</h3>
            <p className="text-sm text-default-500 dark:text-default-300">
              Choose your detection models. The selected combination is preserved when this page reloads.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip
              color={beatDetector === 'beat-transformer' && isDevelopmentEnvironment()
                ? BEAT_MODEL_CHIP_COLORS[beatDetector]
                : 'primary'}
              variant="flat"
              size="sm"
            >
              Beat: {BEAT_MODEL_LABELS[beatDetector]}
            </Chip>
            <Chip
              data-testid="chord-model-chip"
              data-color={CHORD_MODEL_CHIP_COLORS[chordDetector]}
              color={CHORD_MODEL_CHIP_COLORS[chordDetector]}
              variant="flat"
              size="sm"
            >
              Chords: {CHORD_MODEL_LABELS[chordDetector]}
            </Chip>
          </div>
        </div>
      </CardHeader>

      <Divider className="opacity-50" />

      <CardBody className="overflow-visible pt-4">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start overflow-visible">
          <div className="w-full md:w-1/2 relative z-40">
            <HeroUIBeatModelSelector
              onChange={onBeatDetectorChange}
              defaultValue={beatDetector}
              disabled={isAnalyzing}
            />
          </div>

          <div className="w-full md:w-1/2 relative z-30">
            <HeroUIChordModelSelector
              selectedModel={chordDetector}
              onModelChange={onChordDetectorChange}
              disabled={isAnalyzing}
            />
          </div>
        </div>

        <div className={`flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between ${statusStyles}`}>
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusDotStyles}`} />
            <div>
              <p className="text-sm font-semibold text-foreground">{statusTitle}</p>
              <p className="text-sm text-default-600 dark:text-default-300">{statusDescription}</p>
            </div>
          </div>

          <Button
            onPress={onStartAnalysis}
            color="primary"
            size="lg"
            className="w-full md:w-auto md:min-w-[220px] font-medium"
            variant="solid"
            isDisabled={isActionDisabled}
            isLoading={isAnalyzing}
            spinner={
              <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            }
          >
            {actionLabel}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};
