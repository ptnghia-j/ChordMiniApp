/**
 * Loop Playback Toggle Component
 *
 * Toggle button with popover for loop playback control.
 * Allows users to set start and end beats for looping a section of the song.
 * Follows the same design pattern as PitchShiftPopover.
 */

'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent, Tooltip, Input } from '@heroui/react';
import { motion } from 'framer-motion';
import { HiArrowPath } from 'react-icons/hi2';
import UtilityPopoverPanel from '@/components/analysis/UtilityPopoverPanel';
import {
  useIsLoopEnabled,
  useLoopStartBeat,
  useLoopEndBeat,
  useToggleLoop,
  useSetLoopStartBeat,
  useSetLoopEndBeat,
  useSetLoopRange
} from '@/stores/uiStore';

interface LoopPlaybackToggleProps {
  totalBeats: number;
  className?: string;
}

export const LoopPlaybackToggle: React.FC<LoopPlaybackToggleProps> = ({
  totalBeats,
  className = ''
}) => {
  const isLoopEnabled = useIsLoopEnabled();
  const loopStartBeat = useLoopStartBeat();
  const loopEndBeat = useLoopEndBeat();
  const toggleLoop = useToggleLoop();
  const setLoopStartBeat = useSetLoopStartBeat();
  const setLoopEndBeat = useSetLoopEndBeat();
  const setLoopRange = useSetLoopRange();

  // Local state to control popover visibility independently from loop state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [startBeatInput, setStartBeatInput] = useState<string | null>(null);
  const [endBeatInput, setEndBeatInput] = useState<string | null>(null);
  const displayStartBeat = loopStartBeat >= 0 ? loopStartBeat + 1 : 1;
  const displayEndBeat = loopEndBeat >= 0 ? loopEndBeat + 1 : Math.max(1, totalBeats);

  // Initialize loop range to full song when first enabled
  // Use -1 as sentinel value to detect uninitialized state (0 is a valid beat index)
  useEffect(() => {
    if (isLoopEnabled && loopEndBeat === -1 && totalBeats > 0) {
      setLoopRange(0, totalBeats - 1);
    }
  }, [isLoopEnabled, loopEndBeat, totalBeats, setLoopRange]);

  // Handle toggle button click
  const handleToggleClick = useCallback(() => {
    if (!isLoopEnabled) {
      // Enabling loop: turn it on, set default range, and open popover
      toggleLoop();
      if (totalBeats > 0) {
        setLoopRange(0, totalBeats - 1);
      }
      setIsPopoverOpen(true);
    } else {
      // Disabling loop: turn it off and close popover
      toggleLoop();
      setIsPopoverOpen(false);
    }
  }, [isLoopEnabled, toggleLoop, totalBeats, setLoopRange]);

  const commitStartBeatInput = useCallback((rawValue: string) => {
    if (totalBeats === 0) {
      setStartBeatInput(null);
      return;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsedValue)) {
      setStartBeatInput(null);
      return;
    }

    const nextStartBeat = Math.max(0, Math.min(parsedValue - 1, totalBeats - 1));

    if (loopEndBeat >= 0 && nextStartBeat > loopEndBeat) {
      setLoopRange(nextStartBeat, nextStartBeat);
    } else {
      setLoopStartBeat(nextStartBeat);
    }
  }, [loopEndBeat, setLoopRange, setLoopStartBeat, totalBeats]);

  const commitEndBeatInput = useCallback((rawValue: string) => {
    if (totalBeats === 0) {
      setEndBeatInput(null);
      return;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsedValue)) {
      setEndBeatInput(null);
      return;
    }

    const nextEndBeat = Math.max(0, Math.min(parsedValue - 1, totalBeats - 1));

    if (loopStartBeat >= 0 && nextEndBeat < loopStartBeat) {
      setLoopRange(nextEndBeat, nextEndBeat);
    } else {
      setLoopEndBeat(nextEndBeat);
    }
  }, [loopStartBeat, setLoopEndBeat, setLoopRange, totalBeats]);

  const isDisabled = totalBeats === 0;
  const buttonClassName = `h-9 w-9 min-w-9 rounded-full shadow-md transition-colors duration-200 inline-flex items-center justify-center p-0 ${
    isLoopEnabled
      ? 'bg-green-600 text-white hover:bg-green-700'
      : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <Popover
      placement="top"
      offset={10}
      isOpen={isPopoverOpen && isLoopEnabled && !isDisabled}
      onOpenChange={(open) => {
        // Allow popover to close without disabling loop
        setIsPopoverOpen(open);
      }}
      classNames={{
        content: 'p-0 border-none bg-transparent shadow-none'
      }}
    >
      <PopoverTrigger>
        <div className={`relative inline-block ${className}`}>
          <Tooltip
            content={
              isDisabled
                ? 'Loop: No beats available'
                : isLoopEnabled
                ? 'Disable loop playback'
                : 'Enable loop playback'
            }
            placement="top"
            classNames={{
              content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
            }}
          >
            <motion.button
              onClick={handleToggleClick}
              disabled={isDisabled}
              className={buttonClassName}
              whileHover={!isDisabled ? { scale: 1.02 } : {}}
              whileTap={!isDisabled ? { scale: 0.98 } : {}}
              aria-label={
                isDisabled
                  ? 'Loop: No beats available'
                  : isLoopEnabled
                  ? 'Disable loop playback'
                  : 'Enable loop playback'
              }
              aria-pressed={isLoopEnabled}
            >
              <HiArrowPath className="h-4 w-4" />
            </motion.button>
          </Tooltip>
        </div>
      </PopoverTrigger>
      
      <PopoverContent>
        <UtilityPopoverPanel
          title="Loop Range"
          titleClassName="text-center"
          bodyClassName="space-y-3 p-4 min-w-[280px]"
        >
          <div className="flex gap-3">
            <Input
              type="number"
              label="Start Beat"
              labelPlacement="outside"
              aria-label="Start Beat"
              value={startBeatInput ?? displayStartBeat.toString()}
              onValueChange={setStartBeatInput}
              onBlur={() => {
                commitStartBeatInput(startBeatInput ?? displayStartBeat.toString());
                setStartBeatInput(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitStartBeatInput(startBeatInput ?? displayStartBeat.toString());
                  setStartBeatInput(null);
                }
              }}
              min={1}
              max={Math.max(1, totalBeats)}
              size="sm"
              variant="bordered"
              color="success"
              classNames={{
                base: 'flex-1',
                label: 'text-xs text-gray-600 dark:text-gray-400 mb-1',
                input: 'text-sm text-center',
                inputWrapper: 'bg-white/65 dark:bg-slate-900/35 border-white/25 dark:border-white/10'
              }}
            />

            <Input
              type="number"
              label="End Beat"
              labelPlacement="outside"
              aria-label="End Beat"
              value={endBeatInput ?? displayEndBeat.toString()}
              onValueChange={setEndBeatInput}
              onBlur={() => {
                commitEndBeatInput(endBeatInput ?? displayEndBeat.toString());
                setEndBeatInput(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitEndBeatInput(endBeatInput ?? displayEndBeat.toString());
                  setEndBeatInput(null);
                }
              }}
              min={1}
              max={Math.max(1, totalBeats)}
              size="sm"
              variant="bordered"
              color="success"
              classNames={{
                base: 'flex-1',
                label: 'text-xs text-gray-600 dark:text-gray-400 mb-1',
                input: 'text-sm text-center',
                inputWrapper: 'bg-white/65 dark:bg-slate-900/35 border-white/25 dark:border-white/10'
              }}
            />
          </div>
        </UtilityPopoverPanel>
      </PopoverContent>
    </Popover>
  );
};

export default LoopPlaybackToggle;
