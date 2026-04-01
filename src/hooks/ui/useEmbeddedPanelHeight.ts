'use client';

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;
const PANEL_GAP_PX = 64;

export const useEmbeddedPanelHeight = (
  embedded: boolean,
  panelRef: React.RefObject<HTMLElement | null>
) => {
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!embedded || typeof window === 'undefined') return;

    const panel = panelRef.current;
    if (!panel) return;

    let frameId = 0;
    let panelObserver: ResizeObserver | null = null;
    let dockObserver: ResizeObserver | null = null;

    const updateHeight = () => {
      frameId = 0;

      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        setMeasuredHeight(null);
        return;
      }

      const currentPanel = panelRef.current;
      const dock = document.querySelector('[data-mobile-video-dock="true"]') as HTMLElement | null;

      if (!currentPanel || !dock) {
        setMeasuredHeight(null);
        return;
      }

      const panelRect = currentPanel.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const availableHeight = Math.floor(dockRect.top - panelRect.top - PANEL_GAP_PX);

      if (availableHeight > 0 && dockRect.top < panelRect.bottom) {
        setMeasuredHeight(availableHeight);
      } else {
        setMeasuredHeight(null);
      }
    };

    const requestUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateHeight);
    };

    requestUpdate();

    panelObserver = new ResizeObserver(requestUpdate);
    panelObserver.observe(panel);

    const attachDockObserver = () => {
      dockObserver?.disconnect();
      const dock = document.querySelector('[data-mobile-video-dock="true"]') as HTMLElement | null;
      if (!dock) return;
      dockObserver = new ResizeObserver(requestUpdate);
      dockObserver.observe(dock);
    };

    attachDockObserver();

    const mutationObserver = new MutationObserver(() => {
      attachDockObserver();
      requestUpdate();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', requestUpdate);
    window.addEventListener('scroll', requestUpdate, { passive: true });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      panelObserver?.disconnect();
      dockObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', requestUpdate);
      window.removeEventListener('scroll', requestUpdate);
    };
  }, [embedded, panelRef]);

  return embedded ? measuredHeight : null;
};
