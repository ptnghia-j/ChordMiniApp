'use client';

import React, { memo, useState } from 'react';
import AppTooltip from '@/components/common/AppTooltip';
import { SheetMusicLoadingSkeleton } from './SheetMusicLoadingSkeleton';
import { extractSyncDataFromMusicXml, getActiveMeasureIndexFromAudioTime } from './sync';
import { useSheetMusicRenderer } from './useSheetMusicRenderer';
import type { SheetMusicPdfSize } from './types';

export interface SheetMusicDisplayProps {
  musicXml: string;
  currentTime?: number;
  totalDuration?: number;
  bpm?: number;
  timeSignature?: number;
  isComputing?: boolean;
  className?: string;
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
  const [isPdfSizeMenuOpen, setIsPdfSizeMenuOpen] = useState(false);
  const {
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
  } = useSheetMusicRenderer({
    musicXml,
    currentTime,
    totalDuration,
    bpm,
    timeSignature,
    isComputing,
  });
  const isPdfActionDisabled = isRendering || isComputing || isExportingPdf;
  const pdfSizeOptions: Array<{ value: SheetMusicPdfSize; label: string; description: string }> = [
    { value: 'normal', label: '100%', description: 'Normal' },
    { value: 'large', label: '120%', description: 'Larger' },
    { value: 'extra-large', label: '140%', description: 'Extra large' },
  ];

  return (
    <div className={`bg-white text-gray-900 ${className}`}>
      {renderError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {renderError}
        </div>
      )}
      <div className="relative">
        {musicXml.trim() && (
          <div className="absolute right-3 top-3 z-20">
            <AppTooltip content="Download sheet music as PDF">
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={() => {
                    setIsPdfSizeMenuOpen((isOpen) => !isOpen);
                  }}
                  disabled={isPdfActionDisabled}
                  aria-haspopup="menu"
                  aria-expanded={isPdfSizeMenuOpen}
                  className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white/95 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isExportingPdf ? 'Exporting...' : 'PDF'}
                </button>
              </span>
            </AppTooltip>
            {isPdfSizeMenuOpen && !isPdfActionDisabled && (
              <div
                role="menu"
                aria-label="PDF notation size"
                className="absolute right-0 mt-1 w-36 overflow-hidden rounded-md border border-gray-300 bg-white py-1 text-xs shadow-lg"
              >
                {pdfSizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsPdfSizeMenuOpen(false);
                      void handleDownloadPdf(option.value);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    <span>{option.description}</span>
                    <span className="font-semibold text-gray-500">{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div
          ref={wrapperRef}
          aria-busy={isDisplayBusy}
          className="relative h-[68vh] max-h-[760px] overflow-y-auto overflow-x-hidden bg-white"
        >
          {isDisplayBusy && !renderError && (
            <SheetMusicLoadingSkeleton stageLabel={loadingStageLabel} />
          )}
          <div
            ref={contentRef}
            className={`relative mx-auto min-h-[320px] bg-white transition-opacity duration-150 ${
              isDisplayBusy ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            style={{ paddingBottom: `${contentBottomScrollPadding}px` }}
          >
            {!isDisplayBusy && activeMeasureBox && (
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
