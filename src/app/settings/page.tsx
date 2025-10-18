'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useApiKeys } from '@/hooks/settings/useApiKeys';
import ApiKeySettings from '@/components/settings/ApiKeySettings';
import Navigation from '@/components/common/Navigation';
import { Card, CardBody, CardHeader, Switch, Tabs, Tab, Spinner } from '@heroui/react';
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

  if (!isEncryptionSupported()) {
    return (
      <div className="min-h-screen bg-main-bg">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto border-l-4 border-l-danger">
            <CardBody>
              <h1 className="text-xl font-bold mb-4 text-danger">
                Encryption Not Supported
              </h1>
              <p className="text-danger-600 dark:text-danger-400">
                Your browser does not support the Web Crypto API, which is required for secure API key storage.
                Please use a modern browser that supports encryption features.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-dark-bg">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-foreground">
            Settings
          </h1>
          <p className="text-black dark:text-white">
            Manage your application preferences and API configurations
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Tabs
            defaultSelectedKey="general"
            variant="underlined"
            color="primary"
            classNames={{
              tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider",
              cursor: "w-full bg-primary",
              tab: "max-w-fit px-0 h-12 group",
              tabContent: "text-black dark:text-white group-data-[selected=true]:text-primary group-data-[selected=true]:font-semibold group-data-[selected=true]:text-blue-500"
            }}
          >
            <Tab
              key="general"
              title={
                <div className="flex items-center space-x-2">
                  <FiSettings className="w-4 h-4" />
                  <span>General</span>
                </div>
              }
            >
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <h3 className="text-lg font-medium text-foreground">Appearance</h3>
                </CardHeader>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Dark Mode
                      </label>
                      <p className="text-sm text-black dark:text-white">
                        Toggle between light and dark themes
                      </p>
                    </div>
                    <Switch
                      isSelected={theme === 'dark'}
                      onValueChange={toggleTheme}
                      color="primary"
                    />
                  </div>
                </CardBody>
              </Card>
            </Tab>

            <Tab
              key="apiKeys"
              title={
                <div className="flex items-center space-x-2">
                  <FiKey className="w-4 h-4" />
                  <span>API Keys</span>
                </div>
              }
            >
              {isLoading ? (
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-center py-8">
                      <Spinner color="primary" />
                      <span className="ml-3 text-black dark:text-white">
                        Loading API key status...
                      </span>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <ApiKeySettings
                  onApiKeyUpdate={handleApiKeyUpdate}
                  apiKeyStatus={apiKeyStatus}
                />
              )}
            </Tab>

            <Tab
              key="privacy"
              title={
                <div className="flex items-center space-x-2">
                  <FiLock className="w-4 h-4" />
                  <span>Privacy</span>
                </div>
              }
            >
              <Card className="border-l-4 border-l-default-400">
                <CardHeader>
                  <h3 className="text-lg font-medium text-foreground">Data Storage</h3>
                </CardHeader>
                <CardBody>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-foreground">
                        API Key Storage
                      </h4>
                      <p className="text-sm text-black dark:text-white">
                        API keys are encrypted and stored locally in your browser using the Web Crypto API.
                        They never leave your device and are not sent to our servers.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">
                        Cache Data
                      </h4>
                      <p className="text-sm text-black dark:text-white">
                        Analysis results and transcriptions are cached in Firebase to improve performance.
                        No personal information is stored.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">
                        Analytics
                      </h4>
                      <p className="text-sm text-black dark:text-white">
                        We collect anonymous usage statistics to improve the application.
                        No personal data or API keys are included in analytics.
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Tab>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
