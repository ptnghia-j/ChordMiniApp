'use client';

import { useState, useEffect } from 'react';
import { Select, SelectItem, Chip } from '@heroui/react';
import { getModelInfo, ModelInfoResult } from '@/services/beatDetectionService';

type ModelType = 'auto' | 'madmom' | 'beat-transformer';

interface HeroUIBeatModelSelectorProps {
  onChange: (model: ModelType) => void;
  defaultValue?: ModelType;
  className?: string;
}

interface ModelOption {
  id: ModelType;
  name: string;
  description: string;
  available: boolean;
}

const HeroUIBeatModelSelector = ({ 
  onChange, 
  defaultValue = 'beat-transformer', 
  className = '' 
}: HeroUIBeatModelSelectorProps) => {
  const [modelInfo, setModelInfo] = useState<ModelInfoResult | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelType>(defaultValue);
  const [loading, setLoading] = useState(true);

  // Fetch model information on component mount
  useEffect(() => {
    const fetchModelInfo = async () => {
      try {
        const info = await getModelInfo();
        setModelInfo(info);
      } catch (error) {
        console.error('Error fetching model info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchModelInfo();
  }, []);

  // Update selected model when defaultValue changes
  useEffect(() => {
    setSelectedModel(defaultValue);
  }, [defaultValue]);

  const handleSelectionChange = (keys: 'all' | Set<React.Key>) => {
    if (keys !== 'all') {
      const selectedKey = Array.from(keys)[0] as ModelType;
      if (selectedKey) {
        setSelectedModel(selectedKey);
        onChange(selectedKey);
      }
    }
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

  // Filter available models - always show beat-transformer since it's the default
  const availableModels = getModelOptions().filter(model =>
    model.available || model.id === 'beat-transformer'
  );

  const getModelIcon = (modelId: ModelType) => {
    switch (modelId) {
      case 'auto':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
        );
      case 'beat-transformer':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'madmom':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
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
            Beat Detection Models
          </h3>
          <div className="ml-1 text-gray-400 dark:text-gray-500 relative group transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 cursor-help">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
              Advanced beat detection using transformer architecture
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 transition-colors duration-300">
          Advanced beat detection using transformer architecture
        </p>
      </div>

      <Select
        selectedKeys={[selectedModel]}
        onSelectionChange={handleSelectionChange}
        placeholder="Select a beat detection model"
        className="w-full"
        variant="bordered"
        color="primary"
        isLoading={loading}
        isDisabled={loading}
        startContent={getModelIcon(selectedModel)}
        description="Choose the beat detection model for audio analysis"
        aria-label="Beat detection model selector"
      >
        {availableModels.map((model) => (
          <SelectItem
            key={model.id}
            startContent={getModelIcon(model.id)}
            description={model.description}
            className="text-left"
            textValue={model.name}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-medium">{model.name}</span>
              {model.id === 'beat-transformer' && (
                <Chip size="sm" color="primary" variant="flat">
                  BETA
                </Chip>
              )}
            </div>
          </SelectItem>
        ))}
      </Select>

      {loading && (
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">
          Loading model information...
        </div>
      )}
    </div>
  );
};

export default HeroUIBeatModelSelector;
