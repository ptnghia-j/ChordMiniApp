'use client';

import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  status?: string;
  isIndeterminate?: boolean;
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  status,
  isIndeterminate = false,
  className = '',
}) => {
  // Ensure progress is between 0-100
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  
  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-1">
        <div className="text-sm font-medium text-gray-700">
          {status || 'Processing...'}
        </div>
        {!isIndeterminate && (
          <div className="text-sm font-medium text-gray-500">
            {Math.round(normalizedProgress)}%
          </div>
        )}
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        {isIndeterminate ? (
          <div className="h-full bg-blue-600 rounded-full animate-progress-indeterminate" style={{ width: '30%' }}></div>
        ) : (
          <div 
            className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${normalizedProgress}%` }}
          ></div>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
