'use client';

import React from 'react';
import { Tab, Tabs } from '@heroui/react';
import AppTooltip from '@/components/common/AppTooltip';
import { SPEED_PRESETS } from './constants';
import type { VisualizerDisplayMode } from './types';

interface PianoVisualizerHeaderProps {
  playbackChordEventsCount: number;
  onMidiDownload: () => void;
  effectiveDisplayMode: VisualizerDisplayMode;
  hasSheetMusicData: boolean;
  sheetMusicDisabledTooltip: string;
  onDisplayModeChange: (mode: VisualizerDisplayMode) => void;
  speedIndex: number;
  onSpeedChange: (index: number) => void;
}

export const PianoVisualizerHeader: React.FC<PianoVisualizerHeaderProps> = ({
  playbackChordEventsCount,
  onMidiDownload,
  effectiveDisplayMode,
  hasSheetMusicData,
  sheetMusicDisabledTooltip,
  onDisplayModeChange,
  speedIndex,
  onSpeedChange,
}) => {
  const segmentedControlClassName = 'rounded-full bg-white/75 p-1 shadow-sm backdrop-blur dark:bg-gray-800/50';
  const activeSegmentClassName = 'bg-slate-900 text-white shadow-sm dark:bg-gray-900';
  const inactiveSegmentClassName = 'text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10';

  return (
    <div className="chord-timeline-section">
      <div className="mb-2 flex items-center justify-between flex-wrap gap-y-2">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
          Chord Timeline
        </h3>

        <div className="flex items-center space-x-3 flex-wrap justify-end">
          {playbackChordEventsCount > 0 && (
            <AppTooltip content="Download the currently visible piano visualizer notes as MIDI">
              <button
                onClick={onMidiDownload}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                MIDI
              </button>
            </AppTooltip>
          )}

          <Tabs
            aria-label="Piano visualizer display mode"
            selectedKey={effectiveDisplayMode}
            onSelectionChange={(key) => onDisplayModeChange(key as VisualizerDisplayMode)}
            size="sm"
            radius="full"
            variant="light"
            classNames={{
              tabList: segmentedControlClassName,
              cursor: activeSegmentClassName,
              tab: 'h-7 px-3',
              tabContent: 'text-xs font-medium text-gray-700 group-data-[selected=true]:text-white dark:text-gray-200 dark:group-data-[selected=true]:text-white',
            }}
          >
            <Tab key="piano-roll" title="Piano Roll" />
            <Tab
              key="sheet-music"
              title={(
                <AppTooltip content={sheetMusicDisabledTooltip} isDisabled={hasSheetMusicData}>
                  <span title={process.env.NODE_ENV === 'test' ? sheetMusicDisabledTooltip : undefined}>Sheet Music</span>
                </AppTooltip>
              )}
              isDisabled={!hasSheetMusicData}
            />
          </Tabs>

          <div className={`flex items-center space-x-1.5 ${effectiveDisplayMode === 'sheet-music' ? 'opacity-50' : ''}`}>
            <label className="whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">
              Speed:
            </label>
            <div className={`flex space-x-1 ${segmentedControlClassName}`}>
              {SPEED_PRESETS.map((preset, idx) => (
                <AppTooltip key={preset.label} content={preset.description}>
                  <span className="inline-flex">
                    <button
                      onClick={() => onSpeedChange(idx)}
                      disabled={effectiveDisplayMode === 'sheet-music'}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        speedIndex === idx
                          ? activeSegmentClassName
                          : inactiveSegmentClassName
                      }`}
                    >
                      {preset.label}
                    </button>
                  </span>
                </AppTooltip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
