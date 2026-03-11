'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, Chip, Divider } from '@heroui/react';

import HeroUIBeatModelSelector from '@/components/analysis/HeroUIBeatModelSelector';
import HeroUIChordModelSelector from '@/components/analysis/HeroUIChordModelSelector';
import { BeatDetectorType, ChordDetectorType } from '@/hooks/chord-analysis/useModelState';

interface AnalyzeModelSetupCardProps {
  videoTitle: string | null;
  channelTitle: string | null;
  beatDetector: BeatDetectorType;
  chordDetector: ChordDetectorType;
  onBeatDetectorChange: (detector: BeatDetectorType) => void;
  onChordDetectorChange: (detector: ChordDetectorType) => void;
  onContinue: () => void;
  cacheAvailable: boolean;
  cacheCheckCompleted: boolean;
  isPreparing?: boolean;
}

export default function AnalyzeModelSetupCard({
  videoTitle,
  channelTitle,
  beatDetector,
  chordDetector,
  onBeatDetectorChange,
  onChordDetectorChange,
  onContinue,
  cacheAvailable,
  cacheCheckCompleted,
  isPreparing = false,
}: AnalyzeModelSetupCardProps) {
  const primaryActionLabel = cacheCheckCompleted && cacheAvailable
    ? 'Load Cached Results'
    : 'Continue to Analysis';

  return (
    <Card className="w-full overflow-visible border border-default-200 dark:border-default-100" shadow="sm" radius="lg">
      <CardHeader className="flex flex-col items-start gap-1 pb-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Select Models for Analysis</h1>
          <p className="text-sm text-default-500 dark:text-default-300">
            Choose beat and chord detection models to analyze the audio.
          </p>
        </div>

        <div className="mt-1 flex flex-wrap gap-2">
          {cacheCheckCompleted ? (
            <Chip
              color={cacheAvailable ? 'success' : 'warning'}
              variant="flat"
              size="sm"
              startContent={
                <span className={`h-2 w-2 rounded-full ${cacheAvailable ? 'bg-success-500' : 'bg-warning-500'}`} />
              }
            >
              {cacheAvailable
                ? `Cached results available for ${beatDetector} + ${chordDetector}`
                : `No cached results for ${beatDetector} + ${chordDetector}`}
            </Chip>
          ) : (
            <Chip
              color="default"
              variant="flat"
              size="sm"
              startContent={<span className="h-2 w-2 rounded-full bg-default-500" />}
            >
              Checking for cached results...
            </Chip>
          )}

          {(videoTitle || channelTitle) && (
            <Chip variant="flat" size="sm">
              {videoTitle || channelTitle}
            </Chip>
          )}
        </div>
      </CardHeader>

      <Divider className="opacity-50" />

      <CardBody className="overflow-visible pt-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start overflow-visible">
          <div className="w-full md:w-1/3 relative z-40">
            <HeroUIBeatModelSelector onChange={onBeatDetectorChange} defaultValue={beatDetector} disabled={isPreparing} />
          </div>

          <div className="w-full md:w-1/3 relative z-30">
            <HeroUIChordModelSelector selectedModel={chordDetector} onModelChange={onChordDetectorChange} disabled={isPreparing} />
          </div>

          <div className="w-full md:w-1/3 flex flex-col gap-2 mt-4 md:mt-0">
            <Button onPress={onContinue} color="primary" size="lg" className="w-full font-medium bg-blue-600 text-white" isLoading={isPreparing} isDisabled={isPreparing}>
              {isPreparing ? 'Preparing analysis...' : primaryActionLabel}
            </Button>

            <Button as={Link} href="/" variant="light" className="w-full md:w-auto self-start px-0" isDisabled={isPreparing}>
              Back to search
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}