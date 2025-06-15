/**
 * API Key Validation Service
 * Validates user-provided API keys and tracks quota usage
 */

import { 
  ApiKeyValidationResult, 
  ApiKeyStatus, 
  RateLimitInfo,
  RATE_LIMIT_THRESHOLDS 
} from '@/types/apiKeyTypes';
import { apiKeyStorage } from './apiKeyStorageService';

class ApiKeyValidationService {
  private static instance: ApiKeyValidationService;
  private validationCache = new Map<string, { result: ApiKeyValidationResult; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): ApiKeyValidationService {
    if (!ApiKeyValidationService.instance) {
      ApiKeyValidationService.instance = new ApiKeyValidationService();
    }
    return ApiKeyValidationService.instance;
  }

  /**
   * Validate Music.ai API key
   */
  public async validateMusicAiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    const cacheKey = `musicai_${apiKey.slice(-8)}`;
    const cached = this.getCachedValidation(cacheKey);
    if (cached) return cached;

    try {
      // Test the Music.ai API key with a minimal request
      const response = await fetch('/api/validate-music-ai-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey })
      });

      const data = await response.json();

      const result: ApiKeyValidationResult = {
        isValid: response.ok && data.valid,
        error: data.error || (response.ok ? undefined : 'Invalid API key'),
        service: 'musicAi'
      };

      this.setCachedValidation(cacheKey, result);
      return result;
    } catch {
      const result: ApiKeyValidationResult = {
        isValid: false,
        error: 'Failed to validate API key',
        service: 'musicAi'
      };
      return result;
    }
  }

  /**
   * Validate Gemini API key and get quota information
   */
  public async validateGeminiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    const cacheKey = `gemini_${apiKey.slice(-8)}`;
    const cached = this.getCachedValidation(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch('/api/validate-gemini-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey })
      });

      const data = await response.json();

      const result: ApiKeyValidationResult = {
        isValid: response.ok && data.valid,
        error: data.error || (response.ok ? undefined : 'Invalid API key'),
        service: 'gemini',
        quotaInfo: data.quotaInfo
      };

      this.setCachedValidation(cacheKey, result);
      return result;
    } catch {
      const result: ApiKeyValidationResult = {
        isValid: false,
        error: 'Failed to validate API key',
        service: 'gemini'
      };
      return result;
    }
  }

  /**
   * Get current API key status for all services
   */
  public async getApiKeyStatus(): Promise<ApiKeyStatus> {
    const status: ApiKeyStatus = {
      musicAi: {
        hasKey: apiKeyStorage.hasApiKey('musicAi'),
        isValid: false
      },
      gemini: {
        hasKey: apiKeyStorage.hasApiKey('gemini'),
        isValid: false
      }
    };

    // Validate Music.ai key if present
    if (status.musicAi.hasKey) {
      try {
        const apiKey = await apiKeyStorage.getApiKey('musicAi');
        if (apiKey) {
          const validation = await this.validateMusicAiKey(apiKey);
          status.musicAi.isValid = validation.isValid;
          status.musicAi.error = validation.error;
          status.musicAi.lastValidated = new Date().toISOString();
        }
      } catch {
        status.musicAi.error = 'Failed to validate stored key';
      }
    }

    // Validate Gemini key if present
    if (status.gemini.hasKey) {
      try {
        const apiKey = await apiKeyStorage.getApiKey('gemini');
        if (apiKey) {
          const validation = await this.validateGeminiKey(apiKey);
          status.gemini.isValid = validation.isValid;
          status.gemini.error = validation.error;
          status.gemini.lastValidated = new Date().toISOString();
          
          if (validation.quotaInfo) {
            status.gemini.quotaUsed = validation.quotaInfo.used;
            status.gemini.quotaLimit = validation.quotaInfo.limit;
            status.gemini.quotaResetTime = validation.quotaInfo.resetTime;
          }
        }
      } catch {
        status.gemini.error = 'Failed to validate stored key';
      }
    }

    return status;
  }

  /**
   * Get rate limit information for Gemini API
   */
  public async getGeminiRateLimitInfo(): Promise<RateLimitInfo | null> {
    if (!apiKeyStorage.hasApiKey('gemini')) {
      return null;
    }

    try {
      const apiKey = await apiKeyStorage.getApiKey('gemini');
      if (!apiKey) return null;

      const validation = await this.validateGeminiKey(apiKey);
      if (!validation.quotaInfo) return null;

      const quotaPercentage = validation.quotaInfo.used / validation.quotaInfo.limit;

      return {
        service: 'gemini',
        quotaUsed: validation.quotaInfo.used,
        quotaLimit: validation.quotaInfo.limit,
        quotaPercentage,
        resetTime: validation.quotaInfo.resetTime,
        isNearLimit: quotaPercentage >= RATE_LIMIT_THRESHOLDS.GEMINI_WARNING,
        isOverLimit: quotaPercentage >= RATE_LIMIT_THRESHOLDS.GEMINI_CRITICAL
      };
    } catch (error) {
      console.error('Failed to get Gemini rate limit info:', error);
      return null;
    }
  }

  /**
   * Check if a service requires user API key
   */
  public requiresUserApiKey(service: 'musicAi' | 'gemini'): boolean {
    if (service === 'musicAi') {
      // Music.ai always requires user API key in production
      return true;
    }
    
    if (service === 'gemini') {
      // Gemini has fallback to app key, but check if we're near limits
      // This would be determined by server-side rate limiting
      return false; // Default to allowing app key usage
    }
    
    return false;
  }

  /**
   * Cache validation results
   */
  private getCachedValidation(cacheKey: string): ApiKeyValidationResult | null {
    const cached = this.validationCache.get(cacheKey);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;
    if (isExpired) {
      this.validationCache.delete(cacheKey);
      return null;
    }
    
    return cached.result;
  }

  private setCachedValidation(cacheKey: string, result: ApiKeyValidationResult): void {
    this.validationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Clear validation cache
   */
  public clearValidationCache(): void {
    this.validationCache.clear();
  }
}

export const apiKeyValidation = ApiKeyValidationService.getInstance();
