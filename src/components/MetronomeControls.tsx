import React, { useState, useEffect } from 'react';
import { metronomeService } from '@/services/metronomeService';

interface MetronomeControlsProps {
  className?: string;
}

const MetronomeControls: React.FC<MetronomeControlsProps> = ({ className = '' }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [soundStyle, setSoundStyle] = useState<'traditional' | 'digital' | 'wood' | 'bell'>('traditional');
  const [isExpanded, setIsExpanded] = useState(false);

  // Initialize component state from metronome service
  useEffect(() => {
    setIsEnabled(metronomeService.isMetronomeEnabled());
    setVolume(metronomeService.getVolume());
    setSoundStyle(metronomeService.getSoundStyle() as 'traditional' | 'digital' | 'wood' | 'bell');
  }, []);

  // Handle metronome toggle
  const handleToggle = async () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    await metronomeService.setEnabled(newEnabled);

    // Test click when enabling
    if (newEnabled) {
      setTimeout(() => {
        metronomeService.testClick(false);
      }, 100);
    }
  };

  // Handle volume change
  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);
    metronomeService.setVolume(newVolume);
  };

  // Handle sound style change
  const handleSoundStyleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = event.target.value as 'traditional' | 'digital' | 'wood' | 'bell';
    setSoundStyle(newStyle);
    await metronomeService.setSoundStyle(newStyle);
  };

  // Test downbeat click
  const testDownbeat = () => {
    metronomeService.testClick(true);
  };

  // Test regular beat click
  const testRegularBeat = () => {
    metronomeService.testClick(false);
  };

  return (
    <div className={`metronome-controls ${className}`}>
      {/* Main toggle button */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleToggle}
          className={`px-3 py-1 text-xs rounded-full shadow-md transition-colors duration-200 ${
            isEnabled
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
          }`}
          title={isEnabled ? "Disable metronome" : "Enable metronome"}
        >
          <div className="flex items-center space-x-1">
            {/* Metronome icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
            </svg>
            <span>{isEnabled ? "Metronome: ON" : "Metronome: OFF"}</span>
          </div>
        </button>

        {/* Expand/collapse button for advanced controls */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          title="Metronome settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Expanded controls */}
      {isExpanded && (
        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors duration-300">
          {/* Sound style selector */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sound Style
            </label>
            <select
              value={soundStyle}
              onChange={handleSoundStyleChange}
              className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="traditional">Traditional (Tick-Tock)</option>
              <option value="digital">Digital (Clean)</option>
              <option value="wood">Wood Block</option>
              <option value="bell">Bell</option>
            </select>
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
