'use client';

import { useEffect, useMemo, useState } from 'react';
import { exportScorePartsToMusicXml, type MusicXmlExportOptions, type ScorePartData } from '@/utils/musicXmlExport';

interface UseMusicXmlRendererResult {
  musicXml: string;
  isComputing: boolean;
}

export function useMusicXmlRenderer(
  parts: ScorePartData[],
  options?: MusicXmlExportOptions,
): UseMusicXmlRendererResult {
  const [musicXml, setMusicXml] = useState('');
  const [isComputing, setIsComputing] = useState(false);
  const bpm = options?.bpm;
  const timeSignature = options?.timeSignature;
  const title = options?.title;
  const resolvedOptions = useMemo(() => ({
    bpm,
    timeSignature,
    title,
  }), [bpm, timeSignature, title]);

  useEffect(() => {
    if (parts.length === 0) {
      return;
    }

    let cancelled = false;
    let worker: Worker | null = null;
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const finalizeWithXml = (xml: string) => {
      if (cancelled || settled) return;
      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      setMusicXml(xml);
      setIsComputing(false);
      worker?.terminate();
    };

    const finalizeWithFallback = () => {
      finalizeWithXml(exportScorePartsToMusicXml(parts, resolvedOptions));
    };

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      queueMicrotask(() => {
        finalizeWithFallback();
      });
      return;
    }

    try {
      worker = new Worker(
        new URL('../../workers/musicXmlExport.worker.ts', import.meta.url),
        { type: 'module' },
      );

      queueMicrotask(() => {
        if (!cancelled) {
          setIsComputing(true);
        }
      });

      worker.onmessage = (event: MessageEvent<{ xml: string }>) => {
        finalizeWithXml(event.data.xml);
      };

      worker.onerror = () => {
        finalizeWithFallback();
      };

      fallbackTimer = setTimeout(() => {
        finalizeWithFallback();
      }, 1200);

      worker.postMessage({ parts, options: resolvedOptions });
    } catch {
      queueMicrotask(() => {
        finalizeWithFallback();
      });
    }

    return () => {
      cancelled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      worker?.terminate();
    };
  }, [parts, resolvedOptions]);

  return {
    musicXml: parts.length === 0 ? '' : musicXml,
    isComputing: parts.length === 0 ? false : isComputing,
  };
}

export default useMusicXmlRenderer;
