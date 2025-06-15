'use client';

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ApiKeySettingsProps, API_KEY_HELP_URLS } from '@/types/apiKeyTypes';
import ApiKeyModal from './ApiKeyModal';

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({
  onApiKeyUpdate,
  apiKeyStatus
}) => {
  const { theme } = useTheme();
  const [activeModal, setActiveModal] = useState<'musicAi' | 'gemini' | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleKeySubmitted = async (service: 'musicAi' | 'gemini', key: string) => {
    setIsUpdating(service);
    try {
      await onApiKeyUpdate(service, key);
      setActiveModal(null);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleRemoveKey = async (service: 'musicAi' | 'gemini') => {
    setIsUpdating(service);
    try {
      await onApiKeyUpdate(service, null);
    } finally {
      setIsUpdating(null);
    }
  };

  const getStatusIcon = (service: 'musicAi' | 'gemini') => {
    const status = apiKeyStatus[service];
    
    if (!status.hasKey) {
      return (
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    }
    
    if (status.isValid) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    );
  };

  const getStatusText = (service: 'musicAi' | 'gemini') => {
    const status = apiKeyStatus[service];
    
    if (!status.hasKey) {
      return 'No API key configured';
    }
    
    if (status.isValid) {
      return 'API key is valid';
    }
    
    return status.error || 'API key validation failed';
  };

  const getQuotaDisplay = () => {
    const geminiStatus = apiKeyStatus.gemini;
    
    if (!geminiStatus.hasKey || !geminiStatus.quotaUsed || !geminiStatus.quotaLimit) {
      return null;
    }
    
    const percentage = (geminiStatus.quotaUsed / geminiStatus.quotaLimit) * 100;
    const isNearLimit = percentage >= 80;
    const isOverLimit = percentage >= 95;
    
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-sm">
          <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
            Translation quota
          </span>
          <span className={`font-medium ${
            isOverLimit ? 'text-red-500' : 
            isNearLimit ? 'text-yellow-500' : 
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {geminiStatus.quotaUsed}/{geminiStatus.quotaLimit} ({percentage.toFixed(0)}%)
          </span>
        </div>
        <div className={`mt-1 h-2 rounded-full ${
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
        }`}>
          <div 
            className={`h-full rounded-full transition-all duration-300 ${
              isOverLimit ? 'bg-red-500' : 
              isNearLimit ? 'bg-yellow-500' : 
              'bg-green-500'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        {geminiStatus.quotaResetTime && (
          <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            Resets: {new Date(geminiStatus.quotaResetTime).toLocaleString()}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-medium mb-4 ${
          theme === 'dark' ? 'text-white' : 'text-gray-900'
        }`}>
          API Key Management
        </h3>
        <p className={`text-sm mb-6 ${
          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
        }`}>
          Configure your own API keys for external services. Keys are stored securely in your browser and never sent to our servers.
        </p>
      </div>

      {/* Music.ai API Key */}
      <div className={`p-4 rounded-lg border ${
        theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              {getStatusIcon('musicAi')}
              <h4 className={`font-medium ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Music.ai API Key
              </h4>
              <span className={`px-2 py-1 text-xs rounded-full ${
                theme === 'dark' ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800'
              }`}>
                Required
              </span>
            </div>
            <p className={`text-sm mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Required for lyrics transcription and chord generation features.
            </p>
            <div className={`text-xs mb-2 p-2 rounded-md ${
              theme === 'dark' ? 'bg-green-900/20 text-green-300' : 'bg-green-50 text-green-700'
            }`}>
              💡 <strong>Free to start:</strong> Music.ai provides $20 free credit when you sign up for a new account
            </div>
            <p className={`text-sm ${
              apiKeyStatus.musicAi.isValid ? 'text-green-600' :
              apiKeyStatus.musicAi.hasKey ? 'text-red-600' :
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {getStatusText('musicAi')}
            </p>
          </div>
          <div className="flex space-x-2 ml-4">
            <button
              onClick={() => setActiveModal('musicAi')}
              disabled={isUpdating === 'musicAi'}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isUpdating === 'musicAi'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {apiKeyStatus.musicAi.hasKey ? 'Update' : 'Add'} Key
            </button>
            {apiKeyStatus.musicAi.hasKey && (
              <button
                onClick={() => handleRemoveKey('musicAi')}
                disabled={isUpdating === 'musicAi'}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  isUpdating === 'musicAi'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : theme === 'dark'
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <a
            href={API_KEY_HELP_URLS.MUSIC_AI}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm hover:underline ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Get Music.ai API key →
          </a>
        </div>
      </div>

      {/* Gemini API Key */}
      <div className={`p-4 rounded-lg border ${
        theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              {getStatusIcon('gemini')}
              <h4 className={`font-medium ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Gemini API Key
              </h4>
              <span className={`px-2 py-1 text-xs rounded-full ${
                theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
              }`}>
                Optional
              </span>
            </div>
            <p className={`text-sm mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Bypass rate limits for lyrics translation. Falls back to app quota when not provided.
            </p>
            <div className={`text-xs mb-2 p-2 rounded-md ${
              theme === 'dark' ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-700'
            }`}>
              🆓 <strong>Free tier available:</strong> Gemini API includes generous free usage limits for personal projects
            </div>
            <p className={`text-sm ${
              apiKeyStatus.gemini.isValid ? 'text-green-600' :
              apiKeyStatus.gemini.hasKey ? 'text-red-600' :
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {getStatusText('gemini')}
            </p>
            {getQuotaDisplay()}
          </div>
          <div className="flex space-x-2 ml-4">
            <button
              onClick={() => setActiveModal('gemini')}
              disabled={isUpdating === 'gemini'}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isUpdating === 'gemini'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {apiKeyStatus.gemini.hasKey ? 'Update' : 'Add'} Key
            </button>
            {apiKeyStatus.gemini.hasKey && (
              <button
                onClick={() => handleRemoveKey('gemini')}
                disabled={isUpdating === 'gemini'}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  isUpdating === 'gemini'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : theme === 'dark'
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <a
            href={API_KEY_HELP_URLS.GEMINI}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm hover:underline ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Get Gemini API key →
          </a>
        </div>
      </div>

      {/* Modals */}
      {activeModal && (
        <ApiKeyModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          service={activeModal}
          required={false}
          onKeySubmitted={(key) => handleKeySubmitted(activeModal, key)}
        />
      )}
    </div>
  );
};

export default ApiKeySettings;
