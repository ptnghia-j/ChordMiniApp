'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

interface ScoreSyncData {
  measureStartScoreTimes: number[];
  measureStartAudioTimes: number[];
}

interface RasterizedScorePage {
  dataUrl: string;
  width: number;
  height: number;
}

interface PdfWriter {
  addPage: () => void;
  addImage: (...args: unknown[]) => void;
  internal: {
    pageSize: {
      getWidth: () => number;
      getHeight: () => number;
    };
  };
  save: (filename: string) => void;
}

function collectRenderableScoreCanvases(container: HTMLElement): HTMLCanvasElement[] {
  const MIN_SCORE_WIDTH = 120;
  const MIN_SCORE_HEIGHT = 80;

  return Array.from(container.querySelectorAll('canvas'))
    .filter((element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement)
    .filter((canvas) => canvas.width >= MIN_SCORE_WIDTH && canvas.height >= MIN_SCORE_HEIGHT);
}

function rasterizeScoreCanvasPages(container: HTMLElement): RasterizedScorePage[] {
  const canvases = collectRenderableScoreCanvases(container);
  const pages: RasterizedScorePage[] = [];

  for (const canvas of canvases) {
    try {
      pages.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: Math.max(1, canvas.width),
        height: Math.max(1, canvas.height),
      });
    } catch {
      // Ignore tainted or unreadable canvases and continue with other pages/fallbacks.
      continue;
    }
  }

  return pages;
}

