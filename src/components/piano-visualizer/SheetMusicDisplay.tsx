'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

type OpenSheetMusicDisplayCtor = new (
  container: HTMLElement,
  options?: Record<string, unknown>,
) => {
  load: (source: string) => Promise<void>;
  render: () => void;
  clear: () => void;
  enableOrDisableCursors?: (enabled: boolean) => void;
  cursor?: {
    reset: () => void;
    show: () => void;
    hide?: () => void;
    next: () => void;
    cursorElement?: HTMLElement;
    Iterator?: {
      EndReached?: boolean;
      currentTimeStamp?: { RealValue?: number };
      CurrentSourceTimestamp?: { RealValue?: number };
      clone?: () => {
        EndReached?: boolean;
        currentTimeStamp?: { RealValue?: number };
        CurrentSourceTimestamp?: { RealValue?: number };
        moveToNextVisibleVoiceEntry?: (notesOnly: boolean) => void;
      };
    };
  };
  Zoom: number;
};

declare global {
  interface Window {
    opensheetmusicdisplay?: {
      OpenSheetMusicDisplay?: OpenSheetMusicDisplayCtor;
    } | OpenSheetMusicDisplayCtor;
    __chordMiniOsmdLoader__?: Promise<OpenSheetMusicDisplayCtor>;
  }
}

interface SheetMusicDisplayProps {
  musicXml: string;
  currentTime?: number;
  totalDuration?: number;
  bpm?: number;
  timeSignature?: number;
  isComputing?: boolean;
  className?: string;
}

interface MeasureHighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

function resolveOsmdConstructor(): OpenSheetMusicDisplayCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const maybeNamespace = window.opensheetmusicdisplay;
  if (!maybeNamespace) {
    return null;
  }

  if (typeof maybeNamespace === 'function') {
    return maybeNamespace as OpenSheetMusicDisplayCtor;
  }

  if (typeof maybeNamespace.OpenSheetMusicDisplay === 'function') {
    return maybeNamespace.OpenSheetMusicDisplay;
  }

  return null;
}

function loadOsmdConstructor(): Promise<OpenSheetMusicDisplayCtor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OSMD can only load in the browser.'));
  }

  const existing = resolveOsmdConstructor();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (window.__chordMiniOsmdLoader__) {
    return window.__chordMiniOsmdLoader__;
  }

  window.__chordMiniOsmdLoader__ = new Promise<OpenSheetMusicDisplayCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/opensheetmusicdisplay/opensheetmusicdisplay.min.js';
    script.async = true;
    script.onload = () => {
      const ctor = resolveOsmdConstructor();
      if (ctor) {
        resolve(ctor);
      } else {
        reject(new Error('OSMD loaded but OpenSheetMusicDisplay was not found on window.'));
      }
    };
    script.onerror = () => reject(new Error('Unable to load local OpenSheetMusicDisplay bundle.'));
    document.head.appendChild(script);
  });

  return window.__chordMiniOsmdLoader__;
}

