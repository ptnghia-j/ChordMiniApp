'use client';

import React from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';

interface UtilityPopoverPanelProps {
  title?: React.ReactNode;
  titleClassName?: string;
  headerStartContent?: React.ReactNode;
  headerEndContent?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}

export default function UtilityPopoverPanel({
  title,
  titleClassName = '',
  headerStartContent,
  headerEndContent,
  bodyClassName = '',
  className = '',
  children,
}: UtilityPopoverPanelProps) {
  return (
    <Card
      shadow="none"
      className={`border border-white/35 bg-default-200/85 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.7)] backdrop-blur-md dark:border-white/20 dark:bg-gray-800/60 ${className}`}
    >
      {(title || headerStartContent || headerEndContent) && (
        <CardHeader className="flex items-center justify-between gap-3 border-b border-white/20 px-4 py-3 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-2">
            {headerStartContent}
            {title && (
              <div className={`truncate text-sm font-semibold text-slate-800 dark:text-slate-100 ${titleClassName}`}>
                {title}
              </div>
            )}
          </div>
          {headerEndContent}
        </CardHeader>
      )}
      <CardBody className={bodyClassName}>{children}</CardBody>
    </Card>
  );
}
