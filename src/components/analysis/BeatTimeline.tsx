'use client';

import React, { useMemo, useRef, useEffect } from 'react';

interface BeatTimelineProps {
  beats: Array<{time: number, beatNum?: number} | number>;
  downbeats?: number[];
  currentBeatIndex: number;
  currentDownbeatIndex: number;
  duration: number;
  className?: string;
}

/**
 * BeatTimeline Component - Optimized beat visualization with horizontal scrolling
 * 
 * Features:
 * - Horizontal scrolling instead of cramming all beats
 * - Proportional beat sizing
 * - Better typography and contrast
 * - Improved dark mode support
 * - Performance optimized with memoization
 */
export const BeatTimeline: React.FC<BeatTimelineProps> = React.memo(({
  beats,
  downbeats = [],
  currentBeatIndex,
  currentDownbeatIndex,
  duration,
  className = ''
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Memoize beat processing for performance
  const processedBeats = useMemo(() => {
    if (!beats || !beats.map) return [];
    
    return beats.map((beat, index) => {
      const beatTime = typeof beat === 'object' ? beat.time : beat;
      const beatNum = typeof beat === 'object' ? beat.beatNum : ((index % 4) + 1);
      const isFirstBeat = beatNum === 1;
      const isCurrent = index === currentBeatIndex;
      
      return {
        time: beatTime,
        beatNum,
        isFirstBeat,
        isCurrent,
        index
      };
    });
  }, [beats, currentBeatIndex]);

  // Memoize downbeat processing
  const processedDownbeats = useMemo(() => {
    if (!downbeats || !downbeats.map) return [];

    return downbeats.map((beatTime, index) => ({
      time: beatTime,
      index,
      isCurrent: index === currentDownbeatIndex
    }));
  }, [downbeats, currentDownbeatIndex]);

  // Auto-scroll to current beat
  useEffect(() => {
    if (scrollContainerRef.current && currentBeatIndex >= 0) {
      const container = scrollContainerRef.current;
      const beatWidth = 40; // Approximate width per beat
      const targetScroll = currentBeatIndex * beatWidth - container.clientWidth / 2;
      
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    }
  }, [currentBeatIndex]);

  if (!processedBeats.length) {
    return (
      <div className={`p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 transition-colors duration-300 ${className}`}>
        <h3 className="font-medium text-lg mb-2 text-gray-800 dark:text-gray-100">Beat Timeline</h3>
        <div className="flex items-center justify-center h-16 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-700 rounded-md">
          No beat data available
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg transition-colors duration-300 ${className}`}>
      <h3 className="font-medium text-lg mb-2 text-gray-800 dark:text-gray-100">Beat Timeline</h3>
      
      {/* Scrollable beat container */}
      <div 
        ref={scrollContainerRef}
        className="relative h-20 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-gray-500 rounded-md overflow-x-auto overflow-y-hidden transition-colors duration-300"
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* Beat timeline content */}
        <div className="relative h-full flex items-end" style={{ minWidth: `${processedBeats.length * 40}px` }}>
          
          {/* Beat markers */}
          {processedBeats.map(({ beatNum, isFirstBeat, isCurrent, index }) => (
            <div
              key={`beat-${index}`}
              className="relative flex flex-col items-center justify-end h-full"
              style={{ width: '40px', flexShrink: 0 }}
            >
              {/* Beat number */}
              <div className={`text-sm font-medium mb-1 ${
                isFirstBeat 
                  ? 'text-blue-700 dark:text-blue-300' 
                  : 'text-gray-600 dark:text-gray-400'
              } ${isCurrent ? 'text-blue-800 dark:text-blue-200 font-bold' : ''}`}>
                {beatNum}
              </div>
              
              {/* Beat bar */}
              <div
                className={`w-1 transition-all duration-200 ${
                  isCurrent
                    ? 'bg-blue-600 dark:bg-blue-400 h-12'
                    : isFirstBeat
                      ? 'bg-blue-500 dark:bg-blue-300 h-8'
                      : 'bg-gray-500 dark:bg-gray-400 h-6'
                }`}
              />
            </div>
          ))}

          {/* Downbeat markers overlay */}
          {processedDownbeats.map(({ time, index, isCurrent }) => (
            <div
              key={`downbeat-${index}`}
              className={`absolute bottom-0 w-2 h-16 transform -translate-x-1/2 ${
                isCurrent ? 'bg-red-600 dark:bg-red-400' : 'bg-red-500 dark:bg-red-300'
              } opacity-80`}
              style={{ 
                left: `${(time / duration) * (processedBeats.length * 40)}px`
              }}
            >
              <div className={`absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold ${
                isCurrent ? 'text-red-700 dark:text-red-300' : 'text-red-600 dark:text-red-400'
              }`}>
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-1 h-3 bg-gray-500 dark:bg-gray-400"></div>
          <span>Regular beats (2,3,4)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1 h-4 bg-blue-500 dark:bg-blue-300"></div>
          <span>Measure start (downbeat)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1 h-5 bg-blue-600 dark:bg-blue-400"></div>
          <span>Current beat</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-4 bg-red-500 dark:bg-red-300 opacity-80"></div>
          <span>Measure start (downbeat)</span>
        </div>
      </div>
    </div>
  );
});

BeatTimeline.displayName = 'BeatTimeline';

export default BeatTimeline;
