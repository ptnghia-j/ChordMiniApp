'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ConfirmationButtonsProps {
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  disabled?: boolean;
}

/**
 * Component that displays Yes/No confirmation buttons for chatbot interactions
 */
const ConfirmationButtons: React.FC<ConfirmationButtonsProps> = ({
  onConfirm,
  onCancel,
  confirmText = 'Yes',
  cancelText = 'No',
  disabled = false
}) => {
  return (
    <div className="flex gap-3 mt-4">
      {/* Yes/Confirm Button */}
      <motion.button
        onClick={onConfirm}
        disabled={disabled}
        className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200 flex-1 max-w-[120px]"
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        {confirmText}
      </motion.button>

      {/* No/Cancel Button */}
      <motion.button
        onClick={onCancel}
        disabled={disabled}
        className="px-6 py-3 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200 flex-1 max-w-[120px]"
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        {cancelText}
      </motion.button>
    </div>
  );
};

export default ConfirmationButtons;
