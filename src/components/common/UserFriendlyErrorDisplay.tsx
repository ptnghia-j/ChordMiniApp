'use client';

import React from 'react';
import { Card, CardBody, Button } from '@heroui/react';
import { createUserFriendlyError } from '@/utils/errorMessageUtils';

interface UserFriendlyErrorDisplayProps {
  error: string;
  suggestion?: string;
  onTryAnotherVideo?: () => void;
  onRetry?: () => void;
  className?: string;
}

const UserFriendlyErrorDisplay: React.FC<UserFriendlyErrorDisplayProps> = ({
  error,
  suggestion,
  onTryAnotherVideo,
  onRetry,
  className = ''
}) => {
  const friendlyError = createUserFriendlyError(error);
  const displaySuggestion = suggestion || friendlyError.suggestion;

  return (
    <Card
      className={className}
      classNames={{
        base: 'border border-danger-200 dark:border-danger-500/40 bg-danger-50 dark:bg-danger-50/10 shadow-sm',
      }}
      radius="md"
    >
      <CardBody className="gap-1 px-4 py-3">
        {/* Title + message */}
        <p className="text-sm font-semibold text-danger-700 dark:text-danger-400">
          {friendlyError.title}
        </p>
        <p className="text-xs text-danger-600 dark:text-danger-300">
          {friendlyError.message}
        </p>

        {/* Suggestion (one line, subtle) */}
        {displaySuggestion && (
          <p className="text-xs text-default-500 mt-1">
            {displaySuggestion}
          </p>
        )}

        {/* Action buttons */}
        {(onRetry || (friendlyError.showTryAnotherButton && onTryAnotherVideo)) && (
          <div className="flex gap-2 mt-2">
            {onRetry && (
              <Button size="sm" variant="flat" color="danger" onPress={onRetry}>
                Try Again
              </Button>
            )}
            {friendlyError.showTryAnotherButton && onTryAnotherVideo && (
              <Button size="sm" variant="light" color="default" onPress={onTryAnotherVideo}>
                Try Another Video
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default UserFriendlyErrorDisplay;
