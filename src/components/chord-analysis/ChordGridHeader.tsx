import React from 'react';

export interface ChordGridHeaderProps {
  timeSignature: number;
  keySignature?: string;
  isDetectingKey?: boolean;
  hasPickupBeats?: boolean;
  pickupBeatsCount?: number;
  className?: string;
}

/**
 * Header component for ChordGrid displaying time signature, key signature, and pickup beats
 * Extracted from ChordGrid for better component organization and reusability
 */
export const ChordGridHeader: React.FC<ChordGridHeaderProps> = ({
  timeSignature,
  keySignature,
  isDetectingKey = false,
  hasPickupBeats = false,
  pickupBeatsCount = 0,
  className = ''
}) => {
  return (
    <div className={`flex justify-between items-baseline ${className}`}>
      {/* Left side - Title */}
      <div className="flex items-center gap-3">
        {/* 2. Added m-0 to remove default browser margins */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 m-0">
          Chord Progression
        </h3>
      </div>

      {/* Right side - Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Time signature tag */}
        <div className="bg-blue-50 dark:bg-blue-800/40 border border-blue-200 dark:border-blue-400 rounded-lg px-3 py-1">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-50">
            Time: {timeSignature === 6 ? '6/8' : `${timeSignature}/4`}
          </span>
        </div>

        {/* Key signature tag */}
        {keySignature && (
          <div className="bg-green-50 dark:bg-green-800/40 border border-green-200 dark:border-green-400 rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-green-800 dark:text-green-50">
              Key: {keySignature.replace(/b/g, '♭').replace(/#/g, '♯')}
            </span>
          </div>
        )}

        {/* Key detection loading indicator */}
        {isDetectingKey && (
          <div className="bg-blue-50/60 dark:bg-blue-200/60 border border-blue-200 dark:border-blue-300 rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-900">
              Detecting key...
            </span>
          </div>
        )}

        {/* Pickup beats indicator */}
        {hasPickupBeats && pickupBeatsCount > 0 && (
          <div className="bg-blue-50 dark:bg-blue-200 border border-blue-200 dark:border-blue-300 rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-900">
              Pickup: {pickupBeatsCount} beat{pickupBeatsCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChordGridHeader;
