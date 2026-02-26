'use client';

import React, { useEffect, useRef } from 'react';
import { addToast, closeToast } from '@heroui/react';
import { useProcessing } from '@/contexts/ProcessingContext';

interface DownloadingIndicatorProps {
  isVisible: boolean;
}

const DownloadingIndicator: React.FC<DownloadingIndicatorProps> = ({
  isVisible
}) => {
  // Get stage and statusMessage from the ProcessingContext
  const { stage, statusMessage } = useProcessing();
  const toastKeyRef = useRef<string | null>(null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) {
      // Show toast when becoming visible
      wasVisibleRef.current = true;
      const key = addToast({
        title: stage === 'downloading' ? 'Downloading YouTube Video...' : 'Extracting Audio...',
        description: statusMessage || 'This may take a moment for longer videos...',
        color: 'warning',
        variant: 'flat',
        timeout: 0, // Don't auto-dismiss - wait until extraction completes
        hideCloseButton: true,
      });
      toastKeyRef.current = key;
    } else if (!isVisible && wasVisibleRef.current) {
      // Close toast when becoming hidden
      wasVisibleRef.current = false;
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
    }
  }, [isVisible, stage, statusMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
    };
  }, []);

  return null;
};

export default DownloadingIndicator;
