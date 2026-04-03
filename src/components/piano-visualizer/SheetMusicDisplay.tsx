'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface SheetMusicDisplayProps {
  musicXml: string;
  currentTime?: number;
  totalDuration?: number;
  bpm?: number;
  isComputing?: boolean;
  className?: string;
}

export const SheetMusicDisplay: React.FC<SheetMusicDisplayProps> = ({
  musicXml,
  currentTime = 0,
  totalDuration,
  bpm = 120,
  isComputing = false,
  className = '',
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  const getWholeNoteTime = useCallback((seconds: number) => (seconds * bpm) / 240, [bpm]);
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

    cursorElement.style.background = 'rgba(37, 99, 235, 0.18)';
    cursorElement.style.border = '2px solid rgba(37, 99, 235, 0.55)';
    cursorElement.style.borderRadius = '8px';
    cursorElement.style.boxSizing = 'border-box';
    cursorElement.style.pointerEvents = 'none';
    cursorElement.style.zIndex = '8';
  }, []);

  useEffect(() => {
    let cancelled = false;
    const wrapper = wrapperRef.current;
    const container = containerRef.current;

    async function renderSheetMusic() {
      if (!container || !wrapper || !musicXml.trim()) {
        return;
      }

      setIsRendering(true);
      setRenderError(null);

      try {
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
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
    };
  }, [musicXml, styleMeasureCursor]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const osmd = osmdRef.current;
    const cursor = osmd?.cursor;
    if (!wrapper || !cursor) {
      return;
    }

    try {
      cursor.reset();
      cursor.show();

      const targetTime = getWholeNoteTime(currentTime);
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
        return;
      }

      styleMeasureCursor();

      const wrapperRect = wrapper.getBoundingClientRect();
      const cursorRect = cursorElement.getBoundingClientRect();
      const topOffset = cursorRect.top - wrapperRect.top + wrapper.scrollTop;
      const focusTop = Math.max(0, topOffset - wrapper.clientHeight * 0.35);

      wrapper.scrollTo({
        top: focusTop,
        behavior: 'smooth',
      });
    } catch {
      if (!totalDuration || totalDuration <= 0) {
        return;
      }

      const ratio = Math.min(1, Math.max(0, currentTime / totalDuration));
      const maxScrollTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
      wrapper.scrollTo({
        top: ratio * maxScrollTop,
        behavior: 'smooth',
      });
    }
  }, [currentTime, getIteratorTime, getWholeNoteTime, styleMeasureCursor, totalDuration]);

  useEffect(() => {
    function handleResize() {
      try {
        osmdRef.current?.render();
      } catch {
        // Ignore re-render issues on resize; the next prop change will refresh.
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          ref={containerRef}
          className="mx-auto min-h-[320px] bg-white [&_svg]:h-auto [&_svg]:max-w-none"
        />
      </div>
    </div>
  );
};

export default SheetMusicDisplay;
