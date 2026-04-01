'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import { Chip } from '@heroui/react';
import { motion } from 'framer-motion';
import UtilityPopoverPanel from '@/components/analysis/UtilityPopoverPanel';

interface CapoNeckPreviewProps {
  capoFret: number;
  suggestedCapoFret?: number | null;
  onCapoFretChange?: (fret: number) => void;
}

const SVG_WIDTH = 312;
const SVG_HEIGHT = 112;
const NECK_LEFT = 30;
const NECK_RIGHT = 290;
const NECK_TOP = 26;
const NECK_BOTTOM = 92;
const STRING_COUNT = 6;
const DEFAULT_FRET_COUNT = 12;
const FRET_MARKERS = [3, 5, 7, 9, 12];

function clampCapoFret(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(12, value));
}

export default function CapoNeckPreview({
  capoFret,
  suggestedCapoFret = null,
  onCapoFretChange,
}: CapoNeckPreviewProps) {
  const currentFret = clampCapoFret(capoFret);
  const suggestedFret = suggestedCapoFret == null ? null : clampCapoFret(suggestedCapoFret);
  const isDraggingRef = useRef(false);

  const fretCount = useMemo(() => DEFAULT_FRET_COUNT, []);

  const fretSpacing = (NECK_RIGHT - NECK_LEFT) / fretCount;
  const currentCapoX = NECK_LEFT + fretSpacing * currentFret;
  const neckWidth = NECK_RIGHT - NECK_LEFT;
  const nutWidth = 7;

  const stringLines = Array.from({ length: STRING_COUNT }, (_, index) => {
    const ratio = index / (STRING_COUNT - 1);
    return NECK_TOP + ((NECK_BOTTOM - NECK_TOP) * ratio);
  });

  const getFretFromClientX = useCallback((bounds: DOMRect | ReturnType<SVGRectElement['getBoundingClientRect']>, clientX: number): number => {
    const relativeX = clientX - bounds.left;
    const normalized = bounds.width > 0 ? relativeX / bounds.width : 0;
    return clampCapoFret(Math.round(normalized * fretCount));
  }, [fretCount]);

  const updateCapoFromPointer = useCallback((event: React.PointerEvent<SVGRectElement>) => {
    if (!onCapoFretChange) {
      return;
    }

    onCapoFretChange(getFretFromClientX(event.currentTarget.getBoundingClientRect(), event.clientX));
  }, [getFretFromClientX, onCapoFretChange]);

  const updateCapoFromMouse = useCallback((event: React.MouseEvent<SVGRectElement>) => {
    if (!onCapoFretChange) {
      return;
    }

    onCapoFretChange(getFretFromClientX(event.currentTarget.getBoundingClientRect(), event.clientX));
  }, [getFretFromClientX, onCapoFretChange]);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGRectElement>) => {
    if (!onCapoFretChange) {
      return;
    }

    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateCapoFromPointer(event);
  }, [onCapoFretChange, updateCapoFromPointer]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGRectElement>) => {
    if (!isDraggingRef.current) {
      return;
    }

    updateCapoFromPointer(event);
  }, [updateCapoFromPointer]);

  const handlePointerRelease = useCallback((event: React.PointerEvent<SVGRectElement>) => {
    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent<SVGRectElement>) => {
    if (!onCapoFretChange) {
      return;
    }

    isDraggingRef.current = true;
    updateCapoFromMouse(event);
  }, [onCapoFretChange, updateCapoFromMouse]);

  const handleMouseMove = useCallback((event: React.MouseEvent<SVGRectElement>) => {
    if (!isDraggingRef.current) {
      return;
    }

    updateCapoFromMouse(event);
  }, [updateCapoFromMouse]);

  const handleMouseRelease = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <UtilityPopoverPanel bodyClassName="gap-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {suggestedFret != null
                ? suggestedFret === 0
                  ? 'Suggested: no capo'
                  : `Suggested: fret ${suggestedFret}`
                : 'Capo preview'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {currentFret === 0 ? 'Current: no capo' : `Current: fret ${currentFret}`}
            </p>
          </div>
          <Chip
            size="sm"
            variant="flat"
            classNames={{
              base: 'border border-white/20 bg-white/40 dark:bg-slate-900/35',
              content: 'text-[11px] font-medium text-slate-700 dark:text-slate-200',
            }}
          >
            Frets 0-{fretCount}
          </Chip>
        </div>

        <svg
          aria-hidden="true"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="h-auto w-full"
          role="presentation"
        >
          <rect
            x={NECK_LEFT - 8}
            y={NECK_TOP - 4}
            width={neckWidth + 10}
            height={(NECK_BOTTOM - NECK_TOP) + 8}
            rx={15}
            fill="transparent"
            stroke="rgba(148, 163, 184, 0.35)"
          />

          <rect
            x={NECK_LEFT - 10}
            y={NECK_TOP - 5}
            width={nutWidth}
            height={(NECK_BOTTOM - NECK_TOP) + 10}
            rx={3}
            fill="rgba(71, 85, 105, 0.95)"
          />

          {Array.from({ length: fretCount + 1 }, (_, fretIndex) => {
            const x = NECK_LEFT + (fretSpacing * fretIndex);
            const strokeWidth = fretIndex === 0 ? 0 : fretIndex === fretCount ? 1.2 : 1;
            return (
              <line
                key={`fret-${fretIndex}`}
                x1={x}
                x2={x}
                y1={NECK_TOP}
                y2={NECK_BOTTOM}
                stroke="rgba(148, 163, 184, 0.7)"
                strokeWidth={strokeWidth}
              />
            );
          })}

          {stringLines.map((y, index) => (
            <line
              key={`string-${index}`}
              x1={NECK_LEFT}
              x2={NECK_RIGHT}
              y1={y}
              y2={y}
              stroke="rgba(100, 116, 139, 0.9)"
              strokeWidth={index === 0 ? 1.6 : 1.2}
            />
          ))}

          {FRET_MARKERS.filter((marker) => marker <= fretCount).map((marker) => {
            const x = NECK_LEFT + (fretSpacing * (marker - 0.5));
            const isDoubleMarker = marker === 12;

            if (isDoubleMarker) {
              return (
                <React.Fragment key={`marker-${marker}`}>
                  <circle cx={x} cy={NECK_TOP + 18} r={3.2} fill="rgba(71, 85, 105, 0.7)" />
                  <circle cx={x} cy={NECK_BOTTOM - 18} r={3.2} fill="rgba(71, 85, 105, 0.7)" />
                </React.Fragment>
              );
            }

            return <circle key={`marker-${marker}`} cx={x} cy={(NECK_TOP + NECK_BOTTOM) / 2} r={3.2} fill="rgba(71, 85, 105, 0.7)" />;
          })}

          <rect
            x={NECK_LEFT}
            y={NECK_TOP - 8}
            width={neckWidth}
            height={(NECK_BOTTOM - NECK_TOP) + 16}
            rx={12}
            fill="transparent"
            className={onCapoFretChange ? 'cursor-grab active:cursor-grabbing' : undefined}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerRelease}
            onPointerCancel={handlePointerRelease}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseRelease}
            onMouseLeave={handleMouseRelease}
            data-testid="capo-drag-surface"
          />

          {currentFret > 0 && (
            <motion.rect
              data-testid="capo-current-strip"
              initial={false}
              animate={{ x: currentCapoX - 4 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              y={NECK_TOP - 5}
              width={8}
              height={(NECK_BOTTOM - NECK_TOP) + 10}
              rx={4}
              fill="rgba(59, 130, 246, 0.35)"
              stroke="rgba(59, 130, 246, 0.85)"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
    </UtilityPopoverPanel>
  );
}
