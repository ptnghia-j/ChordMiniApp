'use client';

import React, { useState, useEffect } from 'react';
import { Select, SelectItem, Chip } from '@heroui/react';

// Import the type from the service
type ChordDetectorType = 'chord-cnn-lstm' | 'btc-sl' | 'btc-pl';

interface ChordModelOption {
  id: ChordDetectorType;
  name: string;
  description: string;
  performance?: string;
  available_chord_dicts?: string[];
  available?: boolean;
}

interface ModelInfoResponse {
  name?: string;
  description?: string;
  performance?: string;
  available_chord_dicts?: string[];
  available?: boolean;
}

interface HeroUIChordModelSelectorProps {
  selectedModel: ChordDetectorType;
  onModelChange: (model: ChordDetectorType) => void;
  disabled?: boolean;
  className?: string;
  fallbackInfo?: {
    original_model_requested?: string;
    fallback_reason?: string;
    fallback_model?: string;
  } | null;
}

const HeroUIChordModelSelector: React.FC<HeroUIChordModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  className = '',
  fallbackInfo = null
}) => {
  const [modelInfo, setModelInfo] = useState<Record<string, ChordModelOption>>({});
  const [availableModels, setAvailableModels] = useState<ChordDetectorType[]>(['chord-cnn-lstm', 'btc-sl', 'btc-pl']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch model information
  useEffect(() => {
    const fetchModelInfo = async () => {
      try {
        setLoading(true);

        // Use the Next.js API route instead of direct backend call
        const response = await fetch('/api/model-info', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.chord_model_info) {
          const modelInfoMap: Record<string, ChordModelOption> = {};
          const modelIds: ChordDetectorType[] = [];

          Object.entries(data.chord_model_info).forEach(([key, value]) => {
            const modelOption: ChordModelOption = {
              id: key as ChordDetectorType,
              name: (value as ModelInfoResponse).name || key,
              description: (value as ModelInfoResponse).description || 'Chord recognition model',
              performance: (value as ModelInfoResponse).performance || 'Unknown performance',
              available_chord_dicts: (value as ModelInfoResponse).available_chord_dicts || [],
              available: (value as ModelInfoResponse).available !== false // Default to true if not specified
            };

            modelInfoMap[key] = modelOption;
            // Include all available models
            if (modelOption.available) {
              modelIds.push(key as ChordDetectorType);
            }
          });

          setModelInfo(modelInfoMap);
          setAvailableModels(modelIds.length > 0 ? modelIds : ['chord-cnn-lstm', 'btc-sl', 'btc-pl']);
        } else {
          // Fallback to default models
          setAvailableModels(['chord-cnn-lstm', 'btc-sl', 'btc-pl']);
        }
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

  const handleSelectionChange = (keys: 'all' | Set<React.Key>) => {
    if (keys !== 'all') {
      const selectedKey = Array.from(keys)[0] as ChordDetectorType;
      if (selectedKey) {
        onModelChange(selectedKey);
      }
    }
  };

  // Default model options
  const defaultModelOptions: Record<ChordDetectorType, ChordModelOption> = {
    'chord-cnn-lstm': {
      id: 'chord-cnn-lstm',
      name: 'Chord-CNN-LSTM',
      description: 'CNN+LSTM model with 301 chord labels for comprehensive chord recognition',
      performance: 'High accuracy, medium processing speed (~25s)',
      available: true
    },
    'btc-sl': {
      id: 'btc-sl',
      name: 'BTC SL (Supervised Learning)',
      description: 'Transformer model with 170 chord labels, supervised training (with fallback)',
      performance: 'High accuracy with transformer architecture (auto-fallback to CNN-LSTM if needed)',
      available: true
    },
    'btc-pl': {
      id: 'btc-pl',
      name: 'BTC PL (Pseudo-Label)',
      description: 'Transformer model with 170 chord labels, pseudo-label training (with fallback)',
      performance: 'Enhanced accuracy through pseudo-labeling (auto-fallback to CNN-LSTM if needed)',
      available: true
    }
  };

  // Get the currently selected model details
  const selectedModelOption = modelInfo[selectedModel] || defaultModelOptions[selectedModel];

  const getModelIcon = (modelId: ChordDetectorType) => {
    switch (modelId) {
      case 'chord-cnn-lstm':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'btc-sl':
      case 'btc-pl':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-2">
        <div className="flex items-center">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">
            Chord Recognition Model
          </h3>
          <div className="ml-1 text-gray-400 dark:text-gray-500 relative group transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 cursor-help">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              CNN+LSTM model with 301 chord labels for comprehensive chord recognition
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 transition-colors duration-300">
          CNN+LSTM model with 301 chord labels for comprehensive chord recognition
        </p>
      </div>

      <Select
        selectedKeys={[selectedModel]}
        onSelectionChange={handleSelectionChange}
        placeholder="Select a chord recognition model"
        className="w-full"
        variant="bordered"
        color="primary"
        isLoading={loading}
        isDisabled={loading || disabled}
        startContent={getModelIcon(selectedModel)}
        description={selectedModelOption?.performance || "Choose the chord recognition model for audio analysis"}
        aria-label="Chord recognition model selector"
      >
        {availableModels.map((model) => {
          const modelOption = modelInfo[model] || defaultModelOptions[model];
          return (
            <SelectItem
              key={model}
              startContent={getModelIcon(model)}
              description={modelOption.description}
              className="text-left"
              textValue={modelOption.name}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">{modelOption.name}</span>
                {model.startsWith('btc-') && (
                  <Chip size="sm" color="secondary" variant="flat">
                    Transformer
                  </Chip>
                )}
              </div>
            </SelectItem>
          );
        })}
      </Select>

      {/* Fallback info */}
      {fallbackInfo && (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm transition-colors duration-300">
          <p className="font-medium text-yellow-800 dark:text-yellow-200 transition-colors duration-300">Model Fallback:</p>
          <p className="text-yellow-700 dark:text-yellow-300 transition-colors duration-300">
            {fallbackInfo.fallback_reason} Using {fallbackInfo.fallback_model} instead.
          </p>
        </div>
      )}

      {/* Upcoming models box */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm transition-colors duration-300">
        <p className="font-medium mb-1 text-blue-800 dark:text-blue-200 transition-colors duration-300">Upcoming Model:</p>
        <ul className="list-disc pl-5 space-y-1 text-blue-700 dark:text-blue-300 transition-colors duration-300">
          <li>2E1D model - lighter model for 170 chord vocabulary</li>
        </ul>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-red-500 dark:text-red-400 transition-colors duration-300">
          Error: {error}
        </div>
      )}

      {loading && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">
          Loading model information...
        </div>
      )}
    </div>
  );
};

export default HeroUIChordModelSelector;
