/**
 * API Key Management Types
 * Handles user-provided API keys for external services
 */

export interface ApiKeyConfig {
  musicAi?: string;
  gemini?: string;
}

export interface EncryptedApiKeyData {
  encryptedData: string;
  iv: string;
  salt: string;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  error?: string;
  service: 'musicAi' | 'gemini';
  quotaInfo?: {
    used: number;
    limit: number;
    resetTime?: string;
  };
}

export interface ApiKeyStatus {
  musicAi: {
    hasKey: boolean;
    isValid: boolean;
    lastValidated?: string;
    error?: string;
  };
  gemini: {
    hasKey: boolean;
    isValid: boolean;
    lastValidated?: string;
    error?: string;
    quotaUsed?: number;
    quotaLimit?: number;
    quotaResetTime?: string;
  };
}

export interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: 'musicAi' | 'gemini';
  required?: boolean;
  onKeySubmitted: (key: string) => Promise<void>;
  currentError?: string;
}

export interface ApiKeySettingsProps {
  onApiKeyUpdate: (service: 'musicAi' | 'gemini', key: string | null) => void;
  apiKeyStatus: ApiKeyStatus;
}

export interface RateLimitInfo {
  service: 'gemini';
  quotaUsed: number;
  quotaLimit: number;
  quotaPercentage: number;
  resetTime?: string;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export interface ApiKeyRequirement {
  service: 'musicAi' | 'gemini';
  feature: string;
  required: boolean;
  fallbackAvailable: boolean;
  message: string;
}

// Constants for API key management
export const API_KEY_STORAGE_KEYS = {
  MUSIC_AI: 'chord_app_music_ai_key',
  GEMINI: 'chord_app_gemini_key',
  ENCRYPTION_SALT: 'chord_app_key_salt'
} as const;

export const API_KEY_VALIDATION_ENDPOINTS = {
  MUSIC_AI: '/api/validate-music-ai-key',
  GEMINI: '/api/validate-gemini-key'
} as const;

export const RATE_LIMIT_THRESHOLDS = {
  GEMINI_WARNING: 0.8, // 80% usage warning
  GEMINI_CRITICAL: 0.95 // 95% usage critical
} as const;

export const API_KEY_HELP_URLS = {
  MUSIC_AI: 'https://www.music.ai/pricing',
  GEMINI: 'https://makersuite.google.com/app/apikey'
} as const;
