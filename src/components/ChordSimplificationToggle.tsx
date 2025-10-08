'use client';

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineSparkles, HiSparkles } from 'react-icons/hi2';
import { Tooltip } from '@heroui/react';

interface ChordSimplificationToggleProps {
  isEnabled: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * Toggle button for chord simplification
 * Simplifies all chord labels to only 5 basic types: Major, Minor, Augmented, Diminished, Suspended
 * Follows the same design pattern as auto-scroll and metronome toggle buttons
 */
const ChordSimplificationToggle: React.FC<ChordSimplificationToggleProps> = ({
  isEnabled,
  onClick,
  className = ''
}) => {
  return (
    <Tooltip
      content={isEnabled ? "Show full chord notation" : "Simplify chord notation to basic types"}
      placement="top"
      delay={500}
      closeDelay={100}
      classNames={{
        content: 'bg-white text-gray-900 dark:bg-content-bg dark:text-gray-100 border border-gray-300 dark:border-gray-600 shadow-lg'
      }}
    >
      <motion.button
        onClick={onClick}
        className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
          isEnabled
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200/60 dark:bg-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-gray-300/70 dark:hover:bg-gray-500/70'
        } ${className}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Icon */}
        {isEnabled ? (
          <HiSparkles className="h-4 w-4" />
        ) : (
          <HiOutlineSparkles className="h-4 w-4" />
        )}
      </motion.button>
    </Tooltip>
  );
};

export default memo(ChordSimplificationToggle);
