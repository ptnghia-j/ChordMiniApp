'use client';

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ApiKeySettingsProps, API_KEY_HELP_URLS } from '@/types/apiKeyTypes';
import ApiKeyModal from './ApiKeyModal';
import { HiLightBulb } from 'react-icons/hi2';
import { HiGift } from 'react-icons/hi2';

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
      <div className={`p-4 rounded-lg border-l-4 ${
        theme === 'dark' ? 'bg-gray-800/30 border-l-blue-500 border-r border-t border-b border-gray-600' : 'bg-gray-50 border-l-blue-500 border-r border-t border-b border-gray-200'
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
              <span className={`px-2 py-1 text-xs rounded ${
                theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
              }`}>
                Required
              </span>
            </div>
            <p className={`text-sm mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Required for lyrics transcription and chord generation features.
            </p>

            {/* Workflow Setup Warning - Only show if API key is not validated */}
            {!apiKeyStatus.musicAi.isValid && (
              <div className={`text-sm mb-3 p-3 rounded-md border-2 ${
                theme === 'dark' ? 'bg-red-900/20 border-red-500 text-red-300' : 'bg-red-50 border-red-300 text-red-700'
              }`}>
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-semibold mb-1">Setup Required</div>
                    <p>Create a <strong>&ldquo;Lyrics Transcription and Alignment&rdquo;</strong> workflow in your Music.AI workspace. <a href="https://music.ai/workflows/" target="_blank" rel="noopener noreferrer" className="underline">Setup guide →</a></p>
                  </div>
                </div>
              </div>
            )}

            <div className={`text-xs mb-2 p-2 rounded ${
              theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'
            } flex items-start gap-2`}>
              <HiLightBulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span><strong>Free to start:</strong> Music.ai provides $20 free credit when you sign up for a new account</span>
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
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-4">
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
            <a
              href="https://music.ai/workflows/"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm hover:underline font-medium ${
                theme === 'dark' ? 'text-orange-400' : 'text-orange-600'
              }`}
            >
              Setup Workflow Guide →
            </a>
          </div>
          <p className={`text-xs ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            💡 <strong>Pro tip:</strong> Create your workflow first, then add your API key here for seamless integration.
          </p>
        </div>
      </div>

      {/* Gemini API Key */}
      <div className={`p-4 rounded-lg border-l-4 ${
        theme === 'dark' ? 'bg-gray-800/30 border-l-gray-500 border-r border-t border-b border-gray-600' : 'bg-gray-50 border-l-gray-400 border-r border-t border-b border-gray-200'
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
              <span className={`px-2 py-1 text-xs rounded ${
                theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
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
            } flex items-start gap-2`}>
              <HiGift className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span><strong>Free tier available:</strong> Gemini API includes generous free usage limits for personal projects</span>
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
