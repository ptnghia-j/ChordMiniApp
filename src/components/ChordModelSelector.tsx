'use client';

import React, { useState, useEffect, useRef } from 'react';
import '@/styles/dropdown.css';

interface ChordModelOption {
  id: string;
  name: string;
  description: string;
  performance?: string;
  available_chord_dicts?: string[];
}

interface ChordModelSelectorProps {
  selectedModel: 'chord-cnn-lstm';
  onModelChange: (model: 'chord-cnn-lstm') => void;
  disabled?: boolean;
  className?: string;
}

const ChordModelSelector: React.FC<ChordModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  className = ''
}) => {
  const [modelInfo, setModelInfo] = useState<Record<string, ChordModelOption>>({});
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Check if dropdown would be cut off at the bottom
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;

      // If there's not enough space below (less than 300px), position dropdown above
      if (spaceBelow < 300) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }
  }, [isOpen]);

  // Fetch available models from the API
  useEffect(() => {
    const fetchModelInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/model-info');

        if (!response.ok) {
          throw new Error(`Failed to fetch model info: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Unknown error fetching model info');
        }

        // Set available models and model info
        setAvailableModels(data.available_chord_models || []);
        setModelInfo(data.chord_model_info || {});
        setError(null);
      } catch (err) {
        console.error('Error fetching model info:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchModelInfo();
  }, []);

  // Handle model change
  const handleModelChange = (newModel: 'chord-cnn-lstm') => {
    onModelChange(newModel);
    setIsOpen(false);
  };

  // Get the currently selected model details
  const selectedModelOption = modelInfo[selectedModel] || {
    id: selectedModel,
    name: 'Chord-CNN-LSTM',
    description: 'Advanced deep learning model capable of recognizing 301 different chord labels. This model combines CNN and LSTM architectures for accurate chord recognition across various musical genres.',
    performance: 'High accuracy with comprehensive chord vocabulary'
  };

  return (
    <div className={`model-selector-container ${className}`}>
      <div className="mb-2">
        <div className="flex items-center">
          <h3 className="text-sm font-medium text-gray-700">Chord Recognition Model</h3>
          <div className="ml-1 text-gray-400 relative group">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 cursor-help">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute left-0 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-20 -translate-x-1/2 translate-y-1">
              The Chord-CNN-LSTM model can recognize 301 different chord types with high accuracy across various musical genres.
            </div>
          </div>
        </div>
      </div>

      {/* Model Selector */}
      <div className="relative" ref={dropdownRef}>
        {/* Dropdown button */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading || disabled}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-blue-800 rounded-lg shadow-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-600 transition-colors"
        >
          <div className="flex items-center">
            {/* Model icon */}
            <span className="w-6 h-6 flex items-center justify-center mr-2 rounded-full bg-blue-100 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 7H7v6h6V7z" />
                <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
              </svg>
            </span>
            <span className="font-medium">{selectedModelOption.name}</span>
            {loading && (
              <div className="ml-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div
            className={`absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg dropdown-menu ${
              dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            <ul className="py-1 max-h-[240px] overflow-auto">
              {availableModels.map((model) => (
                <li
                  key={model}
                  className={`px-4 py-2.5 hover:bg-gray-100 cursor-pointer ${selectedModel === model ? 'bg-gray-50' : ''}`}
                  onClick={() => handleModelChange(model as 'chord-cnn-lstm')}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-start">
                      {/* Model icon */}
                      <span className={`w-6 h-6 flex items-center justify-center mr-2 rounded-full ${selectedModel === model ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13 7H7v6h6V7z" />
                          <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-medium">{modelInfo[model]?.name || model}</p>
                        <p className="text-sm text-gray-500">{modelInfo[model]?.description || 'Deep learning model for chord recognition'}</p>
                      </div>
                    </div>
                    {selectedModel === model && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </li>
              ))}

              {availableModels.length === 0 && (
                <li className="px-4 py-2.5 text-gray-500">
                  No models available
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Note about future models */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
        <p className="font-medium mb-1">Coming Soon:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>BTC model - capable of detecting 170 chord labels</li>
          <li>2E1D model - lighter model for 170 chord labels</li>
        </ul>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-red-500">
          Error: {error}
        </div>
      )}

      {/* Description of selected model */}
      <div className="mt-2 text-sm text-gray-500">
        {selectedModelOption.description}
        {selectedModelOption.performance && (
          <span className="block mt-1">Performance: {selectedModelOption.performance}</span>
        )}
      </div>
    </div>
  );
};

export default ChordModelSelector;
