'use client';

import React from 'react';
import { Tooltip, type TooltipProps } from '@heroui/react';

type AppTooltipProps = Omit<TooltipProps, 'content' | 'children'> & {
  content: React.ReactNode;
  children: React.ReactElement;
};

const DEFAULT_CLASS_NAMES: NonNullable<TooltipProps['classNames']> = {
  base: 'max-w-xs',
  content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg',
};

const AppTooltip: React.FC<AppTooltipProps> = ({
  content,
  children,
  classNames,
  placement = 'top',
  delay = 500,
  closeDelay = 100,
  ...rest
}) => {
  if (process.env.NODE_ENV === 'test') {
    return children;
  }

  return (
    <Tooltip
      content={content}
      placement={placement}
      delay={delay}
      closeDelay={closeDelay}
      classNames={{ ...DEFAULT_CLASS_NAMES, ...classNames }}
      {...rest}
    >
      {children}
    </Tooltip>
  );
};

export default AppTooltip;