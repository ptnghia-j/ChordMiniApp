/**
 * API Key Utilities
 * Centralized utilities for API key retrieval and validation
 */

/**
 * Retrieve Music.AI API key with proper error handling
 * Consolidates the API key retrieval logic used across components
 */
export const getMusicAiApiKey = async (): Promise<string | null> => {
  try {
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');
    return await apiKeyStorage.getApiKey('musicAi');
  } catch (error) {
    console.error('Failed to retrieve Music.AI API key:', error);
    return null;
  }
};

/**
 * Retrieve Music.AI API key with validation and error handling
 * Returns both the key and validation status
 */
export const getMusicAiApiKeyWithValidation = async (): Promise<{
  apiKey: string | null;
  isValid: boolean;
  error?: string;
}> => {
  const apiKey = await getMusicAiApiKey();
  
  if (!apiKey) {
    return {
      apiKey: null,
      isValid: false,
      error: 'Music.AI API key not found. Please add your API key in settings.'
    };
  }

  // Basic format validation (UUID format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(apiKey)) {
    return {
      apiKey,
      isValid: false,
      error: 'Invalid Music.AI API key format. Expected UUID format.'
    };
  }

  return {
    apiKey,
    isValid: true
  };
};

/**
 * Retrieve Gemini API key with proper error handling
 */
export const getGeminiApiKey = async (): Promise<string | null> => {
  try {
    const { apiKeyStorage } = await import('@/services/cache/apiKeyStorageService');
    return await apiKeyStorage.getApiKey('gemini');
  } catch (error) {
    console.error('Failed to retrieve Gemini API key:', error);
    return null;
  }
};
