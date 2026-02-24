'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useApiKeys } from '@/hooks/settings/useApiKeys';
import ApiKeySettings from '@/components/settings/ApiKeySettings';
import Navigation from '@/components/common/Navigation';
import { Card, CardBody, Switch, Tabs, Tab, Spinner, Divider } from '@heroui/react';
import { FiSettings, FiKey, FiLock, FiMoon, FiShield, FiDatabase, FiBarChart2 } from 'react-icons/fi';

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
          <Card className="max-w-2xl mx-auto" shadow="sm">
            <CardBody className="gap-2">
              <h1 className="text-xl font-bold text-danger">Encryption Not Supported</h1>
              <p className="text-sm text-danger-600 dark:text-danger-400">
                Your browser does not support the Web Crypto API, which is required for secure API key storage.
                Please use a modern browser.
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage your preferences and API configurations
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
              tabContent: "text-gray-600 dark:text-gray-400 group-data-[selected=true]:text-primary group-data-[selected=true]:font-semibold"
            }}
          >
            {/* General Tab */}
            <Tab
              key="general"
              title={
                <div className="flex items-center space-x-2">
                  <FiSettings className="w-4 h-4" />
                  <span>General</span>
                </div>
              }
            >
              <div className="space-y-4 pt-1">
                <Card shadow="sm" className="border border-gray-200 dark:border-gray-700">
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
                          <FiMoon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Dark Mode</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Toggle between light and dark themes</p>
                        </div>
                      </div>
                      <Switch
                        isSelected={theme === 'dark'}
                        onValueChange={toggleTheme}
                        color="primary"
                        size="sm"
                      />
                    </div>
                  </CardBody>
                </Card>
              </div>
            </Tab>

            {/* API Keys Tab */}
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
                <Card shadow="sm" className="border border-gray-200 dark:border-gray-700">
                  <CardBody>
                    <div className="flex items-center justify-center py-8">
                      <Spinner color="primary" size="sm" />
                      <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                        Loading API key status...
                      </span>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <div className="pt-1">
                  <ApiKeySettings
                    onApiKeyUpdate={handleApiKeyUpdate}
                    apiKeyStatus={apiKeyStatus}
                  />
                </div>
              )}
            </Tab>

            {/* Privacy Tab */}
            <Tab
              key="privacy"
              title={
                <div className="flex items-center space-x-2">
                  <FiLock className="w-4 h-4" />
                  <span>Privacy</span>
                </div>
              }
            >
              <div className="space-y-4 pt-1">
                <Card shadow="sm" className="border border-gray-200 dark:border-gray-700">
                  <CardBody className="p-4 gap-4">
                    <PrivacyItem
                      icon={<FiShield className="w-4 h-4 text-success" />}
                      iconBg="bg-success-50 dark:bg-success-900/20"
                      title="API Key Storage"
                      description="Encrypted locally via Web Crypto API. Keys never leave your device."
                    />
                    <Divider />
                    <PrivacyItem
                      icon={<FiDatabase className="w-4 h-4 text-primary" />}
                      iconBg="bg-primary-50 dark:bg-primary-900/20"
                      title="Cache Data"
                      description="Analysis results are cached in Firebase for performance. No personal data is stored."
                    />
                    <Divider />
                    <PrivacyItem
                      icon={<FiBarChart2 className="w-4 h-4 text-warning" />}
                      iconBg="bg-warning-50 dark:bg-warning-900/20"
                      title="Analytics"
                      description="Anonymous usage statistics only. No personal data or API keys included."
                    />
                  </CardBody>
                </Card>
              </div>
            </Tab>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function PrivacyItem({ icon, iconBg, title, description }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
