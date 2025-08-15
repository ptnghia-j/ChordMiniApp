import React, { useState, useEffect } from 'react';
import type { MetronomeService } from '@/services/metronomeService';
import { FiChevronDown } from 'react-icons/fi';
import { PiMetronomeBold, PiMetronome } from 'react-icons/pi';
import { Tooltip } from '@heroui/react';

interface MetronomeControlsProps {
  className?: string;
  onToggleWithSync?: () => Promise<boolean>; // ENHANCED: Synchronized toggle function with current time
}

const MetronomeControls: React.FC<MetronomeControlsProps> = ({
  className = '',
  onToggleWithSync
}) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [soundStyle, setSoundStyle] = useState<'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long'>('librosa_short');
  const [isExpanded] = useState(false);
  const [metronomeService, setMetronomeService] = useState<MetronomeService | null>(null);
  const [showSoundStyleDropdown, setShowSoundStyleDropdown] = useState(false);

  // Initialize metronome service on client side only
  useEffect(() => {
    const initMetronome = async () => {
      if (typeof window !== 'undefined') {
        const { metronomeService: service } = await import('@/services/metronomeService');
        setMetronomeService(service);
        setIsEnabled(service.isMetronomeEnabled());
        setVolume(service.getVolume());
        setSoundStyle(service.getSoundStyle() as 'traditional' | 'digital' | 'wood' | 'bell' | 'librosa_default' | 'librosa_pitched' | 'librosa_short' | 'librosa_long');
      }
    };
    initMetronome();
  }, []);

  // Handle metronome toggle with synchronization
  const handleToggle = async () => {
    if (!metronomeService) {
      console.error('MetronomeControls: No metronome service available');
      return;
    }

    let newEnabled: boolean;

    // ENHANCED: Use synchronized toggle when available for perfect timing
    if (onToggleWithSync) {
      // console.log('Using synchronized metronome toggle with current time');
      newEnabled = await onToggleWithSync();
    } else {
      // Fallback to legacy toggle (for upload page compatibility)
      // console.log('Using legacy metronome toggle (no current time sync)');
      newEnabled = !isEnabled;
      await metronomeService.setEnabled(newEnabled, 0); // Default to time 0
    }

    setIsEnabled(newEnabled);

    // Test click when enabling (for AudioContext initialization)
    if (newEnabled) {
      setTimeout(() => {
        metronomeService.testClick(false);
      }, 100);
    }
  };

  // Handle volume change
  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!metronomeService) return;
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);
    metronomeService.setVolume(newVolume);
  };

  // Handle sound style change
  const handleSoundStyleChange = async (newStyle: typeof soundStyle) => {
    if (!metronomeService) return;
    setSoundStyle(newStyle);
    setShowSoundStyleDropdown(false);
    await metronomeService.setSoundStyle(newStyle);
  };

  const soundStyleOptions = [
    { value: 'traditional', label: 'Traditional (Tick-Tock)' },
    { value: 'digital', label: 'Digital (Clean)' },
    { value: 'wood', label: 'Wood Block' },
    { value: 'bell', label: 'Bell' },
    { value: 'librosa_default', label: 'Librosa Default' },
    { value: 'librosa_pitched', label: 'Librosa Pitched' },
    { value: 'librosa_short', label: 'Librosa Short' },
    { value: 'librosa_long', label: 'Librosa Long' },
  ] as const;

  // Test downbeat click
  const testDownbeat = () => {
    // console.log('MetronomeControls: Test downbeat clicked');
    if (!metronomeService) {
      // console.error('MetronomeControls: No metronome service for downbeat test');
      return;
    }
    metronomeService.testClick(true);
  };

  // Test regular beat click
  const testRegularBeat = () => {
    // console.log('MetronomeControls: Test regular beat clicked');
    if (!metronomeService) {
      // console.error('MetronomeControls: No metronome service for regular beat test');
      return;
    }
    metronomeService.testClick(false);
  };

  return (
    <div className={`metronome-controls ${className}`}>
      {/* Main toggle button */}
      <div className="flex items-center space-x-2">
        <Tooltip
          content={isEnabled ? "Disable metronome" : "Enable metronome"}
          placement="top"
          delay={500}
          closeDelay={100}
          classNames={{
            base: "max-w-xs",
            content: "bg-gray-900 dark:bg-gray-800 text-white border border-gray-700"
          }}
        >
          <button
            onClick={handleToggle}
            className={`p-2 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center ${
              isEnabled
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
          >
            {/* Icon */}
            {isEnabled ? (
              <PiMetronomeBold className="h-4 w-4" />
            ) : (
              <PiMetronome className="h-4 w-4" />
            )}
          </button>
        </Tooltip>
      </div>

      {/* Expanded controls */}
      {isExpanded && (
        <div className="mt-2 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors duration-300">
          {/* Sound style selector */}
          <div className="mb-3 relative">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sound Style
            </label>
            <div className="relative">
              <button
                onClick={() => setShowSoundStyleDropdown(!showSoundStyleDropdown)}
                className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 flex items-center justify-between"
              >
                <span>{soundStyleOptions.find(option => option.value === soundStyle)?.label}</span>
                <FiChevronDown className={`w-3 h-3 transition-transform ${showSoundStyleDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showSoundStyleDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                  {soundStyleOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSoundStyleChange(option.value)}
                      className={`w-full px-2 py-1 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors ${
                        soundStyle === option.value ? 'bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Volume control */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Volume: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #f97316 0%, #f97316 ${volume * 100}%, #e5e7eb ${volume * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Test buttons */}
          <div className="flex space-x-2">
            <button
              onClick={testRegularBeat}
              className="flex-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
              title="Test regular beat sound"
            >
              Test Beat
            </button>
            <button
              onClick={testDownbeat}
              className="flex-1 px-2 py-1 text-xs bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded hover:bg-green-200 dark:hover:bg-green-700 transition-colors"
              title="Test downbeat sound"
            >
              Test Downbeat
            </button>
          </div>

          {/* Status indicator */}
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span>
                  {isEnabled ? 'Metronome active' : 'Metronome inactive'}
                </span>
              </div>
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                {soundStyle.charAt(0).toUpperCase() + soundStyle.slice(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Custom styles for the range slider */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-webkit-slider-track {
          height: 8px;
          border-radius: 4px;
        }

        .slider::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          background: #e5e7eb;
        }
      `}</style>
    </div>
  );
};

export default MetronomeControls;
