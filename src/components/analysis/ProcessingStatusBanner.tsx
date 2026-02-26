'use client';

import React, { useEffect, useRef } from 'react';
import { addToast, closeToast } from '@heroui/react';

import { useProcessing } from '@/contexts/ProcessingContext';
import { ChordDetectionResult } from '@/services/chord-analysis/chordRecognitionService';
import { BeatInfo } from '@/services/audio/beatDetectionService';

interface ProcessingStatusBannerProps {
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
  audioUrl?: string;
  fromCache?: boolean;
  fromFirestoreCache?: boolean;
  videoId?: string;
  beatDetector?: 'madmom' | 'beat-transformer' | 'auto';
}

const ProcessingStatusBanner: React.FC<ProcessingStatusBannerProps> = React.memo(({
  fromCache = false,
  fromFirestoreCache = false,
}) => {
  const { stage, statusMessage, getFormattedElapsedTime } = useProcessing();
  const processingToastKeyRef = useRef<string | null>(null);
  const prevStageRef = useRef<string>('idle');

  useEffect(() => {
    const prevStage = prevStageRef.current;
    prevStageRef.current = stage;

    // Handle processing stages: beat-detection and chord-recognition
    if (stage === 'beat-detection' || stage === 'chord-recognition') {
      // Close previous processing toast if stage changed (e.g., beat-detection → chord-recognition)
      if (processingToastKeyRef.current && prevStage !== stage) {
        closeToast(processingToastKeyRef.current);
        processingToastKeyRef.current = null;
      }

      // Show new processing toast if none is active for this stage
      if (!processingToastKeyRef.current) {
        const isBeats = stage === 'beat-detection';
        const key = addToast({
          title: isBeats ? 'Detecting Beats' : 'Recognizing Chords',
          description: statusMessage || (isBeats
            ? 'Analyzing beat patterns and timing...'
            : 'Recognizing chords and synchronizing with beats...'),
          color: isBeats ? 'primary' : 'secondary',
          variant: 'flat',
          timeout: 0, // Stay open until processing completes
          hideCloseButton: true,
          shouldShowTimeoutProgress: false,
        });
        processingToastKeyRef.current = key;
      }
    }

    // Handle completion
    if (stage === 'complete' && (prevStage === 'beat-detection' || prevStage === 'chord-recognition')) {
      // Close processing toast
      if (processingToastKeyRef.current) {
        closeToast(processingToastKeyRef.current);
        processingToastKeyRef.current = null;
      }

      // Build description with cache badges
      const cacheInfo = [
        fromCache ? '📦 Audio Cache' : '',
        fromFirestoreCache ? '💾 Results Cache' : '',
      ].filter(Boolean).join(' · ');

      const description = `Beat and chord analysis completed in ${getFormattedElapsedTime()}${cacheInfo ? ` · ${cacheInfo}` : ''}`;

      // Show success toast with 5s auto-dismiss
      addToast({
        title: 'Analysis Complete',
        description,
        color: 'success',
        variant: 'flat',
        timeout: 5000, // Auto-dismiss after 5 seconds (matching original)
        shouldShowTimeoutProgress: true,
      });
    }

    // Handle error
    if (stage === 'error') {
      // Close processing toast
      if (processingToastKeyRef.current) {
        closeToast(processingToastKeyRef.current);
        processingToastKeyRef.current = null;
      }

      addToast({
        title: 'Analysis Error',
        description: statusMessage || 'An error occurred during processing.',
        color: 'danger',
        variant: 'flat',
        timeout: 5000,
        shouldShowTimeoutProgress: true,
      });
    }

    // Handle idle - cleanup any lingering toast
    if (stage === 'idle' && processingToastKeyRef.current) {
      closeToast(processingToastKeyRef.current);
      processingToastKeyRef.current = null;
    }
  }, [stage, statusMessage, getFormattedElapsedTime, fromCache, fromFirestoreCache]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processingToastKeyRef.current) {
        closeToast(processingToastKeyRef.current);
        processingToastKeyRef.current = null;
      }
    };
  }, []);

  // This component now renders nothing - it's purely a side-effect component for toasts
  return null;
});

ProcessingStatusBanner.displayName = 'ProcessingStatusBanner';

export default ProcessingStatusBanner;
