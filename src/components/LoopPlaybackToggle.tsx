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

  // Initialize loop range to full song when first enabled
  useEffect(() => {
    if (isLoopEnabled && loopEndBeat === 0 && totalBeats > 0) {
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

  // Handle start beat input change
  const handleStartBeatChange = useCallback((value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    // Validate range
    const clampedValue = Math.max(0, Math.min(numValue, totalBeats - 1));

    // If new start > current end, set end = start
    if (clampedValue > loopEndBeat) {
      setLoopRange(clampedValue, clampedValue);
    } else {
      setLoopStartBeat(clampedValue);
    }
  }, [totalBeats, loopEndBeat, setLoopStartBeat, setLoopRange]);

  // Handle end beat input change
  const handleEndBeatChange = useCallback((value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    // Validate range
    const clampedValue = Math.max(0, Math.min(numValue, totalBeats - 1));

    // If new end < current start, set start = end
    if (clampedValue < loopStartBeat) {
      setLoopRange(clampedValue, clampedValue);
    } else {
      setLoopEndBeat(clampedValue);
    }
  }, [totalBeats, loopStartBeat, setLoopEndBeat, setLoopRange]);

  const isDisabled = totalBeats === 0;

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
              className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
                isLoopEnabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              <HiArrowPath className="h-5 w-5" />
            </motion.button>
          </Tooltip>
        </div>
      </PopoverTrigger>
      
      <PopoverContent>
        <div className="bg-white/60 dark:bg-content-bg/60 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-lg min-w-[280px] backdrop-blur-sm">
          {/* Loop range inputs */}
          <div className="space-y-3">
            {/* Header */}
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">
              Loop Range
            </div>

            {/* Compact side-by-side inputs */}
            <div className="flex gap-3">
              {/* Start beat input */}
              <Input
                type="number"
                label="Start Beat"
                labelPlacement="outside"
                value={loopStartBeat.toString()}
                onValueChange={handleStartBeatChange}
                min={0}
                max={totalBeats - 1}
                size="sm"
                variant="bordered"
                color="success"
                classNames={{
                  base: 'flex-1',
                  label: 'text-xs text-gray-600 dark:text-gray-400 mb-1',
                  input: 'text-sm text-center',
                  inputWrapper: 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                }}
              />

              {/* End beat input */}
              <Input
                type="number"
                label="End Beat"
                labelPlacement="outside"
                value={loopEndBeat.toString()}
                onValueChange={handleEndBeatChange}
                min={0}
                max={totalBeats - 1}
                size="sm"
                variant="bordered"
                color="success"
                classNames={{
                  base: 'flex-1',
                  label: 'text-xs text-gray-600 dark:text-gray-400 mb-1',
                  input: 'text-sm text-center',
                  inputWrapper: 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                }}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LoopPlaybackToggle;

