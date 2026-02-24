'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { Card, CardBody } from '@heroui/react';

interface BeatTimelineProps {
  beats: Array<{time: number, beatNum?: number} | number>;
  downbeats?: number[];
  currentBeatIndex: number;
  currentDownbeatIndex: number;
  duration: number;
  className?: string;
  /** When true, renders without its own Card wrapper (for embedding inside another Card) */
  embedded?: boolean;
}

const BEAT_WIDTH = 36;

export const BeatTimeline: React.FC<BeatTimelineProps> = React.memo(({
  beats,
  downbeats = [],
  currentBeatIndex,
  currentDownbeatIndex,
  duration,
  className = '',
  embedded = false,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const processedBeats = useMemo(() => {
    if (!beats?.map) return [];
    return beats.map((beat, index) => {
      const beatTime = typeof beat === 'object' ? beat.time : beat;
      const beatNum = typeof beat === 'object' ? beat.beatNum : ((index % 4) + 1);
      return {
        time: beatTime,
        beatNum,
        isDownbeat: beatNum === 1,
        isCurrent: index === currentBeatIndex,
        index
      };
    });
  }, [beats, currentBeatIndex]);

  const processedDownbeats = useMemo(() => {
    if (!downbeats?.map) return [];
    return downbeats.map((beatTime, index) => ({
      time: beatTime,
      index,
      isCurrent: index === currentDownbeatIndex
    }));
  }, [downbeats, currentDownbeatIndex]);

  useEffect(() => {
    if (scrollContainerRef.current && currentBeatIndex >= 0) {
      const container = scrollContainerRef.current;
      const targetScroll = currentBeatIndex * BEAT_WIDTH - container.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    }
  }, [currentBeatIndex]);

  const emptyState = (
    <div className="flex items-center justify-center h-16 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      No beat data available
    </div>
  );

  const content = !processedBeats.length ? emptyState : (
    <div className="flex flex-col gap-2">
      {/* Scrollable beat visualization */}
      <div
        ref={scrollContainerRef}
        className="relative rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600/50 overflow-x-auto overflow-y-hidden"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div
          className="relative flex items-end h-16"
          style={{ minWidth: `${processedBeats.length * BEAT_WIDTH}px` }}
        >
          {processedBeats.map(({ beatNum, isDownbeat, isCurrent, index }) => (
            <div
              key={`beat-${index}`}
              className="relative flex flex-col items-center justify-end h-full"
              style={{ width: `${BEAT_WIDTH}px`, flexShrink: 0 }}
            >
              <span
                className={`text-[11px] font-semibold mb-1 select-none transition-colors ${
                  isCurrent
                    ? 'text-blue-600 dark:text-blue-300 font-bold'
                    : isDownbeat
                      ? 'text-blue-500 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {beatNum}
              </span>

              <div
                className={`rounded-t-sm transition-all duration-150 ${
                  isCurrent
                    ? 'w-2 h-10 bg-blue-500 dark:bg-blue-400 shadow-sm shadow-blue-500/30'
                    : isDownbeat
                      ? 'w-1.5 h-7 bg-blue-300 dark:bg-blue-500/70'
                      : 'w-1 h-5 bg-gray-300 dark:bg-gray-500'
                }`}
              />

              {isDownbeat && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[2px] bg-blue-400/40 dark:bg-blue-500/30" />
              )}
            </div>
          ))}

          {processedDownbeats.map(({ time, index: dbIndex, isCurrent }) => (
            <div
              key={`db-${dbIndex}`}
              className={`absolute bottom-0 w-[3px] rounded-t-full ${
                isCurrent
                  ? 'h-full bg-red-500/60 dark:bg-red-400/50'
                  : 'h-full bg-red-400/25 dark:bg-red-300/20'
              }`}
              style={{
                left: `${(time / duration) * (processedBeats.length * BEAT_WIDTH)}px`,
                transform: 'translateX(-1.5px)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Compact legend */}
      <div className="hidden md:flex items-center gap-3 px-1">
        <LegendItem>
          <div className="w-1 h-3 rounded-sm bg-gray-300 dark:bg-gray-500" />
          <span>Regular beat</span>
        </LegendItem>
        <LegendItem>
          <div className="w-1.5 h-3.5 rounded-sm bg-blue-300 dark:bg-blue-500/70" />
          <span>Downbeat</span>
        </LegendItem>
        <LegendItem>
          <div className="w-2 h-4 rounded-sm bg-blue-500 dark:bg-blue-400 shadow-sm shadow-blue-500/30" />
          <span>Current beat</span>
        </LegendItem>
        <LegendItem>
          <div className="w-[3px] h-3.5 rounded-full bg-red-400/60" />
          <span>Measure start</span>
        </LegendItem>
      </div>
    </div>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card
      shadow="sm"
      radius="lg"
      className={`mt-2 border border-gray-200 dark:border-gray-700 ${className}`}
    >
      <CardBody className="px-3 py-3">
        {content}
      </CardBody>
    </Card>
  );
});

function LegendItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
      {children}
    </div>
  );
}

BeatTimeline.displayName = 'BeatTimeline';

export default BeatTimeline;
