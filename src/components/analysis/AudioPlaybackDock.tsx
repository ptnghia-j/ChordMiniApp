"use client";

import React, { memo, useMemo, useState } from 'react';
import { Button, Tooltip, Popover, PopoverTrigger, PopoverContent, Slider } from '@heroui/react';
import { FaPlay, FaPause } from 'react-icons/fa';

export interface AudioPlaybackDockProps {
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
  bpm?: number; // optional original BPM for display
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const AudioPlaybackDock: React.FC<AudioPlaybackDockProps> = ({
  isPlaying,
  onTogglePlayPause,
  playbackRate,
  onChangePlaybackRate,
  currentTime,
  duration,
  onSeek,
  disabled = false,
  bpm,
}) => {
  const [open, setOpen] = useState(false);
  const formatTime = (t: number) => {
    if (!isFinite(t) || t < 0) return '0:00';
    const minutes = Math.floor(t / 60);
    const seconds = Math.floor(t % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };


  const bpmText = useMemo(() => {
    if (!bpm || bpm <= 0) return null;
    const original = Math.round(bpm);
    const adjusted = Math.round(bpm * playbackRate);
    if (playbackRate === 1) return `${original} BPM`;
    return `${original} BPM → ${adjusted} BPM`;
  }, [bpm, playbackRate]);

  return (
    <div className="inline-flex items-center gap-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/70 backdrop-blur-md border border-gray-300 dark:border-gray-700 shadow-sm px-3 sm:px-4 py-2 mx-auto">
      {/* Play / Pause */}
      <Tooltip
        content={isPlaying ? 'Pause' : 'Play'}
        placement="top"
        classNames={{
          content:
            'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg',
        }}
      >
        <button
          onClick={onTogglePlayPause}
          disabled={disabled}
          className={`p-2 rounded-full transition-colors ${
            disabled
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <FaPause className="h-5 w-5" /> : <FaPlay className="h-5 w-5" />}
        </button>
      </Tooltip>

      {/* Progress slider */}
      <div className="min-w-[160px] w-[240px] sm:w-[280px] md:w-[320px]">
        <Slider
          aria-label="Playback position"
          size="sm"
          step={0.01}
          minValue={0}
          maxValue={Math.max(0, duration || 0)}
          value={Math.min(Math.max(0, currentTime || 0), Math.max(0, duration || 0))}
          onChange={(val) => {
            const t = Array.isArray(val) ? val[0] : val;
            onSeek(typeof t === 'number' ? t : Number(t));
          }}
          className="w-full"
          classNames={{
            track: 'bg-gray-200 dark:bg-gray-700 h-1.5',
            filler: 'bg-blue-500 dark:bg-blue-400',
            thumb: 'bg-white border-0 shadow-lg w-4 h-4 after:bg-white after:border-0'
          }}
        />
        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-600 dark:text-gray-300">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Speed selector - collapsed into a popover */}
      <Popover isOpen={open} onOpenChange={setOpen} placement="top" offset={8}>
        <PopoverTrigger>
          <Button
            size="sm"
            radius="full"
            variant="flat"
            className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            isDisabled={disabled}
          >
            {playbackRate}x
          </Button>
        </PopoverTrigger>
        <PopoverContent className="min-w-[220px] p-3 bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300">Playback Speed</div>
            <div className="grid grid-cols-3 gap-2">
              {RATES.map((rate) => (
                <Button
                  key={rate}
                  size="sm"
                  radius="full"
                  variant={playbackRate === rate ? 'solid' : 'flat'}
                  color={playbackRate === rate ? 'primary' : 'default'}
                  className={playbackRate === rate ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'}
                  onPress={() => { onChangePlaybackRate(rate); setOpen(false); }}
                >
                  {rate}x
                </Button>
              ))}
            </div>
            {bpmText && (
              <div className="text-xs text-gray-700 dark:text-gray-300 pt-1">
                {bpmText}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default memo(AudioPlaybackDock);
