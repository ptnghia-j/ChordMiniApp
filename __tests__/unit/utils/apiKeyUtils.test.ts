jest.mock('@/services/cache/apiKeyStorageService', () => ({
  apiKeyStorage: {
    getApiKey: jest.fn(),
  },
}));

import {
  getGeminiApiKey,
  getMusicAiApiKey,
  getMusicAiApiKeyWithValidation,
} from '@/utils/apiKeyUtils';
import { apiKeyStorage } from '@/services/cache/apiKeyStorageService';

describe('apiKeyUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retrieves Music.AI and Gemini API keys from storage', async () => {
    (apiKeyStorage.getApiKey as jest.Mock)
      .mockResolvedValueOnce('123e4567-e89b-12d3-a456-426614174000')
      .mockResolvedValueOnce('gemini-secret');

    await expect(getMusicAiApiKey()).resolves.toBe('123e4567-e89b-12d3-a456-426614174000');
    await expect(getGeminiApiKey()).resolves.toBe('gemini-secret');
    expect(apiKeyStorage.getApiKey).toHaveBeenNthCalledWith(1, 'musicAi');
    expect(apiKeyStorage.getApiKey).toHaveBeenNthCalledWith(2, 'gemini');
  });

  it('returns null and logs when key retrieval fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (apiKeyStorage.getApiKey as jest.Mock).mockRejectedValue(new Error('storage unavailable'));

    await expect(getMusicAiApiKey()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to retrieve Music.AI API key:',
      expect.any(Error)
    );
  });

  it('validates missing, malformed, and valid Music.AI keys', async () => {
    (apiKeyStorage.getApiKey as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('not-a-uuid')
      .mockResolvedValueOnce('123e4567-e89b-12d3-a456-426614174000');

    await expect(getMusicAiApiKeyWithValidation()).resolves.toEqual({
      apiKey: null,
      isValid: false,
      error: 'Music.AI API key not found. Please add your API key in settings.',
    });

    await expect(getMusicAiApiKeyWithValidation()).resolves.toEqual({
      apiKey: 'not-a-uuid',
      isValid: false,
      error: 'Invalid Music.AI API key format. Expected UUID format.',
    });

    await expect(getMusicAiApiKeyWithValidation()).resolves.toEqual({
      apiKey: '123e4567-e89b-12d3-a456-426614174000',
      isValid: true,
    });
  });
});
