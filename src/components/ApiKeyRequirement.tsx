'use client';

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import ApiKeyModal from './ApiKeyModal';
import { HiLightBulb, HiGift } from 'react-icons/hi2';
import type { ApiKeyRequirement } from '@/types/apiKeyTypes';

interface ApiKeyRequirementProps {
  requirement: ApiKeyRequirement;
  onApiKeyProvided: (service: 'musicAi' | 'gemini', key: string) => Promise<void>;
  onSkip?: () => void;
}

const ApiKeyRequirement: React.FC<ApiKeyRequirementProps> = ({
  requirement,
  onApiKeyProvided,
  onSkip
}) => {
  const { theme } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKeySubmitted = async (key: string) => {
    setIsSubmitting(true);
    try {
      await onApiKeyProvided(requirement.service, key);
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getServiceIcon = () => {
    switch (requirement.service) {
      case 'musicAi':
        return (
          <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        );
      case 'gemini':
        return (
          <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        );
      default:
        return (
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
    }
  };

  const getServiceName = () => {
    switch (requirement.service) {
      case 'musicAi':
        return 'Music.ai';
      case 'gemini':
        return 'Gemini';
      default:
        return 'API';
    }
  };

  return (
    <div className={`
      max-w-md mx-auto p-6 rounded-lg border-2 border-dashed
      ${theme === 'dark' 
        ? 'bg-gray-800 border-gray-600' 
        : 'bg-gray-50 border-gray-300'
      }
    `}>
      {/* Icon and Title */}
      <div className="text-center mb-4">
        <div className="flex justify-center mb-3">
          {getServiceIcon()}
        </div>
        <h3 className={`text-lg font-semibold mb-2 ${
          theme === 'dark' ? 'text-white' : 'text-gray-900'
        }`}>
          {getServiceName()} API Key {requirement.required ? 'Required' : 'Recommended'}
        </h3>
        <p className={`text-sm ${
          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
        }`}>
          {requirement.message}
        </p>
      </div>

      {/* Feature Info */}
      <div className={`mb-6 p-3 rounded-md ${
        theme === 'dark' ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'
      }`}>
        <p className={`text-sm ${
          theme === 'dark' ? 'text-blue-200' : 'text-blue-800'
        }`}>
          <strong>Feature:</strong> {requirement.feature}
        </p>
        {requirement.service === 'musicAi' && (
          <div className={`text-sm mt-2 font-medium ${
            theme === 'dark' ? 'text-green-300' : 'text-green-700'
          } flex items-center gap-2`}>
            <HiLightBulb className="w-4 h-4" />
            <span>Free to start: $20 credit included with new accounts</span>
          </div>
        )}
        {requirement.service === 'gemini' && (
          <div className={`text-sm mt-2 font-medium ${
            theme === 'dark' ? 'text-green-300' : 'text-green-700'
          } flex items-center gap-2`}>
            <HiGift className="w-4 h-4" />
            <span>Free tier available: Generous usage limits for personal projects</span>
          </div>
        )}
        {requirement.fallbackAvailable && (
          <p className={`text-xs mt-1 ${
            theme === 'dark' ? 'text-blue-300' : 'text-blue-600'
          }`}>
            Limited functionality available without API key
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={() => setShowModal(true)}
          disabled={isSubmitting}
          className={`
            w-full px-4 py-2 rounded-md font-medium transition-colors
            ${isSubmitting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
        >
          {isSubmitting ? 'Setting up...' : `Add ${getServiceName()} API Key`}
        </button>

        {!requirement.required && onSkip && (
          <button
            onClick={onSkip}
            disabled={isSubmitting}
            className={`
              w-full px-4 py-2 rounded-md font-medium transition-colors
              ${theme === 'dark' 
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }
            `}
          >
            {requirement.fallbackAvailable ? 'Continue with Limited Features' : 'Skip for Now'}
          </button>
        )}
      </div>

      {/* Security Note */}
      <div className={`mt-4 p-3 rounded-md ${
        theme === 'dark' ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200'
      }`}>
        <div className="flex items-start space-x-2">
          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <p className={`text-xs ${
              theme === 'dark' ? 'text-green-200' : 'text-green-800'
            }`}>
              <strong>Secure:</strong> Your API key is encrypted and stored locally in your browser. It never leaves your device.
            </p>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <ApiKeyModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          service={requirement.service}
          required={requirement.required}
          onKeySubmitted={handleKeySubmitted}
        />
      )}
    </div>
  );
};

export default ApiKeyRequirement;
