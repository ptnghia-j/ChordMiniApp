'use client';

import React from 'react';
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
        base: "max-w-xs",
        content: "bg-gray-900 dark:bg-gray-800 text-white border border-gray-700"
      }}
    >
      <motion.button
        onClick={onClick}
        className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
          isEnabled
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
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

export default ChordSimplificationToggle;
