'use client';

import { useSyncExternalStore } from 'react';

export interface ViewportSnapshot {
  width: number;
  height: number;
  isMobile: boolean;
}

const MOBILE_BREAKPOINT_PX = 768;
const SERVER_SNAPSHOT: ViewportSnapshot = {
  width: 1024,
  height: 768,
  isMobile: false,
};

let currentSnapshot: ViewportSnapshot = SERVER_SNAPSHOT;
let isListening = false;
let mobileMediaQuery: MediaQueryList | null = null;
const listeners = new Set<() => void>();

function readViewportSnapshot(): ViewportSnapshot {
  if (typeof window === 'undefined') {
    return SERVER_SNAPSHOT;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    isMobile: width < MOBILE_BREAKPOINT_PX,
  };
}

function snapshotsEqual(left: ViewportSnapshot, right: ViewportSnapshot): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.isMobile === right.isMobile;
}

function emitIfChanged() {
  const nextSnapshot = readViewportSnapshot();
  if (snapshotsEqual(currentSnapshot, nextSnapshot)) {
    return;
  }

  currentSnapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
}

function ensureListening() {
  if (isListening || typeof window === 'undefined') {
    return;
  }

  currentSnapshot = readViewportSnapshot();
  window.addEventListener('resize', emitIfChanged, { passive: true });
  window.addEventListener('orientationchange', emitIfChanged, { passive: true });
  mobileMediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
  mobileMediaQuery.addEventListener('change', emitIfChanged);
  isListening = true;
}

function stopListeningIfIdle() {
  if (!isListening || listeners.size > 0 || typeof window === 'undefined') {
    return;
  }

  window.removeEventListener('resize', emitIfChanged);
  window.removeEventListener('orientationchange', emitIfChanged);
  mobileMediaQuery?.removeEventListener('change', emitIfChanged);
  mobileMediaQuery = null;
  isListening = false;
}

function subscribe(listener: () => void): () => void {
  ensureListening();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    stopListeningIfIdle();
  };
}

function getSnapshot(): ViewportSnapshot {
  if (typeof window === 'undefined') {
    return SERVER_SNAPSHOT;
  }

  const nextSnapshot = readViewportSnapshot();
  if (!snapshotsEqual(currentSnapshot, nextSnapshot)) {
    currentSnapshot = nextSnapshot;
  }
  return currentSnapshot;
}

function getServerSnapshot(): ViewportSnapshot {
  return SERVER_SNAPSHOT;
}

export function useViewportSnapshot(): ViewportSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