const SheetMusicDisplayComponent: React.FC<SheetMusicDisplayProps> = ({
  musicXml,
  currentTime = 0,
  totalDuration,
  bpm = 120,
  timeSignature = 4,
  isComputing = false,
  className = '',
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<{
    render: () => void;
    clear: () => void;
    enableOrDisableCursors?: (enabled: boolean) => void;
    cursor?: {
      reset: () => void;
      show: () => void;
      hide?: () => void;
      next: () => void;
      cursorElement?: HTMLElement;
      Iterator?: {
        EndReached?: boolean;
        currentTimeStamp?: { RealValue?: number };
        CurrentSourceTimestamp?: { RealValue?: number };
        clone?: () => {
          EndReached?: boolean;
          currentTimeStamp?: { RealValue?: number };
          CurrentSourceTimestamp?: { RealValue?: number };
          moveToNextVisibleVoiceEntry?: (notesOnly: boolean) => void;
        };
      };
    };
  } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [measureBoxes, setMeasureBoxes] = useState<MeasureHighlightBox[]>([]);

  const getWholeNoteTime = useCallback((seconds: number) => (seconds * bpm) / 240, [bpm]);
  const measureDurationSeconds = (timeSignature * 60) / bpm;
  const activeMeasureIndex = Math.max(0, Math.floor(currentTime / Math.max(measureDurationSeconds, 0.001)));
  const measureCount = Math.max(1, musicXml.match(/<measure number="/g)?.length ?? 0);
  const getIteratorTime = useCallback((
    iterator?: {
      currentTimeStamp?: { RealValue?: number };
      CurrentSourceTimestamp?: { RealValue?: number };
    },
  ) => iterator?.currentTimeStamp?.RealValue ?? iterator?.CurrentSourceTimestamp?.RealValue ?? 0, []);

  const styleMeasureCursor = useCallback(() => {
    const cursorElement = osmdRef.current?.cursor?.cursorElement;
    if (!cursorElement) {
      return;
    }

    cursorElement.style.background = 'rgba(37, 99, 235, 0.22)';
    cursorElement.style.border = 'none';
    cursorElement.style.borderRadius = '8px';
    cursorElement.style.boxSizing = 'border-box';
    cursorElement.style.pointerEvents = 'none';
    cursorElement.style.zIndex = '8';
  }, []);

  const buildMeasureBoxMap = useCallback((): MeasureHighlightBox[] => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    const osmd = osmdRef.current;
    const cursor = osmd?.cursor;
    if (!wrapper || !content || !cursor || measureCount <= 0) {
      return [];
    }

    const boxes: MeasureHighlightBox[] = [];

    try {
      cursor.reset();
      cursor.show();

      for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
        const targetTime = getWholeNoteTime(measureIndex * measureDurationSeconds);
        let safetyCounter = 0;

        while (safetyCounter < 10000) {
          safetyCounter += 1;
          const iterator = cursor.Iterator;
          const clone = iterator?.clone?.();
          if (!clone || clone.EndReached) {
            break;
          }

          clone.moveToNextVisibleVoiceEntry?.(false);
          const nextTime = getIteratorTime(clone);
          if (nextTime <= targetTime + 0.0001) {
            cursor.next();
            continue;
          }

          break;
        }

        const cursorElement = cursor.cursorElement;
        if (!cursorElement) {
          continue;
        }

        styleMeasureCursor();

        const contentRect = content.getBoundingClientRect();
        const cursorRect = cursorElement.getBoundingClientRect();
        boxes[measureIndex] = {
          top: cursorRect.top - contentRect.top,
          left: cursorRect.left - contentRect.left,
          width: cursorRect.width,
          height: cursorRect.height,
        };
      }

      cursor.hide?.();
    } catch {
      return [];
    }

    return boxes;
  }, [getIteratorTime, getWholeNoteTime, measureCount, measureDurationSeconds, styleMeasureCursor]);

  const activeMeasureBox = measureBoxes[activeMeasureIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    const wrapper = wrapperRef.current;
    const container = containerRef.current;

    async function renderSheetMusic() {
      if (!container || !wrapper || !musicXml.trim()) {
        setMeasureBoxes([]);
        return;
      }

      setIsRendering(true);
      setRenderError(null);

      try {
        const OpenSheetMusicDisplay = await loadOsmdConstructor();
        if (cancelled || !container) {
          return;
        }

        container.innerHTML = '';
        container.style.width = `${Math.max(wrapper.clientWidth - 32, 640)}px`;

        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          backend: 'svg',
          drawTitle: false,
          drawComposer: false,
          drawPartNames: true,
          drawingParameters: 'compact',
          renderSingleHorizontalStaffline: false,
          followCursor: false,
          cursorsOptions: [{
            type: 3,
            color: '#2563eb',
            alpha: 0.24,
            follow: false,
          }],
        });

        await osmd.load(musicXml);
        if (cancelled) {
          return;
        }

        osmd.Zoom = 0.82;
        osmd.render();
        osmd.enableOrDisableCursors?.(true);
        osmd.cursor?.reset();
        osmd.cursor?.show();
        osmdRef.current = osmd;
        styleMeasureCursor();
        setMeasureBoxes(buildMeasureBoxMap());
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to render sheet music.';
          setRenderError(message);
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    renderSheetMusic();

    return () => {
      cancelled = true;
      if (container) {
        container.innerHTML = '';
      }
      osmdRef.current = null;
      setMeasureBoxes([]);
    };
  }, [buildMeasureBoxMap, musicXml, styleMeasureCursor]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !activeMeasureBox) {
      return;
    }

    try {
      const topOffset = activeMeasureBox.top;
      const bottomOffset = activeMeasureBox.top + activeMeasureBox.height;
      const currentTop = wrapper.scrollTop;
      const currentBottom = currentTop + wrapper.clientHeight;
      const topSafeZone = wrapper.clientHeight * 0.22;
      const bottomSafeZone = wrapper.clientHeight * 0.4;
      const visibleTopBoundary = currentTop + topSafeZone;
      const visibleBottomBoundary = currentBottom - bottomSafeZone;
      const desiredCenterTop = Math.max(
        0,
        topOffset - (wrapper.clientHeight - activeMeasureBox.height) * 0.42,
      );

      if (topOffset < visibleTopBoundary || bottomOffset > visibleBottomBoundary) {
        wrapper.scrollTo({
          top: desiredCenterTop,
          behavior: 'auto',
        });
      }
    } catch {
      if (!totalDuration || totalDuration <= 0) {
        return;
      }

      const ratio = Math.min(1, Math.max(0, currentTime / totalDuration));
      const maxScrollTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
      wrapper.scrollTo({
        top: ratio * maxScrollTop,
        behavior: 'auto',
      });
    }
  }, [activeMeasureBox, currentTime, totalDuration]);

  useEffect(() => {
    function handleResize() {
      try {
        osmdRef.current?.render();
        setMeasureBoxes(buildMeasureBoxMap());
      } catch {
        // Ignore re-render issues on resize; the next prop change will refresh.
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [buildMeasureBoxMap]);

  return (
    <div className={`bg-white text-gray-900 ${className}`}>
      {(isRendering || isComputing) && (
        <div className="mb-3 text-sm text-gray-600">
          {isComputing ? 'Preparing sheet music...' : 'Rendering sheet music...'}
        </div>
      )}
      {renderError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {renderError}
        </div>
      )}
      <div ref={wrapperRef} className="h-[68vh] max-h-[760px] overflow-y-auto overflow-x-hidden bg-white">
        <div
          ref={contentRef}
          className="relative mx-auto min-h-[320px] bg-white"
        >
          {activeMeasureBox && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-lg bg-[rgba(37,99,235,0.22)]"
              style={{
                top: activeMeasureBox.top,
                left: activeMeasureBox.left,
                width: activeMeasureBox.width,
                height: activeMeasureBox.height,
                zIndex: 8,
              }}
            />
          )}
          <div
            ref={containerRef}
            className="min-h-[320px] bg-white [&_svg]:h-auto [&_svg]:max-w-none"
          />
        </div>
      </div>
    </div>
  );
};

function getMeasureIndexForProps({
  currentTime = 0,
  bpm = 120,
  timeSignature = 4,
}: Pick<SheetMusicDisplayProps, 'currentTime' | 'bpm' | 'timeSignature'>): number {
  const measureDurationSeconds = (timeSignature * 60) / bpm;
  return Math.max(0, Math.floor(currentTime / Math.max(measureDurationSeconds, 0.001)));
}

export const SheetMusicDisplay = memo(
  SheetMusicDisplayComponent,
  (prevProps, nextProps) => (
    prevProps.musicXml === nextProps.musicXml
    && prevProps.totalDuration === nextProps.totalDuration
    && prevProps.bpm === nextProps.bpm
    && prevProps.timeSignature === nextProps.timeSignature
    && prevProps.isComputing === nextProps.isComputing
    && prevProps.className === nextProps.className
    && getMeasureIndexForProps(prevProps) === getMeasureIndexForProps(nextProps)
  ),
);

export default SheetMusicDisplay;
