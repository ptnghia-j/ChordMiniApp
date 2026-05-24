import React, { useMemo } from 'react';
import { useCurrentTime, usePlaybackStore } from '@/stores/playbackStore';
import { enhanceLyricsWithCharacterTiming } from '@/utils/lyricsTimingUtils';
import type { LyricLine, LyricsData } from '@/types/musicAiTypes';
import { getLyricColorChangePosition } from '@/components/lyrics/LyricLine';
import { LYRIC_GRID_COLOR_VARIABLE_CLASSES } from '@/components/lyrics/lyricsTheme';

export interface BeatGridTimedLyrics {
  mode: 'word' | 'line';
  lyrics: LyricsData;
}

export function groupPlacementsIntoRows<T extends { columnStart: number; columnEnd: number }>(
  placements: T[]
): T[][] {
  if (placements.length === 0) return [];
  const sorted = [...placements].sort((a, b) => a.columnStart - b.columnStart);
  const rows: T[][] = [];
  sorted.forEach((p) => {
    const suitableRow = rows.find((row) => {
      const lastP = row[row.length - 1];
      return p.columnStart > lastP.columnEnd;
    });
    if (suitableRow) {
      suitableRow.push(p);
    } else {
      rows.push([p]);
    }
  });
  return rows;
}

interface GridLyricsRowProps {
  placements: Array<{
    line: LyricLine;
    columnStart: number;
    columnEnd: number;
  }>;
  columnCount: number;
  mode: 'word' | 'line';
  fontSize?: string;
}


function ActiveLyricText({ line, mode }: { line: LyricLine; mode: 'word' | 'line' }) {
  const currentTime = useCurrentTime();
  const enhancedLine = useMemo(() => (
    enhanceLyricsWithCharacterTiming({ lines: [line] }).lines[0]
  ), [line]);

  const { colorChangePosition, lineProgress } = getLyricColorChangePosition({
    currentTime,
    lineStartTime: line.startTime,
    lineEndTime: line.endTime,
    textLength: line.text.length,
    characterTimings: mode === 'word' ? enhancedLine.characterTimings : undefined,
  });

  let progressPercent = 0;
  if (line.text.length > 0) {
    const charProgress = mode === 'word' && enhancedLine.characterTimings?.[colorChangePosition]
      ? Math.max(0, Math.min(1, (
        (currentTime - enhancedLine.characterTimings[colorChangePosition].startTime)
        / Math.max(0.001, enhancedLine.characterTimings[colorChangePosition].endTime - enhancedLine.characterTimings[colorChangePosition].startTime)
      )))
      : ((lineProgress * line.text.length) % 1);

    progressPercent = ((colorChangePosition + charProgress) / line.text.length) * 100;
  }

  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(to right, var(--swept-color) 0%, var(--swept-color) ${progressPercent}%, currentColor ${progressPercent}%, currentColor 100%)`,
    backgroundSize: '100% 100%',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  return (
    <span
      style={gradientStyle}
      className="font-semibold inline-block"
    >
      {line.text}
    </span>
  );
}

export function GridLyricText({ line, mode }: { line: LyricLine; mode: 'word' | 'line' }) {
  const status = usePlaybackStore((state) => {
    if (state.currentTime > line.endTime) return 'past';
    if (state.currentTime >= line.startTime) return 'active';
    return 'future';
  });

  if (status === 'past') {
    return (
      <span className="font-semibold transition-colors duration-300" style={{ color: 'var(--lyric-played)' }}>
        {line.text}
      </span>
    );
  }

  if (status === 'future') {
    return (
      <span className="transition-colors duration-300" style={{ color: 'var(--lyric-unplayed)' }}>
        {line.text}
      </span>
    );
  }

  return <ActiveLyricText line={line} mode={mode} />;
}

export default function GridLyricsRow({ placements, columnCount, mode, fontSize }: GridLyricsRowProps) {
  const rows = useMemo(() => groupPlacementsIntoRows(placements), [placements]);

  if (placements.length === 0) return null;

  return (
    <div
      className={`font-varela grid gap-y-1 px-0.5 pb-2 pt-1 font-medium leading-tight text-slate-500 dark:text-slate-400 ${LYRIC_GRID_COLOR_VARIABLE_CLASSES}`}
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, columnCount)}, minmax(0, 1fr))`,
        fontSize: fontSize || undefined,
      }}
    >
      {rows.map((row, rowIndex) => (
        row.map((placement, itemIndex) => {
          const nextPlacement = row[itemIndex + 1];
          const gridColumnEnd = nextPlacement
            ? nextPlacement.columnStart
            : '-1';
          return (
            <div
              key={`${placement.line.startTime}-${itemIndex}`}
              className="min-w-0 whitespace-normal text-left"
              style={{
                gridColumn: `${Math.max(1, Math.min(placement.columnStart, columnCount))} / ${gridColumnEnd}`,
                gridRow: `${rowIndex + 1}`,
              }}
            >
              <GridLyricText line={placement.line} mode={mode} />
            </div>
          );
        })
      ))}
    </div>
  );
}