async function rasterizeScoreWithDedicatedCanvasBackend(params: {
  musicXml: string;
  targetWidth: number;
}): Promise<RasterizedScorePage[]> {
  if (typeof document === 'undefined') {
    return [];
  }

  const { musicXml, targetWidth } = params;
  const OpenSheetMusicDisplay = await loadOsmdConstructor();
  const host = document.createElement('div');
  const exportContainer = document.createElement('div');

  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${Math.max(640, Math.ceil(targetWidth))}px`;
  host.style.background = '#ffffff';
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  host.setAttribute('aria-hidden', 'true');

  exportContainer.style.width = '100%';
  exportContainer.style.background = '#ffffff';
  host.appendChild(exportContainer);
  document.body.appendChild(host);

  try {
    const exportOsmd = new OpenSheetMusicDisplay(exportContainer, {
      autoResize: false,
      backend: 'canvas',
      drawTitle: false,
      drawComposer: false,
      drawPartNames: true,
      drawingParameters: 'compact',
      renderSingleHorizontalStaffline: false,
      followCursor: false,
      cursorsOptions: [],
    });

    await exportOsmd.load(musicXml);
    exportOsmd.Zoom = 0.82;
    exportOsmd.render();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    return rasterizeScoreCanvasPages(exportContainer);
  } catch {
    return [];
  } finally {
    host.remove();
  }
}

function appendImageToPdfPages(params: {
  pdf: PdfWriter;
  imageData: string;
  sourceWidth: number;
  sourceHeight: number;
  addPageBefore: boolean;
}): void {
  const {
    pdf,
    imageData,
    sourceWidth,
    sourceHeight,
    addPageBefore,
  } = params;

  if (addPageBefore) {
    pdf.addPage();
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const renderedWidth = pageWidth;
  const renderedHeight = (sourceHeight * renderedWidth) / Math.max(sourceWidth, 1);
  let heightLeft = renderedHeight;
  let positionY = 0;

  pdf.addImage(imageData, 'PNG', 0, positionY, renderedWidth, renderedHeight, undefined, 'FAST');
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    positionY = heightLeft - renderedHeight;
    pdf.addPage();
    pdf.addImage(imageData, 'PNG', 0, positionY, renderedWidth, renderedHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
  }
}

function normalizeMeasureStartTimes(rawTimes: unknown): number[] {
  if (!Array.isArray(rawTimes)) {
    return [];
  }

  return rawTimes
    .filter((value) => Number.isFinite(value))
    .map((value) => Number(value));
}

function extractSyncDataFromMusicXml(musicXml: string): ScoreSyncData {
  const syncMatch = musicXml.match(/chordmini-sync-data:([\s\S]*?)-->/i);
  if (!syncMatch) {
    return {
      measureStartScoreTimes: [],
      measureStartAudioTimes: [],
    };
  }

  try {
    const parsed = JSON.parse(syncMatch[1].trim()) as {
      measureStartScoreTimes?: unknown;
      measureStartAudioTimes?: unknown;
    };

    return {
      measureStartScoreTimes: normalizeMeasureStartTimes(parsed.measureStartScoreTimes),
      measureStartAudioTimes: normalizeMeasureStartTimes(parsed.measureStartAudioTimes),
    };
  } catch {
    return {
      measureStartScoreTimes: [],
      measureStartAudioTimes: [],
    };
  }
}

function isStrictlyIncreasing(values: number[]): boolean {
  if (values.length < 2) {
    return false;
  }

  for (let index = 1; index < values.length; index += 1) {
    if (!Number.isFinite(values[index]) || values[index] <= values[index - 1] + 0.000001) {
      return false;
    }
  }

  return true;
}

function resolveMeasureStartScoreTimes(
  syncData: ScoreSyncData,
  measureCount: number,
  measureDurationSeconds: number,
): number[] {
  if (syncData.measureStartScoreTimes.length >= measureCount) {
    return syncData.measureStartScoreTimes.slice(0, measureCount);
  }

  return Array.from({ length: measureCount }, (_, measureIndex) => (
    Number((measureIndex * measureDurationSeconds).toFixed(6))
  ));
}

function getActiveMeasureIndexFromAudioTime(
  currentTime: number,
  syncData: ScoreSyncData,
  bpm: number,
  timeSignature: number,
): number {
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  const starts = syncData.measureStartAudioTimes;

  if (isStrictlyIncreasing(starts)) {
    let left = 0;
    let right = starts.length - 1;
    let answer = 0;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      if (safeCurrentTime >= starts[middle]) {
        answer = middle;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    return Math.max(0, answer);
  }

  const measureDurationSeconds = (timeSignature * 60) / bpm;
  return Math.max(0, Math.floor(safeCurrentTime / Math.max(measureDurationSeconds, 0.001)));
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
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [measureBoxes, setMeasureBoxes] = useState<MeasureHighlightBox[]>([]);
  const syncData = useMemo(() => extractSyncDataFromMusicXml(musicXml), [musicXml]);

  const getWholeNoteTime = useCallback((seconds: number) => (seconds * bpm) / 240, [bpm]);
  const measureDurationSeconds = (timeSignature * 60) / bpm;
  const measureCount = Math.max(1, musicXml.match(/<measure\b/g)?.length ?? 0);
  const measureStartScoreTimes = useMemo(
    () => resolveMeasureStartScoreTimes(syncData, measureCount, measureDurationSeconds),
    [measureCount, measureDurationSeconds, syncData],
  );
  const rawActiveMeasureIndex = getActiveMeasureIndexFromAudioTime(currentTime, syncData, bpm, timeSignature);
  const maxRenderableMeasureIndex = Math.max(0, (measureBoxes.length > 0 ? measureBoxes.length : measureCount) - 1);
  const activeMeasureIndex = Math.min(rawActiveMeasureIndex, maxRenderableMeasureIndex);
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
        const targetScoreTime = measureStartScoreTimes[measureIndex] ?? (measureIndex * measureDurationSeconds);
        const targetTime = getWholeNoteTime(targetScoreTime);
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

      const extractedBoxes = boxes.filter((box): box is MeasureHighlightBox => Boolean(box));
      if (extractedBoxes.length === 0) {
        return [];
      }

      const normalizedBoxes: MeasureHighlightBox[] = [];
      for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
        normalizedBoxes[measureIndex] = boxes[measureIndex] ?? normalizedBoxes[measureIndex - 1] ?? extractedBoxes[0];
      }

      const contentWidth = content.getBoundingClientRect().width;
      const MIN_VISIBLE_WIDTH = 24;
      const MIN_VISIBLE_HEIGHT = 44;

      const visualBoxes = normalizedBoxes.map((box, index) => {
        const next = normalizedBoxes[index + 1];
        const estimatedWidth = next
          ? Math.max(1, next.left - box.left)
          : Math.max(1, contentWidth - box.left);
        const width = box.width >= 8 ? box.width : Math.max(MIN_VISIBLE_WIDTH, estimatedWidth);
        const height = box.height >= 8 ? box.height : Math.max(MIN_VISIBLE_HEIGHT, box.height);
        const top = box.height >= 8 ? box.top : Math.max(0, box.top - ((height - box.height) / 2));

        return {
          top,
          left: box.left,
          width,
          height,
        };
      });

      return visualBoxes;
    } catch {
      return [];
    }
  }, [getIteratorTime, getWholeNoteTime, measureCount, measureDurationSeconds, measureStartScoreTimes, styleMeasureCursor]);

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

  const handleDownloadPdf = useCallback(async () => {
    if (isExportingPdf || isRendering || isComputing || !musicXml.trim()) {
      return;
    }

    const content = contentRef.current;
    if (!content) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const fontSet = (document as Document & {
        fonts?: {
          status?: string;
          ready: Promise<unknown>;
        };
      }).fonts;
      if (fontSet && fontSet.status !== 'loaded') {
        try {
          await fontSet.ready;
        } catch {
          // Continue export with currently available fonts.
        }
      }

      const { jsPDF } = await import('jspdf');

      const dedicatedCanvasPages = await rasterizeScoreWithDedicatedCanvasBackend({
        musicXml,
        targetWidth: content.clientWidth || content.scrollWidth,
      });

      if (dedicatedCanvasPages.length === 0) {
        throw new Error('No score pages were rendered for PDF export.');
      }

      const [firstPage, ...remainingPages] = dedicatedCanvasPages;
      const pdf = new jsPDF({
        orientation: firstPage.width > firstPage.height ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'a4',
      }) as unknown as PdfWriter;

      appendImageToPdfPages({
        pdf,
        imageData: firstPage.dataUrl,
        sourceWidth: firstPage.width,
        sourceHeight: firstPage.height,
        addPageBefore: false,
      });

      for (const page of remainingPages) {
        appendImageToPdfPages({
          pdf,
          imageData: page.dataUrl,
          sourceWidth: page.width,
          sourceHeight: page.height,
          addPageBefore: true,
        });
      }

      pdf.save('sheet-music.pdf');
    } catch {
      setRenderError('Unable to export sheet music as PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [isComputing, isExportingPdf, isRendering, musicXml]);

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
      <div className="relative">
        {musicXml.trim() && (
          <button
            type="button"
            onClick={() => {
              void handleDownloadPdf();
            }}
            disabled={isRendering || isComputing || isExportingPdf}
            className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-md border border-gray-300 bg-white/95 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            title="Download sheet music as PDF"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isExportingPdf ? 'Exporting...' : 'PDF'}
          </button>
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
    </div>
  );
};

function getMeasureIndexForProps({
  musicXml,
  currentTime = 0,
  bpm = 120,
  timeSignature = 4,
}: Pick<SheetMusicDisplayProps, 'musicXml' | 'currentTime' | 'bpm' | 'timeSignature'>): number {
  const syncData = extractSyncDataFromMusicXml(musicXml);
  return getActiveMeasureIndexFromAudioTime(currentTime, syncData, bpm, timeSignature);
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
