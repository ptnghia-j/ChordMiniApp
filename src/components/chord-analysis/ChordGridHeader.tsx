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
    <div className={`flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      {/* Left side - Title */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* <div className="rounded-full border border-default-200/80 bg-default-100 px-3 py-1 transition-colors duration-300 dark:border-white/10 dark:bg-gray-800/50"> */}
          <h3 className="m-0 text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
            Chord Progression
          </h3>
        {/* </div> */}
      </div>

      {/* Right side - Tags */}
      <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end sm:gap-2">
        {/* Time signature tag */}
        <div className="rounded-lg border border-blue-300/60 bg-blue-500/10 px-2 py-0.5 sm:px-3 sm:py-1 dark:border-blue-400/35 dark:bg-blue-800/40">
          <span className="text-xs font-medium text-blue-800 dark:text-blue-50 sm:text-sm">
            Time: {timeSignature === 6 ? '6/8' : `${timeSignature}/4`}
          </span>
        </div>

        {/* Key signature tag */}
        {keySignature && (
          <div className="rounded-lg border border-green-300/60 bg-green-500/10 px-2 py-0.5 sm:px-3 sm:py-1 dark:border-green-400/35 dark:bg-green-800/40">
            <span className="text-xs font-medium text-green-800 dark:text-green-50 sm:text-sm">
              Key: {keySignature.replace(/b/g, '♭').replace(/#/g, '♯')}
            </span>
          </div>
        )}

        {/* Key detection loading indicator */}
        {isDetectingKey && (
          <div className="rounded-lg border border-blue-300/55 bg-blue-500/12 px-2 py-0.5 sm:px-3 sm:py-1 dark:border-blue-300/35 dark:bg-blue-300/16">
            <span className="text-xs font-medium text-blue-800 dark:text-white sm:text-sm">
              Detecting key...
            </span>
          </div>
        )}

        {/* Pickup beats indicator */}
        {hasPickupBeats && pickupBeatsCount > 0 && (
          <div className="rounded-lg border border-blue-300/55 bg-blue-500/12 px-2 py-0.5 sm:px-3 sm:py-1 dark:border-blue-300/35 dark:bg-blue-300/16">
            <span className="text-xs font-medium text-blue-800 dark:text-blue-900 sm:text-sm">
              Pickup: {pickupBeatsCount} beat{pickupBeatsCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChordGridHeader;
