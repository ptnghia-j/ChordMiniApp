'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadOsmdConstructor } from './osmdLoader';
import { appendImageToPdfPages, rasterizeScoreWithDedicatedCanvasBackend } from './pdfExport';
import {
  countScoreMeasuresInMusicXml,
  extractSyncDataFromMusicXml,
  getActiveMeasureIndexFromAudioTime,
  resolveMeasureScrollTop,
  resolveMeasureStartScoreTimes,
  stabilizeMeasureBoxAnchors,
} from './sync';
import type { MeasureHighlightBox, OpenSheetMusicDisplayCtor, PdfWriter } from './types';

interface UseSheetMusicRendererParams {
  musicXml: string;
  currentTime: number;
  totalDuration?: number;
  bpm: number;
  timeSignature: number;
  isComputing: boolean;
}

export function useSheetMusicRenderer({
  musicXml,
  currentTime,
  totalDuration,
  bpm,
  timeSignature,
  isComputing,
}: UseSheetMusicRendererParams) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<InstanceType<OpenSheetMusicDisplayCtor> | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [measureBoxes, setMeasureBoxes] = useState<MeasureHighlightBox[]>([]);
  const [wrapperViewportHeight, setWrapperViewportHeight] = useState(0);
  const [isPresentationReady, setIsPresentationReady] = useState(false);
  const syncData = useMemo(() => extractSyncDataFromMusicXml(musicXml), [musicXml]);

  const getWholeNoteTime = useCallback((seconds: number) => (seconds * bpm) / 240, [bpm]);
  const measureDurationSeconds = (timeSignature * 60) / bpm;
  const measureCount = useMemo(
    () => countScoreMeasuresInMusicXml(musicXml, syncData),
    [musicXml, syncData],
  );
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
          if (!iterator || iterator.EndReached) {
            break;
          }

          const currentIteratorTime = getIteratorTime(iterator);
          if (currentIteratorTime >= targetTime - 0.0001) {
            break;
          }

          const clone = iterator.clone?.();
          if (!clone || clone.EndReached) {
            break;
          }

          clone.moveToNextVisibleVoiceEntry?.(false);
          if (clone.EndReached) {
            break;
          }

          const nextTime = getIteratorTime(clone);
          if (nextTime <= currentIteratorTime + 0.0001) {
            break;
          }

          cursor.next();
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

      const stabilizedBoxes = stabilizeMeasureBoxAnchors(boxes, measureCount);
      if (stabilizedBoxes.length === 0) {
        return [];
      }

      const contentWidth = content.getBoundingClientRect().width;
      const MIN_VISIBLE_WIDTH = 24;
      const MIN_VISIBLE_HEIGHT = 44;

      const visualBoxes = stabilizedBoxes.map((box, index) => {
        const next = stabilizedBoxes[index + 1];
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
  const isDisplayBusy = isComputing || isRendering || !isPresentationReady;
  const loadingStageLabel = isComputing ? 'Preparing Sheet Music' : 'Rendering Sheet Music';
  const contentBottomScrollPadding = useMemo(
    () => Math.min(420, Math.max(220, Math.round(wrapperViewportHeight * 0.55))),
    [wrapperViewportHeight],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updateWrapperViewportHeight = () => {
      setWrapperViewportHeight(wrapper.clientHeight);
    };

    updateWrapperViewportHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateWrapperViewportHeight);
      resizeObserver.observe(wrapper);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener('resize', updateWrapperViewportHeight);
    return () => window.removeEventListener('resize', updateWrapperViewportHeight);
  }, []);

  useEffect(() => {
    if (isComputing || !musicXml.trim()) {
      setIsPresentationReady(false);
    }
  }, [isComputing, musicXml]);

  useEffect(() => {
    let cancelled = false;
    const wrapper = wrapperRef.current;
    const container = containerRef.current;

    async function renderSheetMusic() {
      if (!container || !wrapper || !musicXml.trim()) {
        setMeasureBoxes([]);
        setIsPresentationReady(false);
        return;
      }

      setIsRendering(true);
      setIsPresentationReady(false);
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
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
        if (!cancelled) {
          setIsPresentationReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to render sheet music.';
          setRenderError(message);
          setIsPresentationReady(false);
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderSheetMusic();

    return () => {
      cancelled = true;
      if (container) {
        container.innerHTML = '';
      }
      osmdRef.current = null;
      setMeasureBoxes([]);
      setIsPresentationReady(false);
    };
  }, [buildMeasureBoxMap, musicXml, styleMeasureCursor]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !activeMeasureBox || isDisplayBusy) {
      return;
    }

    try {
      const targetScrollTop = resolveMeasureScrollTop({
        activeMeasureBox,
        currentScrollTop: wrapper.scrollTop,
        viewportHeight: wrapper.clientHeight,
        scrollHeight: wrapper.scrollHeight,
      });

      if (targetScrollTop !== null) {
        wrapper.scrollTo({
          top: targetScrollTop,
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
  }, [activeMeasureBox, currentTime, isDisplayBusy, totalDuration]);

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

  return {
    wrapperRef,
    contentRef,
    containerRef,
    activeMeasureBox,
    isDisplayBusy,
    loadingStageLabel,
    contentBottomScrollPadding,
    isRendering,
    isExportingPdf,
    renderError,
    handleDownloadPdf,
  };
}
