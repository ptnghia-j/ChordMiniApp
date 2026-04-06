'use client';

import React from 'react';
import { HiArrowPath, HiOutlineSquares2X2, HiSquares2X2 } from 'react-icons/hi2';
import { Tooltip } from '@heroui/react';

interface SegmentationToggleButtonProps {
  isEnabled: boolean;
  onClick: () => void;
  hasSegmentationData: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  errorMessage?: string | null;
  className?: string;
}

const SegmentationToggleButton: React.FC<SegmentationToggleButtonProps> = ({
  isEnabled,
  onClick,
  hasSegmentationData,
  isLoading = false,
  disabled = false,
  disabledReason,
  errorMessage,
  className = '',
}) => {
  const buttonClassName = `h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0 ${
    isEnabled
      ? 'bg-indigo-600 text-white'
      : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-800 dark:text-gray-100 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
  } ${(disabled || isLoading) ? 'cursor-not-allowed opacity-60' : ''}`;

  const tooltipLabel = isLoading
    ? 'Analyzing song segments...'
    : hasSegmentationData
      ? (isEnabled ? 'Hide song segmentation overlay' : 'Show song segmentation overlay')
      : errorMessage
        ? 'Retry song segmentation'
        : disabled && disabledReason
          ? disabledReason
          : 'Enable song segmentation';

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <Tooltip
        content={tooltipLabel}
        placement="top"
        delay={500}
        closeDelay={100}
        classNames={{
          base: 'max-w-xs',
          content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg',
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
          disabled={disabled || isLoading}
          className={buttonClassName}
          aria-label={hasSegmentationData ? 'Toggle song segmentation overlay' : 'Enable song segmentation'}
        >
          {isLoading ? (
            <HiArrowPath className="h-4 w-4 animate-spin" />
          ) : isEnabled ? (
            <HiSquares2X2 className="h-4 w-4" />
          ) : (
            <HiOutlineSquares2X2 className="h-4 w-4" />
          )}
        </button>
      </Tooltip>

      <div className="absolute -top-1 -right-1 bg-indigo-500/70 dark:bg-indigo-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold pointer-events-none">
        BETA
      </div>
    </div>
  );
};

export default SegmentationToggleButton;
