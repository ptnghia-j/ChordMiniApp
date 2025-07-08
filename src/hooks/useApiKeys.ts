/**
 * API Key Management Hook
 * Provides centralized API key management functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  ApiKeyStatus, 
  ApiKeyValidationResult, 
  RateLimitInfo 
} from '@/types/apiKeyTypes';
import { apiKeyStorage } from '@/services/apiKeyStorageService';
import { apiKeyValidation } from '@/services/apiKeyValidationService';

export const useApiKeys = () => {
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    musicAi: { hasKey: false, isValid: false },
    gemini: { hasKey: false, isValid: false }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);

  // Initialize API key status
  const refreshApiKeyStatus = useCallback(async () => {
    try {
      const status = await apiKeyValidation.getApiKeyStatus();
      setApiKeyStatus(status);
      
      // Get rate limit info for Gemini
      const geminiRateLimit = await apiKeyValidation.getGeminiRateLimitInfo();
      setRateLimitInfo(geminiRateLimit);
    } catch (error) {
      console.error('Failed to refresh API key status:', error);
    }
  }, []);

  // Load initial status
  useEffect(() => {
    const loadInitialStatus = async () => {
      setIsLoading(true);
      await refreshApiKeyStatus();
      setIsLoading(false);
    };
    
    loadInitialStatus();
  }, [refreshApiKeyStatus]);

  // Validate and store API key
  const setApiKey = useCallback(async (
    service: 'musicAi' | 'gemini', 
    apiKey: string
  ): Promise<ApiKeyValidationResult> => {
    let validationResult: ApiKeyValidationResult;
    
    // Validate the API key
    if (service === 'musicAi') {
      validationResult = await apiKeyValidation.validateMusicAiKey(apiKey);
    } else {
      validationResult = await apiKeyValidation.validateGeminiKey(apiKey);
    }
    
    if (validationResult.isValid) {
      // Store the key if validation succeeds
      await apiKeyStorage.storeApiKey(service, apiKey);
      
      // Refresh status
      await refreshApiKeyStatus();
    }
    
    return validationResult;
  }, [refreshApiKeyStatus]);

  // Remove API key
  const removeApiKey = useCallback(async (service: 'musicAi' | 'gemini') => {
    apiKeyStorage.removeApiKey(service);
    await refreshApiKeyStatus();
  }, [refreshApiKeyStatus]);

  // Get API key for service calls
  const getApiKey = useCallback(async (service: 'musicAi' | 'gemini'): Promise<string | null> => {
    return await apiKeyStorage.getApiKey(service);
  }, []);

  // Check if service requires user API key
  const requiresApiKey = useCallback((service: 'musicAi' | 'gemini'): boolean => {
    return apiKeyValidation.requiresUserApiKey(service);
  }, []);

  // Check if service is available (has valid key or fallback available)
  const isServiceAvailable = useCallback((service: 'musicAi' | 'gemini'): boolean => {
    const status = apiKeyStatus[service];

    if (service === 'musicAi') {
      // Music.ai requires user API key
      return status.hasKey && status.isValid;
    }

    if (service === 'gemini') {
      // Gemini has fallback to app key
      return true; // Always available with fallback
    }

    return false;
  }, [apiKeyStatus]);



  // Get service availability message
  const getServiceMessage = useCallback((service: 'musicAi' | 'gemini'): string => {
    const status = apiKeyStatus[service];
    
    if (service === 'musicAi') {
      if (!status.hasKey) {
        return 'Music.ai API key required for lyrics transcription and chord generation';
      }
      if (!status.isValid) {
        return 'Invalid Music.ai API key - please check your key';
      }
      return 'Music.ai services available';
    }
    
    if (service === 'gemini') {
      if (!status.hasKey) {
        return 'Using app translation quota - add your own key to bypass limits';
      }
      if (!status.isValid) {
        return 'Invalid Gemini API key - falling back to app quota';
      }
      return 'Using your Gemini API key for translations';
    }
    
    return 'Service status unknown';
  }, [apiKeyStatus]);

  // Check if we're near rate limits
  const isNearRateLimit = useCallback((service: 'gemini'): boolean => {
    if (service === 'gemini' && rateLimitInfo) {
      return rateLimitInfo.isNearLimit;
    }
    return false;
  }, [rateLimitInfo]);

  // Check if we're over rate limits
  const isOverRateLimit = useCallback((service: 'gemini'): boolean => {
    if (service === 'gemini' && rateLimitInfo) {
      return rateLimitInfo.isOverLimit;
    }
    return false;
  }, [rateLimitInfo]);

  // Clear all API keys
  const clearAllApiKeys = useCallback(async () => {
    apiKeyStorage.clearAllApiKeys();
    await refreshApiKeyStatus();
  }, [refreshApiKeyStatus]);

  // Check if encryption is supported
  const isEncryptionSupported = useCallback((): boolean => {
    return apiKeyStorage.isEncryptionSupported();
  }, []);

  return {
    // State
    apiKeyStatus,
    isLoading,
    rateLimitInfo,
    
    // Actions
    setApiKey,
    removeApiKey,
    getApiKey,
    refreshApiKeyStatus,
    clearAllApiKeys,
    
    // Utilities
    requiresApiKey,
    isServiceAvailable,
    getServiceMessage,
    isNearRateLimit,
    isOverRateLimit,
    isEncryptionSupported
  };
};
