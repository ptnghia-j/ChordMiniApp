/**
 * Pitch Shift Popover Component
 * 
 * Simplified popover control for pitch shifting with just a slider.
 * Appears as a popover above/below the pitch shift toggle button.
 */

'use client';

import React, { useCallback, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { motion } from 'framer-motion';
import { TbMusicUp } from 'react-icons/tb';
import { useUI } from '@/contexts/UIContext';
import { formatSemitones } from '@/utils/chordTransposition';

export const PitchShiftPopover: React.FC = () => {
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

  // Slider change handler
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      setPitchShiftSemitones(value);
    },
    [setPitchShiftSemitones]
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
      </PopoverTrigger>
      
      <PopoverContent>
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-lg min-w-[280px]">
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
                min="-6"
                max="6"
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
                    #10b981 ${((pitchShiftSemitones + 6) / 12) * 100}%,
                    #e5e7eb ${((pitchShiftSemitones + 6) / 12) * 100}%,
                    #e5e7eb 100%)`,
                }}
                aria-label="Pitch shift amount in semitones"
              />

              {/* Slider markers */}
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
                <span>-6</span>
                <span>0</span>
                <span>+6</span>
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

