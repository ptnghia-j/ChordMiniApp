'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { HiOutlineSquares2X2, HiSquares2X2 } from 'react-icons/hi2';
import { Tooltip } from '@heroui/react';
import { SEGMENTATION_COLOR_LEGEND } from '@/utils/segmentationColors';

interface SegmentationToggleButtonProps {
  isEnabled: boolean;
  onClick: () => void;
  hasSegmentationData: boolean;
  className?: string;
}

/**
 * Toggle button for segmentation visualization
 * Shows/hides color-coded segmentation overlay on the beat/chord grid
 */
const SegmentationToggleButton: React.FC<SegmentationToggleButtonProps> = ({
  isEnabled,
  onClick,
  hasSegmentationData,
  className = ''
}) => {
  if (!hasSegmentationData) {
    return null; // Don't show toggle if no segmentation data available
  }

  // Create more opaque colors for better visibility in legend
  const getLegendColor = (color: string): string => {
    // Convert rgba(r, g, b, 0.3) to rgba(r, g, b, 0.8) for better visibility
    return color.replace('0.3)', '0.8)');
  };

  // Create tooltip content with color legend
  const tooltipContent = (
    <div className="p-3">
      <div className="text-center mb-3 font-semibold text-sm">Segmentation Colors</div>
      <div className="space-y-2">
        {SEGMENTATION_COLOR_LEGEND.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div
              className="w-5 h-5 rounded-sm shadow-sm"
              style={{ backgroundColor: getLegendColor(item.color) }}
            />
            <span className="text-sm font-medium">{item.type}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <Tooltip
        content={isEnabled ? tooltipContent : `${isEnabled ? 'Hide' : 'Show'} song segmentation visualization`}
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
          className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            isEnabled
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isEnabled ? (
            <HiSquares2X2 className="w-3 h-3 sm:w-4 sm:h-4" />
          ) : (
            <HiOutlineSquares2X2 className="w-3 h-3 sm:w-4 sm:h-4" />
          )}
          <span className="hidden sm:inline">Segmentation</span>
          <span className="sm:hidden">Seg</span>
        </motion.button>
      </Tooltip>

      {/* Beta tag */}
      <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] px-1 py-0.5 rounded-full font-bold">
        EXP
      </div>
    </div>
  );
};

export default SegmentationToggleButton;
