/**
 * Pitch Shift Panel Component
 * 
 * Control panel for adjusting pitch shift amount with slider and preset buttons.
 * Shows original and target keys, quality warnings, and loading states.
 */

'use client';

import React, { useCallback, useMemo } from 'react';
import { TbRefresh, TbAlertTriangle } from 'react-icons/tb';
import {
  useIsPitchShiftEnabled,
  usePitchShiftSemitones,
  useIsProcessingPitchShift,
  usePitchShiftError,
  useOriginalKey,
  useTargetKey,
  useSetPitchShiftSemitones,
  useResetPitchShift
} from '@/stores/uiStore';
import {
  formatSemitones,
  getIntervalName,
  getQualityWarning,
} from '@/utils/chordTransposition';

export const PitchShiftPanel: React.FC = () => {
  const isPitchShiftEnabled = useIsPitchShiftEnabled();
  const pitchShiftSemitones = usePitchShiftSemitones();
  const isProcessingPitchShift = useIsProcessingPitchShift();
  const pitchShiftError = usePitchShiftError();
  const originalKey = useOriginalKey();
  const targetKey = useTargetKey();
  const setPitchShiftSemitones = useSetPitchShiftSemitones();
  const resetPitchShift = useResetPitchShift();

  // Debounced semitone change handler
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      setPitchShiftSemitones(value);
    },
    [setPitchShiftSemitones]
  );

  // Preset button handler
  const handlePresetClick = useCallback(
    (semitones: number) => {
      setPitchShiftSemitones(semitones);
    },
    [setPitchShiftSemitones]
  );

  // Quality warning
  const qualityWarning = useMemo(
    () => getQualityWarning(pitchShiftSemitones),
    [pitchShiftSemitones]
  );

  // Interval name
  const intervalName = useMemo(
    () => getIntervalName(pitchShiftSemitones),
    [pitchShiftSemitones]
  );

  if (!isPitchShiftEnabled) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Pitch Shift Control
        </h3>
        <button
          onClick={resetPitchShift}
          disabled={pitchShiftSemitones === 0 || isProcessingPitchShift}
          className={`
            flex items-center gap-1 px-2 py-1 rounded text-sm
            ${pitchShiftSemitones === 0 || isProcessingPitchShift
              ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
              : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
            }
          `}
          aria-label="Reset pitch shift"
        >
          <TbRefresh className="w-4 h-4" />
          <span>Reset</span>
        </button>
      </div>

      {/* Key Display */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Original:</span>
            <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
              {originalKey}
            </span>
          </div>
          <div className="text-gray-400 dark:text-gray-500">→</div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Shifted:</span>
            <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
              {targetKey}
            </span>
          </div>
        </div>
        <div className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          {intervalName} ({formatSemitones(pitchShiftSemitones)} semitones)
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="mb-4">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Quick Presets:</div>
        <div className="flex gap-2 flex-wrap">
          {[-2, -1, 0, +1, +2].map((semitones) => (
            <button
              key={semitones}
              onClick={() => handlePresetClick(semitones)}
              disabled={isProcessingPitchShift}
              className={`
                px-3 py-1 rounded text-sm font-medium transition-all
                ${pitchShiftSemitones === semitones
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }
                ${isProcessingPitchShift ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {formatSemitones(semitones)}
            </button>
          ))}
        </div>
      </div>

      {/* Slider */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="pitch-shift-slider"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Semitones
          </label>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
            {formatSemitones(pitchShiftSemitones)}
          </span>
        </div>
        
        <input
          id="pitch-shift-slider"
          type="range"
          min="-12"
          max="12"
          step="1"
          value={pitchShiftSemitones}
          onChange={handleSliderChange}
          disabled={isProcessingPitchShift}
          className={`
            w-full h-2 rounded-lg appearance-none cursor-pointer
            bg-gray-200 dark:bg-gray-700
            ${isProcessingPitchShift ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          style={{
            background: `linear-gradient(to right, 
              #10b981 0%, 
              #10b981 ${((pitchShiftSemitones + 12) / 24) * 100}%, 
              #e5e7eb ${((pitchShiftSemitones + 12) / 24) * 100}%, 
              #e5e7eb 100%)`,
          }}
        />
        
        {/* Slider markers */}
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>-12</span>
          <span>-7</span>
          <span>-5</span>
          <span>0</span>
          <span>+5</span>
          <span>+7</span>
          <span>+12</span>
        </div>
      </div>

      {/* Quality Warning */}
      {qualityWarning && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <div className="flex items-start gap-2">
            <TbAlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {qualityWarning}
            </p>
          </div>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessingPitchShift && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Processing pitch shift...
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {pitchShiftError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
          <div className="flex items-start gap-2">
            <TbAlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-200">
              {pitchShiftError}
            </p>
          </div>
        </div>
      )}

      {/* CSS for slider thumb */}
      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #10b981;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        input[type='range']::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #10b981;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        input[type='range']:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
          opacity: 0.5;
        }

        input[type='range']:disabled::-moz-range-thumb {
          cursor: not-allowed;
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
};

export default PitchShiftPanel;

