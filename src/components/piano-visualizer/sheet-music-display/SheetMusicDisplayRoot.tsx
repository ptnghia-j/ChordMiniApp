'use client';

import React, { memo } from 'react';
import AppTooltip from '@/components/common/AppTooltip';
import { SheetMusicLoadingSkeleton } from './SheetMusicLoadingSkeleton';
import { extractSyncDataFromMusicXml, getActiveMeasureIndexFromAudioTime } from './sync';
import { useSheetMusicRenderer } from './useSheetMusicRenderer';

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

  return (
    <div className={`bg-white text-gray-900 ${className}`}>
      {renderError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {renderError}
        </div>
      )}
      <div className="relative">
        {musicXml.trim() && (
          <AppTooltip content="Download sheet music as PDF">
            <span className="absolute right-3 top-3 z-20 inline-flex">
              <button
                type="button"
                onClick={() => {
                  void handleDownloadPdf();
                }}
                disabled={isRendering || isComputing || isExportingPdf}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white/95 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExportingPdf ? 'Exporting...' : 'PDF'}
              </button>
            </span>
          </AppTooltip>
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
            className={`relative mx-auto min-h-[320px] bg-white transition-opacity duration-200 ${
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
