'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { HiOutlineHashtag, HiHashtag } from 'react-icons/hi2';
import { Tooltip } from '@heroui/react';

interface RomanNumeralToggleProps {
  isEnabled: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * Toggle button for Roman numeral analysis display
 * Shows Roman numeral notation below chord labels when enabled
 * Follows the same design pattern as auto-scroll, simplify, and metronome toggle buttons
 */
const RomanNumeralToggle: React.FC<RomanNumeralToggleProps> = ({
  isEnabled,
  onClick,
  className = ''
}) => {
  return (
    <div className="relative">
      <Tooltip
        content={isEnabled ? "Hide Roman numeral analysis" : "Show Roman numeral analysis"}
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
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
          } ${className}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Icon */}
          {isEnabled ? (
            <HiHashtag className="h-4 w-4" />
          ) : (
            <HiOutlineHashtag className="h-4 w-4" />
          )}
        </motion.button>
      </Tooltip>

      {/* Beta tag */}
      <div className="absolute -top-1 -right-1 bg-blue-500/70 dark:bg-blue-500/30 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">
        BETA
      </div>
    </div>
  );
};

export default RomanNumeralToggle;
