/**
 * Pitch Shift Popover Component
 *
 * Simplified popover control for pitch shifting with semitone and playback speed sliders.
 * Appears as a popover above/below the pitch shift toggle button.
 */

'use client';

import React, { useCallback, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent, Tooltip, Slider } from '@heroui/react';
import { motion } from 'framer-motion';
import { TbMusicUp } from 'react-icons/tb';
import { MIN_SEMITONES, MAX_SEMITONES } from '@/utils/chordTransposition';
import {
  useIsPitchShiftEnabled,
  useTogglePitchShift,
  usePitchShiftSemitones,
  useIsProcessingPitchShift,
  useIsFirebaseAudioAvailable,
  useSetPitchShiftSemitones
} from '@/stores/uiStore';
import { formatSemitones } from '@/utils/chordTransposition';

interface PitchShiftPopoverProps {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

export const PitchShiftPopover: React.FC<PitchShiftPopoverProps> = ({
  playbackRate,
  setPlaybackRate,
}) => {
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const togglePitchShift = useTogglePitchShift();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const isProcessingPitchShift = useIsProcessingPitchShift();
  const isFirebaseAudioAvailable = useIsFirebaseAudioAvailable();
  const setPitchShiftSemitones = useSetPitchShiftSemitones();

  const isDisabled = !isFirebaseAudioAvailable;

  // Local state to control popover visibility independently from pitch shift state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Pitch shift slider change handler
  const handleSliderChange = useCallback(
    (value: number | number[]) => {
      const numValue = Array.isArray(value) ? value[0] : value;
      setPitchShiftSemitones(numValue);
    },
    [setPitchShiftSemitones]
  );

  // Playback speed slider change handler
  const handlePlaybackRateChange = useCallback(
    (value: number | number[]) => {
      const numValue = Array.isArray(value) ? value[0] : value;
      setPlaybackRate(numValue);
    },
    [setPlaybackRate]
  );

  // Handle toggle button click
  const handleToggleClick = useCallback(() => {
    if (!isPitchShiftEnabled) {
      // Enabling pitch shift: turn it on and open popover
      togglePitchShift();
      setIsPopoverOpen(true);
    } else {
      // Disabling pitch shift: turn it off and close popover
      togglePitchShift();
      setIsPopoverOpen(false);
    }
  }, [isPitchShiftEnabled, togglePitchShift]);

  return (
    <>
      <Popover
        placement="top"
        offset={10}
        isOpen={isPopoverOpen && isPitchShiftEnabled && !isDisabled}
        onOpenChange={(open) => {
          // Allow popover to close without disabling pitch shift
          setIsPopoverOpen(open);
        }}
        classNames={{
          content: 'p-0 border-none bg-transparent shadow-none'
        }}
      >
      <PopoverTrigger>
        <div className="relative inline-block">
          <Tooltip
            content={
              isDisabled
                ? 'Pitch Shift: Audio not available'
                : isPitchShiftEnabled
                ? 'Disable pitch shift'
                : 'Enable pitch shift'
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
                isPitchShiftEnabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              whileHover={!isDisabled ? { scale: 1.02 } : {}}
              whileTap={!isDisabled ? { scale: 0.98 } : {}}
              aria-label={
                isDisabled
                  ? 'Pitch Shift: Audio not available'
                  : isPitchShiftEnabled
                  ? 'Disable pitch shift'
                  : 'Enable pitch shift'
              }
              aria-pressed={isPitchShiftEnabled}
            >
              <TbMusicUp className="h-5 w-5" />
            </motion.button>
          </Tooltip>

          {/* Beta tag */}
          <div className="absolute -top-1 -right-1 bg-green-500/70 dark:bg-green-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold pointer-events-none">
            BETA
          </div>
        </div>
      </PopoverTrigger>
      
      <PopoverContent>
        <div className="bg-white/60 dark:bg-content-bg/60 border border-gray-300 dark:border-gray-600 rounded-lg p-4 pb-6 shadow-lg min-w-[280px] backdrop-blur-sm">
          {/* Slider with value display */}
          <div className="space-y-3">
            {/* Pitch Shift Slider */}
            <div className="pb-2 pitch-shift-slider">
              <Slider
                label="Pitch Shift"
                size="sm"
                color="success"
                step={1}
                minValue={MIN_SEMITONES}
                maxValue={MAX_SEMITONES}
                value={pitchShiftSemitones}
                onChange={handleSliderChange}
                isDisabled={isProcessingPitchShift}
                showTooltip={true}
                getValue={(value) => formatSemitones(Array.isArray(value) ? value[0] : value)}
                marks={[
                  { value: MIN_SEMITONES, label: `${MIN_SEMITONES}` },
                  { value: 0, label: '0' },
                  { value: MAX_SEMITONES, label: `+${MAX_SEMITONES}` }
                ]}
                classNames={{
                  base: 'max-w-full mb-2',
                  label: 'text-sm font-medium text-gray-700 dark:text-gray-300',
                  value: 'text-sm font-semibold text-green-600 dark:text-green-400',
                  track: 'bg-gray-200 dark:bg-gray-700',
                  filler: 'bg-green-500',
                  thumb: 'shadow-md border-2 border-green-500 dark:border-green-500',
                  mark: 'text-xs'
                }}
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 my-3" />

            {/* Playback Speed Slider */}
            <div className="pb-2 pitch-shift-slider">
              <Slider
                label="Playback Speed"
                size="sm"
                color="success"
                step={0.25}
                minValue={0.25}
                maxValue={2.0}
                value={playbackRate}
                onChange={handlePlaybackRateChange}
                isDisabled={isProcessingPitchShift}
                showTooltip={true}
                getValue={(value) => `${(Array.isArray(value) ? value[0] : value).toFixed(2)}x`}
                marks={[
                  { value: 0.25, label: '0.25x' },
                  { value: 1.0, label: '1.0x' },
                  { value: 2.0, label: '2.0x' }
                ]}
                classNames={{
                  base: 'max-w-full mb-2',
                  label: 'text-sm font-medium text-gray-700 dark:text-gray-300',
                  value: 'text-sm font-semibold text-green-600 dark:text-green-400',
                  track: 'bg-gray-200 dark:bg-gray-700',
                  filler: 'bg-green-500',
                  thumb: 'shadow-md border-2 border-green-500 dark:border-green-500',
                  mark: 'text-xs'
                }}
              />
            </div>

            {/* Processing indicator */}
            {isProcessingPitchShift && (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
};

export default PitchShiftPopover;

