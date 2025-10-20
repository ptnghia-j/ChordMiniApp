"use client";

import React from 'react';

interface ScrollableTabContainerProps {
  children: React.ReactNode;
  className?: string;
  heightClass?: string; // Tailwind height utility for the scroll viewport
  variant?: 'card' | 'plain'; // 'card' adds bg/rounded, 'plain' is transparent
}

/**
 * Shared scrollable container for tab content to keep patterns DRY.
 * Wraps content in a rounded card with an inner fixed-height scroll area.
 */
export const ScrollableTabContainer: React.FC<ScrollableTabContainerProps> = ({
  children,
  className = '',
  heightClass = 'h-[60vh] md:h-[66vh]',
  variant = 'card'
}) => {
  const rootClasses = [
    'chord-grid-window',
    variant === 'card' ? 'bg-white dark:bg-content-bg rounded-lg overflow-hidden' : 'overflow-hidden'
  ].join(' ');

  return (
    <div className={`${rootClasses} ${className}`}>
      <div className={`${heightClass} overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
};

export default ScrollableTabContainer;

