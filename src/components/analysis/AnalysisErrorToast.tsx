'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Button, addToast, closeToast } from '@heroui/react';
import { mergeToastClassNames } from '@/utils/toastStyles';

import { createUserFriendlyError } from '@/utils/errorMessageUtils';

interface AnalysisErrorToastProps {
  error: string | null;
  suggestion?: string;
  onTryAnotherVideo: () => void;
  onRetry: () => void;
}

const AnalysisErrorToast: React.FC<AnalysisErrorToastProps> = ({
  error,
  suggestion,
  onTryAnotherVideo,
  onRetry,
}) => {
  const pathname = usePathname();
  const toastKeyRef = useRef<string | null>(null);
  const retryRef = useRef(onRetry);
  const tryAnotherRef = useRef(onTryAnotherVideo);

  useEffect(() => {
    retryRef.current = onRetry;
    tryAnotherRef.current = onTryAnotherVideo;
  }, [onRetry, onTryAnotherVideo]);

  useEffect(() => {
    if (toastKeyRef.current) {
      closeToast(toastKeyRef.current);
      toastKeyRef.current = null;
    }

    if (!error) {
      return undefined;
    }

    const friendlyError = createUserFriendlyError(error);
    const displaySuggestion = suggestion || friendlyError.suggestion;
    const closeCurrentToast = () => {
      if (toastKeyRef.current) {
        closeToast(toastKeyRef.current);
        toastKeyRef.current = null;
      }
    };

    const key = addToast({
      title: friendlyError.title,
      description: (
        <div className="space-y-3 w-full">
          <div className="space-y-1">
            <p className="text-sm">{friendlyError.message}</p>
            {displaySuggestion && (
              <p className="text-xs text-default-600 dark:text-gray-200">
                {displaySuggestion}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              size="sm"
              color="danger"
              variant="solid"
              onPress={() => {
                closeCurrentToast();
                retryRef.current();
              }}
            >
              Try Again
            </Button>
            {friendlyError.showTryAnotherButton && (
              <Button
                size="sm"
                color="default"
                variant="bordered"
                onPress={() => {
                  closeCurrentToast();
                  tryAnotherRef.current();
                }}
              >
                Try Another Video
              </Button>
            )}
          </div>
        </div>
      ),
      color: 'default',
      timeout: 0,
      classNames: mergeToastClassNames({
        base: 'items-start w-full max-w-[420px] p-4',
        icon: 'text-danger-500',
        title: 'text-danger-600 dark:text-danger-400',
        description: 'w-full',
      }),
    });
    toastKeyRef.current = key;

    return closeCurrentToast;
  }, [error, suggestion, pathname]);

  return null;
};

export default AnalysisErrorToast;
