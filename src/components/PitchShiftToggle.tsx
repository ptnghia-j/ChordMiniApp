/**
 * Pitch Shift Toggle Component
 *
 * Toggle button for enabling/disabling pitch shift feature.
 * Integrated into the chord grid utility dock.
 * Follows the same design pattern as other utility bar toggles.
 */

'use client';

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { TbMusicUp } from 'react-icons/tb';
import { Tooltip } from '@heroui/react';
import { useIsPitchShiftEnabled, useTogglePitchShift, useIsFirebaseAudioAvailable } from '@/stores/uiStore';

export const PitchShiftToggle: React.FC = () => {
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const togglePitchShift = useTogglePitchShift();
  const isFirebaseAudioAvailable = useIsFirebaseAudioAvailable();

  const isDisabled = !isFirebaseAudioAvailable;

  return (
    <Tooltip
      content={
        isDisabled
          ? 'Pitch Shift: Firebase audio not available'
          : isPitchShiftEnabled
          ? 'Disable pitch shift'
          : 'Enable pitch shift'
      }
      placement="top"
      delay={500}
      closeDelay={100}
      classNames={{
        content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
      }}
    >
      <motion.button
        onClick={togglePitchShift}
        disabled={isDisabled}
        className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
          isPitchShiftEnabled
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        whileHover={!isDisabled ? { scale: 1.02 } : {}}
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        aria-label="Toggle pitch shift"
        aria-pressed={isPitchShiftEnabled}
      >
        <TbMusicUp className="h-5 w-5" />
      </motion.button>
    </Tooltip>
  );
};

export default memo(PitchShiftToggle);

