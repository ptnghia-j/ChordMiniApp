'use client';

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useApiKeys } from '@/hooks/useApiKeys';
import ApiKeySettings from '@/components/ApiKeySettings';
import Navigation from '@/components/Navigation';
import { FiSettings, FiKey, FiLock } from 'react-icons/fi';

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const {
    apiKeyStatus,
    isLoading,
    setApiKey,
    removeApiKey,
    refreshApiKeyStatus,
    isEncryptionSupported
  } = useApiKeys();
  
  const [activeTab, setActiveTab] = useState<'general' | 'apiKeys' | 'privacy'>('general');

  // Handle API key updates
  const handleApiKeyUpdate = async (service: 'musicAi' | 'gemini', key: string | null) => {
    try {
      if (key) {
        const validation = await setApiKey(service, key);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid API key');
        }
      } else {
        await removeApiKey(service);
      }
      await refreshApiKeyStatus();
    } catch (error) {
      console.error('Failed to update API key:', error);
      throw error;
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: FiSettings },
    { id: 'apiKeys', name: 'API Keys', icon: FiKey },
    { id: 'privacy', name: 'Privacy', icon: FiLock }
  ] as const;

  if (!isEncryptionSupported()) {
    return (
      <div className="min-h-screen bg-main-bg">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className={`max-w-2xl mx-auto p-6 rounded-lg border ${
            theme === 'dark' ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'
          }`}>
            <h1 className={`text-xl font-bold mb-4 ${
              theme === 'dark' ? 'text-red-200' : 'text-red-800'
            }`}>
              Encryption Not Supported
            </h1>
            <p className={`${theme === 'dark' ? 'text-red-200' : 'text-red-800'}`}>
              Your browser does not support the Web Crypto API, which is required for secure API key storage. 
              Please use a modern browser that supports encryption features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main-bg">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Settings
          </h1>
          <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
            Manage your application preferences and API configurations
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Tab Navigation */}
          <div className={`border-b ${theme === 'dark' ? 'border-gray-600' : 'border-gray-200'}`}>
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    py-2 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : theme === 'dark'
                        ? 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <tab.icon className="mr-2 w-4 h-4" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-8">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className={`text-lg font-medium mb-4 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Appearance
                  </h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className={`text-sm font-medium ${
                        theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                      }`}>
                        Dark Mode
                      </label>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Toggle between light and dark themes
                      </p>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-200'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                          ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'apiKeys' && (
              <div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className={`ml-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      Loading API key status...
                    </span>
                  </div>
                ) : (
                  <ApiKeySettings
                    onApiKeyUpdate={handleApiKeyUpdate}
                    apiKeyStatus={apiKeyStatus}
                  />
                )}
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <h3 className={`text-lg font-medium mb-4 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Data Storage
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className={`font-medium ${
                        theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                      }`}>
                        API Key Storage
                      </h4>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        API keys are encrypted and stored locally in your browser using the Web Crypto API.
                        They never leave your device and are not sent to our servers.
                      </p>
                    </div>
                    <div>
                      <h4 className={`font-medium ${
                        theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                      }`}>
                        Cache Data
                      </h4>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Analysis results and transcriptions are cached in Firebase to improve performance.
                        No personal information is stored.
                      </p>
                    </div>
                    <div>
                      <h4 className={`font-medium ${
                        theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                      }`}>
                        Analytics
                      </h4>
                      <p className={`text-sm ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        We collect anonymous usage statistics to improve the application.
                        No personal data or API keys are included in analytics.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
