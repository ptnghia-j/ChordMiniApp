'use client';

import { useEffect } from 'react';

/**
 * Aggressively removes/hides the Next.js dev build indicator bubble + overlays in development only.
 * Works across Next 15.x. No effect in production builds.
 */
export default function DevIndicatorHider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const hideEl = (el: Element) => {
      const elStyle = el as HTMLElement;
      elStyle.style.display = 'none';
      elStyle.style.visibility = 'hidden';
      elStyle.style.opacity = '0';
      elStyle.style.pointerEvents = 'none';
      elStyle.style.position = 'absolute';
      elStyle.style.zIndex = '-1';
    };

    const hideAll = () => {
      const selectors = [
        '[data-nextjs-build-indicator]',
        '[data-nextjs-terminal]',
        '[data-nextjs-dialog-overlay]',
        '[data-nextjs-toast]',
        '#__next-build-watcher',
        '#__next-dev-overlay',
        '.__next-dev-build-indicator',
        '.__next-dev-overlay',
        '[class*="__next-dev"]',
        '[id*="__next-dev"]',
      ];

      // Direct DOM elements
      selectors.forEach(sel => document.querySelectorAll(sel).forEach(hideEl));

      // Shadow DOM hosts (defensive): try common roots in Next dev UI
      document.querySelectorAll('*').forEach((possibleHost: Element) => {
        const hostWithShadow = possibleHost as Element & { shadowRoot?: ShadowRoot | null };
        const shadow = hostWithShadow && hostWithShadow.shadowRoot ? hostWithShadow.shadowRoot : null;
        if (shadow) {
          selectors.forEach(sel => shadow.querySelectorAll(sel).forEach(hideEl));
        }
      });
    };

    // Run immediately and observe the DOM for re-insertions
    hideAll();
    const obs = new MutationObserver(hideAll);
    obs.observe(document.documentElement, { childList: true, subtree: true });

    return () => obs.disconnect();
  }, []);

  return null;
}

