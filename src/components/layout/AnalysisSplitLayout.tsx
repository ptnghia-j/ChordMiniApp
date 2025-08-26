"use client";

import React from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

interface AnalysisSplitLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Whether to render as split panes. If false, render left as full-width */
  isSplit?: boolean;
  /** Local storage key for persisting layout */
  storageKey?: string;
  /** Desktop defaults in percent */
  defaultDesktopLayout?: [number, number]; // [left, right]
  /** Mobile defaults in percent for vertical split (top/bottom) */
  defaultMobileLayout?: [number, number]; // [top, bottom]
}

/**
 * Responsive resizable split layout with localStorage persistence.
 * - Desktop: horizontal split (left/right)
 * - Mobile: vertical split (top/bottom)
 */
export default function AnalysisSplitLayout({
  left,
  right,
  isSplit = true,
  storageKey = 'analysis-split-layout-v1',
  defaultDesktopLayout = [60, 40],
  defaultMobileLayout = [60, 40],
}: AnalysisSplitLayoutProps) {
  const isMobile = useIsMobile();
  const orientation: 'horizontal' | 'vertical' = isMobile ? 'vertical' : 'horizontal';

  // Single-pane mode is handled in JSX below to preserve hook call order

  // Load initial layout from storage
  const initialLayout = React.useMemo(() => {
    if (typeof window === 'undefined') return isMobile ? defaultMobileLayout : defaultDesktopLayout;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return isMobile ? defaultMobileLayout : defaultDesktopLayout;
      const parsed = JSON.parse(raw) as { orientation: 'horizontal' | 'vertical'; sizes: [number, number] };
      if (parsed && parsed.orientation === orientation && Array.isArray(parsed.sizes)) {
        return parsed.sizes as [number, number];
      }
    } catch { /* ignore */ }
    return isMobile ? defaultMobileLayout : defaultDesktopLayout;
  }, [storageKey, isMobile, orientation, defaultDesktopLayout, defaultMobileLayout]);

  const handleLayout = React.useCallback((sizes: number[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ orientation, sizes }));
    } catch { /* ignore */ }
  }, [orientation, storageKey]);

  return (
    <div className="h-full min-h-0 flex-1">
      {isSplit ? (
        <PanelGroup
          direction={orientation === 'horizontal' ? 'horizontal' : 'vertical'}
          onLayout={handleLayout}
          className="h-full min-h-0"
        >
          <Panel
            defaultSize={initialLayout[0]}
            minSize={40}
            maxSize={70}
            className="min-w-0 min-h-0 overflow-hidden"
          >
            <div className="h-full min-h-0 overflow-y-auto">{left}</div>
          </Panel>
          <PanelResizeHandle className="group relative z-[40]">
            <div
              className={`transition-colors ${
                orientation === 'horizontal'
                  ? 'w-4 md:w-5 cursor-col-resize'
                  : 'h-4 md:h-5 cursor-row-resize'
              }`}
            >
              {/* Visible grabber glyph */}
              <div className="h-full w-full flex items-center justify-center">
                <div className={`${orientation === 'horizontal' ? 'h-8 w-1' : 'w-8 h-1'} rounded bg-gray-300 dark:bg-gray-600 shadow-sm`}/>
              </div>
              {/* Bar background to increase hit area */}
              <div
                className={`${
                  orientation === 'horizontal' ? 'h-full w-full' : 'h-full w-full'
                } bg-gray-200/60 dark:bg-gray-700/50 hover:bg-gray-300/70 dark:hover:bg-gray-600/70 absolute inset-0 pointer-events-none rounded`}
              />
            </div>
          </PanelResizeHandle>
          <Panel
            defaultSize={initialLayout[1]}
            minSize={30}
            maxSize={60}
            className="min-w-0 min-h-0 overflow-hidden"
          >
            <div className="h-full min-h-0 overflow-y-auto embedded-pane">{right}</div>
          </Panel>
        </PanelGroup>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto">{left}</div>
      )}
    </div>
  );
}

function useIsMobile(breakpointPx: number = 768) {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpointPx;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpointPx]);

  return isMobile;
}

