'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ResponsiveVideoUtilityLayoutProps {
  videoPlayer: React.ReactNode;
  utilityBar: React.ReactNode;
  isVideoMinimized: boolean;
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
}

export const ResponsiveVideoUtilityLayout: React.FC<ResponsiveVideoUtilityLayoutProps> = ({
  videoPlayer,
  utilityBar,
  isVideoMinimized,
  isChatbotOpen,
  isLyricsPanelOpen,
}) => {
  const [videoHeight, setVideoHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [isMdUp, setIsMdUp] = useState(false);
  const [isDockPinnedAboveFooter, setIsDockPinnedAboveFooter] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMdUp(window.innerWidth >= 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const videoContainer = videoContainerRef.current;
    const layoutContainer = layoutContainerRef.current;
    if (!videoContainer || !layoutContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === videoContainer) setVideoHeight(entry.contentRect.height);
        if (entry.target === layoutContainer) {
          setContainerWidth(entry.contentRect.width);
          setLayoutHeight(entry.contentRect.height);
        }
      }
    });

    resizeObserver.observe(videoContainer);
    resizeObserver.observe(layoutContainer);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (isMdUp) return;

    const updateDockPosition = () => {
      const footer = document.querySelector('footer');
      if (!footer) {
        setIsDockPinnedAboveFooter(false);
        return;
      }

      const footerRect = footer.getBoundingClientRect();
      const dockHeight = layoutContainerRef.current?.getBoundingClientRect().height ?? layoutHeight;
      setIsDockPinnedAboveFooter(footerRect.top <= window.innerHeight - dockHeight - 16);
    };

    updateDockPosition();
    window.addEventListener('scroll', updateDockPosition, { passive: true });
    window.addEventListener('resize', updateDockPosition);
    return () => {
      window.removeEventListener('scroll', updateDockPosition);
      window.removeEventListener('resize', updateDockPosition);
    };
  }, [isMdUp, layoutHeight]);

  const videoWidthPx = useMemo(() => {
    if (!isMdUp) return Math.max(containerWidth, 0);
    const minW = isVideoMinimized ? 200 : 280;
    const maxW = isVideoMinimized ? 360 : 560;
    if (!containerWidth) return minW;
    return Math.round(Math.max(minW, Math.min(containerWidth * (isVideoMinimized ? 0.22 : 0.3), maxW)));
  }, [containerWidth, isMdUp, isVideoMinimized]);

  const utilityBarWidth = useMemo(() => {
    if (!isMdUp || containerWidth === 0) return '100%';
    return Math.max(containerWidth - videoWidthPx - 48, 300);
  }, [containerWidth, isMdUp, videoWidthPx]);

  const panelsOpen = isChatbotOpen || isLyricsPanelOpen;
  const baseOverlap = Math.max(0, Math.min(Math.round(videoHeight * (panelsOpen ? 0.85 : 0.95)), 420));
  const extraLift = panelsOpen ? 32 : 104;
  const shouldUseFixedMobileDock = !isMdUp && !isDockPinnedAboveFooter;

  return (
    <>
      {shouldUseFixedMobileDock ? (
        <div aria-hidden="true" className="md:hidden" style={{ height: layoutHeight ? `${layoutHeight + 12}px` : '180px' }} />
      ) : null}
      <div
        ref={layoutContainerRef}
        className={
          shouldUseFixedMobileDock
            ? 'fixed inset-x-0 bottom-0 z-[80] flex flex-col items-stretch gap-2 px-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-1.5'
            : 'relative z-[60] flex flex-col items-stretch gap-2 px-2.5 pb-0 sm:px-4 sm:pb-0 md:flex-row md:items-end md:gap-3'
        }
        style={{ marginTop: isMdUp ? (baseOverlap ? -(baseOverlap + extraLift) : (panelsOpen ? -28 : -88)) : 0 }}
      >
        {shouldUseFixedMobileDock ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/50 via-slate-950/18 to-transparent dark:from-slate-950/72" />
        ) : null}
        <div
          className="relative z-[1] flex-1 w-full min-w-0 max-w-full md:order-1 md:w-auto"
          style={{
            maxWidth: isMdUp ? (typeof utilityBarWidth === 'number' ? `${utilityBarWidth}px` : utilityBarWidth) : '100%',
            minWidth: '280px',
          }}
        >
          <div className={isMdUp ? 'overflow-x-auto hide-scrollbar' : 'overflow-visible'}>
            <div className={isMdUp ? 'inline-flex w-max min-w-full' : 'w-full'}>{utilityBar}</div>
          </div>
        </div>

        <div
          ref={videoContainerRef}
          className="relative z-[1] flex-shrink-0 transition-all duration-300 md:order-2"
          style={{
            width: isMdUp ? `${videoWidthPx}px` : '100%',
            minWidth: isMdUp ? (isVideoMinimized ? '200px' : '260px') : '0',
            maxWidth: isMdUp ? (isVideoMinimized ? '360px' : '560px') : '100%',
          }}
        >
          {videoPlayer}
        </div>
      </div>
    </>
  );
};

export default ResponsiveVideoUtilityLayout;