'use client';

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { RateLimitInfo } from '@/types/apiKeyTypes';
import ApiKeyModal from '@/components/settings/ApiKeyModal';

interface RateLimitWarningProps {
  rateLimitInfo: RateLimitInfo;
  onApiKeyProvided: (key: string) => Promise<void>;
  onDismiss?: () => void;
  showModal?: boolean;
}

const RateLimitWarning: React.FC<RateLimitWarningProps> = ({
  rateLimitInfo,
  onApiKeyProvided,
  onDismiss,
  showModal = false
}) => {
  const { theme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(showModal);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKeySubmitted = async (key: string) => {
    setIsSubmitting(true);
    try {
      await onApiKeyProvided(key);
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWarningLevel = () => {
    if (rateLimitInfo.isOverLimit) {
      return {
        color: 'red',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        ),
        title: 'Rate Limit Exceeded',
        message: 'Translation services are temporarily unavailable due to rate limits.'
      };
    } else if (rateLimitInfo.isNearLimit) {
      return {
        color: 'yellow',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        ),
        title: 'Approaching Rate Limit',
        message: 'Translation quota is running low. Consider adding your own API key.'
      };
    } else {
      return {
        color: 'blue',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        title: 'Translation Quota Status',
        message: 'Current usage of shared translation quota.'
      };
    }
  };

  const warningLevel = getWarningLevel();

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'red':
        return {
          bg: theme === 'dark' ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200',
          text: theme === 'dark' ? 'text-red-200' : 'text-red-800',
          icon: 'text-red-500',
          button: 'bg-red-600 hover:bg-red-700 text-white'
        };
      case 'yellow':
        return {
          bg: theme === 'dark' ? 'bg-yellow-900/20 border-yellow-800' : 'bg-yellow-50 border-yellow-200',
          text: theme === 'dark' ? 'text-yellow-200' : 'text-yellow-800',
          icon: 'text-yellow-500',
          button: 'bg-yellow-600 hover:bg-yellow-700 text-white'
        };
      default:
        return {
          bg: theme === 'dark' ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200',
          text: theme === 'dark' ? 'text-blue-200' : 'text-blue-800',
          icon: 'text-blue-500',
          button: 'bg-blue-600 hover:bg-blue-700 text-white'
        };
    }
  };

  const colorClasses = getColorClasses(warningLevel.color);

  return (
    <>
      <div className={`p-4 rounded-lg border ${colorClasses.bg}`}>
        <div className="flex items-start space-x-3">
          <div className={`${colorClasses.icon} mt-0.5`}>
            {warningLevel.icon}
          </div>
          <div className="flex-1">
            <h4 className={`font-medium ${colorClasses.text}`}>
              {warningLevel.title}
            </h4>
            <p className={`text-sm mt-1 ${colorClasses.text}`}>
              {warningLevel.message}
            </p>
            
            {/* Quota Display */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className={colorClasses.text}>
                  Translation quota
                </span>
                <span className={`font-medium ${colorClasses.text}`}>
                  {rateLimitInfo.quotaUsed}/{rateLimitInfo.quotaLimit} ({rateLimitInfo.quotaPercentage.toFixed(0)}%)
                </span>
              </div>
              <div className={`mt-1 h-2 rounded-full ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
              }`}>
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    rateLimitInfo.isOverLimit ? 'bg-red-500' : 
                    rateLimitInfo.isNearLimit ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(rateLimitInfo.quotaPercentage * 100, 100)}%` }}
                />
              </div>
              {rateLimitInfo.resetTime && (
                <p className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  Resets: {new Date(rateLimitInfo.resetTime).toLocaleString()}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex space-x-3 mt-4">
              <button
                onClick={() => setIsModalOpen(true)}
                disabled={isSubmitting}
                className={`
                  px-3 py-1 text-sm rounded-md font-medium transition-colors
                  ${isSubmitting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : colorClasses.button
                  }
                `}
              >
                {isSubmitting ? 'Setting up...' : 'Add Your API Key'}
              </button>
              
              {onDismiss && !rateLimitInfo.isOverLimit && (
                <button
                  onClick={onDismiss}
                  className={`
                    px-3 py-1 text-sm rounded-md font-medium transition-colors
                    ${theme === 'dark' 
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }
                  `}
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <ApiKeyModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          service="gemini"
          required={rateLimitInfo.isOverLimit}
          onKeySubmitted={handleKeySubmitted}
        />
      )}
    </>
  );
};

export default RateLimitWarning;
