'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';

interface ResponsiveVideoUtilityLayoutProps {
  videoPlayer: React.ReactNode;
  utilityBar: React.ReactNode;
  isVideoMinimized: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
}

/**
 * Responsive layout component that positions YouTube player and utility bar
 * adjacent to each other with dynamic width adjustment based on video size
 */
export const ResponsiveVideoUtilityLayout: React.FC<ResponsiveVideoUtilityLayoutProps> = ({
  videoPlayer,
  utilityBar,
  isVideoMinimized,
  isChatbotOpen,
  isLyricsPanelOpen
}) => {

  const [videoHeight, setVideoHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMdUp, setIsMdUp] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);
  // Track viewport breakpoint (md and up means side-by-side)
  useEffect(() => {
    const onResize = () => setIsMdUp(window.innerWidth >= 768); // Tailwind md breakpoint
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);


  // Monitor video container size changes
  useEffect(() => {
    const videoContainer = videoContainerRef.current;
    const layoutContainer = layoutContainerRef.current;

    if (!videoContainer || !layoutContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === videoContainer) {
          setVideoHeight(entry.contentRect.height);
        } else if (entry.target === layoutContainer) {
          setContainerWidth(entry.contentRect.width);
        }

      }
    });

    resizeObserver.observe(videoContainer);
    resizeObserver.observe(layoutContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate responsive video width for tablet/medium screens
  const videoWidthPx = useMemo(() => {
    const minW = isVideoMinimized ? 200 : 280;
    const maxW = isVideoMinimized ? 360 : 560;
    if (!containerWidth) return minW;
    // Scale relative to layout container to stay side-by-side on tablets
    const factor = isVideoMinimized ? 0.22 : 0.30;
    const target = containerWidth * factor;
    return Math.round(Math.max(minW, Math.min(target, maxW)));
  }, [containerWidth, isVideoMinimized]);

  // Calculate utility bar width based on available space
  const calculateUtilityBarWidth = () => {
    if (!isMdUp || containerWidth === 0) return '100%';

    // Account for gaps and padding
    const gap = 16; // 1rem gap
    const padding = 32; // Total horizontal padding
    const availableWidth = containerWidth - videoWidthPx - gap - padding;

    // Minimum width for utility bar
    const minWidth = 300;

    return Math.max(availableWidth, minWidth);
  };

  // Always use responsive adjacent layout; panels open state only affects sizing/scroll
  const utilityBarWidth = calculateUtilityBarWidth();

  // Responsive adjacent layout with optional overlap into the chord grid area
  const panelsOpen = isChatbotOpen || isLyricsPanelOpen;

  // Compute dynamic overlap based on measured video height
  const baseOverlap = Math.max(0, Math.min(Math.round(videoHeight * (panelsOpen ? 0.85 : 0.95)), 420));
  const extraLift = 16; // small additional lift to close residual gap consistently


  return (
    <div
      ref={layoutContainerRef}
      className={`flex flex-col md:flex-row md:items-end items-stretch gap-4 px-3 pb-0 sm:px-4 sm:pb-0 relative z-[60]`}
      style={{ marginTop: isMdUp ? (baseOverlap ? -(baseOverlap + extraLift) : (panelsOpen ? -16 : -48)) : 0 }}
    >
      {/* Utility bar container - LEFT on wide screens, first in order */}
      <div
        className="flex-1 w-full md:w-auto min-w-0 md:order-1 max-w-full"
        style={{
          maxWidth: typeof utilityBarWidth === 'number' ? `${utilityBarWidth}px` : utilityBarWidth,
          minWidth: '280px'
        }}
      >
        <div className="overflow-x-auto hide-scrollbar">
          <div className="inline-flex w-max min-w-full">
            {utilityBar}
          </div>
        </div>
      </div>

      {/* Video player container - RIGHT on wide screens */}
      <div
        ref={videoContainerRef}
        className={`flex-shrink-0 transition-all duration-300 md:order-2`}
        style={{
          width: `${videoWidthPx}px`,
          minWidth: isVideoMinimized ? '200px' : '260px',
          maxWidth: isVideoMinimized ? '360px' : '560px'
        }}
      >
        {videoPlayer}
      </div>
    </div>
  );
};

export default ResponsiveVideoUtilityLayout;