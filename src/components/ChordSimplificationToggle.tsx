'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { HiOutlineAcademicCap, HiAcademicCap } from 'react-icons/hi2';

interface ChordSimplificationToggleProps {
  isEnabled: boolean;
  onClick: () => void;
  isVideoMinimized?: boolean;
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
  isVideoMinimized = false,
  className = ''
}) => {
  return (
    <motion.button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-full shadow-md whitespace-nowrap transition-colors duration-200 flex items-center space-x-1 ${
        isEnabled
          ? 'bg-green-600 text-white hover:bg-green-700'
          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
      } ${className}`}
      title={isEnabled ? "Show full chord notation" : "Simplify chord notation to basic types"}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Icon */}
      {isEnabled ? (
        <HiAcademicCap className="h-3 w-3" />
      ) : (
        <HiOutlineAcademicCap className="h-3 w-3" />
      )}
      
      {/* Text label */}
      <span>
        <span className={`${isVideoMinimized ? 'hidden' : ''}`}>
          {isEnabled ? "Simplify: ON" : "Simplify: OFF"}
        </span>
        <span className={`${isVideoMinimized ? 'inline' : 'hidden'}`}>
          {isEnabled ? "Simple" : "Simple"}
        </span>
      </span>
    </motion.button>
  );
};

export default ChordSimplificationToggle;
