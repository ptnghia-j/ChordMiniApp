/**
 * Pitch Shift Popover Component
 *
 * Simplified popover control for pitch shifting with semitone and playback speed sliders.
 * Appears as a popover above/below the pitch shift toggle button.
 */

'use client';

import React, { useCallback, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { motion } from 'framer-motion';
import { TbMusicUp } from 'react-icons/tb';
import { MIN_SEMITONES, MAX_SEMITONES } from '@/utils/chordTransposition';
import { useUI } from '@/contexts/UIContext';
import { formatSemitones } from '@/utils/chordTransposition';

interface PitchShiftPopoverProps {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

export const PitchShiftPopover: React.FC<PitchShiftPopoverProps> = ({
  playbackRate,
  setPlaybackRate,
}) => {
  const {
    isPitchShiftEnabled,
    togglePitchShift,
    pitchShiftSemitones,
    isProcessingPitchShift,
    isFirebaseAudioAvailable,
    setPitchShiftSemitones,
  } = useUI();

  const isDisabled = !isFirebaseAudioAvailable;

  // Local state to control popover visibility independently from pitch shift state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Pitch shift slider change handler
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      setPitchShiftSemitones(value);
    },
    [setPitchShiftSemitones]
  );

  // Playback speed slider change handler
  const handlePlaybackRateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      setPlaybackRate(value);
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
          <motion.button
            onClick={handleToggleClick}
            disabled={isDisabled}
            className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
              isPitchShiftEnabled
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
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
            title={
              isDisabled
                ? 'Pitch Shift: Audio not available'
                : isPitchShiftEnabled
                ? 'Disable pitch shift'
                : 'Enable pitch shift'
            }
          >
            <TbMusicUp className="h-5 w-5" />
          </motion.button>

          {/* Beta tag */}
          <div className="absolute -top-1 -right-1 bg-green-500/70 dark:bg-green-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">
            BETA
          </div>
        </div>
      </PopoverTrigger>
      
      <PopoverContent>
        <div className="bg-white/60 dark:bg-content-bg/60 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-lg min-w-[280px] backdrop-blur-sm">
          {/* Slider with value display */}
          <div className="space-y-3">
            {/* Value display */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pitch Shift
              </span>
              <span className="text-sm font-semibold text-green-600 dark:text-green-400 min-w-[3rem] text-right">
                {formatSemitones(pitchShiftSemitones)}
              </span>
            </div>
            
            {/* Slider */}
            <div className="relative">
              <input
                type="range"
                min={MIN_SEMITONES}
                max={MAX_SEMITONES}
                step="1"
                value={pitchShiftSemitones}
                onChange={handleSliderChange}
                disabled={isProcessingPitchShift}
                className={`
                  w-full h-2 rounded-lg appearance-none cursor-pointer
                  bg-gray-200 dark:bg-gray-700
                  ${isProcessingPitchShift ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                style={{
                  background: `linear-gradient(to right,
                    #10b981 0%,
                    #10b981 ${((pitchShiftSemitones - MIN_SEMITONES) / (MAX_SEMITONES - MIN_SEMITONES)) * 100}%,
                    #e5e7eb ${((pitchShiftSemitones - MIN_SEMITONES) / (MAX_SEMITONES - MIN_SEMITONES)) * 100}%,
                    #e5e7eb 100%)`,
                }}
                aria-label="Pitch shift amount in semitones"
              />

              {/* Slider markers */}
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
                <span>{MIN_SEMITONES}</span>
                <span>0</span>
                <span>+{MAX_SEMITONES}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 my-3" />

            {/* Playback Speed Control */}
            <div className="space-y-2">
              {/* Value display */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Playback Speed
                </span>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400 min-w-[3rem] text-right">
                  {playbackRate.toFixed(2)}x
                </span>
              </div>

              {/* Slider */}
              <div className="relative">
                <input
                  type="range"
                  min="0.25"
                  max="2.0"
                  step="0.25"
                  value={playbackRate}
                  onChange={handlePlaybackRateChange}
                  disabled={isProcessingPitchShift}
                  className={`
                    w-full h-2 rounded-lg appearance-none cursor-pointer
                    bg-gray-200 dark:bg-gray-700
                    ${isProcessingPitchShift ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  style={{
                    background: `linear-gradient(to right,
                      #10b981 0%,
                      #10b981 ${((playbackRate - 0.25) / 1.75) * 100}%,
                      #e5e7eb ${((playbackRate - 0.25) / 1.75) * 100}%,
                      #e5e7eb 100%)`,
                  }}
                  aria-label="Playback speed rate"
                />

                {/* Slider markers */}
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
                  <span>0.25x</span>
                  <span>1.0x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </div>

            {/* Processing indicator */}
            {isProcessingPitchShift && (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </div>
            )}
          </div>

          {/* CSS for slider thumb - Safari compatible */}
          <style jsx>{`
            input[type='range'] {
              -webkit-appearance: none;
              appearance: none;
            }

            input[type='range']::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: white;
              border: 2px solid #10b981;
              cursor: pointer;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }

            input[type='range']::-moz-range-thumb {
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: white;
              border: 2px solid #10b981;
              cursor: pointer;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
              border: none;
            }

            input[type='range']::-webkit-slider-runnable-track {
              height: 8px;
              border-radius: 4px;
            }

            input[type='range']::-moz-range-track {
              height: 8px;
              border-radius: 4px;
              background: transparent;
            }

            input[type='range']:disabled::-webkit-slider-thumb {
              cursor: not-allowed;
              opacity: 0.5;
            }

            input[type='range']:disabled::-moz-range-thumb {
              cursor: not-allowed;
              opacity: 0.5;
            }
          `}</style>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default PitchShiftPopover;

