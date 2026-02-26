'use client';

import React, { useEffect, useRef } from 'react';
import { addToast } from '@heroui/react';

interface ExtractionNotificationProps {
  isVisible: boolean;
  fromCache: boolean;
  onDismiss: () => void;
  onRefresh: () => void;
}

const ExtractionNotification: React.FC<ExtractionNotificationProps> = ({
  isVisible,
  fromCache,
  onDismiss,
}) => {
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (isVisible && !hasShownRef.current) {
      hasShownRef.current = true;

      addToast({
        title: fromCache ? 'Audio Loaded from Cache' : 'Audio Extracted Successfully',
        description: fromCache
          ? 'Using cached audio file. Select models to begin analysis.'
          : 'Audio extraction complete. Select models to begin analysis.',
        color: fromCache ? 'primary' : 'success',
        variant: 'flat',
        timeout: 5000, // Auto-dismiss after 5 seconds (matching original)
        shouldShowTimeoutProgress: true,
        onClose: onDismiss,
      });
    }

    if (!isVisible) {
      hasShownRef.current = false;
    }
  }, [isVisible, fromCache, onDismiss]);

  return null;
};

export default ExtractionNotification;
