'use client';

import React, { useState } from 'react';
import { Card, CardBody, Chip, Button, Progress } from '@heroui/react';
import { ApiKeySettingsProps, API_KEY_HELP_URLS } from '@/types/apiKeyTypes';
import ApiKeyModal from './ApiKeyModal';

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({
  onApiKeyUpdate,
  apiKeyStatus
}) => {
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

  const StatusDot = ({ valid, hasKey }: { valid: boolean; hasKey: boolean }) => (
    <div className={`w-2 h-2 rounded-full shrink-0 ${
      !hasKey ? 'bg-gray-400' : valid ? 'bg-green-500' : 'bg-red-500'
    }`} />
  );

  const getStatusLabel = (service: 'musicAi' | 'gemini') => {
    const s = apiKeyStatus[service];
    if (!s.hasKey) return 'Not configured';
    if (s.isValid) return 'Valid';
    return s.error || 'Invalid';
  };

  const geminiQuota = (() => {
    const g = apiKeyStatus.gemini;
    if (!g.hasKey || !g.quotaUsed || !g.quotaLimit) return null;
    const pct = (g.quotaUsed / g.quotaLimit) * 100;
    return { used: g.quotaUsed, limit: g.quotaLimit, pct, resetTime: g.quotaResetTime };
  })();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Keys are encrypted locally and never leave your browser.
      </p>

      {/* Music.ai */}
      <Card shadow="sm" className="border border-gray-200 dark:border-gray-700">
        <CardBody className="p-4 gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-gray-900 dark:text-white">Music.ai</h4>
                <Chip size="sm" variant="flat" color="primary">Required</Chip>
                <div className="flex items-center gap-1.5 ml-1">
                  <StatusDot valid={apiKeyStatus.musicAi.isValid} hasKey={apiKeyStatus.musicAi.hasKey} />
                  <span className={`text-xs font-medium ${
                    apiKeyStatus.musicAi.isValid ? 'text-green-600 dark:text-green-400'
                    : apiKeyStatus.musicAi.hasKey ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {getStatusLabel('musicAi')}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Required for lyrics transcription. New accounts get $20 free credit.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm" color="primary" variant="flat"
                isDisabled={isUpdating === 'musicAi'}
                onPress={() => setActiveModal('musicAi')}
              >
                {apiKeyStatus.musicAi.hasKey ? 'Update' : 'Add Key'}
              </Button>
              {apiKeyStatus.musicAi.hasKey && (
                <Button
                  size="sm" color="danger" variant="light"
                  isDisabled={isUpdating === 'musicAi'}
                  onPress={() => handleRemoveKey('musicAi')}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* Setup warning — only when no valid key */}
          {!apiKeyStatus.musicAi.isValid && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-50 dark:bg-warning-50/10 border border-warning-200 dark:border-warning-500/30 text-sm text-warning-700 dark:text-warning-400">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>
                Create a <strong>&ldquo;Lyrics Transcription and Alignment&rdquo;</strong> workflow in your Music.AI workspace first.
              </span>
            </div>
          )}

          {/* Links */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={API_KEY_HELP_URLS.MUSIC_AI} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              Get API Key &rarr;
            </a>
            <a href="https://music.ai/workflows/" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">
              Setup Workflow &rarr;
            </a>
          </div>
        </CardBody>
      </Card>

      {/* Gemini */}
      <Card shadow="sm" className="border border-gray-200 dark:border-gray-700">
        <CardBody className="p-4 gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-gray-900 dark:text-white">Gemini</h4>
                <Chip size="sm" variant="flat" color="default">Optional</Chip>
                <div className="flex items-center gap-1.5 ml-1">
                  <StatusDot valid={apiKeyStatus.gemini.isValid} hasKey={apiKeyStatus.gemini.hasKey} />
                  <span className={`text-xs font-medium ${
                    apiKeyStatus.gemini.isValid ? 'text-green-600 dark:text-green-400'
                    : apiKeyStatus.gemini.hasKey ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {getStatusLabel('gemini')}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Bypass translation rate limits. Free tier available.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm" color="primary" variant="flat"
                isDisabled={isUpdating === 'gemini'}
                onPress={() => setActiveModal('gemini')}
              >
                {apiKeyStatus.gemini.hasKey ? 'Update' : 'Add Key'}
              </Button>
              {apiKeyStatus.gemini.hasKey && (
                <Button
                  size="sm" color="danger" variant="light"
                  isDisabled={isUpdating === 'gemini'}
                  onPress={() => handleRemoveKey('gemini')}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* Quota */}
          {geminiQuota && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Translation quota</span>
                <span className="font-medium">{geminiQuota.used}/{geminiQuota.limit} ({geminiQuota.pct.toFixed(0)}%)</span>
              </div>
              <Progress
                size="sm"
                value={geminiQuota.pct}
                color={geminiQuota.pct >= 95 ? 'danger' : geminiQuota.pct >= 80 ? 'warning' : 'success'}
                className="max-w-full"
              />
              {geminiQuota.resetTime && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Resets {new Date(geminiQuota.resetTime).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <a href={API_KEY_HELP_URLS.GEMINI} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline">
            Get API Key &rarr;
          </a>
        </CardBody>
      </Card>

      {/* Modal */}
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
