'use client';

import { useState, useEffect, useRef } from 'react';
import { getModelInfo, ModelInfoResult } from '@/services/beatDetectionService';
import '@/styles/dropdown.css';

type ModelType = 'auto' | 'madmom' | 'beat-transformer' | 'librosa';

interface BeatModelSelectorProps {
  onChange: (model: Exclude<ModelType, 'librosa'>) => void;
  defaultValue?: Exclude<ModelType, 'librosa'>;
  className?: string;
}

interface ModelOption {
  id: ModelType;
  name: string;
  description: string;
  available: boolean;
}

const BeatModelSelector = ({ onChange, defaultValue = 'beat-transformer', className = '' }: BeatModelSelectorProps) => {
  const [modelInfo, setModelInfo] = useState<ModelInfoResult | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelType>(defaultValue);
  const [loading, setLoading] = useState(true);
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
    if (isOpen && buttonRef.current && typeof window !== 'undefined') {
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

  useEffect(() => {
    async function fetchModelInfo() {
      setLoading(true);
      try {
        const info = await getModelInfo();
        setModelInfo(info);
      } catch (error) {
        console.error('Failed to fetch model info:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchModelInfo();
  }, []);

  const handleModelChange = (model: ModelType) => {
    setSelectedModel(model);
    if (model !== 'librosa') {
      onChange(model);
    }
    setIsOpen(false);
  };

  // Define model options with descriptions
  const getModelOptions = (): ModelOption[] => [
    {
      id: 'auto',
      name: 'Auto',
      description: 'Automatically selects the best available model for your audio',
      available: true
    },
    {
      id: 'beat-transformer',
      name: modelInfo?.model_info?.['beat-transformer']?.name || 'Beat-Transformer',
      description: modelInfo?.model_info?.['beat-transformer']?.description ||
                  'High-precision DL model with 5-channel audio separation',
      available: modelInfo?.beat_transformer_available || false
    },
    {
      id: 'madmom',
      name: modelInfo?.model_info?.['madmom']?.name || 'Madmom',
      description: modelInfo?.model_info?.['madmom']?.description ||
                  'Neural network with good balance of accuracy and speed',
      available: modelInfo?.madmom_available || false
    }
  ];

  // Get the currently selected model details
  const selectedModelOption = getModelOptions().find(option => option.id === selectedModel) || getModelOptions()[0];

  // Filter available models - always show beat-transformer since it's the default
  const availableModels = getModelOptions().filter(model =>
    model.available || model.id === 'beat-transformer'
  );

  return (
    <div className={`model-selector-container ${className}`}>
      <div className="mb-2">
        <div className="flex items-center">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">Beat Detection Models</h3>
          <div className="ml-1 text-gray-400 dark:text-gray-500 relative group transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 cursor-help">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute left-0 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-20 -translate-x-1/2 translate-y-1">
              Different models offer varying levels of accuracy and processing speed. Choose the one that best fits your needs.
            </div>
          </div>
        </div>
      </div>

      {/* Loading Banner */}
      {loading && (
        <div className="mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200 text-sm">Loading Beat Models</p>
              <p className="text-blue-600 dark:text-blue-300 text-xs">Fetching available models from the backend...</p>
            </div>
          </div>
        </div>
      )}

      <div className="relative" ref={dropdownRef}>
        {/* Dropdown button */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-content-bg border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm text-left text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-400 dark:hover:border-gray-500 transition-colors duration-300"
        >
          <div className="flex items-center">
            {/* Model icon based on type */}
            <span className="w-6 h-6 flex items-center justify-center mr-2 rounded-full bg-blue-100 dark:bg-blue-200 text-blue-600 dark:text-blue-800 transition-colors duration-300">
              {selectedModelOption.id === 'auto' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              )}
              {selectedModelOption.id === 'beat-transformer' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 7H7v6h6V7z" />
                  <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                </svg>
              )}

              {selectedModelOption.id === 'madmom' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                </svg>
              )}
              {selectedModelOption.id === 'librosa' && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span className="font-medium text-gray-800 dark:text-gray-200 transition-colors duration-300">{selectedModelOption.name}</span>
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
            className={`absolute z-50 w-full bg-white dark:bg-content-bg border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dropdown-menu transition-colors duration-300 ${
              dropdownPosition === 'top'
                ? 'bottom-full mb-1'
                : 'top-full mt-1'
            }`}
          >
            <ul className="py-1 max-h-[240px] overflow-auto text-gray-800 dark:text-gray-200 transition-colors duration-300">
              {availableModels.map((model) => (
                <li
                  key={model.id}
                  className={`px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors duration-300 ${selectedModel === model.id ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                  onClick={() => handleModelChange(model.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-start">
                      {/* Model icon */}
                      <span className={`w-6 h-6 flex items-center justify-center mr-2 rounded-full transition-colors duration-300 ${selectedModel === model.id ? 'bg-blue-100 dark:bg-blue-200 text-blue-600 dark:text-blue-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        {model.id === 'auto' && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                        )}
                        {model.id === 'beat-transformer' && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13 7H7v6h6V7z" />
                            <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                          </svg>
                        )}

                        {model.id === 'madmom' && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                          </svg>
                        )}
                        {model.id === 'librosa' && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200 transition-colors duration-300">{model.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">{model.description}</p>
                      </div>
                    </div>
                    {selectedModel === model.id && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400 transition-colors duration-300" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Description of selected model */}
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">
        {selectedModelOption.description}
      </div>
    </div>
  );
};

export default BeatModelSelector;