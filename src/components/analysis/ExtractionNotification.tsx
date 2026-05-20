'use client';

import React, { useEffect, useRef } from 'react';
import { addToast } from '@heroui/react';
import { mergeToastClassNames } from '@/utils/toastStyles';

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

      const accentClass = fromCache
        ? 'text-primary-600 dark:text-blue-400'
        : 'text-success-600 dark:text-success-400';

      addToast({
        title: fromCache ? 'Audio Loaded from Cache' : 'Audio Extracted Successfully',
        description: fromCache
          ? 'Using cached audio file. Select models to begin analysis.'
          : 'Audio extraction complete. Select models to begin analysis.',
        color: 'default',
        timeout: 5000, // Auto-dismiss after 5 seconds (matching original)
        shouldShowTimeoutProgress: true,
        classNames: mergeToastClassNames({
          icon: accentClass,
          title: accentClass,
        }),
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
